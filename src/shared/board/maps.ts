import {
  COUNTRY_IDS,
  type CountryId,
  MAP_IDS,
  type MapId,
  type ResortId,
  type Tile,
} from "./types.js";

export const BASE_CITY_COUNT = 20;
export const RESORT_COUNT = 4;
export const MIN_EXTRA_LOCATIONS = -8;
export const MAX_EXTRA_LOCATIONS = 24;
export const DEFAULT_LOTS_PER_SIDE = 7;
export const MAX_LOTS_PER_SIDE = 13;
export const MAX_BOARD_SIZE = 4 * (MAX_LOTS_PER_SIDE + 1);

export const MAP_DEFAULT_EXTRA_LOCATIONS: Record<MapId, number> = {
  world: 0,
  usa: 15,
  vietnam: 10,
  japan: 20,
};

export function resolveMapId(value: unknown): MapId {
  return typeof value === "string" &&
    (MAP_IDS as readonly string[]).includes(value)
    ? (value as MapId)
    : "world";
}

export function clampExtraLocations(extra: number | undefined): number {
  if (extra === undefined || !Number.isFinite(extra)) return 0;
  return Math.max(
    MIN_EXTRA_LOCATIONS,
    Math.min(MAX_EXTRA_LOCATIONS, Math.round(extra)),
  );
}

export function getMapDefaultExtraLocations(mapId: MapId): number {
  return MAP_DEFAULT_EXTRA_LOCATIONS[mapId];
}

export function getLotsPerSideForCityCount(cityCount: number): number {
  const minEdgeSlots = cityCount + RESORT_COUNT + 4;
  return Math.ceil(minEdgeSlots / 4);
}

const CUSTOM_BOARD_CACHE = new Map<string, readonly Tile[]>();

const SIDE_RESORT_RATIO = [4 / 7, 6 / 7, 2 / 7, 1 / 7] as const;
const CHANCE_SIDE_ORDER = [2, 3, 4, 1] as const;

function nearestFreeOffset(
  lotsPerSide: number,
  target: number,
  occupied: ReadonlySet<number>,
  forbiddenLast = false,
): number {
  const maxAllowed = forbiddenLast ? Math.max(1, lotsPerSide - 1) : lotsPerSide;
  const clamped = Math.max(1, Math.min(maxAllowed, target));
  for (let delta = 0; delta < lotsPerSide; delta++) {
    for (const sign of delta === 0 ? [0] : [-1, 1]) {
      const candidate = clamped + sign * delta;
      if (candidate >= 1 && candidate <= maxAllowed && !occupied.has(candidate))
        return candidate;
    }
  }
  for (let candidate = 1; candidate <= lotsPerSide; candidate++)
    if (!occupied.has(candidate)) return candidate;
  throw new Error("No free slot available on board side");
}

/**
 * Builds a symmetric 4-sided board holding `20 + extraLocations` cities (`12..44`),
 * 4 resorts (one per side), at least 3 Chance spaces, 1 Tax space on side 4,
 * and contiguous country color groups that stay within each side.
 */
export function buildCustomBoard(
  mapId: MapId,
  extraLocations: number,
): readonly Tile[] {
  const clampedExtra = clampExtraLocations(extraLocations);
  const key = `${mapId}:${clampedExtra}`;
  const cached = CUSTOM_BOARD_CACHE.get(key);
  if (cached) return cached;

  const cityCount = BASE_CITY_COUNT + clampedExtra;
  const lotsPerSide = getLotsPerSideForCityCount(cityCount);
  const stride = lotsPerSide + 1;
  const total = 4 * stride;
  const specialCount = 4 * lotsPerSide - cityCount - RESORT_COUNT;
  const chanceCount = specialCount - 1;

  const resorts = new Map<number, number>();
  const chances = new Set<number>();
  let taxIndex = 4 * stride - 2;

  const sideOccupied: Set<number>[] = [
    new Set(),
    new Set(),
    new Set(),
    new Set(),
  ];

  // One resort per side, placed symmetrically at varied positions.
  for (let side = 1; side <= 4; side++) {
    const offset = Math.max(
      1,
      Math.min(
        lotsPerSide,
        Math.round(lotsPerSide * SIDE_RESORT_RATIO[side - 1]),
      ),
    );
    sideOccupied[side - 1].add(offset);
    resorts.set((side - 1) * stride + offset, side);
  }

  // Tax sits near the high-rent end of side 4 while leaving the final lot a city.
  {
    const occupied = sideOccupied[3];
    const taxOffset = nearestFreeOffset(
      lotsPerSide,
      Math.max(1, lotsPerSide - 1),
      occupied,
      lotsPerSide >= 3,
    );
    occupied.add(taxOffset);
    taxIndex = 3 * stride + taxOffset;
  }

  // Spread Chance squares across the sides, keeping pairs well apart.
  const chancePerSide = [0, 0, 0, 0];
  for (let i = 0; i < chanceCount; i++) {
    const side = CHANCE_SIDE_ORDER[i % CHANCE_SIDE_ORDER.length];
    chancePerSide[side - 1] += 1;
  }
  for (let side = 1; side <= 4; side++) {
    const count = chancePerSide[side - 1];
    const occupied = sideOccupied[side - 1];
    for (let k = 1; k <= count; k++) {
      const ideal = Math.round((k * (lotsPerSide + 1)) / (count + 1));
      const offset = nearestFreeOffset(
        lotsPerSide,
        ideal,
        occupied,
        side === 4 && lotsPerSide >= 3,
      );
      occupied.add(offset);
      chances.add((side - 1) * stride + offset);
    }
  }

  const cityIndicesBySide: number[][] = [[], [], [], []];
  for (let side = 1; side <= 4; side++) {
    const start = (side - 1) * stride;
    for (let offset = 1; offset <= lotsPerSide; offset++) {
      const idx = start + offset;
      if (!resorts.has(idx) && !chances.has(idx) && idx !== taxIndex)
        cityIndicesBySide[side - 1].push(idx);
    }
  }

  const cityCountry = new Map<
    number,
    { country: CountryId; city: 1 | 2 | 3 | 4 }
  >();
  let groupCursor = 0;
  for (let side = 1; side <= 4; side++) {
    const cities = cityIndicesBySide[side - 1];
    const count = cities.length;
    if (count === 0) continue;
    const groupsOnSide = count <= 3 ? 1 : count <= 7 ? 2 : 3;
    const baseSize = Math.floor(count / groupsOnSide);
    const remainder = count % groupsOnSide;
    let cursor = 0;
    for (let g = 0; g < groupsOnSide; g++) {
      const size = baseSize + (g >= groupsOnSide - remainder ? 1 : 0);
      const country = COUNTRY_IDS[groupCursor++];
      for (let i = 0; i < size; i++) {
        cityCountry.set(cities[cursor++], {
          country,
          city: (i + 1) as 1 | 2 | 3 | 4,
        });
      }
    }
  }

  const board: Tile[] = [];
  for (let index = 0; index < total; index++) {
    const side = (Math.floor(index / stride) + 1) as 1 | 2 | 3 | 4;
    if (index === 0) {
      board.push({ kind: "start", index: 0 });
    } else if (index === stride) {
      board.push({ kind: "island", index });
    } else if (index === 2 * stride) {
      board.push({ kind: "championship", index });
    } else if (index === 3 * stride) {
      board.push({ kind: "world-tour", index });
    } else if (resorts.has(index)) {
      board.push({
        kind: "resort",
        index,
        resort: side as ResortId,
        side,
      });
    } else if (chances.has(index)) {
      board.push({ kind: "chance", index });
    } else if (index === taxIndex) {
      board.push({ kind: "tax", index });
    } else {
      const entry = cityCountry.get(index);
      if (!entry) throw new Error(`Missing country group for city ${index}`);
      board.push({
        kind: "city",
        index,
        country: entry.country,
        city: entry.city,
        side,
      });
    }
  }

  CUSTOM_BOARD_CACHE.set(key, board);
  return board;
}
