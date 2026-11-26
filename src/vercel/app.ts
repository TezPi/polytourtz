import { Hono } from "hono";
import type { z } from "zod";
import type { ClientMessage } from "../shared/protocol/index.js";
import {
  ClientMessageSchema,
  CreateRoomSchema,
  JoinRoomSchema,
} from "../shared/protocol/index.js";
import { APP_VERSION } from "../shared/version.js";
import type { RoomServiceError } from "./room-service.js";
import { VercelRoomService } from "./room-service.js";
import type { RoomStore } from "./store.js";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function resolveOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    return `${forwardedProto ?? url.protocol.replace(":", "")}://${forwardedHost}`;
  }
  return url.origin;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === resolveOrigin(request);
  } catch {
    return false;
  }
}

async function readJson<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.infer<S> | null> {
  const raw = await request.text();
  if (raw.length > 16_384) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const checked = schema.safeParse(parsed);
  return checked.success ? checked.data : null;
}

function normalizeRoomCode(raw: string): string | null {
  const upper = raw.toUpperCase();
  return /^[A-Z0-9]{6}$/.test(upper) ? upper : null;
}

function bearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  return token.length >= 16 ? token : null;
}

function isServiceError(value: unknown): value is RoomServiceError {
  return (
    value !== null &&
    typeof value === "object" &&
    "status" in value &&
    "code" in value
  );
}

/**
 * Rewrites `/api/index?__path=/api/...` back to its canonical `/api/...` URL so
 * Hono routing works regardless of whether Vercel passes original or rewritten paths.
 */
export function normalizeVercelRequest(request: Request): Request {
  const url = new URL(request.url);
  const rewrittenPath = url.searchParams.get("__path");
  if (!rewrittenPath?.startsWith("/api")) return request;
  const params = new URLSearchParams(url.searchParams);
  params.delete("__path");
  const qs = params.toString();
  const target = new URL(`${rewrittenPath}${qs ? `?${qs}` : ""}`, url.origin);
  return new Request(target, request);
}

export function createVercelApp(store: RoomStore) {
  const service = new VercelRoomService(store);
  const app = new Hono();

  app.get("/api/health", (context) =>
    context.json({ status: "ok", transport: "http" }, 200, NO_STORE),
  );

  app.get("/api/version", (context) =>
    context.json({ version: APP_VERSION }, 200, NO_STORE),
  );

  app.post("/api/rooms", async (context) => {
    if (!sameOrigin(context.req.raw)) {
      return context.json({ error: "cross-origin" }, 403, NO_STORE);
    }
    const body = await readJson(context.req.raw, CreateRoomSchema);
    if (!body) return context.json({ error: "invalid-body" }, 400, NO_STORE);
    const result = await service.createRoom(body);
    if (isServiceError(result)) {
      return context.json({ error: result.code }, result.status, NO_STORE);
    }
    return context.json(result, 201, NO_STORE);
  });

  app.post("/api/rooms/:roomCode/join", async (context) => {
    if (!sameOrigin(context.req.raw)) {
      return context.json({ error: "cross-origin" }, 403, NO_STORE);
    }
    const roomCode = normalizeRoomCode(context.req.param("roomCode"));
    if (!roomCode)
      return context.json({ error: "invalid-room" }, 400, NO_STORE);
    const body = await readJson(context.req.raw, JoinRoomSchema);
    if (!body) return context.json({ error: "invalid-body" }, 400, NO_STORE);
    const result = await service.joinRoom(roomCode, body);
    if (isServiceError(result)) {
      return context.json({ error: result.code }, result.status, NO_STORE);
    }
    return context.json(result, 200, NO_STORE);
  });

  app.post("/api/rooms/:roomCode/leave", async (context) => {
    if (!sameOrigin(context.req.raw)) {
      return context.json({ error: "cross-origin" }, 403, NO_STORE);
    }
    const roomCode = normalizeRoomCode(context.req.param("roomCode"));
    if (!roomCode)
      return context.json({ error: "invalid-room" }, 400, NO_STORE);
    const token = bearerToken(context.req.raw);
    if (!token) return context.json({ error: "unauthorized" }, 401, NO_STORE);
    const result = await service.leaveRoom(roomCode, token);
    if (isServiceError(result)) {
      return context.json({ error: result.code }, result.status, NO_STORE);
    }
    return context.json(result, 200, NO_STORE);
  });

  app.get("/api/rooms/:roomCode", async (context) => {
    const roomCode = normalizeRoomCode(context.req.param("roomCode"));
    if (!roomCode)
      return context.json({ error: "invalid-room" }, 400, NO_STORE);
    const result = await service.getLobby(roomCode);
    if (isServiceError(result)) {
      return context.json({ error: result.code }, result.status, NO_STORE);
    }
    return context.json(result, 200, NO_STORE);
  });

  app.post("/api/rooms/:roomCode/rpc", async (context) => {
    if (!sameOrigin(context.req.raw)) {
      return context.json({ error: "cross-origin" }, 403, NO_STORE);
    }
    const roomCode = normalizeRoomCode(context.req.param("roomCode"));
    if (!roomCode)
      return context.json({ error: "invalid-room" }, 400, NO_STORE);
    const token = bearerToken(context.req.raw);
    if (!token) return context.json({ error: "unauthorized" }, 401, NO_STORE);
    let raw: unknown;
    try {
      const text = await context.req.raw.text();
      if (text.length > 8_192) {
        return context.json({ error: "invalid-body" }, 400, NO_STORE);
      }
      raw = JSON.parse(text);
    } catch {
      return context.json({ error: "invalid-body" }, 400, NO_STORE);
    }
    const obj =
      raw !== null && typeof raw === "object"
        ? (raw as {
            message?: unknown;
            lastSeq?: unknown;
            poll?: unknown;
            knownLobby?: unknown;
            knownYou?: unknown;
            knownRandomness?: unknown;
          })
        : {};
    const parsedMessage = ClientMessageSchema.safeParse(obj.message ?? raw);
    if (!parsedMessage.success) {
      return context.json({ error: "malformed-message" }, 400, NO_STORE);
    }
    const lastSeq =
      typeof obj.lastSeq === "number" && Number.isInteger(obj.lastSeq)
        ? obj.lastSeq
        : null;
    const result = await service.handleRpc(
      roomCode,
      token,
      parsedMessage.data as ClientMessage,
      lastSeq,
      Date.now(),
      {
        poll: obj.poll === true,
        knownLobby: typeof obj.knownLobby === "string" ? obj.knownLobby : null,
        knownYou: typeof obj.knownYou === "string" ? obj.knownYou : null,
        knownRandomness:
          typeof obj.knownRandomness === "string" ? obj.knownRandomness : null,
      },
    );
    if (isServiceError(result)) {
      return context.json({ error: result.code }, result.status, NO_STORE);
    }
    return context.json(result, 200, NO_STORE);
  });

  app.all("/api/*", (context) =>
    context.json({ error: "not-found" }, 404, NO_STORE),
  );

  return {
    fetch(request: Request): Response | Promise<Response> {
      return app.fetch(normalizeVercelRequest(request));
    },
  };
}
