import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  del,
  get,
  head,
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
 * Private Vercel Blob room persistence using transactional `head()` ETags.
 *
 * `put(..., { ifMatch })` validates against the Blob API metadata store, whose
 * authoritative ETag is returned by `head()` and `put()`. Under concurrent
 * writes, `get(..., { useCache: false })` on the content delivery endpoint can
 * return a lagged or mismatched `response.headers.etag`, causing persistent 412
 * conflicts. Validating the cache and conditional writes against `head().etag`
 * eliminates both stale reads and ETag mismatches.
 */
export function createBlobRoomStore(): RoomStore {
  const cache = new Map<string, CachedEntry>();

  return {
    async load(roomCode) {
      const key = roomCode.toUpperCase();
      const path = roomBlobPath(roomCode);
      const cached = cache.get(key);

      let meta: Awaited<ReturnType<typeof head>>;
      try {
        meta = await head(path);
      } catch (error) {
        if (error instanceof BlobNotFoundError) {
          cache.delete(key);
          return null;
        }
        throw error;
      }

      if (cached && meta.etag && cached.etag === meta.etag) {
        return {
          data: JSON.parse(cached.raw) as VercelRoomDoc,
          etag: cached.etag,
        };
      }

      try {
        let text: string | null = null;
        let fetchedEtag = "";
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const result = await get(path, {
            access: "private",
            useCache: false,
          });
          if (result?.statusCode === 200) {
            text = await new Response(result.stream).text();
            fetchedEtag = result.blob.etag;
            if (!meta.etag || fetchedEtag === meta.etag) break;
          }
          if (attempt < 2) {
            await new Promise((resolve) =>
              setTimeout(resolve, 80 * (attempt + 1)),
            );
          }
        }
        if (text === null) {
          cache.delete(key);
          return null;
        }

        const remote = JSON.parse(text) as VercelRoomDoc;
        const remoteRev = remote.rev ?? 0;
        if (
          cached &&
          remote.createdAt === cached.createdAt &&
          remoteRev < cached.rev &&
          fetchedEtag !== meta.etag
        ) {
          return {
            data: JSON.parse(cached.raw) as VercelRoomDoc,
            etag: meta.etag || cached.etag,
          };
        }

        const etag = meta.etag || fetchedEtag;
        if (etag && (!meta.etag || fetchedEtag === meta.etag)) {
          cache.set(key, {
            raw: text,
            etag,
            rev: remoteRev,
            createdAt: remote.createdAt,
          });
        } else {
          cache.delete(key);
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
