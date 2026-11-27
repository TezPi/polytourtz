import { describe, expect, it } from "vitest";
import {
  getBoard,
  getMapDefaultExtraLocations,
  isCityTile,
  isResortTile,
} from "../../shared/board/index.js";
import { DEFAULT_GAME_CONFIG } from "../../shared/engine/index.js";
import { setLocale } from "../i18n.js";
import { mapLabel, tileName, tilePrice } from "./board-display.js";

describe("board display across custom maps", () => {
  it("assigns unique localized city and resort names across usa, vietnam, and japan", () => {
    setLocale("vi");
    expect(mapLabel("usa")).toBe("Nước Mỹ");
    expect(mapLabel("vietnam")).toBe("Việt Nam");
    expect(mapLabel("japan")).toBe("Nhật Bản");

    for (const mapId of ["usa", "vietnam", "japan"] as const) {
      const config = {
        ...DEFAULT_GAME_CONFIG,
        boardRule: "country" as const,
        mapId,
        mapExtraLocations: getMapDefaultExtraLocations(mapId),
      };
      const board = getBoard(config);
      const propertyNames = board
        .filter((tile) => isCityTile(tile) || isResortTile(tile))
        .map((tile) => tileName(tile.index, config));
      expect(propertyNames.every((name) => name.trim().length > 0)).toBe(true);
      expect(new Set(propertyNames).size).toBe(propertyNames.length);
      const lastCity = board.filter(isCityTile).at(-1);
      expect(lastCity).toBeDefined();
      if (lastCity) {
        expect(tilePrice(lastCity.index, { config })).toBe(400_000);
      }
    }

    const lastTileName = (mapId: "usa" | "vietnam" | "japan") => {
      const config = {
        boardRule: "country" as const,
        mapId,
        mapExtraLocations: getMapDefaultExtraLocations(mapId),
      };
      const lastCity = getBoard(config).filter(isCityTile).at(-1);
      return tileName(lastCity?.index ?? 0, config);
    };
    expect(lastTileName("usa")).toBe("New York");
    expect(lastTileName("vietnam")).toBe("TP. Hồ Chí Minh");
    expect(lastTileName("japan")).toBe("Tokyo");
  });
});
