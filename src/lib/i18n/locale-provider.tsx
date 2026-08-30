"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, type Locale } from "./config";
import ru from "./dictionaries/ru";
import uz from "./dictionaries/uz";

const dictionaries = { ru, uz } as const;
type Dictionary = typeof ru;
type Namespace = keyof Dictionary;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const router = useRouter();

  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000`;
      setLocaleState(next);
      router.refresh();
    },
    [router],
  );

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}

export function useTranslations<N extends Namespace>(namespace: N): (key: keyof Dictionary[N] & string) => string {
  const { locale } = useLocale();
  return useCallback(
    (key) => {
      const namespaceDict = dictionaries[locale][namespace] as Record<string, string>;
      return namespaceDict[key] ?? key;
    },
    [locale, namespace],
  );
}
