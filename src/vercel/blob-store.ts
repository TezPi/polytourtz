import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  del,
  get,
  put,
} from "@vercel/blob";
import { RoomConflictError, type RoomStore } from "./store.js";
import type { VercelRoomDoc } from "./types.js";

function roomBlobPath(roomCode: string): string {
  return `rooms/${roomCode.toUpperCase()}.json`;
}

function isConflictError(error: unknown): boolean {
  if (error instanceof BlobPreconditionFailedError) return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("already exists") ||
    message.includes("precondition") ||
    message.includes("412")
  );
}

/**
 * Private Vercel Blob room persistence with immediate reads and ETag CAS.
 *
 * A write-through in-memory cache keeps the latest doc + etag after every
 * successful `create()` / `replace()`.  Subsequent `load()` calls within the
 * same serverless function instance return the cached version, eliminating the
 * most common cause of spurious CAS failures: Blob `get()` returning a stale
 * etag even with `useCache: false` due to eventual-consistency lag.
 */
export function createBlobRoomStore(): RoomStore {
  const cache = new Map<string, { raw: string; etag: string }>();

  return {
    async load(roomCode) {
      const key = roomCode.toUpperCase();
      const cached = cache.get(key);
      if (cached) {
        return {
          data: JSON.parse(cached.raw) as VercelRoomDoc,
          etag: cached.etag,
        };
      }
      try {
        const result = await get(roomBlobPath(roomCode), {
          access: "private",
          useCache: false,
        });
        if (result?.statusCode !== 200) return null;
        const text = await new Response(result.stream).text();
        const etag = result.blob.etag;
        cache.set(key, { raw: text, etag });
        return { data: JSON.parse(text) as VercelRoomDoc, etag };
      } catch (error) {
        if (error instanceof BlobNotFoundError) return null;
        throw error;
      }
    },
    async create(roomCode, doc) {
      const key = roomCode.toUpperCase();
      try {
        const raw = JSON.stringify(doc);
        const blob = await put(roomBlobPath(roomCode), raw, {
          access: "private",
          allowOverwrite: false,
          contentType: "application/json",
        });
        cache.set(key, { raw, etag: blob.etag });
        return { data: doc, etag: blob.etag };
      } catch (error) {
        if (isConflictError(error)) {
          throw new RoomConflictError("Room already exists");
        }
        throw error;
      }
    },
    async replace(roomCode, doc, expectedEtag) {
      const key = roomCode.toUpperCase();
      try {
        const raw = JSON.stringify(doc);
        const blob = await put(roomBlobPath(roomCode), raw, {
          access: "private",
          allowOverwrite: true,
          ifMatch: expectedEtag,
          contentType: "application/json",
        });
        cache.set(key, { raw, etag: blob.etag });
        return { data: doc, etag: blob.etag };
      } catch (error) {
        if (isConflictError(error)) {
          // Invalidate so the next retry fetches fresh from origin.
          cache.delete(key);
          throw new RoomConflictError("ETag mismatch");
        }
        throw error;
      }
    },
    async remove(roomCode) {
      cache.delete(roomCode.toUpperCase());
      try {
        await del(roomBlobPath(roomCode));
      } catch (error) {
        if (!(error instanceof BlobNotFoundError)) throw error;
      }
    },
  };
}
