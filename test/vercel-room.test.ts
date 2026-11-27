import { describe, expect, it, vi } from "vitest";
import type {
  LobbyState,
  RoomCredentials,
  ServerMessage,
} from "../src/shared/protocol/index.js";
import { createVercelApp } from "../src/vercel/app.js";
import {
  createMemoryRoomStore,
  RoomConflictError,
  type RoomStore,
} from "../src/vercel/store.js";

const ORIGIN = "https://polytourtz.vercel.app";

async function apiJson<T>(
  app: ReturnType<typeof createVercelApp>,
  path: string,
  init: RequestInit = {},
): Promise<{ readonly status: number; readonly body: T }> {
  const headers = new Headers(init.headers);
  headers.set("Origin", ORIGIN);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await app.fetch(
    new Request(`${ORIGIN}${path}`, { ...init, headers }),
  );
  return {
    status: response.status,
    body: (await response.json()) as T,
  };
}

describe("Vercel HTTP RPC room backend", () => {
  it("reports HTTP transport on /api/health and app version on /api/version", async () => {
    const app = createVercelApp(createMemoryRoomStore());
    const health = await apiJson<{ status: string; transport: string }>(
      app,
      "/api/health",
    );
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: "ok", transport: "http" });

    const rewritten = await apiJson<{ status: string; transport: string }>(
      app,
      "/api/index?__path=/api/health",
    );
    expect(rewritten.status).toBe(200);
    expect(rewritten.body).toEqual({ status: "ok", transport: "http" });

    const version = await apiJson<{ version: string }>(app, "/api/version");
    expect(version.status).toBe(200);
    expect(version.body.version.length).toBeGreaterThan(0);
  });

  it("supports a 5-player room with skins, joining, starting, rolling, and bot progression", async () => {
    const app = createVercelApp(createMemoryRoomStore());

    // Host creates a room with 3 bots + custom cosmetics.
    const hostCosmetics = {
      skin: "royal",
      tone: "gold",
      hat: "crown",
      eyewear: "none",
      gear: "cape",
    } as const;
    const guestCosmetics = {
      skin: "ninja",
      tone: "sakura",
      hat: "none",
      eyewear: "shades",
      gear: "wings",
    } as const;
    const botCosmetics = {
      skin: "robot",
      tone: "cyan",
      hat: "propeller",
      eyewear: "visor",
      gear: "jetpack",
    } as const;

    const created = await apiJson<RoomCredentials>(app, "/api/rooms", {
      method: "POST",
      body: JSON.stringify({
        name: "Host",
        bots: 3,
        config: { randomnessMode: "secure", botDifficulty: "medium" },
        cosmetics: hostCosmetics,
      }),
    });
    expect(created.status).toBe(201);
    expect(created.body.seat).toBe(0);
    const roomCode = created.body.roomCode;

    // 5th player joins with custom cosmetics.
    const joined = await apiJson<RoomCredentials>(
      app,
      `/api/rooms/${roomCode}/join`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "BanBe",
          cosmetics: guestCosmetics,
        }),
      },
    );
    expect(joined.status).toBe(200);
    expect(joined.body.seat).toBe(4);

    // Host syncs and inspects lobby.
    const syncHost = await apiJson<{ messages: ServerMessage[] }>(
      app,
      `/api/rooms/${roomCode}/rpc`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${created.body.token}` },
        body: JSON.stringify({ message: { type: "sync", lastSeq: null } }),
      },
    );
    expect(syncHost.status).toBe(200);
    const welcome = syncHost.body.messages.find((m) => m.type === "welcome");
    expect(welcome?.type).toBe("welcome");
    if (welcome?.type === "welcome") {
      expect(welcome.lobby.seats).toHaveLength(5);
      expect(welcome.lobby.seats[0]?.cosmetics).toEqual(hostCosmetics);
      expect(welcome.lobby.seats[4]?.cosmetics).toEqual(guestCosmetics);
    }

    // Host customizes bot 1 skin + removes bots cleanly? No, keeps all 5 seats and tests bot + human!
    const customizeBot = await apiJson<{ messages: ServerMessage[] }>(
      app,
      `/api/rooms/${roomCode}/rpc`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${created.body.token}` },
        body: JSON.stringify({
          message: {
            type: "lobby",
            id: "cmd-bot-cosmetics",
            op: {
              type: "cosmetics",
              seat: 1,
              cosmetics: botCosmetics,
            },
          },
          lastSeq: 0,
        }),
      },
    );
    expect(customizeBot.status).toBe(200);
    expect(
      customizeBot.body.messages.some(
        (m) => m.type === "ack" && m.id === "cmd-bot-cosmetics",
      ),
    ).toBe(true);

    const startRes = await apiJson<{ messages: ServerMessage[] }>(
      app,
      `/api/rooms/${roomCode}/rpc`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${created.body.token}` },
        body: JSON.stringify({
          message: {
            type: "lobby",
            id: "cmd-start",
            op: { type: "start", fillBots: false },
          },
          lastSeq: 0,
        }),
      },
    );
    expect(startRes.status).toBe(200);
    expect(
      startRes.body.messages.some(
        (m) => m.type === "ack" && m.id === "cmd-start",
      ),
    ).toBe(true);
    const startEvents = startRes.body.messages.find((m) => m.type === "events");
    expect(startEvents?.type).toBe("events");

    // Second player polls from lastSeq=null and gets snapshot of 5-player match.
    const guestSync = await apiJson<{ messages: ServerMessage[] }>(
      app,
      `/api/rooms/${roomCode}/rpc`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${joined.body.token}` },
        body: JSON.stringify({ message: { type: "sync", lastSeq: null } }),
      },
    );
    expect(guestSync.status).toBe(200);
    const guestWelcome = guestSync.body.messages.find(
      (m) => m.type === "welcome",
    );
    expect(guestWelcome?.type).toBe("welcome");
    if (guestWelcome?.type === "welcome") {
      expect(guestWelcome.snapshot?.players).toHaveLength(5);
      expect(guestWelcome.snapshot?.players[1]?.cosmetics).toEqual(
        botCosmetics,
      );
    }

    // Also verify a 2-human room allows the active seat to roll and receive CSPRNG proof.
    const twoHuman = await apiJson<RoomCredentials>(app, "/api/rooms", {
      method: "POST",
      body: JSON.stringify({
        name: "P0",
        config: { randomnessMode: "secure" },
      }),
    });
    const twoJoin = await apiJson<RoomCredentials>(
      app,
      `/api/rooms/${twoHuman.body.roomCode}/join`,
      { method: "POST", body: JSON.stringify({ name: "P1" }) },
    );
    const twoStart = await apiJson<{ messages: ServerMessage[] }>(
      app,
      `/api/rooms/${twoHuman.body.roomCode}/rpc`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${twoHuman.body.token}` },
        body: JSON.stringify({
          message: {
            type: "lobby",
            id: "start-2p",
            op: { type: "start", fillBots: false },
          },
          lastSeq: 0,
        }),
      },
    );
    expect(
      twoStart.body.messages.some(
        (m) => m.type === "ack" && m.id === "start-2p",
      ),
    ).toBe(true);

    const p1Sync = await apiJson<{ messages: ServerMessage[] }>(
      app,
      `/api/rooms/${twoHuman.body.roomCode}/rpc`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${twoJoin.body.token}` },
        body: JSON.stringify({ message: { type: "sync", lastSeq: null } }),
      },
    );
    const p1Welcome = p1Sync.body.messages.find((m) => m.type === "welcome");
    expect(p1Welcome?.type).toBe("welcome");
    const activeSeat =
      p1Welcome?.type === "welcome" ? p1Welcome.snapshot?.activeSeat : 0;
    const seq = p1Welcome?.type === "welcome" ? p1Welcome.seq : 0;
    const rollerToken =
      activeSeat === 1 ? twoJoin.body.token : twoHuman.body.token;

    const rollRes = await apiJson<{ messages: ServerMessage[] }>(
      app,
      `/api/rooms/${twoHuman.body.roomCode}/rpc`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${rollerToken}` },
        body: JSON.stringify({
          message: {
            type: "intent",
            id: "roll-1",
            atSeq: seq,
            action: { type: "Roll" },
          },
          lastSeq: seq,
        }),
      },
    );
    expect(rollRes.status).toBe(200);
    expect(
      rollRes.body.messages.some(
        (m) => m.type === "randomness" && m.status === "resolved",
      ),
    ).toBe(true);
    expect(
      rollRes.body.messages.some(
        (m) =>
          m.type === "events" &&
          m.events.some((event) => event.type === "DiceRolled"),
      ),
    ).toBe(true);
  });

  it("handles unauthorized tokens and missing rooms cleanly", async () => {
    const app = createVercelApp(createMemoryRoomStore());
    const missing = await apiJson<{ error: string }>(app, "/api/rooms/AAAAAA");
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("room-not-found");

    const created = await apiJson<RoomCredentials>(app, "/api/rooms", {
      method: "POST",
      body: JSON.stringify({ name: "Host" }),
    });
    const unauth = await apiJson<{ error: string }>(
      app,
      `/api/rooms/${created.body.roomCode}/rpc`,
      {
        method: "POST",
        headers: { Authorization: "Bearer invalid-token-value-12345" },
        body: JSON.stringify({ message: { type: "sync", lastSeq: null } }),
      },
    );
    expect(unauth.status).toBe(401);
    expect(unauth.body.error).toBe("unauthorized");
  });

  it("seats friends into bot places on Play rooms, rejects 6th player, and returns { ok: true } on leave", async () => {
    const app = createVercelApp(createMemoryRoomStore());
    const host = await apiJson<RoomCredentials>(app, "/api/rooms", {
      method: "POST",
      body: JSON.stringify({ name: "Host", bots: 4 }),
    });
    expect(host.status).toBe(201);
    const code = host.body.roomCode;

    for (const [name, seat] of [
      ["F1", 1],
      ["F2", 2],
      ["F3", 3],
      ["F4", 4],
    ] as const) {
      const joined = await apiJson<RoomCredentials>(
        app,
        `/api/rooms/${code}/join`,
        {
          method: "POST",
          body: JSON.stringify({ name }),
        },
      );
      expect(joined.status).toBe(200);
      expect(joined.body.seat).toBe(seat);
    }

    const full = await apiJson<{ error: string }>(
      app,
      `/api/rooms/${code}/join`,
      {
        method: "POST",
        body: JSON.stringify({ name: "F5" }),
      },
    );
    expect(full.status).toBe(409);
    expect(full.body.error).toBe("room-full");

    const leaveHost = await apiJson<{ ok: boolean }>(
      app,
      `/api/rooms/${code}/leave`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${host.body.token}` },
      },
    );
    expect(leaveHost.status).toBe(200);
    expect(leaveHost.body).toEqual({ ok: true });

    const lobbyAfter = await apiJson<{ lobby: LobbyState }>(
      app,
      `/api/rooms/${code}`,
    );
    expect(lobbyAfter.status).toBe(200);
    expect(lobbyAfter.body.lobby.seats).toHaveLength(4);
    expect(lobbyAfter.body.lobby.seats[0]?.name).toBe("F1");
  });

  it("retries transient CAS conflicts and keeps background poll syncs 200 under write contention", async () => {
    const inner = createMemoryRoomStore();
    let forcedConflicts = 0;
    let blockAllReplaces = false;
    let replaceCalls = 0;
    const flakyStore: RoomStore = {
      load: (code) => inner.load(code),
      create: (code, doc) => inner.create(code, doc),
      remove: (code) => inner.remove(code),
      async replace(code, doc, expectedEtag) {
        replaceCalls += 1;
        if (blockAllReplaces) throw new RoomConflictError("Contention");
        if (forcedConflicts > 0) {
          forcedConflicts -= 1;
          throw new RoomConflictError("Simulated stale read");
        }
        return inner.replace(code, doc, expectedEtag);
      },
    };
    const app = createVercelApp(flakyStore);
    let fakeNow = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => fakeNow);
    try {
      const host = await apiJson<RoomCredentials>(app, "/api/rooms", {
        method: "POST",
        body: JSON.stringify({ name: "Host", bots: 4 }),
      });
      const code = host.body.roomCode;

      // 3 transient conflicts still succeed via server CAS retry.
      forcedConflicts = 3;
      const guest = await apiJson<RoomCredentials>(
        app,
        `/api/rooms/${code}/join`,
        { method: "POST", body: JSON.stringify({ name: "Guest" }) },
      );
      expect(guest.status).toBe(200);
      expect(guest.body.seat).toBe(1);
      expect(replaceCalls).toBe(4);

      // Advance past HEARTBEAT_WRITE_INTERVAL_MS so the background poll tries
      // to write a heartbeat, collides continuously, and degrades to 200.
      fakeNow += 10_000;
      blockAllReplaces = true;
      replaceCalls = 0;
      const poll = await apiJson<{
        messages: ServerMessage[];
        lobbyDigest: string;
      }>(app, `/api/rooms/${code}/rpc`, {
        method: "POST",
        headers: { Authorization: `Bearer ${host.body.token}` },
        body: JSON.stringify({
          message: { type: "sync", lastSeq: 0 },
          lastSeq: 0,
          poll: true,
        }),
      });
      expect(replaceCalls).toBe(2);
      expect(poll.status).toBe(200);
      expect(poll.body.lobbyDigest.length).toBeGreaterThan(0);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
