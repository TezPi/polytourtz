import type { Seat } from "./types.js";

export const CHARACTER_SKINS = [
  "classic",
  "tycoon",
  "astronaut",
  "ninja",
  "robot",
  "pirate",
  "royal",
  "cat",
] as const;
export type CharacterSkin = (typeof CHARACTER_SKINS)[number];

export const OUTFIT_TONES = [
  "seat",
  "gold",
  "sakura",
  "mint",
  "midnight",
  "cream",
  "cyan",
  "crimson",
] as const;
export type OutfitTone = (typeof OUTFIT_TONES)[number];

export const HAT_ACCESSORIES = [
  "none",
  "crown",
  "tophat",
  "cap",
  "wizard",
  "headphones",
  "halo",
  "propeller",
] as const;
export type HatAccessory = (typeof HAT_ACCESSORIES)[number];

export const EYEWEAR_ACCESSORIES = [
  "none",
  "shades",
  "monocle",
  "visor",
  "round",
  "star",
] as const;
export type EyewearAccessory = (typeof EYEWEAR_ACCESSORIES)[number];

export const GEAR_ACCESSORIES = [
  "none",
  "wings",
  "cape",
  "jetpack",
  "bowtie",
  "scarf",
  "shield",
] as const;
export type GearAccessory = (typeof GEAR_ACCESSORIES)[number];

/** Player character customization synced across lobby, HUD, and 3D pawns. */
export type PlayerCosmetics = {
  readonly skin: CharacterSkin;
  readonly tone: OutfitTone;
  readonly hat: HatAccessory;
  readonly eyewear: EyewearAccessory;
  readonly gear: GearAccessory;
};

export const DEFAULT_COSMETICS: PlayerCosmetics = {
  skin: "classic",
  tone: "seat",
  hat: "none",
  eyewear: "none",
  gear: "none",
};

/** Default distinctive cosmetics given to server bots unless customized. */
export const BOT_DEFAULT_COSMETICS: Record<Seat, PlayerCosmetics> = {
  0: DEFAULT_COSMETICS,
  1: {
    skin: "ninja",
    tone: "midnight",
    hat: "none",
    eyewear: "visor",
    gear: "scarf",
  },
  2: {
    skin: "astronaut",
    tone: "cream",
    hat: "halo",
    eyewear: "shades",
    gear: "jetpack",
  },
  3: {
    skin: "robot",
    tone: "cyan",
    hat: "headphones",
    eyewear: "visor",
    gear: "shield",
  },
  4: {
    skin: "cat",
    tone: "gold",
    hat: "crown",
    eyewear: "star",
    gear: "cape",
  },
};

export function resolveCosmetics(
  seat: Seat,
  control: "human" | "bot" | null | undefined,
  cosmetics?: PlayerCosmetics | null,
): PlayerCosmetics {
  if (cosmetics) return cosmetics;
  if (control === "bot") return BOT_DEFAULT_COSMETICS[seat];
  return DEFAULT_COSMETICS;
}

export function isDefaultCosmetics(cosmetics: PlayerCosmetics): boolean {
  return (
    cosmetics.skin === DEFAULT_COSMETICS.skin &&
    cosmetics.tone === DEFAULT_COSMETICS.tone &&
    cosmetics.hat === DEFAULT_COSMETICS.hat &&
    cosmetics.eyewear === DEFAULT_COSMETICS.eyewear &&
    cosmetics.gear === DEFAULT_COSMETICS.gear
  );
}
