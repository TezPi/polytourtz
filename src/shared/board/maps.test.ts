import { describe, expect, it } from "vitest";
import { SIM_CONFIG, simulateGame } from "../../../tools/sim/simulation.js";
import {
  getBoard,
  getBoardLotsPerSide,
  getBoardSize,
  getCornerTileIndex,
  getCountryCityTiles,
  getMapDefaultExtraLocations,
  getTileBaseRent,
  getTileBuildCost,
  getTileLandPrice,
  isCityTile,
  isResortTile,
  MAP_IDS,
  MAX_EXTRA_LOCATIONS,
  MIN_EXTRA_LOCATIONS,
} from "./index.js";

describe("custom maps and resizable locations", () => {
  it("gives USA +15 (35 cities), Vietnam +10 (30 cities), and Japan +20 (40 cities)", () => {
    expect(getMapDefaultExtraLocations("world")).toBe(0);
    expect(getMapDefaultExtraLocations("usa")).toBe(15);
    expect(getMapDefaultExtraLocations("vietnam")).toBe(10);
    expect(getMapDefaultExtraLocations("japan")).toBe(20);

    for (const [mapId, expectedCities, expectedSize] of [
      ["usa", 35, 48],
      ["vietnam", 30, 44],
      ["japan", 40, 52],
    ] as const) {
      const config = {
        boardRule: "country" as const,
        mapId,
        mapExtraLocations: getMapDefaultExtraLocations(mapId),
      };
      const board = getBoard(config);
      expect(board).toHaveLength(expectedSize);
      expect(getBoardSize(config)).toBe(expectedSize);
      expect(board.filter(isCityTile)).toHaveLength(expectedCities);
      expect(board.filter(isResortTile)).toHaveLength(4);
      const stride = getBoardLotsPerSide(config) + 1;
      expect(getCornerTileIndex(config, "start")).toBe(0);
      expect(getCornerTileIndex(config, "island")).toBe(stride);
      expect(getCornerTileIndex(config, "championship")).toBe(stride * 2);
      expect(getCornerTileIndex(config, "world-tour")).toBe(stride * 3);
    }
  });

  it("scales cleanly when increasing or decreasing locations across all bounds", () => {
    for (const mapId of MAP_IDS) {
      for (
        let extra = MIN_EXTRA_LOCATIONS;
        extra <= MAX_EXTRA_LOCATIONS;
        extra += 4
      ) {
        const config = {
          boardRule: "country" as const,
          mapId,
          mapExtraLocations: extra,
        };
        const board = getBoard(config);
        const cities = board.filter(isCityTile);
        expect(cities).toHaveLength(20 + extra);
        expect(board.filter(isResortTile)).toHaveLength(4);
        expect(board.length % 4).toBe(0);

        for (const city of cities) {
          expect(
            getTileLandPrice(city.index, "reference", config),
          ).toBeGreaterThanOrEqual(60_000);
          expect(
            getTileBuildCost(city.index, 4, "reference", config),
          ).toBeGreaterThan(0);
          expect(
            getTileBaseRent(city.index, 4, "reference", config),
          ).toBeGreaterThan(
            getTileBaseRent(city.index, 0, "reference", config),
          );
        }

        const usedCountries = new Set(cities.map((c) => c.country));
        expect(usedCountries.size).toBeGreaterThanOrEqual(4);
        for (const country of usedCountries) {
          const group = getCountryCityTiles(country, config);
          expect(group.length).toBeGreaterThanOrEqual(2);
          expect(new Set(group.map((g) => g.side)).size).toBe(1);
        }
      }
    }
  });

  it("simulates full games with conserved cash on usa (+15), vietnam (+10), japan (+20), and small (-8)", () => {
    for (const [mapId, mapExtraLocations] of [
      ["usa", 15],
      ["vietnam", 10],
      ["japan", 20],
      ["world", -8],
    ] as const) {
      const result = simulateGame(7, {
        ...SIM_CONFIG,
        mapId,
        mapExtraLocations,
        roundLimit: 25,
      });
      expect(result.decisions).toBeGreaterThan(0);
      expect(result.rounds).toBeLessThanOrEqual(25);
    }
  });
});
