import {
  type BoardSelector,
  ECONOMY,
  getBoard,
  getTileLandPrice,
  isCityTile,
  isResortTile,
  type MapId,
  resolveMapId,
} from "../../shared/board/index.js";
import {
  boardRule,
  economyRule,
  type PublicState,
  type Seat,
} from "../../shared/engine/index.js";
import { getLocale, translate } from "../i18n.js";

export const PLAYER_COLORS = [
  "#be3d24",
  "#236cce",
  "#8151b5",
  "#26764c",
  "#c97b14",
] as const;
export const PLAYER_LABELS = [
  "Corail",
  "Océan",
  "Lavande",
  "Forêt",
  "Ambre",
] as const;
// Six vivid hues spread around the wheel and two muted concrete tones, so
// groups stay apart even as the light tints printed on the board. Look-alike
// pairs (orange and yellow, blue and teal) sit on different sides, yellow
// stays away from the sand of the beaches, and the two concrete regions
// (slate lavender, warm taupe) never read as Japan's pink.
export const REGION_COLORS = {
  A: "#5b8fd9",
  B: "#ec8a3c",
  C: "#5fb56c",
  D: "#8a84ad",
  E: "#a9876f",
  F: "#e6c033",
  G: "#3fb5ad",
  H: "#dc72bd",
  I: "#d45d5d",
  J: "#4b9cd3",
  K: "#84b04c",
  L: "#b06cc4",
} as const;
// One country per colour group, from France to Japan; resorts sit between.
export const TILE_NAMES = [
  "Départ",
  "Lyon",
  "Marseille",
  "Paris",
  "Seychelles",
  "Naples",
  "Milan",
  "Rome",
  "Île paisible",
  "Faro",
  "Porto",
  "Lisbonne",
  "Surprise",
  "Hambourg",
  "Maldives",
  "Berlin",
  "Championnat",
  "Genève",
  "Bora Bora",
  "Zurich",
  "Surprise",
  "Chicago",
  "Los Angeles",
  "New York",
  "Tour du monde",
  "Hawaï",
  "Busan",
  "Séoul",
  "Surprise",
  "Osaka",
  "Impôts",
  "Tokyo",
] as const;
export const LEVEL_NAMES = [
  "Terrain",
  "1 maison",
  "2 maisons",
  "3 maisons",
  "Hôtel",
  "Monument",
] as const;
const ENGLISH_TILE_NAMES = [
  "Start",
  "Lyon",
  "Marseille",
  "Paris",
  "Seychelles",
  "Naples",
  "Milan",
  "Rome",
  "Island",
  "Faro",
  "Porto",
  "Lisbon",
  "Chance",
  "Hamburg",
  "Maldives",
  "Berlin",
  "Championship",
  "Geneva",
  "Bora Bora",
  "Zurich",
  "Chance",
  "Chicago",
  "Los Angeles",
  "New York",
  "World tour",
  "Hawaii",
  "Busan",
  "Seoul",
  "Chance",
  "Osaka",
  "Taxes",
  "Tokyo",
] as const;
const ENGLISH_LEVEL_NAMES = [
  "Land",
  "1 house",
  "2 houses",
  "3 houses",
  "Hotel",
  "Landmark",
] as const;
const LEGACY_TILE_NAMES = [
  "Départ",
  "Roubaix",
  "Saint-Étienne",
  "Surprise",
  "Grenade",
  "Côte d’Azur",
  "Valence",
  "Séville",
  "Île paisible",
  "Porto",
  "Lisbonne",
  "Rome",
  "Chypre",
  "Milan",
  "Surprise",
  "Berlin",
  "Championnat",
  "Prague",
  "Vienne",
  "Surprise",
  "Londres",
  "Dubaï",
  "Montréal",
  "New York",
  "Grand voyage",
  "Sydney",
  "Singapour",
  "Séoul",
  "Bali",
  "Impôts",
  "Osaka",
  "Tokyo",
] as const;
const LEGACY_ENGLISH_TILE_NAMES = [
  "Start",
  "Roubaix",
  "Saint-Étienne",
  "Chance",
  "Granada",
  "French Riviera",
  "Valencia",
  "Seville",
  "Island",
  "Porto",
  "Lisbon",
  "Rome",
  "Cyprus",
  "Milan",
  "Chance",
  "Berlin",
  "Championship",
  "Prague",
  "Vienna",
  "Chance",
  "London",
  "Dubai",
  "Montréal",
  "New York",
  "World tour",
  "Sydney",
  "Singapore",
  "Seoul",
  "Bali",
  "Taxes",
  "Osaka",
  "Tokyo",
] as const;
const VIETNAMESE_TILE_NAMES = [
  "Xuất phát",
  "Lyon",
  "Marseille",
  "Paris",
  "Seychelles",
  "Naples",
  "Milan",
  "Rome",
  "Đảo hoang",
  "Faro",
  "Porto",
  "Lisbon",
  "Cơ hội",
  "Hamburg",
  "Maldives",
  "Berlin",
  "Giải đấu",
  "Geneva",
  "Bora Bora",
  "Zurich",
  "Cơ hội",
  "Chicago",
  "Los Angeles",
  "New York",
  "Du lịch",
  "Hawaii",
  "Busan",
  "Seoul",
  "Cơ hội",
  "Osaka",
  "Thuế",
  "Tokyo",
] as const;
const VIETNAMESE_LEVEL_NAMES = [
  "Đất trống",
  "1 nhà",
  "2 nhà",
  "3 nhà",
  "Khách sạn",
  "Kỳ quan",
] as const;
const LEGACY_VIETNAMESE_TILE_NAMES = [
  "Xuất phát",
  "Roubaix",
  "Saint-Étienne",
  "Cơ hội",
  "Granada",
  "French Riviera",
  "Valencia",
  "Seville",
  "Đảo hoang",
  "Porto",
  "Lisbon",
  "Rome",
  "Síp",
  "Milan",
  "Cơ hội",
  "Berlin",
  "Giải đấu",
  "Prague",
  "Vienna",
  "Cơ hội",
  "London",
  "Dubai",
  "Montréal",
  "New York",
  "Du lịch",
  "Sydney",
  "Singapore",
  "Seoul",
  "Bali",
  "Thuế",
  "Osaka",
  "Tokyo",
] as const;
type BoardConfig = BoardSelector;

type PlaceName = string | readonly [fr: string, en: string, vi: string];

function resolvePlace(entry: PlaceName): string {
  return typeof entry === "string"
    ? entry
    : translate(entry[0], entry[1], entry[2]);
}

const MAP_CITIES: Record<MapId, readonly PlaceName[]> = {
  world: [
    "Lyon",
    "Marseille",
    "Paris",
    "Naples",
    "Milan",
    "Rome",
    "Faro",
    "Porto",
    ["Lisbonne", "Lisbon", "Lisbon"],
    ["Hambourg", "Hamburg", "Hamburg"],
    "Berlin",
    ["Genève", "Geneva", "Geneva"],
    "Zurich",
    "Amsterdam",
    "Madrid",
    ["Athènes", "Athens", "Athens"],
    "Stockholm",
    ["Copenhague", "Copenhagen", "Copenhagen"],
    "Dublin",
    "Istanbul",
    ["Le Caire", "Cairo", "Cairo"],
    "Marrakech",
    "Cape Town",
    "Mumbai",
    "Bangkok",
    "Taipei",
    "Jakarta",
    ["Manille", "Manila", "Manila"],
    "Auckland",
    "Vancouver",
    "Toronto",
    ["Mexico", "Mexico City", "Mexico City"],
    "Chicago",
    "Los Angeles",
    "New York",
    "Bogotá",
    "Lima",
    "Santiago",
    "Buenos Aires",
    ["Rio", "Rio de Janeiro", "Rio de Janeiro"],
    "Busan",
    ["Séoul", "Seoul", "Seoul"],
    "Osaka",
    "Tokyo",
  ],
  usa: [
    "Boise",
    "Anchorage",
    "Albuquerque",
    "Omaha",
    "Tucson",
    "Fresno",
    "Salt Lake City",
    "Sacramento",
    "Kansas City",
    "Raleigh",
    "Indianapolis",
    "Columbus",
    "Milwaukee",
    "Charlotte",
    "Nashville",
    "Austin",
    "Memphis",
    ["La Nouvelle-Orléans", "New Orleans", "New Orleans"],
    "Portland",
    "Denver",
    "Minneapolis",
    "St. Louis",
    "Pittsburgh",
    "Cleveland",
    "Detroit",
    "Baltimore",
    "Orlando",
    "Tampa",
    "Phoenix",
    "San Diego",
    "San Antonio",
    "Dallas",
    "Houston",
    "Atlanta",
    ["Philadelphie", "Philadelphia", "Philadelphia"],
    "Washington",
    "Boston",
    "Seattle",
    "Las Vegas",
    "Miami",
    "Chicago",
    "San Francisco",
    "Los Angeles",
    "New York",
  ],
  vietnam: [
    "Lạng Sơn",
    "Cao Bằng",
    "Điện Biên Phủ",
    "Hà Giang",
    "Lào Cai",
    "Yên Bái",
    "Thái Nguyên",
    "Bắc Ninh",
    "Hải Dương",
    "Nam Định",
    "Ninh Bình",
    "Thanh Hóa",
    "Vinh",
    "Hà Tĩnh",
    "Đồng Hới",
    "Đông Hà",
    "Huế",
    "Hội An",
    "Tam Kỳ",
    "Quảng Ngãi",
    "Quy Nhơn",
    "Tuy Hòa",
    "Buôn Ma Thuột",
    "Pleiku",
    "Đà Lạt",
    "Phan Thiết",
    "Biên Hòa",
    "Thủ Dầu Một",
    "Vũng Tàu",
    "Mỹ Tho",
    "Bến Tre",
    "Vĩnh Long",
    "Long Xuyên",
    "Rạch Giá",
    "Cà Mau",
    "Hạ Long",
    "Hải Phòng",
    "Nha Trang",
    "Cần Thơ",
    "Đà Nẵng",
    "Bình Dương",
    "Thủ Đức",
    ["Hanoï", "Hanoi", "Hà Nội"],
    ["Hô-Chi-Minh", "Ho Chi Minh", "TP. Hồ Chí Minh"],
  ],
  japan: [
    "Kushiro",
    "Aomori",
    "Akita",
    "Morioka",
    "Yamagata",
    "Fukushima",
    "Mito",
    "Utsunomiya",
    "Takasaki",
    "Nagano",
    "Toyama",
    "Kanazawa",
    "Fukui",
    "Kofu",
    "Matsumoto",
    "Shizuoka",
    "Hamamatsu",
    "Gifu",
    "Tsu",
    "Otsu",
    "Nara",
    "Wakayama",
    "Tottori",
    "Matsue",
    "Okayama",
    "Takamatsu",
    "Matsuyama",
    "Kochi",
    "Miyazaki",
    "Kagoshima",
    "Kumamoto",
    "Nagasaki",
    "Oita",
    "Niigata",
    "Sendai",
    "Hiroshima",
    "Kobe",
    "Fukuoka",
    "Sapporo",
    "Nagoya",
    "Yokohama",
    "Kyoto",
    "Osaka",
    "Tokyo",
  ],
};

const MAP_RESORTS: Record<MapId, readonly PlaceName[]> = {
  world: ["Seychelles", "Maldives", "Bora Bora", ["Hawaï", "Hawaii", "Hawaii"]],
  usa: ["Maui", "Aspen", "Key West", "Lake Tahoe"],
  vietnam: ["Phú Quốc", "Côn Đảo", "Cát Bà", "Mũi Né"],
  japan: ["Okinawa", "Hakone", "Niseko", "Ishigaki"],
};

export function mapLabel(mapId: MapId): string {
  switch (mapId) {
    case "usa":
      return translate("États-Unis", "USA", "Nước Mỹ");
    case "vietnam":
      return translate("Viêt Nam", "Vietnam", "Việt Nam");
    case "japan":
      return translate("Japon", "Japan", "Nhật Bản");
    default:
      return translate("Monde", "World", "Thế giới");
  }
}

export function tileName(index: number, config?: BoardConfig): string {
  const obj = typeof config === "string" ? { boardRule: config } : config;
  const mapId = resolveMapId(obj?.mapId);
  const extra = obj?.mapExtraLocations ?? 0;
  if (mapId === "world" && extra === 0) {
    const legacy = obj !== undefined && boardRule(obj) === "legacy";
    return translate(
      (legacy ? LEGACY_TILE_NAMES : TILE_NAMES)[index] ?? "",
      (legacy ? LEGACY_ENGLISH_TILE_NAMES : ENGLISH_TILE_NAMES)[index] ?? "",
      (legacy ? LEGACY_VIETNAMESE_TILE_NAMES : VIETNAMESE_TILE_NAMES)[index] ??
        "",
    );
  }
  const board = getBoard(config);
  const tile = board[index];
  if (!tile) return "";
  switch (tile.kind) {
    case "start":
      return translate("Départ", "Start", "Xuất phát");
    case "island":
      return translate("Île paisible", "Island", "Đảo hoang");
    case "championship":
      return translate("Championnat", "Championship", "Giải đấu");
    case "world-tour":
      return translate("Tour du monde", "World tour", "Du lịch");
    case "chance":
      return translate("Surprise", "Chance", "Cơ hội");
    case "tax":
      return translate("Impôts", "Taxes", "Thuế");
    case "resort": {
      const resorts = board.filter(isResortTile);
      const ordinal = resorts.findIndex((entry) => entry.index === index);
      return resolvePlace(MAP_RESORTS[mapId][ordinal % 4]);
    }
    case "city": {
      const cities = board.filter(isCityTile);
      const ordinal = cities.findIndex((entry) => entry.index === index);
      const pool = MAP_CITIES[mapId];
      const pick =
        cities.length <= 1
          ? pool.length - 1
          : Math.round((ordinal * (pool.length - 1)) / (cities.length - 1));
      return resolvePlace(pool[pick]);
    }
  }
}
export function levelName(level: number): string {
  return translate(
    LEVEL_NAMES[level] ?? "",
    ENGLISH_LEVEL_NAMES[level] ?? "",
    VIETNAMESE_LEVEL_NAMES[level] ?? "",
  );
}
export const TILE_ICONS: Record<string, string> = {
  start: "↗",
  island: "☀",
  championship: "★",
  "world-tour": "✈",
  chance: "?",
  tax: "¤",
  resort: "☂",
  city: "⌂",
};
export function tileColor(index: number, config?: BoardConfig) {
  const tile = getBoard(config)[index];
  if (!tile) return "#78bda7";
  return tile.kind === "city"
    ? REGION_COLORS[tile.country]
    : tile.kind === "resort"
      ? "#52aab8"
      : tile.kind === "chance"
        ? "#e7b24c"
        : "#78bda7";
}
/** Land price under the match's frozen rules; new rooms use the reference grid. */
export function tilePrice(
  index: number,
  state: Pick<PublicState, "config"> | null = null,
) {
  const tile = getBoard(state?.config)[index];
  if (!tile) return null;
  return tile.kind === "city"
    ? getTileLandPrice(
        tile.index,
        state ? economyRule(state.config) : "reference",
        state?.config ?? "country",
      )
    : tile.kind === "resort"
      ? ECONOMY.resortPrice
      : null;
}
export function tilePosition(index: number): [number, number] {
  const step = 1.08;
  if (index <= 8) return [(index - 4) * step, 4 * step];
  if (index <= 16) return [4 * step, (12 - index) * step];
  if (index <= 24) return [(20 - index) * step, -4 * step];
  return [-4 * step, (index - 28) * step];
}
export function pawnOffset(seat: Seat): [number, number] {
  if (seat === 4) return [0, 0];
  return [seat % 2 === 0 ? -0.19 : 0.19, seat < 2 ? -0.18 : 0.18];
}
/** Exact amount with grouped digits (1 800 000), for balances players track. */
export function fullMoney(value: number) {
  const locale = getLocale();
  return new Intl.NumberFormat(
    locale === "fr" ? "fr-FR" : locale === "vi" ? "vi-VN" : "en-GB",
    {
      maximumFractionDigits: 0,
    },
  ).format(value);
}
export function money(value: number) {
  const current = getLocale();
  const locale =
    current === "fr" ? "fr-CH" : current === "vi" ? "vi-VN" : "en-GB";
  if (Math.abs(value) >= 1_000_000)
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value / 1_000_000)} M`;
  if (Math.abs(value) >= 1000)
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1000)} k`;
  return new Intl.NumberFormat(locale).format(value);
}
