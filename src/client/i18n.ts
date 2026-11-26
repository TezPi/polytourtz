import { useSyncExternalStore } from "react";
import { VI_TRANSLATIONS } from "./i18n-vi.js";
import { applyLocaleMetadata } from "./seo.js";
import {
  getSettings,
  subscribeSettings,
  updateSettings,
} from "./settings/store.js";

export type Locale = "fr" | "en" | "vi";
let appliedLocale = getSettings().locale;
applyLocaleMetadata(appliedLocale);
subscribeSettings(() => {
  const next = getSettings().locale;
  if (next === appliedLocale) return;
  appliedLocale = next;
  applyLocaleMetadata(next);
});

export function getLocale(): Locale {
  return getSettings().locale;
}

export function setLocale(next: Locale) {
  updateSettings({ locale: next });
}

export function translate(fr: string, en: string, vi?: string): string {
  const current = getLocale();
  if (current === "en") return en;
  if (current === "vi") return vi ?? VI_TRANSLATIONS[en] ?? en;
  return fr;
}

/** Language is a local display preference; it never enters the room protocol. */
export function useLocale() {
  const current = useSyncExternalStore(
    subscribeSettings,
    getLocale,
    () => "fr" as Locale,
  );
  return { locale: current, setLocale, t: translate };
}
