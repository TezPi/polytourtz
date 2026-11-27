import type { VercelRoomDoc } from "./types.js";

export type StoredEntry<T> = {
  readonly data: T;
  readonly etag: string;
};

export class RoomConflictError extends Error {
  constructor(message = "Room state changed concurrently") {
    super(message);
    this.name = "RoomConflictError";
  }
}

/** Vercel Blob rejects every call once the store is suspended (quota or billing). */
export function isStoreSuspended(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "BlobStoreSuspendedError" ||
      error.message.includes("store has been suspended"))
  );
}

export interface RoomStore {
  load(roomCode: string): Promise<StoredEntry<VercelRoomDoc> | null>;
  create(
    roomCode: string,
    doc: VercelRoomDoc,
  ): Promise<StoredEntry<VercelRoomDoc>>;
  replace(
    roomCode: string,
    doc: VercelRoomDoc,
    expectedEtag: string,
  ): Promise<StoredEntry<VercelRoomDoc>>;
  remove(roomCode: string): Promise<void>;
}

/**
 * In-memory CAS store used in unit tests and local Node checks so ETag
 * conflict behavior matches private Vercel Blob without requiring network.
 */
export function createMemoryRoomStore(): RoomStore {
  const entries = new Map<string, { raw: string; etag: string }>();
  let version = 0;

  function nextEtag(): string {
    version += 1;
    return `"mem-${version}"`;
  }

  return {
    async load(roomCode) {
      const entry = entries.get(roomCode.toUpperCase());
      if (!entry) return null;
      return {
        data: JSON.parse(entry.raw) as VercelRoomDoc,
        etag: entry.etag,
      };
    },
    async create(roomCode, doc) {
      const key = roomCode.toUpperCase();
      if (entries.has(key)) throw new RoomConflictError("Room already exists");
      const etag = nextEtag();
      const raw = JSON.stringify(doc);
      entries.set(key, { raw, etag });
      return { data: JSON.parse(raw) as VercelRoomDoc, etag };
    },
    async replace(roomCode, doc, expectedEtag) {
      const key = roomCode.toUpperCase();
      const current = entries.get(key);
      if (!current || current.etag !== expectedEtag) {
        throw new RoomConflictError("ETag mismatch");
      }
      const etag = nextEtag();
      const raw = JSON.stringify(doc);
      entries.set(key, { raw, etag });
      return { data: JSON.parse(raw) as VercelRoomDoc, etag };
    },
    async remove(roomCode) {
      entries.delete(roomCode.toUpperCase());
    },
  };
}
