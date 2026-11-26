import { useSyncExternalStore } from "react";
import {
  CHARACTER_SKINS,
  type CharacterSkin,
  DEFAULT_COSMETICS,
  EYEWEAR_ACCESSORIES,
  type EyewearAccessory,
  GEAR_ACCESSORIES,
  type GearAccessory,
  HAT_ACCESSORIES,
  type HatAccessory,
  OUTFIT_TONES,
  type OutfitTone,
  type PlayerCosmetics,
  type Seat,
} from "../../shared/engine/index.js";
import { translate } from "../i18n.js";
import { PLAYER_COLORS } from "./board-display.js";

export const COSMETICS_STORAGE_KEY = "polytour.cosmetics.v1";

export const OUTFIT_TONE_HEX: Record<Exclude<OutfitTone, "seat">, string> = {
  gold: "#d9981e",
  sakura: "#d95b8f",
  mint: "#2d9f7e",
  midnight: "#283952",
  cream: "#e7dfd0",
  cyan: "#2b90ba",
  crimson: "#b9313d",
};

export function resolveBodyColor(
  seat: Seat,
  cosmetics?: PlayerCosmetics | null,
): string {
  const tone = cosmetics?.tone ?? "seat";
  if (tone !== "seat") return OUTFIT_TONE_HEX[tone];
  switch (cosmetics?.skin) {
    case "robot":
      return "#8ea0ae";
    case "astronaut":
      return "#edf2f7";
    case "ninja":
      return "#253143";
    case "tycoon":
      return "#2e3d4f";
    case "cat":
      return "#e69a57";
    case "pirate":
      return "#304b69";
    case "royal":
      return "#6d3b9e";
    default:
      return PLAYER_COLORS[seat];
  }
}

export function skinLabel(skin: CharacterSkin): string {
  switch (skin) {
    case "classic":
      return translate("Classique", "Classic", "Cổ điển");
    case "tycoon":
      return translate("Magnat", "Tycoon", "Tỷ phú");
    case "astronaut":
      return translate("Astronaute", "Astronaut", "Phi hành gia");
    case "ninja":
      return translate("Ninja", "Ninja", "Ninja");
    case "robot":
      return translate("Robot", "Robot", "Robot");
    case "pirate":
      return translate("Pirate", "Pirate", "Hải tặc");
    case "royal":
      return translate("Royal", "Royal", "Hoàng gia");
    case "cat":
      return translate("Chat", "Lucky Cat", "Mèo may mắn");
  }
}

export function toneLabel(tone: OutfitTone): string {
  switch (tone) {
    case "seat":
      return translate("Couleur du siège", "Seat color", "Theo màu ghế");
    case "gold":
      return translate("Or impérial", "Royal Gold", "Vàng hoàng kim");
    case "sakura":
      return translate("Sakura", "Sakura", "Hồng anh đào");
    case "mint":
      return translate("Menthe", "Mint", "Xanh bạc hà");
    case "midnight":
      return translate("Nuit", "Midnight", "Xanh đêm");
    case "cream":
      return translate("Crème", "Cream", "Kem sữa");
    case "cyan":
      return translate("Cyan", "Cyan", "Xanh ngọc");
    case "crimson":
      return translate("Carmin", "Crimson", "Đỏ thẫm");
  }
}

export function hatLabel(hat: HatAccessory): string {
  switch (hat) {
    case "none":
      return translate("Par défaut", "Default", "Mặc định");
    case "crown":
      return translate("Couronne", "Crown", "Vương miện");
    case "tophat":
      return translate("Haut-de-forme", "Top Hat", "Mũ chóp");
    case "cap":
      return translate("Casquette", "Cap", "Mũ lưỡi trai");
    case "wizard":
      return translate("Chapeau magique", "Wizard Hat", "Mũ phù thủy");
    case "headphones":
      return translate("Casque audio", "Headphones", "Tai nghe");
    case "halo":
      return translate("Auréole", "Halo", "Hào quang");
    case "propeller":
      return translate("Hélice", "Propeller", "Chong chóng");
  }
}

export function eyewearLabel(eyewear: EyewearAccessory): string {
  switch (eyewear) {
    case "none":
      return translate("Aucune", "None", "Không");
    case "shades":
      return translate("Solaires", "Shades", "Kính râm");
    case "monocle":
      return translate("Monocle", "Monocle", "Kính một mắt");
    case "visor":
      return translate("Visière cyber", "Cyber Visor", "Kính Cyber");
    case "round":
      return translate("Rondes", "Round", "Kính tròn");
    case "star":
      return translate("Étoiles", "Star Glasses", "Kính ngôi sao");
  }
}

export function gearLabel(gear: GearAccessory): string {
  switch (gear) {
    case "none":
      return translate("Aucun", "None", "Không");
    case "wings":
      return translate("Ailes", "Wings", "Cánh thiên thần");
    case "cape":
      return translate("Cape", "Cape", "Áo choàng");
    case "jetpack":
      return translate("Jetpack", "Jetpack", "Tên lửa đẩy");
    case "bowtie":
      return translate("Nœud papillon", "Bowtie", "Nơ cổ");
    case "scarf":
      return translate("Écharpe", "Scarf", "Khăn choàng");
    case "shield":
      return translate("Bouclier", "Mini Shield", "Khiên nhỏ");
  }
}

export function randomCosmetics(): PlayerCosmetics {
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(Math.random() * items.length)];
  return {
    skin: pick(CHARACTER_SKINS),
    tone: pick(OUTFIT_TONES),
    hat: pick(HAT_ACCESSORIES),
    eyewear: pick(EYEWEAR_ACCESSORIES),
    gear: pick(GEAR_ACCESSORIES),
  };
}

const listeners = new Set<() => void>();

function validateCosmetics(value: unknown): PlayerCosmetics {
  if (!value || typeof value !== "object") return DEFAULT_COSMETICS;
  const record = value as Record<string, unknown>;
  const inList = <T extends string>(
    list: readonly T[],
    candidate: unknown,
    fallback: T,
  ): T =>
    typeof candidate === "string" &&
    (list as readonly string[]).includes(candidate)
      ? (candidate as T)
      : fallback;
  return {
    skin: inList(CHARACTER_SKINS, record.skin, DEFAULT_COSMETICS.skin),
    tone: inList(OUTFIT_TONES, record.tone, DEFAULT_COSMETICS.tone),
    hat: inList(HAT_ACCESSORIES, record.hat, DEFAULT_COSMETICS.hat),
    eyewear: inList(
      EYEWEAR_ACCESSORIES,
      record.eyewear,
      DEFAULT_COSMETICS.eyewear,
    ),
    gear: inList(GEAR_ACCESSORIES, record.gear, DEFAULT_COSMETICS.gear),
  };
}

function readStoredCosmetics(): PlayerCosmetics {
  if (typeof window === "undefined") return DEFAULT_COSMETICS;
  try {
    const raw = window.localStorage.getItem(COSMETICS_STORAGE_KEY);
    if (!raw) return DEFAULT_COSMETICS;
    return validateCosmetics(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_COSMETICS;
  }
}

let currentCosmetics = readStoredCosmetics();

export function getOwnCosmetics(): PlayerCosmetics {
  return currentCosmetics;
}

export function saveOwnCosmetics(next: PlayerCosmetics): void {
  currentCosmetics = validateCosmetics(next);
  try {
    if (typeof window !== "undefined")
      window.localStorage.setItem(
        COSMETICS_STORAGE_KEY,
        JSON.stringify(currentCosmetics),
      );
  } catch {
    // Ignore storage errors when localStorage is restricted.
  }
  for (const listener of listeners) listener();
}

export function useOwnCosmetics(): PlayerCosmetics {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getOwnCosmetics,
    () => DEFAULT_COSMETICS,
  );
}
