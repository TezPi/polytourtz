import { BOT_TIMING, ECONOMY } from "../shared/board/index.js";
import type {
  GameEvent,
  GameState,
  PlayerCosmetics,
  Seat,
  SeatInfo,
} from "../shared/engine/index.js";
import {
  applyAction,
  applyTimeout,
  botAction,
  botDecisionAt,
  changeControl,
  createGame,
  DEFAULT_GAME_CONFIG,
  expirePauseVote,
  legalActions,
  toPublic,
} from "../shared/engine/index.js";
import type {
  ClientMessage,
  LobbySeat,
  LobbyState,
  RoomConfig,
  RoomCredentials,
  ServerMessage,
} from "../shared/protocol/index.js";
import {
  PROTOCOL_VERSION,
  RoomConfigSchema,
} from "../shared/protocol/index.js";
import {
  ROOM_DEBUG_VERSION,
  type RoomDiagnostics,
} from "../shared/protocol/room-diagnostics.js";
import { createEngineContext } from "../worker/chance-randomness.js";
import { prepareDice, resolveDice } from "../worker/randomness.js";
import { renameChanceCardsInEvent } from "../worker/state-migrations.js";
import {
  RoomConflictError,
  type RoomStore,
  type StoredEntry,
} from "./store.js";
import type {
  PendingDice,
  StoredRoomEvent,
  StoredRoomMember,
  StoredRoomSeat,
  VercelRoomDoc,
} from "./types.js";

const LOBBY_LIFETIME_MS = 7_200_000;
const FINISHED_LIFETIME_MS = 600_000;
const ONLINE_WINDOW_MS = 15_000;
const ATTENDANCE_WINDOW_MS = 20_000;
const HEARTBEAT_WRITE_INTERVAL_MS = 4_000;
const GRACE_MS = 60_000;
const MAX_SEATS = 5;
const MAX_REPLAY_GAP = 500;
const MAX_STORED_EVENTS = 1_000;
const MAX_STORED_COMMANDS = 400;
const MAX_CAS_RETRIES = 6;
const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const SEAT_ORDER: readonly Seat[] = [0, 1, 2, 3, 4];

const BOT_NAMES: Record<Seat, string> = {
  0: "Bot 1",
  1: "Bot 2",
  2: "Bot 3",
  3: "Bot 4",
  4: "Bot 5",
};

export type RoomServiceError = {
  readonly status: 401 | 403 | 404 | 409 | 503;
  readonly code: string;
};

type Actor =
  | { readonly kind: "seat"; readonly seat: Seat }
  | { readonly kind: "member"; readonly memberId: string };

type MutableDoc = {
  version: 1;
  roomCode: string;
  config: RoomConfig;
  createdAt: number;
  expiresAt: number | null;
  hostSeat: Seat;
  locked: boolean;
  memberSeq: number;
  seats: StoredRoomSeat[];
  members: StoredRoomMember[];
  localSeats: { seat: Seat; controller: Seat }[];
  commands: { seat: Seat; id: string }[];
  saved: { seq: number; state: GameState } | null;
  events: StoredRoomEvent[];
  pendingDice: PendingDice | null;
  botTimerAt: number | null;
  lastProof: VercelRoomDoc["lastProof"];
};

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateRoomCode(): string {
  const chars: string[] = [];
  while (chars.length < 6) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    for (const byte of bytes) {
      if (byte < 248 && chars.length < 6) {
        chars.push(ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length] ?? "A");
      }
    }
  }
  return chars.join("");
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

function cloneDoc(doc: VercelRoomDoc): MutableDoc {
  return structuredClone(doc) as MutableDoc;
}

function controllerOf(doc: VercelRoomDoc, seat: Seat): Seat {
  return (
    doc.localSeats.find((entry) => entry.seat === seat)?.controller ?? seat
  );
}

function controlledSeats(doc: VercelRoomDoc, controller: Seat): Seat[] {
  const own: Seat[] = [controller];
  for (const entry of doc.localSeats) {
    if (entry.controller === controller && entry.seat !== controller) {
      own.push(entry.seat);
    }
  }
  return own;
}

function freeSeat(doc: VercelRoomDoc): Seat | null {
  for (const seat of SEAT_ORDER) {
    if (!doc.seats.some((entry) => entry.seat === seat)) return seat;
  }
  return null;
}

function isControllerOnline(
  doc: VercelRoomDoc,
  seat: Seat,
  now: number,
): boolean {
  const entry = doc.seats.find((candidate) => candidate.seat === seat);
  if (!entry) return false;
  if (entry.control === "bot") return true;
  const ctrlSeat = controllerOf(doc, seat);
  const ctrl = doc.seats.find((candidate) => candidate.seat === ctrlSeat);
  return (
    ctrl?.lastSeenAt !== null &&
    ctrl?.lastSeenAt !== undefined &&
    now - ctrl.lastSeenAt < ONLINE_WINDOW_MS &&
    entry.takeover !== true
  );
}

function hasActiveHumanAudience(doc: VercelRoomDoc, now: number): boolean {
  const localSet = new Set(doc.localSeats.map((entry) => entry.seat));
  return doc.seats.some(
    (entry) =>
      entry.control === "human" &&
      !localSet.has(entry.seat) &&
      entry.lastSeenAt !== null &&
      now - entry.lastSeenAt < ATTENDANCE_WINDOW_MS,
  );
}

function rememberCommand(doc: MutableDoc, seat: Seat, id: string): void {
  doc.commands.push({ seat, id });
  if (doc.commands.length > MAX_STORED_COMMANDS) {
    doc.commands.splice(0, doc.commands.length - MAX_STORED_COMMANDS);
  }
}

function commandUsed(doc: VercelRoomDoc, seat: Seat, id: string): boolean {
  return doc.commands.some((entry) => entry.seat === seat && entry.id === id);
}

function compactLobbySeats(doc: MutableDoc): void {
  if (doc.saved) return;
  const sorted = [...doc.seats].sort((a, b) => a.seat - b.seat);
  const remap = new Map<Seat, Seat>();
  const remappedSeats: StoredRoomSeat[] = [];
  sorted.forEach((entry, index) => {
    const nextSeat = index as Seat;
    remap.set(entry.seat, nextSeat);
    remappedSeats.push({ ...entry, seat: nextSeat });
  });
  doc.seats = remappedSeats;
  doc.hostSeat = remap.get(doc.hostSeat) ?? 0;
  doc.localSeats = doc.localSeats.map((entry) => ({
    seat: remap.get(entry.seat) ?? entry.seat,
    controller: remap.get(entry.controller) ?? entry.controller,
  }));
}

function seatWaitingMembers(doc: MutableDoc): boolean {
  if (doc.saved) return false;
  let promoted = false;
  const remaining: StoredRoomMember[] = [];
  for (const member of doc.members) {
    const openSeat = member.approved ? freeSeat(doc) : null;
    if (openSeat !== null) {
      doc.seats.push({
        seat: openSeat,
        name: member.name,
        control: "human",
        tokenHash: member.tokenHash,
        botDifficulty: null,
        cosmetics: member.cosmetics,
        lastSeenAt: member.lastSeenAt,
      });
      promoted = true;
    } else {
      remaining.push(member);
    }
  }
  doc.members = remaining;
  return promoted;
}

function buildLobbyState(doc: VercelRoomDoc, now: number): LobbyState {
  const status: LobbyState["status"] = doc.saved
    ? doc.saved.state.status === "finished"
      ? "finished"
      : "playing"
    : "lobby";
  const seats: LobbySeat[] = [...doc.seats]
    .sort((a, b) => a.seat - b.seat)
    .map((entry) => {
      const controller =
        doc.localSeats.find((local) => local.seat === entry.seat)?.controller ??
        null;
      return {
        seat: entry.seat,
        name: entry.name,
        control: entry.control,
        online: isControllerOnline(doc, entry.seat, now),
        controller,
        ...(entry.control === "bot" && entry.botDifficulty
          ? { botDifficulty: entry.botDifficulty }
          : {}),
        ...(entry.cosmetics ? { cosmetics: entry.cosmetics } : {}),
      };
    });
  const rules = doc.saved?.state.config ?? DEFAULT_GAME_CONFIG;
  return {
    roomCode: doc.roomCode,
    hostSeat: doc.hostSeat,
    locked: doc.locked,
    status,
    config: {
      ...doc.config,
      mapId: doc.config.mapId ?? "world",
      mapExtraLocations: doc.config.mapExtraLocations ?? 0,
    },
    boardRule: rules.boardRule ?? DEFAULT_GAME_CONFIG.boardRule,
    economyRule: rules.economyRule ?? DEFAULT_GAME_CONFIG.economyRule,
    hotelPurchaseRule:
      rules.hotelPurchaseRule ?? DEFAULT_GAME_CONFIG.hotelPurchaseRule,
    sellBackPercent:
      rules.sellBackPercent ?? DEFAULT_GAME_CONFIG.sellBackPercent,
    sellBeyondDebt: rules.sellBeyondDebt ?? DEFAULT_GAME_CONFIG.sellBeyondDebt,
    worldTourRule: rules.worldTourRule ?? DEFAULT_GAME_CONFIG.worldTourRule,
    fourResortRent: rules.fourResortRent ?? DEFAULT_GAME_CONFIG.fourResortRent,
    buildAfterBuyout:
      rules.buildAfterBuyout ?? DEFAULT_GAME_CONFIG.buildAfterBuyout,
    escapeCard: rules.escapeCard ?? DEFAULT_GAME_CONFIG.escapeCard,
    chanceRule: rules.chanceRule ?? DEFAULT_GAME_CONFIG.chanceRule,
    startLandingBonus:
      rules.startLandingBonus ?? DEFAULT_GAME_CONFIG.startLandingBonus,
    seats,
    waiting: doc.members
      .filter((member) => !member.approved || doc.saved !== null)
      .map((member) => ({
        id: member.id,
        name: member.name,
        approved: member.approved,
        online: now - member.lastSeenAt < ONLINE_WINDOW_MS,
      })),
  };
}

function nextBotTimer(
  doc: VercelRoomDoc,
  now: number,
  resetBot: boolean,
): number | null {
  const state = doc.saved?.state;
  if (
    state?.status !== "active" ||
    state.pause?.kind === "paused" ||
    doc.pendingDice ||
    !state.pending ||
    !hasActiveHumanAudience(doc, now)
  ) {
    return null;
  }
  const pendingSeat = state.pending.seat;
  const seatRow = doc.seats.find((entry) => entry.seat === pendingSeat);
  const isBotTurn = seatRow?.control === "bot" || seatRow?.takeover === true;
  if (!isBotTurn) return null;
  const desired = Math.max(
    botDecisionAt(state) ?? 0,
    now + (resetBot ? 0 : BOT_TIMING.resume),
  );
  if (!resetBot && doc.botTimerAt !== null) {
    return doc.botTimerAt;
  }
  return desired;
}

function appendPersistedState(
  doc: MutableDoc,
  state: GameState,
  events: readonly GameEvent[],
  now: number,
  options?: {
    readonly command?: { readonly seat: Seat; readonly id: string };
    readonly proof?: VercelRoomDoc["lastProof"];
    readonly clearDice?: boolean;
  },
): void {
  const fromSeq = (doc.saved?.seq ?? 0) + 1;
  const toSeq = fromSeq + events.length - 1;
  const proofIndex = events.findIndex((event) => event.type === "DiceRolled");
  doc.saved = { seq: toSeq, state };
  events.forEach((event, index) => {
    const proof = options?.proof && index === proofIndex ? options.proof : null;
    doc.events.push({ seq: fromSeq + index, event, proof });
  });
  if (doc.events.length > MAX_STORED_EVENTS) {
    doc.events.splice(0, doc.events.length - MAX_STORED_EVENTS);
  }
  if (options?.command) {
    rememberCommand(doc, options.command.seat, options.command.id);
  }
  if (options?.clearDice) {
    doc.pendingDice = null;
  }
  if (options?.proof) {
    doc.lastProof = options.proof;
  }
  if (state.status === "finished") {
    doc.expiresAt = doc.expiresAt ?? now + FINISHED_LIFETIME_MS;
    doc.botTimerAt = null;
  } else {
    doc.expiresAt = null;
    doc.botTimerAt = nextBotTimer(doc, now, true);
  }
}

async function resolvePendingDice(
  doc: MutableDoc,
  now: number,
  extraMessages: ServerMessage[],
): Promise<boolean> {
  const pending = doc.pendingDice;
  if (!pending || !doc.saved) return false;
  if (
    doc.saved.state.status !== "active" ||
    doc.saved.state.pause?.kind === "paused"
  ) {
    return false;
  }
  try {
    const result = await resolveDice(pending.commitment);
    const current = doc.saved;
    if (!current || current.seq !== pending.atSeq) {
      doc.pendingDice = null;
      return true;
    }
    if (
      current.state.matchDeadline !== null &&
      now >= current.state.matchDeadline
    ) {
      const ended = applyTimeout(current.state, createEngineContext(now));
      appendPersistedState(doc, ended.state, ended.events, now, {
        clearDice: true,
      });
      return true;
    }
    const applied = pending.action
      ? applyAction(
          current.state,
          pending.seat,
          pending.action,
          createEngineContext(now, result.dice),
        )
      : {
          ok: true as const,
          ...applyTimeout(current.state, createEngineContext(now, result.dice)),
        };
    if (!applied.ok) throw new Error(applied.error.message);
    const expiredVote = expirePauseVote(applied.state, now);
    appendPersistedState(
      doc,
      expiredVote.state,
      [...applied.events, ...expiredVote.events],
      now,
      { proof: result.proof, clearDice: true },
    );
    extraMessages.push({
      type: "randomness",
      status: "resolved",
      proof: result.proof,
    });
    return true;
  } catch {
    if (!hasActiveHumanAudience(doc, now)) {
      doc.botTimerAt = null;
      return true;
    }
    doc.pendingDice = {
      ...pending,
      commitment: { ...pending.commitment, availableAt: now + 5_000 },
    };
    extraMessages.push({
      type: "randomness",
      status: "error",
      commitment: doc.pendingDice.commitment,
      message:
        pending.commitment.mode === "drand"
          ? "Verifiable randomness beacon is temporarily unavailable. Retrying."
          : "Server dice generator is temporarily unavailable. Retrying.",
    });
    return true;
  }
}

async function advanceDueTimers(
  doc: MutableDoc,
  now: number,
  extraMessages: ServerMessage[],
): Promise<boolean> {
  let dirty = false;

  for (let step = 0; step < 16; step += 1) {
    const saved = doc.saved;
    if (!saved) break;

    if (
      saved.state.status === "active" &&
      saved.state.pause?.kind !== "paused" &&
      saved.state.matchDeadline !== null &&
      now >= saved.state.matchDeadline
    ) {
      const ended = applyTimeout(saved.state, createEngineContext(now));
      appendPersistedState(doc, ended.state, ended.events, now, {
        clearDice: true,
      });
      dirty = true;
      continue;
    }

    if (saved.state.status === "active") {
      let takeoverChanged = false;
      doc.seats = doc.seats.map((entry) => {
        if (
          entry.control === "human" &&
          entry.tokenHash !== null &&
          entry.takeover !== true &&
          entry.lastSeenAt !== null &&
          now - entry.lastSeenAt >= GRACE_MS
        ) {
          takeoverChanged = true;
          return { ...entry, takeover: true };
        }
        return entry;
      });
      if (takeoverChanged) {
        dirty = true;
        if (doc.saved?.state.pause?.kind === "paused") {
          const humans = doc.saved.state.players.filter(
            (player) => player.control === "human" && !player.bankrupt,
          );
          const allAbandoned =
            humans.length > 0 &&
            humans.every((player) => {
              const ctrl = controllerOf(doc, player.seat);
              const seatRow = doc.seats.find((s) => s.seat === ctrl);
              return seatRow?.takeover === true;
            });
          if (allAbandoned) {
            const resumed = applyAction(
              doc.saved.state,
              humans[0].seat,
              { type: "ResumeGame" },
              createEngineContext(now),
            );
            if (resumed.ok) {
              appendPersistedState(doc, resumed.state, resumed.events, now);
              continue;
            }
          }
        }
      }
    }

    if (doc.saved?.state.status !== "active") break;

    if (!hasActiveHumanAudience(doc, now)) {
      if (doc.botTimerAt !== null) {
        doc.botTimerAt = null;
        dirty = true;
      }
      break;
    }

    if (doc.saved.state.pause?.kind === "paused") {
      if (doc.botTimerAt !== null) {
        doc.botTimerAt = null;
        dirty = true;
      }
      break;
    }

    if (doc.pendingDice) {
      if (now >= doc.pendingDice.commitment.availableAt) {
        const progressed = await resolvePendingDice(doc, now, extraMessages);
        if (progressed) {
          dirty = true;
          continue;
        }
      }
      break;
    }

    if (
      doc.saved.state.pause?.kind === "vote" &&
      now >= doc.saved.state.pause.deadline
    ) {
      const expired = expirePauseVote(doc.saved.state, now);
      appendPersistedState(doc, expired.state, expired.events, now);
      dirty = true;
      continue;
    }

    const pending = doc.saved.state.pending;
    if (!pending) {
      if (doc.botTimerAt !== null) {
        doc.botTimerAt = null;
        dirty = true;
      }
      break;
    }

    const pendingSeatRow = doc.seats.find((s) => s.seat === pending.seat);
    const isBot =
      pendingSeatRow?.control === "bot" || pendingSeatRow?.takeover === true;

    if (isBot) {
      const fireAt = nextBotTimer(doc, now, false);
      if (fireAt !== doc.botTimerAt) {
        doc.botTimerAt = fireAt;
        dirty = true;
      }
      if (fireAt !== null && now >= fireAt) {
        const action = botAction(toPublic(doc.saved.state), pending.seat);
        if (action.type === "Roll") {
          const commitment = prepareDice(
            doc.config.randomnessMode,
            { roomCode: doc.roomCode, seq: doc.saved.seq, seat: pending.seat },
            now,
          );
          doc.pendingDice = {
            commitment,
            seat: pending.seat,
            action,
            intentId: null,
            atSeq: doc.saved.seq,
          };
          doc.botTimerAt = null;
          extraMessages.push({
            type: "randomness",
            status: "committed",
            commitment,
          });
          dirty = true;
          continue;
        }
        const applied = applyAction(
          doc.saved.state,
          pending.seat,
          action,
          createEngineContext(now),
        );
        if (applied.ok) {
          appendPersistedState(doc, applied.state, applied.events, now);
          dirty = true;
          continue;
        }
      }
      break;
    }

    if (now >= pending.deadline) {
      const kind = pending.kind;
      if (kind === "roll" || kind === "island" || kind === "travel") {
        const commitment = prepareDice(
          doc.config.randomnessMode,
          { roomCode: doc.roomCode, seq: doc.saved.seq, seat: pending.seat },
          now,
        );
        doc.pendingDice = {
          commitment,
          seat: pending.seat,
          action: null,
          intentId: null,
          atSeq: doc.saved.seq,
        };
        extraMessages.push({
          type: "randomness",
          status: "committed",
          commitment,
        });
        dirty = true;
        continue;
      }
      const timedOut = applyTimeout(doc.saved.state, createEngineContext(now));
      appendPersistedState(doc, timedOut.state, timedOut.events, now);
      dirty = true;
      continue;
    }

    break;
  }

  return dirty;
}

function buildEventsMessage(
  doc: VercelRoomDoc,
  afterSeq: number,
): Extract<ServerMessage, { type: "events" }> | null {
  if (!doc.saved || doc.saved.seq <= afterSeq) return null;
  const rows = doc.events.filter((entry) => entry.seq > afterSeq);
  if (!rows.length) return null;
  const fromSeq = afterSeq + 1;
  if (rows[0]?.seq !== fromSeq) return null;
  const proofs = rows
    .filter((entry) => entry.proof !== null)
    .map((entry) => ({
      seq: entry.seq,
      proof: entry.proof as NonNullable<StoredRoomEvent["proof"]>,
    }));
  return {
    type: "events",
    fromSeq,
    toSeq: doc.saved.seq,
    events: rows.map(
      (entry) =>
        JSON.parse(
          renameChanceCardsInEvent(JSON.stringify(entry.event)),
        ) as GameEvent,
    ),
    ...(proofs.length ? { proofs } : {}),
  };
}

function buildWelcomeMessage(
  doc: VercelRoomDoc,
  actor: Actor,
  clientLastSeq: number | null,
  now: number,
): Extract<ServerMessage, { type: "welcome" }> {
  const saved = doc.saved;
  const seq = saved?.seq ?? 0;
  const earliest = doc.events[0]?.seq ?? 1;
  const canReplay =
    saved !== null &&
    clientLastSeq !== null &&
    clientLastSeq <= seq &&
    seq - clientLastSeq <= MAX_REPLAY_GAP &&
    (clientLastSeq >= earliest - 1 || clientLastSeq === seq);
  return {
    type: "welcome",
    protocolVersion: PROTOCOL_VERSION,
    roomDebugVersion: ROOM_DEBUG_VERSION,
    you: {
      seat: actor.kind === "seat" ? actor.seat : null,
      member: actor.kind === "member" ? actor.memberId : null,
    },
    seq,
    snapshot: saved && !canReplay ? toPublic(saved.state) : null,
    lobby: buildLobbyState(doc, now),
    randomness: doc.pendingDice
      ? { status: "waiting", commitment: doc.pendingDice.commitment }
      : doc.lastProof
        ? { status: "resolved", proof: doc.lastProof }
        : null,
  };
}

function roomDiagnosticsPayload(
  doc: VercelRoomDoc,
  now: number,
): RoomDiagnostics {
  return {
    worker: {
      worker: "polytour",
      hostname: "vercel",
      runtime: "unknown",
      cloudflare: null,
    },
    room: {
      className: "GameRoom",
      storage: "sqlite",
      location: null,
      jurisdiction: null,
    },
    peers: doc.seats
      .filter(
        (entry) =>
          entry.control === "human" && isControllerOnline(doc, entry.seat, now),
      )
      .map((entry) => ({
        seat: entry.seat,
        colo: null,
        location: null,
        region: null,
      })),
  };
}

function randomnessKey(pending: PendingDice | null): string {
  if (!pending) return "none";
  return `${pending.atSeq}:${pending.commitment.availableAt}:${pending.commitment.round ?? "s"}`;
}

export type RpcOptions = {
  readonly poll?: boolean;
  readonly knownLobby?: string | null;
  readonly knownYou?: string | null;
  readonly knownRandomness?: string | null;
};

export type RpcResponse = {
  readonly messages: ServerMessage[];
  readonly lobbyDigest: string;
  readonly youDigest: string;
  readonly randomnessDigest: string;
};

export class VercelRoomService {
  private readonly store: RoomStore;

  constructor(store: RoomStore) {
    this.store = store;
  }

  private async loadValid(
    roomCode: string,
    now: number,
  ): Promise<StoredEntry<VercelRoomDoc> | null> {
    const entry = await this.store.load(roomCode);
    if (!entry) return null;
    if (entry.data.expiresAt !== null && now >= entry.data.expiresAt) {
      await this.store.remove(roomCode);
      return null;
    }
    return entry;
  }

  private async mutate<T>(
    roomCode: string,
    now: number,
    fn: (doc: MutableDoc) => Promise<{
      readonly dirty: boolean;
      readonly deleteRoom?: boolean;
      readonly result: T | RoomServiceError;
    }>,
  ): Promise<T | RoomServiceError> {
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt += 1) {
      const entry = await this.loadValid(roomCode, now);
      if (!entry) return { status: 404, code: "room-not-found" };
      const doc = cloneDoc(entry.data);
      const outcome = await fn(doc);
      if (outcome.deleteRoom) {
        await this.store.remove(roomCode);
        return outcome.result;
      }
      if (!outcome.dirty) return outcome.result;
      try {
        await this.store.replace(roomCode, doc, entry.etag);
        return outcome.result;
      } catch (error) {
        if (
          error instanceof RoomConflictError &&
          attempt + 1 < MAX_CAS_RETRIES
        ) {
          continue;
        }
        return { status: 409, code: "concurrent-update" };
      }
    }
    return { status: 409, code: "concurrent-update" };
  }

  async createRoom(
    input: {
      readonly name: string;
      readonly config?: RoomConfig;
      readonly bots?: number;
      readonly cosmetics?: PlayerCosmetics;
    },
    now = Date.now(),
  ): Promise<RoomCredentials | RoomServiceError> {
    const config = RoomConfigSchema.parse(input.config ?? {});
    const token = randomToken();
    const tokenHash = await hashToken(token);
    const botCount = Math.min(Math.max(input.bots ?? 0, 0), MAX_SEATS - 1);

    const seats: StoredRoomSeat[] = [
      {
        seat: 0,
        name: input.name,
        control: "human",
        tokenHash,
        botDifficulty: null,
        ...(input.cosmetics ? { cosmetics: input.cosmetics } : {}),
        lastSeenAt: now,
      },
    ];
    for (let i = 1; i <= botCount; i += 1) {
      const seat = i as Seat;
      seats.push({
        seat,
        name: BOT_NAMES[seat],
        control: "bot",
        tokenHash: null,
        botDifficulty: config.botDifficulty,
        lastSeenAt: null,
      });
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const roomCode = generateRoomCode();
      const doc: VercelRoomDoc = {
        version: 1,
        roomCode,
        config,
        createdAt: now,
        expiresAt: now + LOBBY_LIFETIME_MS,
        hostSeat: 0,
        locked: false,
        memberSeq: 0,
        seats,
        members: [],
        localSeats: [],
        commands: [],
        saved: null,
        events: [],
        pendingDice: null,
        botTimerAt: null,
        lastProof: null,
      };
      try {
        await this.store.create(roomCode, doc);
        return { roomCode, seat: 0, token };
      } catch (error) {
        if (error instanceof RoomConflictError) continue;
        return { status: 503, code: "room-service-unavailable" };
      }
    }
    return { status: 503, code: "room-service-unavailable" };
  }

  async getLobby(
    roomCode: string,
    now = Date.now(),
  ): Promise<{ readonly lobby: LobbyState } | RoomServiceError> {
    const entry = await this.loadValid(roomCode, now);
    if (!entry) return { status: 404, code: "room-not-found" };
    return { lobby: buildLobbyState(entry.data, now) };
  }

  async joinRoom(
    roomCode: string,
    input: { readonly name: string; readonly cosmetics?: PlayerCosmetics },
    now = Date.now(),
  ): Promise<RoomCredentials | RoomServiceError> {
    const token = randomToken();
    const tokenHash = await hashToken(token);
    return this.mutate<RoomCredentials>(roomCode, now, async (doc) => {
      if (!doc.saved && !doc.locked) {
        const seat = freeSeat(doc);
        if (seat !== null) {
          doc.seats.push({
            seat,
            name: input.name,
            control: "human",
            tokenHash,
            botDifficulty: null,
            ...(input.cosmetics ? { cosmetics: input.cosmetics } : {}),
            lastSeenAt: now,
          });
          doc.expiresAt = now + LOBBY_LIFETIME_MS;
          return {
            dirty: true,
            result: { roomCode: doc.roomCode, seat, token },
          };
        }
      }
      doc.memberSeq += 1;
      const memberId = `m${doc.memberSeq}`;
      doc.members.push({
        id: memberId,
        name: input.name,
        tokenHash,
        approved: !doc.locked,
        joinedAt: now,
        lastSeenAt: now,
        ...(input.cosmetics ? { cosmetics: input.cosmetics } : {}),
      });
      if (!doc.saved) {
        doc.expiresAt = now + LOBBY_LIFETIME_MS;
      }
      return {
        dirty: true,
        result: { roomCode: doc.roomCode, seat: null, token },
      };
    });
  }

  async leaveRoom(
    roomCode: string,
    token: string,
    now = Date.now(),
  ): Promise<{ readonly left: true } | RoomServiceError> {
    const tokenHash = await hashToken(token);
    return this.mutate<{ readonly left: true }>(roomCode, now, async (doc) => {
      const seatRow = doc.seats.find((s) => s.tokenHash === tokenHash);
      const memberRow = doc.members.find((m) => m.tokenHash === tokenHash);
      if (!seatRow && !memberRow) {
        return {
          dirty: false,
          result: { status: 401, code: "unauthorized" },
        };
      }
      if (memberRow) {
        doc.members = doc.members.filter((m) => m.id !== memberRow.id);
        return { dirty: true, result: { left: true } };
      }
      if (!seatRow) {
        return { dirty: false, result: { left: true } };
      }
      if (!doc.saved) {
        const owned = new Set(controlledSeats(doc, seatRow.seat));
        doc.seats = doc.seats.filter((s) => !owned.has(s.seat));
        doc.localSeats = doc.localSeats.filter(
          (l) => !owned.has(l.seat) && l.controller !== seatRow.seat,
        );
        doc.commands = doc.commands.filter((c) => !owned.has(c.seat));
        const nextHuman = doc.seats.find(
          (s) => s.control === "human" && s.tokenHash !== null,
        );
        if (!nextHuman) {
          return {
            dirty: true,
            deleteRoom: true,
            result: { left: true },
          };
        }
        if (doc.hostSeat === seatRow.seat || owned.has(doc.hostSeat)) {
          doc.hostSeat = nextHuman.seat;
        }
        compactLobbySeats(doc);
        seatWaitingMembers(doc);
        doc.expiresAt = now + LOBBY_LIFETIME_MS;
        return { dirty: true, result: { left: true } };
      }
      // Mid-game departure promotes remaining online human as host and releases seat to bot takeover.
      const owned = new Set(controlledSeats(doc, seatRow.seat));
      doc.seats = doc.seats.map((entry) =>
        owned.has(entry.seat)
          ? {
              ...entry,
              tokenHash: entry.seat === seatRow.seat ? null : entry.tokenHash,
              lastSeenAt: null,
              takeover: true,
            }
          : entry,
      );
      if (owned.has(doc.hostSeat)) {
        const replacementHost = doc.seats.find(
          (entry) => entry.control === "human" && entry.tokenHash !== null,
        );
        if (replacementHost) doc.hostSeat = replacementHost.seat;
      }
      return { dirty: true, result: { left: true } };
    });
  }

  async handleRpc(
    roomCode: string,
    token: string,
    message: ClientMessage,
    clientLastSeq: number | null,
    now = Date.now(),
    options: RpcOptions = {},
  ): Promise<RpcResponse | RoomServiceError> {
    const tokenHash = await hashToken(token);
    return this.mutate<RpcResponse>(roomCode, now, async (doc) => {
      const seatRow = doc.seats.find((s) => s.tokenHash === tokenHash);
      const memberRow = doc.members.find((m) => m.tokenHash === tokenHash);
      if (!seatRow && !memberRow) {
        return {
          dirty: false,
          result: { status: 401, code: "unauthorized" } as RoomServiceError,
        };
      }

      let dirty = false;
      const messages: ServerMessage[] = [];

      // Heartbeat refresh (writes throttled cleanly).
      if (seatRow) {
        if (
          seatRow.lastSeenAt === null ||
          now - seatRow.lastSeenAt >= HEARTBEAT_WRITE_INTERVAL_MS ||
          seatRow.takeover === true
        ) {
          const owned = new Set(controlledSeats(doc, seatRow.seat));
          doc.seats = doc.seats.map((entry) =>
            owned.has(entry.seat)
              ? {
                  ...entry,
                  lastSeenAt: entry.seat === seatRow.seat ? now : null,
                  takeover: false,
                }
              : entry,
          );
          dirty = true;
        }
        if (
          !doc.saved &&
          doc.expiresAt !== null &&
          doc.expiresAt - now < LOBBY_LIFETIME_MS - 60_000
        ) {
          doc.expiresAt = now + LOBBY_LIFETIME_MS;
          dirty = true;
        }
      } else if (memberRow) {
        if (now - memberRow.lastSeenAt >= HEARTBEAT_WRITE_INTERVAL_MS) {
          doc.members = doc.members.map((m) =>
            m.id === memberRow.id ? { ...m, lastSeenAt: now } : m,
          );
          dirty = true;
        }
      }

      // Seat any newly approved waiting member before evaluating this message.
      if (seatWaitingMembers(doc)) {
        dirty = true;
      }

      const activeSeatRow = doc.seats.find((s) => s.tokenHash === tokenHash);
      const activeMemberRow = doc.members.find(
        (m) => m.tokenHash === tokenHash,
      );
      if (!activeSeatRow && !activeMemberRow) {
        return {
          dirty: false,
          result: { status: 403, code: "not-admitted" } as RoomServiceError,
        };
      }
      const actor: Actor = activeSeatRow
        ? { kind: "seat", seat: activeSeatRow.seat }
        : {
            kind: "member",
            memberId: (activeMemberRow as StoredRoomMember).id,
          };

      const digestOfState = () => {
        const lobby = buildLobbyState(doc, now);
        const lobbyDigest = JSON.stringify(lobby);
        const youDigest =
          actor.kind === "seat" ? `s:${actor.seat}` : `m:${actor.memberId}`;
        const rndDigest = randomnessKey(doc.pendingDice);
        return { lobby, lobbyDigest, youDigest, rndDigest };
      };

      // Fast paths that never advance game state.
      if (message.type === "ping") {
        messages.push({ type: "pong", t: message.t, serverNow: now });
        const d = digestOfState();
        return {
          dirty,
          result: {
            messages,
            lobbyDigest: d.lobbyDigest,
            youDigest: d.youDigest,
            randomnessDigest: d.rndDigest,
          },
        };
      }
      if (message.type === "debug-info") {
        messages.push({
          type: "room-diagnostics",
          value: roomDiagnosticsPayload(doc, now),
        });
        const d = digestOfState();
        return {
          dirty,
          result: {
            messages,
            lobbyDigest: d.lobbyDigest,
            youDigest: d.youDigest,
            randomnessDigest: d.rndDigest,
          },
        };
      }

      // Advance any due timers (dice beacons, bot actions, turn/match timeouts).
      if (await advanceDueTimers(doc, now, messages)) {
        dirty = true;
      }

      if (message.type === "sync") {
        const d = digestOfState();
        const youChanged =
          options.knownYou !== undefined &&
          options.knownYou !== null &&
          options.knownYou !== d.youDigest;
        const returnedToLobby =
          options.poll === true &&
          message.lastSeq !== null &&
          message.lastSeq > 0 &&
          doc.saved === null;
        const needsSnapshotReset =
          options.poll === true &&
          message.lastSeq !== null &&
          doc.saved !== null &&
          (doc.saved.seq - message.lastSeq > MAX_REPLAY_GAP ||
            message.lastSeq > doc.saved.seq ||
            (doc.events[0] !== undefined &&
              message.lastSeq < doc.events[0].seq - 1));

        if (
          !options.poll ||
          youChanged ||
          returnedToLobby ||
          needsSnapshotReset
        ) {
          const welcome = buildWelcomeMessage(
            doc,
            actor,
            returnedToLobby || needsSnapshotReset ? null : message.lastSeq,
            now,
          );
          messages.push(welcome);
          if (
            welcome.snapshot === null &&
            message.lastSeq !== null &&
            doc.saved &&
            message.lastSeq < doc.saved.seq
          ) {
            const replayMsg = buildEventsMessage(doc, message.lastSeq);
            if (replayMsg) messages.push(replayMsg);
          }
        } else {
          if (
            message.lastSeq !== null &&
            doc.saved &&
            message.lastSeq < doc.saved.seq
          ) {
            const replayMsg = buildEventsMessage(doc, message.lastSeq);
            if (replayMsg) messages.push(replayMsg);
          }
          if (d.rndDigest !== options.knownRandomness) {
            if (doc.pendingDice) {
              messages.push({
                type: "randomness",
                status: "committed",
                commitment: doc.pendingDice.commitment,
              });
            }
          }
          if (d.lobbyDigest !== options.knownLobby) {
            messages.push({ type: "lobby", lobby: d.lobby });
          }
        }

        return {
          dirty,
          result: {
            messages,
            lobbyDigest: d.lobbyDigest,
            youDigest: d.youDigest,
            randomnessDigest: d.rndDigest,
          },
        };
      }

      const seqBeforeCommand = doc.saved?.seq ?? 0;

      if (message.type === "lobby") {
        const opResult = await this.applyLobbyOp(
          doc,
          actor,
          message,
          now,
          messages,
        );
        if (opResult.changed) dirty = true;
      } else {
        const intentResult = await this.applyIntentOp(
          doc,
          actor,
          message,
          now,
          messages,
        );
        if (intentResult.changed) dirty = true;
      }

      // Immediately resolve due timers created by this command (e.g. secure dice, quick bot first roll).
      if (await advanceDueTimers(doc, now, messages)) {
        dirty = true;
      }

      // Push incremental updates back in the same RPC response.
      const baseSeq =
        clientLastSeq !== null && clientLastSeq <= seqBeforeCommand
          ? clientLastSeq
          : seqBeforeCommand;
      if (doc.saved) {
        if (
          baseSeq < doc.saved.seq &&
          doc.saved.seq - baseSeq <= MAX_REPLAY_GAP
        ) {
          const delta = buildEventsMessage(doc, baseSeq);
          if (delta) messages.push(delta);
        } else if (baseSeq < doc.saved.seq) {
          messages.push(buildWelcomeMessage(doc, actor, null, now));
        }
      } else if (seqBeforeCommand > 0 && doc.saved === null) {
        messages.push(buildWelcomeMessage(doc, actor, null, now));
      }
      const d = digestOfState();
      messages.push({ type: "lobby", lobby: d.lobby });

      return {
        dirty,
        result: {
          messages,
          lobbyDigest: d.lobbyDigest,
          youDigest: d.youDigest,
          randomnessDigest: d.rndDigest,
        },
      };
    });
  }

  private async applyLobbyOp(
    doc: MutableDoc,
    actor: Actor,
    message: Extract<ClientMessage, { type: "lobby" }>,
    now: number,
    messages: ServerMessage[],
  ): Promise<{ readonly changed: boolean }> {
    if (actor.kind !== "seat") {
      messages.push({
        type: "reject",
        id: message.id,
        reason: "not-seated",
      });
      return { changed: false };
    }
    const seat = actor.seat;
    if (commandUsed(doc, seat, message.id)) {
      messages.push({ type: "reject", id: message.id, reason: "duplicate" });
      return { changed: false };
    }
    const reject = (reason: string) => {
      messages.push({ type: "reject", id: message.id, reason });
      return { changed: false };
    };
    const ack = () => {
      rememberCommand(doc, seat, message.id);
      messages.push({ type: "ack", id: message.id });
      return { changed: true };
    };

    const op = message.op;
    const leader = seat === doc.hostSeat;

    if (op.type === "add-local" || op.type === "remove-local") {
      if (doc.saved) return reject("game-already-started");
      if (op.type === "add-local") {
        if (doc.seats.some((s) => s.seat === op.seat)) {
          return reject("seat-taken");
        }
        if (op.seat !== freeSeat(doc)) return reject("seat-order");
        doc.seats.push({
          seat: op.seat,
          name: op.name,
          control: "human",
          tokenHash: null,
          botDifficulty: null,
          ...(op.cosmetics ? { cosmetics: op.cosmetics } : {}),
          lastSeenAt: null,
        });
        doc.localSeats.push({ seat: op.seat, controller: seat });
        return ack();
      }
      const local = doc.localSeats.find((entry) => entry.seat === op.seat);
      if (!local) return reject("not-local");
      if (local.controller !== seat && !leader) return reject("host-only");
      doc.seats = doc.seats.filter((entry) => entry.seat !== op.seat);
      doc.localSeats = doc.localSeats.filter((entry) => entry.seat !== op.seat);
      doc.commands = doc.commands.filter((entry) => entry.seat !== op.seat);
      compactLobbySeats(doc);
      seatWaitingMembers(doc);
      return ack();
    }

    if (op.type === "cosmetics") {
      if (doc.saved) return reject("game-already-started");
      const entry = doc.seats.find((candidate) => candidate.seat === op.seat);
      if (!entry) return reject("not-seated");
      const allowed =
        op.seat === seat ||
        controllerOf(doc, op.seat) === seat ||
        (leader && entry.control === "bot");
      if (!allowed) {
        return reject(entry.control === "bot" ? "host-only" : "not-your-seat");
      }
      doc.seats = doc.seats.map((s) =>
        s.seat === op.seat ? { ...s, cosmetics: op.cosmetics } : s,
      );
      return ack();
    }

    if (!leader) return reject("host-only");

    switch (op.type) {
      case "transfer-host": {
        const target = doc.seats.find((s) => s.seat === op.seat);
        if (
          op.seat === seat ||
          target?.control !== "human" ||
          target.tokenHash === null
        ) {
          return reject("not-transferable");
        }
        doc.hostSeat = op.seat;
        return ack();
      }
      case "lock": {
        doc.locked = op.locked;
        if (!op.locked) {
          doc.members = doc.members.map((m) => ({ ...m, approved: true }));
          seatWaitingMembers(doc);
        }
        return ack();
      }
      case "admit":
      case "deny": {
        const member = doc.members.find((m) => m.id === op.member);
        if (!member) return reject("member-not-found");
        if (op.type === "admit") {
          doc.members = doc.members.map((m) =>
            m.id === op.member ? { ...m, approved: true } : m,
          );
          seatWaitingMembers(doc);
          return ack();
        }
        doc.members = doc.members.filter((m) => m.id !== op.member);
        return ack();
      }
      case "replace-bot": {
        if (!doc.saved) return reject("game-not-started");
        if (doc.saved.state.pause) return reject("pause-in-progress");
        if (doc.pendingDice) return reject("randomness-pending");
        const member = doc.members.find((m) => m.id === op.member);
        if (!member?.approved) return reject("member-not-found");
        const target = doc.seats.find((s) => s.seat === op.seat);
        if (target?.control !== "bot") return reject("not-a-bot");
        const result = changeControl(
          doc.saved.state,
          op.seat,
          "human",
          member.name,
        );
        if (!result.ok) return reject(result.error.code);
        doc.seats = doc.seats.map((s) =>
          s.seat === op.seat
            ? {
                seat: op.seat,
                name: member.name,
                control: "human",
                tokenHash: member.tokenHash,
                botDifficulty: null,
                ...(member.cosmetics ? { cosmetics: member.cosmetics } : {}),
                lastSeenAt: member.lastSeenAt,
              }
            : s,
        );
        doc.members = doc.members.filter((m) => m.id !== member.id);
        appendPersistedState(doc, result.state, result.events, now, {
          command: { seat, id: message.id },
        });
        messages.push({ type: "ack", id: message.id });
        return { changed: true };
      }
      case "return-to-lobby": {
        if (!doc.saved) return reject("game-not-started");
        doc.saved = null;
        doc.events = [];
        doc.pendingDice = null;
        doc.botTimerAt = null;
        doc.lastProof = null;
        doc.commands = [];
        doc.expiresAt = now + LOBBY_LIFETIME_MS;
        doc.seats = doc.seats.map((s) => ({ ...s, takeover: false }));
        seatWaitingMembers(doc);
        rememberCommand(doc, seat, message.id);
        messages.push({ type: "ack", id: message.id });
        messages.push(buildWelcomeMessage(doc, actor, null, now));
        return { changed: true };
      }
      case "settings": {
        if (doc.saved) return reject("game-already-started");
        doc.config = op.config;
        return ack();
      }
      case "add-bot": {
        if (doc.saved) return reject("game-already-started");
        if (doc.seats.some((s) => s.seat === op.seat)) {
          return reject("seat-taken");
        }
        if (op.seat !== freeSeat(doc)) return reject("seat-order");
        doc.seats.push({
          seat: op.seat,
          name: BOT_NAMES[op.seat],
          control: "bot",
          tokenHash: null,
          botDifficulty: doc.config.botDifficulty,
          lastSeenAt: null,
        });
        return ack();
      }
      case "remove-bot": {
        if (doc.saved) return reject("game-already-started");
        const bot = doc.seats.find((s) => s.seat === op.seat);
        if (bot?.control !== "bot") return reject("not-a-bot");
        doc.seats = doc.seats.filter((s) => s.seat !== op.seat);
        compactLobbySeats(doc);
        seatWaitingMembers(doc);
        return ack();
      }
      case "bot-difficulty": {
        if (doc.saved) return reject("game-already-started");
        const bot = doc.seats.find((s) => s.seat === op.seat);
        if (bot?.control !== "bot") return reject("not-a-bot");
        doc.seats = doc.seats.map((s) =>
          s.seat === op.seat ? { ...s, botDifficulty: op.difficulty } : s,
        );
        return ack();
      }
      case "start": {
        if (doc.saved) return reject("game-already-started");
        if (op.fillBots) {
          for (const candidate of SEAT_ORDER) {
            if (!doc.seats.some((s) => s.seat === candidate)) {
              doc.seats.push({
                seat: candidate,
                name: BOT_NAMES[candidate],
                control: "bot",
                tokenHash: null,
                botDifficulty: doc.config.botDifficulty,
                lastSeenAt: null,
              });
            }
          }
        }
        if (doc.seats.length < ECONOMY.minimumPlayers) {
          return reject("need-more-players");
        }
        const sortedSeats = [...doc.seats].sort((a, b) => a.seat - b.seat);
        const engineSeats: SeatInfo[] = sortedSeats.map((s) => ({
          playerId: `seat-${s.seat}`,
          seat: s.seat,
          name: s.name,
          control: s.control,
          ...(s.control === "bot"
            ? { botDifficulty: s.botDifficulty ?? doc.config.botDifficulty }
            : {}),
          ...(s.cosmetics ? { cosmetics: s.cosmetics } : {}),
        }));
        const started = createGame(
          {
            ...DEFAULT_GAME_CONFIG,
            ...doc.config,
            gameId: doc.roomCode,
          },
          engineSeats,
          randomSeed(),
          createEngineContext(now),
        );
        doc.expiresAt = null;
        appendPersistedState(doc, started.state, started.events, now, {
          command: { seat, id: message.id },
        });
        messages.push({ type: "ack", id: message.id });
        return { changed: true };
      }
      default: {
        const exhaustive: never = op;
        return exhaustive;
      }
    }
  }

  private async applyIntentOp(
    doc: MutableDoc,
    actor: Actor,
    message: Extract<ClientMessage, { type: "intent" }>,
    now: number,
    messages: ServerMessage[],
  ): Promise<{ readonly changed: boolean }> {
    const reject = (reason: string, detail?: string) => {
      messages.push({
        type: "reject",
        id: message.id,
        reason,
        ...(detail ? { message: detail } : {}),
      });
      return { changed: false };
    };
    if (actor.kind !== "seat") return reject("not-seated");
    const targetSeat = message.seat ?? actor.seat;
    if (!controlledSeats(doc, actor.seat).includes(targetSeat)) {
      return reject("not-your-seat");
    }
    if (!doc.saved) return reject("game-not-started");
    if (message.atSeq !== doc.saved.seq) return reject("stale");
    if (doc.pendingDice) return reject("randomness-pending");
    if (commandUsed(doc, targetSeat, message.id)) return reject("duplicate");

    const pauseAction =
      message.action.type === "RequestPause" ||
      message.action.type === "VotePause" ||
      message.action.type === "ResumeGame";

    if (!pauseAction && doc.saved.state.pause?.kind === "paused") {
      return reject("game-paused");
    }
    if (
      doc.saved.state.pause?.kind !== "paused" &&
      doc.saved.state.pending &&
      now >= doc.saved.state.pending.deadline &&
      !pauseAction
    ) {
      return reject("decision-expired");
    }
    if (!pauseAction) {
      const legal = legalActions(toPublic(doc.saved.state), targetSeat).some(
        (candidate) =>
          JSON.stringify(candidate) === JSON.stringify(message.action),
      );
      if (!legal) {
        return reject(
          doc.saved.state.activeSeat !== targetSeat
            ? "not-your-turn"
            : "illegal-action",
        );
      }
    }

    if (message.action.type === "Roll") {
      const commitment = prepareDice(
        doc.config.randomnessMode,
        { roomCode: doc.roomCode, seq: doc.saved.seq, seat: targetSeat },
        now,
      );
      doc.pendingDice = {
        commitment,
        seat: targetSeat,
        action: message.action,
        intentId: message.id,
        atSeq: doc.saved.seq,
      };
      rememberCommand(doc, targetSeat, message.id);
      doc.botTimerAt = null;
      messages.push({ type: "ack", id: message.id });
      messages.push({
        type: "randomness",
        status: "committed",
        commitment,
      });
      return { changed: true };
    }

    const applied = applyAction(doc.saved.state, targetSeat, message.action, {
      ...createEngineContext(now),
      pauseSeats: doc.saved.state.players
        .filter((player) => player.control === "human" && !player.bankrupt)
        .map((player) => player.seat),
    });
    if (!applied.ok) return reject(applied.error.code, applied.error.message);

    appendPersistedState(doc, applied.state, applied.events, now, {
      command: { seat: targetSeat, id: message.id },
    });
    messages.push({ type: "ack", id: message.id });
    return { changed: true };
  }
}
