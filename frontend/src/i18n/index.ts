import {
  CATALOGUES,
  LANGUAGE_NAMES,
  type Language,
  type TranslationKey,
} from "./translations";

export { LANGUAGE_NAMES, type Language, type TranslationKey };
export const LANGUAGES = Object.keys(CATALOGUES) as Language[];

const STORAGE_KEY = "language";

/**
 * English is the default and there is deliberately NO browser detection: the
 * app is meant to read as English unless somebody opts out. Auto-detecting
 * would mean an es-AR team never actually sees the default.
 */
export const DEFAULT_LANGUAGE: Language = "en";

function readStored(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in CATALOGUES) return stored as Language;
  } catch {
    // Private mode or blocked storage: fall through to the default.
  }
  return DEFAULT_LANGUAGE;
}

/**
 * Module-level rather than React state on purpose.
 *
 * The label maps (STATUS_LABELS, ROLE_META, STATE_META...) are module-level
 * constants imported by ~17 files. Threading a hook through every one of them
 * would have meant touching every call site; instead those maps expose lazy
 * getters that read this value, and I18nProvider remounts the tree on change so
 * everything re-reads. Language switching is a rare, deliberate action, so the
 * remount is cheap and it guarantees nothing is left showing a stale label.
 */
let current: Language = readStored();

export function getLanguage() {
  return current;
}

export function setLanguage(language: Language) {
  current = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not being able to remember the choice must not break switching it.
  }
  document.documentElement.lang = language;
}

/** Narrows an arbitrary string to a key the catalogue actually defines. */
export function hasTranslation(key: string): key is TranslationKey {
  return key in CATALOGUES.en;
}

/**
 * Same as t(), but for keys built at runtime (an API error code, say). Returns
 * undefined when the key is unknown so the caller can fall back to whatever the
 * server sent instead of rendering the raw key.
 */
export function tryT(key: string): string | undefined {
  return hasTranslation(key) ? t(key) : undefined;
}

/**
 * Looks a key up in the active catalogue, falling back to English and then to
 * the key itself. A missing key shows up as the key rather than as an empty
 * string, which makes the gap obvious instead of invisible.
 */
export function t(key: TranslationKey): string {
  return CATALOGUES[current][key] ?? CATALOGUES.en[key] ?? key;
}

/**
 * Same as t(), with {placeholder} substitution.
 *
 * Placeholders are named rather than positional so a translation can reorder
 * them: Spanish and English do not always put the number in the same place.
 */
export function tf(key: TranslationKey, vars: Record<string, string | number>): string {
  return t(key).replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match
  );
}

/**
 * Date/time locale derived from the language.
 *
 * Both options are day-first (DD/MM), so switching language never silently
 * reinterprets a date the way en-US would: 03/08 stays "3 August" either way.
 */
export function dateLocale(language: Language = current) {
  return language === "es" ? "es-AR" : "en-GB";
}

/**
 * Builds a Record whose values resolve through `t()` on every read.
 *
 * This is what lets the label maps stay module-level constants that ~17 files
 * index into directly (`STATUS_LABELS[status]`) while still following the
 * language. The getters are enumerable, so Object.keys/entries and spreading
 * behave exactly like a plain object.
 */
export function lazyLabels<K extends string>(
  keys: readonly K[],
  keyFor: (key: K) => TranslationKey
): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of keys) {
    Object.defineProperty(out, key, {
      get: () => t(keyFor(key)),
      enumerable: true,
    });
  }
  return out;
}
