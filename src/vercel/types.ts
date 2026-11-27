import type {
  Action,
  BotDifficulty,
  GameEvent,
  GameState,
  PlayerCosmetics,
  Seat,
} from "../shared/engine/index.js";
import type { RoomConfig } from "../shared/protocol/index.js";
import type { DiceCommitment, DiceProof } from "../shared/randomness/types.js";

export type StoredRoomSeat = {
  readonly seat: Seat;
  readonly name: string;
  readonly control: "human" | "bot";
  readonly tokenHash: string | null;
  readonly botDifficulty: BotDifficulty | null;
  readonly cosmetics?: PlayerCosmetics;
  readonly lastSeenAt: number | null;
  readonly takeover?: boolean;
};

export type StoredRoomMember = {
  readonly id: string;
  readonly name: string;
  readonly tokenHash: string;
  readonly approved: boolean;
  readonly joinedAt: number;
  readonly lastSeenAt: number;
  readonly cosmetics?: PlayerCosmetics;
};

export type StoredLocalSeat = {
  readonly seat: Seat;
  readonly controller: Seat;
};

export type StoredRoomEvent = {
  readonly seq: number;
  readonly event: GameEvent;
  readonly proof: DiceProof | null;
};

export type PendingDice = {
  readonly commitment: DiceCommitment;
  readonly seat: Seat;
  readonly action: Action | null;
  readonly intentId: string | null;
  readonly atSeq: number;
};

export type VercelRoomDoc = {
  readonly version: 1;
  readonly rev?: number;
  readonly roomCode: string;
  readonly config: RoomConfig;
  readonly createdAt: number;
  readonly expiresAt: number | null;
  readonly hostSeat: Seat;
  readonly locked: boolean;
  readonly memberSeq: number;
  readonly seats: readonly StoredRoomSeat[];
  readonly members: readonly StoredRoomMember[];
  readonly localSeats: readonly StoredLocalSeat[];
  readonly commands: readonly { readonly seat: Seat; readonly id: string }[];
  readonly saved: { readonly seq: number; readonly state: GameState } | null;
  readonly events: readonly StoredRoomEvent[];
  readonly pendingDice: PendingDice | null;
  readonly botTimerAt: number | null;
  readonly lastProof: DiceProof | null;
};
