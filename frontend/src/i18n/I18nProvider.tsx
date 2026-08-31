import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getLanguage, setLanguage as persistLanguage, type Language } from ".";

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside <I18nProvider>");
  return context;
}

/**
 * Holds the active language and, critically, remounts everything beneath it via
 * `key` when the language changes.
 *
 * The remount is what lets the module-level label maps stay plain objects: they
 * read the current language lazily, and a fresh mount forces every one of them
 * to be read again. Without it, a component that only reads STATUS_LABELS at
 * render would keep showing the previous language until something else made it
 * re-render.
 */
export default function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getLanguage);

  const setLanguage = useCallback((next: Language) => {
    persistLanguage(next);
    setLanguageState(next);
  }, []);

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);

  return (
    <I18nContext.Provider value={value}>
      <div key={language} style={{ display: "contents" }}>
        {children}
      </div>
    </I18nContext.Provider>
  );
}
