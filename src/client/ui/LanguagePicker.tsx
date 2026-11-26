import type { Locale } from "../i18n.js";
import { useLocale } from "../i18n.js";
import Icon from "./Icon.js";

const NEXT_LOCALE: Record<Locale, Locale> = {
  fr: "en",
  en: "vi",
  vi: "fr",
};

export default function LanguagePicker() {
  const { locale, setLocale, t } = useLocale();
  return (
    <button
      type="button"
      className="text-button language-trigger"
      aria-label={t(
        "FR · Passer en anglais",
        "EN · Switch to Vietnamese",
        "VI · Đổi ngôn ngữ",
      )}
      onClick={() => setLocale(NEXT_LOCALE[locale])}
    >
      <Icon name="globe" size={18} />
      <span>{locale.toUpperCase()}</span>
    </button>
  );
}
