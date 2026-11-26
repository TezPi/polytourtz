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

/** Private Vercel Blob room persistence with immediate reads and ETag CAS. */
export function createBlobRoomStore(): RoomStore {
  return {
    async load(roomCode) {
      try {
        const result = await get(roomBlobPath(roomCode), {
          access: "private",
          useCache: false,
        });
        if (result?.statusCode !== 200) return null;
        const text = await new Response(result.stream).text();
        return {
          data: JSON.parse(text) as VercelRoomDoc,
          etag: result.blob.etag,
        };
      } catch (error) {
        if (error instanceof BlobNotFoundError) return null;
        throw error;
      }
    },
    async create(roomCode, doc) {
      try {
        const blob = await put(roomBlobPath(roomCode), JSON.stringify(doc), {
          access: "private",
          allowOverwrite: false,
          contentType: "application/json",
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
      try {
        const blob = await put(roomBlobPath(roomCode), JSON.stringify(doc), {
          access: "private",
          allowOverwrite: true,
          ifMatch: expectedEtag,
          contentType: "application/json",
        });
        return { data: doc, etag: blob.etag };
      } catch (error) {
        if (isConflictError(error)) {
          throw new RoomConflictError("ETag mismatch");
        }
        throw error;
      }
    },
    async remove(roomCode) {
      try {
        await del(roomBlobPath(roomCode));
      } catch (error) {
        if (!(error instanceof BlobNotFoundError)) throw error;
      }
    },
  };
}
