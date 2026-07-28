"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { dictionaries, getInitialLanguage, LANGUAGE_STORAGE_KEY, translatePhrase, type Language, type TranslationKey } from "@/lib/i18n";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey) => string;
  tp: (value: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children, initialLanguage = "ru" }: { children: React.ReactNode; initialLanguage?: Language }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  useEffect(() => {
    const saved = getInitialLanguage();
    if (saved !== initialLanguage) {
      Promise.resolve().then(() => {
        setLanguageState(saved);
      });
    }
  }, [initialLanguage]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => {
    function setLanguage(nextLanguage: Language) {
      setLanguageState(nextLanguage);
      localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
      document.cookie = `${LANGUAGE_STORAGE_KEY}=${nextLanguage}; path=/; max-age=31536000; SameSite=Lax`;
      document.documentElement.lang = nextLanguage;
    }

    function t(key: TranslationKey) {
      const current = dictionaries[language][key];
      if (current) return current;

      // For non-Russian languages, fallback to Russian phrase and translate via phrase map
      if (language !== "ru") {
        const ru = dictionaries.ru[key];
        if (ru) {
          return translatePhrase(ru, language);
        }
      }

      // Final fallback to Russian dictionary or key itself
      return dictionaries.ru[key] || key;
    }

    function tp(value: string) {
      return translatePhrase(value, language);
    }

    return { language, setLanguage, t, tp };
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return context;
}
