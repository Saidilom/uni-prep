"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/locale-provider";
import type { Locale } from "@/lib/i18n/config";
import { useAuthStore } from "@/store/useAuthStore";
import supabase from "@/lib/supabase/client";

const OPTIONS: { value: Locale; label: string }[] = [
  { value: "ru", label: "RU" },
  { value: "uz", label: "UZ" },
];

const VARIANTS = {
  dark: {
    wrapper: "border-white/15 bg-white/5",
    active: "bg-white text-[hsl(var(--brand-olive-ink))]",
    inactive: "text-white/60 hover:text-white",
  },
  light: {
    wrapper: "border-border bg-muted",
    active: "bg-card text-foreground shadow-sm",
    inactive: "text-muted-foreground hover:text-foreground",
  },
} as const;

export default function LocaleSwitcher({
  className = "",
  variant = "dark",
  hrefFor,
}: {
  className?: string;
  variant?: keyof typeof VARIANTS;
  /**
   * Адрес языковой версии ЭТОЙ страницы, если у неё он свой.
   *
   * Нужен лендингу: там язык задаёт адрес (`/` и `/ru`), а не cookie, и одна
   * лишь смена cookie ничего бы не изменила — страница перерисовалась бы тем
   * же языком, и кнопка выглядела бы сломанной. Внутри приложения язык
   * по-прежнему живёт в cookie, и проп не передаётся.
   */
  hrefFor?: (locale: Locale) => string;
}) {
  const { locale, setLocale } = useLocale();
  const { user } = useAuthStore();
  const styles = VARIANTS[variant];

  const handleSelect = (next: Locale) => {
    setLocale(next);
    if (user) {
      supabase.from("users").update({ locale: next }).eq("id", user.id).then(({ error }) => {
        if (error) console.error("Failed to persist locale preference:", error);
      });
    }
  };

  return (
    <div className={`inline-flex items-center rounded-full border p-0.5 text-[11px] font-semibold ${styles.wrapper} ${className}`}>
      {OPTIONS.map((option) => {
        const classes = `rounded-full px-2.5 py-1 transition-colors ${locale === option.value ? styles.active : styles.inactive}`;
        // Ссылкой, а не кнопкой: выбор языка на лендинге — это переход на
        // другой адрес, и поиск должен увидеть его обычной ссылкой.
        // Cookie при этом всё равно ставим, чтобы выбор дожил до входа.
        return hrefFor ? (
          <Link
            key={option.value}
            href={hrefFor(option.value)}
            onClick={() => handleSelect(option.value)}
            aria-current={locale === option.value ? "true" : undefined}
            hrefLang={option.value}
            className={classes}
          >
            {option.label}
          </Link>
        ) : (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSelect(option.value)}
            aria-pressed={locale === option.value}
            className={classes}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
