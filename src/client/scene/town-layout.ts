import {
  type BoardSelector,
  getBoard,
  getBoardLotsPerSide,
} from "../../shared/board/index.js";
import {
  LOTS_PER_SIDE,
  lawnHalfFor,
  sideFrame,
  tileCenter,
  tileRotation,
  tileSide,
  type Vec2,
} from "./board-layout.js";

// The town that fills the middle of the board, in world units.
//
// A paved plaza stays free for the dice. A roundabout circles it and four
// avenues run from it to the corners, each ending in a turning circle. Facing
// every side of the board, one street holds a plot for each city or
// resort of that side, in play order. A plot shows what its owner has built,
// so the middle of the board grows with the game.
//
// Readability comes first: nothing in the town may hide the board road, a lot
// or the dice. Anything standing at a point may be at most `visibilityCap`
// tall there; the layout tests check every envelope below against the camera.

export const PLAZA_RADIUS = 1.34;
/** Center line of the one-way roundabout around the plaza. */
export const RING_RADIUS = 1.48;
export const RING_HALF_WIDTH = 0.14;
export const AVENUE_START = RING_RADIUS + RING_HALF_WIDTH;
export const AVENUE_HALF_WIDTH = 0.15;
export const LANE_OFFSET = 0.07;
/** Distance from the board center to each avenue's turning circle. */
export const TURNING_CIRCLE = 3.3;
export const TURNING_RADIUS = 0.15;
export const TURNING_CIRCLE_PAVED = 0.25;

export const PLOT_WIDTH = 0.36;
export const PLOT_DEPTH = 0.4;
/** Distance from the lawn edge to the middle of each street of plots. */
export const PLOT_INSET = 0.94;
/** The tallest building of the town: a landmark with its spire. */
export const TOWN_MAX_HEIGHT = 0.68;
/** Clearance kept between a shadowed strip of ground and the board road. */
const ROAD_CLEARANCE = 0.03;

export type TownFeature = {
  readonly position: Vec2;
  /** Half extent of the square that holds the whole feature. */
  readonly radius: number;
  readonly height: number;
};

export type TownMetrics = {
  readonly lotsPerSide: number;
  readonly lawnHalf: number;
  readonly plazaRadius: number;
  readonly ringRadius: number;
  readonly ringHalfWidth: number;
  readonly avenueStart: number;
  readonly turningCircle: number;
  readonly plotInset: number;
  readonly ferrisWheel: TownFeature | null;
  readonly carousel: TownFeature | null;
  readonly pond: TownFeature | null;
  readonly helipad: TownFeature | null;
  readonly fountains: readonly TownFeature[];
};

/** Ground point `inset` in from a side's lawn edge, `along` its play axis. */
export function lawnPoint(
  side: number,
  along: number,
  inset: number,
  lotsPerSide = LOTS_PER_SIDE,
): Vec2 {
  const frame = sideFrame(side);
  const out = lawnHalfFor(lotsPerSide) - inset;
  return [
    frame.along[0] * along - frame.inward[0] * out,
    frame.along[1] * along - frame.inward[1] * out,
  ];
}

/** Unit direction from the board center toward corner `corner` (0-3). */
export function cornerDirection(
  corner: number,
  lotsPerSide = LOTS_PER_SIDE,
): Vec2 {
  const stride = lotsPerSide + 1;
  const [x, z] = tileCenter(corner * stride, lotsPerSide);
  const length = Math.hypot(x, z);
  return [x / length, z / length];
}

/** A point `distance` out along a corner's avenue, `across` to its left. */
export function avenuePoint(
  corner: number,
  distance: number,
  across: number,
  lotsPerSide = LOTS_PER_SIDE,
): Vec2 {
  const [x, z] = cornerDirection(corner, lotsPerSide);
  // Left of the outward direction when seen from above: (-z, x) turned back.
  return [x * distance + z * across, z * distance - x * across];
}

export const FERRIS_WHEEL_RADIUS = 0.36;

export function townMetrics(lotsPerSide = LOTS_PER_SIDE): TownMetrics {
  const lawnHalf = lawnHalfFor(lotsPerSide);
  const plazaScale =
    lotsPerSide < LOTS_PER_SIDE ? Math.max(0.45, (lawnHalf - 0.85) / 1.93) : 1;
  const plazaRadius = PLAZA_RADIUS * plazaScale;
  const ringRadius = RING_RADIUS * plazaScale;
  const ringHalfWidth = RING_HALF_WIDTH * plazaScale;
  const avenueStart = ringRadius + ringHalfWidth;
  const plotInset =
    lotsPerSide < LOTS_PER_SIDE
      ? Math.min(PLOT_INSET, lawnHalf - avenueStart - PLOT_DEPTH / 2 - 0.14)
      : PLOT_INSET;
  const turningCircle =
    lotsPerSide === LOTS_PER_SIDE
      ? TURNING_CIRCLE
      : lawnHalf * Math.SQRT2 - (lotsPerSide < LOTS_PER_SIDE ? 0.5 : 0.63);
  const attractionDist =
    lotsPerSide === LOTS_PER_SIDE ? 2.86 : lawnHalf * Math.SQRT2 - 1.07;
  const includeAttractions = lotsPerSide >= LOTS_PER_SIDE;
  return {
    lotsPerSide,
    lawnHalf,
    plazaRadius,
    ringRadius,
    ringHalfWidth,
    avenueStart,
    turningCircle,
    plotInset,
    ferrisWheel: includeAttractions
      ? {
          position: avenuePoint(0, attractionDist, 0.62, lotsPerSide),
          radius: FERRIS_WHEEL_RADIUS * Math.SQRT1_2 + 0.04,
          height: 0.88,
        }
      : null,
    carousel: includeAttractions
      ? {
          position: avenuePoint(
            0,
            lotsPerSide === LOTS_PER_SIDE ? 2.84 : attractionDist - 0.02,
            -0.62,
            lotsPerSide,
          ),
          radius: 0.22,
          height: 0.42,
        }
      : null,
    pond: includeAttractions
      ? {
          position: avenuePoint(1, attractionDist, 0.66, lotsPerSide),
          radius: 0.3,
          height: 0.2,
        }
      : null,
    helipad: includeAttractions
      ? {
          position: avenuePoint(3, attractionDist, -0.66, lotsPerSide),
          radius: 0.24,
          height: 0.2,
        }
      : null,
    fountains: [0, 1, 2, 3].map((corner) => ({
      position: avenuePoint(corner, turningCircle, 0, lotsPerSide),
      radius: 0.07,
      height: 0.2,
    })),
  };
}

export type TownPlot = {
  readonly tile: number;
  readonly side: 0 | 1 | 2 | 3;
  readonly position: Vec2;
  /** Same frame as the tile: local x along play, local z toward the center. */
  readonly rotation: number;
};

const PLOT_CACHE = new Map<string, readonly TownPlot[]>();

/** Each board gets a finite, evenly spaced street, including larger custom sides. */
export function townPlots(
  selector: BoardSelector = "country",
): readonly TownPlot[] {
  const lotsPerSide = getBoardLotsPerSide(selector);
  const board = getBoard(selector);
  const key = `${typeof selector === "string" ? selector : `${selector.boardRule ?? "legacy"}:${selector.mapId ?? "world"}:${selector.mapExtraLocations ?? 0}`}`;
  const cached = PLOT_CACHE.get(key);
  if (cached) return cached;
  const metrics = townMetrics(lotsPerSide);
  const plots = [0, 1, 2, 3].flatMap((side) => {
    const properties = board.filter(
      (tile) =>
        (tile.kind === "city" || tile.kind === "resort") &&
        tileSide(tile.index, lotsPerSide) === side,
    );
    const maxSpan = Math.max(
      0.8,
      metrics.lawnHalf - metrics.plotInset - AVENUE_HALF_WIDTH - 0.36,
    );
    const pitch =
      properties.length <= 1
        ? 0.41
        : Math.min(0.41, (maxSpan * 2) / (properties.length - 1));
    // A 0.41 pitch leaves room for the printed plot and its building envelope.
    // Six-plot legacy streets keep the gap around the central footpath.
    const along =
      lotsPerSide === LOTS_PER_SIDE && properties.length === 6
        ? [-1.11, -0.69, -0.27, 0.27, 0.69, 1.11]
        : properties.map(
            (_, order) => (order - (properties.length - 1) / 2) * pitch,
          );
    return properties.map((tile, order) => ({
      tile: tile.index,
      side: side as TownPlot["side"],
      position: lawnPoint(side, along[order], metrics.plotInset, lotsPerSide),
      rotation: tileRotation(tile.index, lotsPerSide),
    }));
  });
  PLOT_CACHE.set(key, plots);
  return plots;
}

export const TOWN_PLOTS = townPlots();

export function townPlot(tile: number, selector: BoardSelector = "country") {
  return townPlots(selector).find((plot) => plot.tile === tile);
}

/**
 * How tall something may stand on a square footprint without hiding the
 * board road behind it. Seen from the camera, a height h hides √2·h of
 * ground behind it, so h may not exceed the distance to the lawn edge
 * measured along both back axes.
 */
export function visibilityCap(
  x: number,
  z: number,
  radius: number,
  lotsPerSide = LOTS_PER_SIDE,
) {
  return Math.min(x, z) - radius + lawnHalfFor(lotsPerSide) - ROAD_CLEARANCE;
}

const DEFAULT_METRICS = townMetrics();
export const FERRIS_WHEEL: TownFeature =
  DEFAULT_METRICS.ferrisWheel as TownFeature;
export const CAROUSEL: TownFeature = DEFAULT_METRICS.carousel as TownFeature;
export const POND: TownFeature = DEFAULT_METRICS.pond as TownFeature;
export const HELIPAD: TownFeature = DEFAULT_METRICS.helipad as TownFeature;
export const FOUNTAINS: readonly TownFeature[] = DEFAULT_METRICS.fountains;

/** A tree, sized to stay under the visibility cap where it grows. */
export type TownTree = { readonly position: Vec2; readonly height: number };
export const TREE_RADIUS = 0.11;
const TREE_HEIGHT = 0.36;

function tree(position: Vec2, lotsPerSide = LOTS_PER_SIDE): TownTree {
  const [x, z] = position;
  return {
    position,
    height: Math.min(
      TREE_HEIGHT,
      visibilityCap(x, z, TREE_RADIUS, lotsPerSide),
    ),
  };
}

function clearOfAvenueAndPlots(
  candidate: TownTree,
  metrics: TownMetrics,
  plots: readonly TownPlot[],
): boolean {
  if (candidate.height < 0.16) return false;
  const features = [
    metrics.ferrisWheel,
    metrics.carousel,
    metrics.pond,
    metrics.helipad,
    ...metrics.fountains,
  ].filter((item): item is TownFeature => item !== null);
  for (const feature of features) {
    if (
      Math.max(
        Math.abs(feature.position[0] - candidate.position[0]),
        Math.abs(feature.position[1] - candidate.position[1]),
      ) <=
      feature.radius + TREE_RADIUS + 0.02
    )
      return false;
  }
  const plotHalfAlong = PLOT_WIDTH / 2;
  const plotHalfDepth = PLOT_DEPTH / 2;
  for (const plot of plots) {
    const alongX = plot.side % 2 === 0;
    const halfX = (alongX ? plotHalfAlong : plotHalfDepth) + TREE_RADIUS + 0.02;
    const halfZ = (alongX ? plotHalfDepth : plotHalfAlong) + TREE_RADIUS + 0.02;
    if (
      Math.abs(plot.position[0] - candidate.position[0]) < halfX &&
      Math.abs(plot.position[1] - candidate.position[1]) < halfZ
    )
      return false;
  }
  return true;
}

export function townTrees(
  selector: BoardSelector = "country",
): readonly TownTree[] {
  const lotsPerSide = getBoardLotsPerSide(selector);
  const metrics = townMetrics(lotsPerSide);
  const plots = townPlots(selector);
  const avenueDists =
    lotsPerSide === LOTS_PER_SIDE
      ? [1.86, 2.72]
      : lotsPerSide < LOTS_PER_SIDE
        ? []
        : [metrics.avenueStart + 0.24, metrics.turningCircle - 0.58];
  const parkAlongs =
    lotsPerSide === LOTS_PER_SIDE
      ? [-0.92, -0.48, 0.48, 0.92]
      : lotsPerSide < LOTS_PER_SIDE
        ? [-0.45, 0.45]
        : [-1.4, -0.7, 0.7, 1.4];
  return [
    ...[0, 1, 2, 3].flatMap((corner) =>
      avenueDists.flatMap((distance) =>
        [-1, 1].map((left) =>
          tree(
            avenuePoint(corner, distance, left * 0.32, lotsPerSide),
            lotsPerSide,
          ),
        ),
      ),
    ),
    ...[0, 1, 2, 3].flatMap((side) =>
      parkAlongs.map((along) =>
        tree(lawnPoint(side, along, 0.4, lotsPerSide), lotsPerSide),
      ),
    ),
  ].filter((candidate) => clearOfAvenueAndPlots(candidate, metrics, plots));
}

export const TOWN_TREES: readonly TownTree[] = townTrees();

/**
 * The cars' closed circuit, sampled every `spacing` units: in along an
 * avenue, a quarter of the roundabout, out along the next avenue, around its
 * turning circle and back in. One lap visits all four avenues.
 */
export function townCircuit(
  spacing = 0.02,
  lotsPerSide = LOTS_PER_SIDE,
): readonly Vec2[] {
  const metrics = townMetrics(lotsPerSide);
  const polyline: Vec2[] = [];
  const steps = 18;
  const [startX, startZ] = cornerDirection(0, lotsPerSide);
  let angle = Math.atan2(startZ, startX);
  for (let leg = 0; leg < 4; leg++) {
    const corner = cornerAt(angle, lotsPerSide);
    const next = cornerAt(angle - Math.PI / 2, lotsPerSide);
    // Traffic keeps right: inbound cars drive left of the outward axis.
    polyline.push(
      avenuePoint(
        corner,
        metrics.turningCircle - 0.12,
        LANE_OFFSET,
        lotsPerSide,
      ),
      avenuePoint(corner, metrics.avenueStart + 0.06, LANE_OFFSET, lotsPerSide),
    );
    // Counter-clockwise from above: the angle decreases.
    const offset = LANE_OFFSET / metrics.ringRadius;
    for (let step = 0; step <= steps; step++) {
      const a = angle - offset - ((Math.PI / 2 - offset * 2) * step) / steps;
      polyline.push([
        Math.cos(a) * metrics.ringRadius,
        Math.sin(a) * metrics.ringRadius,
      ]);
    }
    polyline.push(
      avenuePoint(next, metrics.avenueStart + 0.06, -LANE_OFFSET, lotsPerSide),
      avenuePoint(
        next,
        metrics.turningCircle - 0.12,
        -LANE_OFFSET,
        lotsPerSide,
      ),
    );
    // Half way around the fountain, from the outbound lane to the inbound one.
    for (let step = 0; step <= steps; step++) {
      const turn = -Math.PI / 2 + (Math.PI * step) / steps;
      polyline.push(
        avenuePoint(
          next,
          metrics.turningCircle + Math.cos(turn) * TURNING_RADIUS,
          Math.sin(turn) * TURNING_RADIUS,
          lotsPerSide,
        ),
      );
    }
    angle -= Math.PI / 2;
  }
  return resample(smooth(polyline, 3), spacing);
}

function cornerAt(angle: number, lotsPerSide: number) {
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let corner = 0; corner < 4; corner++) {
    const [x, z] = cornerDirection(corner, lotsPerSide);
    const d = Math.hypot(x - Math.cos(angle), z - Math.sin(angle));
    if (d < distance) {
      best = corner;
      distance = d;
    }
  }
  return best;
}

/** Chaikin corner cutting on a closed polyline. */
function smooth(points: readonly Vec2[], passes: number): Vec2[] {
  let current = [...points];
  for (let pass = 0; pass < passes; pass++) {
    const next: Vec2[] = [];
    for (let index = 0; index < current.length; index++) {
      const [ax, az] = current[index];
      const [bx, bz] = current[(index + 1) % current.length];
      next.push(
        [ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25],
        [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75],
      );
    }
    current = next;
  }
  return current;
}

/** Evenly spaced points along a closed polyline. */
function resample(points: readonly Vec2[], spacing: number): Vec2[] {
  const lengths = [0];
  for (let index = 0; index < points.length; index++) {
    const [ax, az] = points[index];
    const [bx, bz] = points[(index + 1) % points.length];
    lengths.push(lengths[index] + Math.hypot(bx - ax, bz - az));
  }
  const total = lengths[points.length];
  const count = Math.round(total / spacing);
  const result: Vec2[] = [];
  let segment = 0;
  for (let sample = 0; sample < count; sample++) {
    const distance = (sample * total) / count;
    while (lengths[segment + 1] < distance) segment += 1;
    const [ax, az] = points[segment];
    const [bx, bz] = points[(segment + 1) % points.length];
    const span = lengths[segment + 1] - lengths[segment];
    const t = span > 0 ? (distance - lengths[segment]) / span : 0;
    result.push([ax + (bx - ax) * t, az + (bz - az) * t]);
  }
  return result;
}
