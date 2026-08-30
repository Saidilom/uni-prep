"use client";

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
}: {
  className?: string;
  variant?: keyof typeof VARIANTS;
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
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => handleSelect(option.value)}
          aria-pressed={locale === option.value}
          className={`rounded-full px-2.5 py-1 transition-colors ${locale === option.value ? styles.active : styles.inactive}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
