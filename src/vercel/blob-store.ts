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

type CachedEntry = {
  readonly raw: string;
  readonly etag: string;
  readonly rev: number;
  readonly createdAt: number;
};

/**
 * Private Vercel Blob room persistence with ETag CAS and revision-checked
 * conditional reads.
 *
 * Uses `ifNoneMatch` on `get()` so every read validates against Blob origin
 * while skipping body transfer when unchanged (`304`). Comparing monotonic
 * `rev` + `createdAt` prevents same-instance stale-read regressions right
 * after `create()` / `replace()`, and tracking rejected ETags avoids wasting
 * CAS writes while `get()` catches up after a cross-instance conflict.
 */
export function createBlobRoomStore(): RoomStore {
  const cache = new Map<string, CachedEntry>();
  const staleEtags = new Map<string, string>();

  async function fetchFresh(roomCode: string, ifNoneMatch?: string) {
    return get(roomBlobPath(roomCode), {
      access: "private",
      useCache: false,
      ...(ifNoneMatch ? { ifNoneMatch } : {}),
    });
  }

  return {
    async load(roomCode) {
      const key = roomCode.toUpperCase();
      const cached = cache.get(key);
      const staleEtag = staleEtags.get(key);
      try {
        let result = await fetchFresh(
          roomCode,
          !staleEtag && cached?.etag ? cached.etag : undefined,
        );
        if (result?.statusCode === 304 && cached) {
          return {
            data: JSON.parse(cached.raw) as VercelRoomDoc,
            etag: cached.etag,
          };
        }
        if (result?.statusCode !== 200) {
          cache.delete(key);
          return null;
        }
        let text = await new Response(result.stream).text();
        let etag = result.blob.etag;
        if (staleEtag && etag === staleEtag) {
          // Origin already rejected this ETag; wait briefly once for Blob read
          // propagation rather than immediately colliding with the same ETag.
          await new Promise((resolve) => setTimeout(resolve, 100));
          const retried = await fetchFresh(roomCode);
          if (retried?.statusCode === 200) {
            result = retried;
            text = await new Response(retried.stream).text();
            etag = retried.blob.etag;
          } else if (!retried) {
            cache.delete(key);
            return null;
          }
        }
        const remote = JSON.parse(text) as VercelRoomDoc;
        const remoteRev = remote.rev ?? 0;
        if (
          cached &&
          remote.createdAt === cached.createdAt &&
          remoteRev < cached.rev
        ) {
          return {
            data: JSON.parse(cached.raw) as VercelRoomDoc,
            etag: cached.etag,
          };
        }
        if (staleEtag && etag !== staleEtag) {
          staleEtags.delete(key);
        }
        if (!staleEtag || etag !== staleEtag) {
          cache.set(key, {
            raw: text,
            etag,
            rev: remoteRev,
            createdAt: remote.createdAt,
          });
        }
        return { data: remote, etag };
      } catch (error) {
        if (error instanceof BlobNotFoundError) {
          cache.delete(key);
          return null;
        }
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
        staleEtags.delete(key);
        cache.set(key, {
          raw,
          etag: blob.etag,
          rev: doc.rev ?? 0,
          createdAt: doc.createdAt,
        });
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
        staleEtags.delete(key);
        cache.set(key, {
          raw,
          etag: blob.etag,
          rev: doc.rev ?? 0,
          createdAt: doc.createdAt,
        });
        return { data: doc, etag: blob.etag };
      } catch (error) {
        if (isConflictError(error)) {
          cache.delete(key);
          staleEtags.set(key, expectedEtag);
          throw new RoomConflictError("ETag mismatch");
        }
        throw error;
      }
    },
    async remove(roomCode) {
      const key = roomCode.toUpperCase();
      cache.delete(key);
      staleEtags.delete(key);
      try {
        await del(roomBlobPath(roomCode));
      } catch (error) {
        if (!(error instanceof BlobNotFoundError)) throw error;
      }
    },
  };
}
