"use client";

import Image from "next/image";
import Link from "next/link";
import { APP_NAME } from "@/lib/app-config";
import { useTranslations } from "@/lib/i18n/locale-provider";

// Подвал.
//
// В макете здесь три колонки, включая контакты с телефоном и почтой. Телефона и
// почты у нас нет — и выдуманный контакт на сайте, где принимают оплату, хуже
// отсутствующего: по нему напишут и не получат ответа. Колонка появится, когда
// владелец даст настоящие.

const NAV_IDS = ["results", "features", "faq"] as const;

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function LandingFooter() {
  const t = useTranslations("landingFooter");
  const nav = useTranslations("landingNav");

  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <div className="relative h-7 w-7 shrink-0">
                <Image src="/registan-logo.png" alt={APP_NAME} fill className="object-contain" />
              </div>
              <span className="text-base font-bold tracking-tight text-foreground">{APP_NAME}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("tagline")}</p>
          </div>

          <nav className="flex flex-col gap-2.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
              {t("navigationLabel")}
            </p>
            {NAV_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollToId(id)}
                className="text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {nav(id)}
              </button>
            ))}
            <Link href="/login" className="text-left text-sm text-muted-foreground transition-colors hover:text-foreground">
              {nav("login")}
            </Link>
          </nav>
        </div>

        <p className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} {APP_NAME}
        </p>
      </div>
    </footer>
  );
}
