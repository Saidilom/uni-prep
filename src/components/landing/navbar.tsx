"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { APP_NAME } from "@/lib/app-config";
import { useTranslations } from "@/lib/i18n/locale-provider";
import LocaleSwitcher from "@/components/locale-switcher";
import { LANDING_PATH } from "@/lib/landing-routes";

// Шапка лендинга.
//
// Полоса во всю ширину, а не прежняя плавающая «таблетка»: так в присланном
// макете, и так честнее к содержимому — пунктов стало четыре, и в таблетку они
// на ноутбуке уже не помещались.
//
// Выпадающих меню из макета здесь нет намеренно: прятать за ними нечего, а
// раскрывающийся список из одного пункта раздражает.

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function LandingNavbar() {
  const t = useTranslations("landingNav");
  const NAV_LINKS = [
    { label: t("results"), id: "results" },
    { label: t("features"), id: "features" },
    { label: t("howItWorks"), id: "how-it-works" },
    { label: t("faq"), id: "faq" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <div className="relative h-8 w-8 shrink-0">
            <Image src="/registan-logo.png" alt={APP_NAME} fill className="object-contain" priority />
          </div>
          <span className="text-[17px] font-bold tracking-tight text-foreground">{APP_NAME}</span>
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex">
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => scrollToId(link.id)}
              className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <LocaleSwitcher variant="light" className="hidden sm:inline-flex" hrefFor={(locale) => LANDING_PATH[locale]} />
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted sm:inline-block"
          >
            {t("login")}
          </Link>
          <Link
            href="/join"
            className="group inline-flex items-center gap-2 rounded-full bg-[hsl(var(--brand-olive-ink))] py-1.5 pl-4 pr-1.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
          >
            {t("start")}
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[hsl(var(--brand-olive-ink))] transition-transform duration-300 group-hover:rotate-45">
              <ArrowUpRight size={15} />
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
