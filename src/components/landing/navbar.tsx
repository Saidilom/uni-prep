"use client";

import { useEffect, useState } from "react";
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

// Наверху страницы шапка лежит ПОВЕРХ тёмного первого экрана и должна быть
// прозрачной со светлым текстом; ниже начинается светлое содержимое, и она
// становится обычной. Без этого переключения либо шапка режет тёмный герой
// светлой полосой, либо белые буквы уезжают на белый фон.
const DARK_UNTIL = 80;

export default function LandingNavbar() {
  const t = useTranslations("landingNav");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > DARK_UNTIL);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const NAV_LINKS = [
    { label: t("results"), id: "results" },
    { label: t("features"), id: "features" },
    { label: t("howItWorks"), id: "how-it-works" },
    { label: t("faq"), id: "faq" },
  ];

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled ? "border-b border-border/70 bg-background/90 backdrop-blur-md" : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <div className="relative h-8 w-8 shrink-0">
            <Image src="/registan-logo.png" alt={APP_NAME} fill className="object-contain" priority />
          </div>
          <span className={`text-[17px] font-bold tracking-tight transition-colors ${scrolled ? "text-foreground" : "text-white"}`}>{APP_NAME}</span>
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex">
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => scrollToId(link.id)}
              className={`rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${scrolled ? "text-muted-foreground hover:bg-muted hover:text-foreground" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <LocaleSwitcher variant={scrolled ? "light" : "dark"} className="hidden sm:inline-flex" hrefFor={(locale) => LANDING_PATH[locale]} />
          <Link
            href="/login"
            className={`hidden rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors sm:inline-block ${scrolled ? "text-foreground hover:bg-muted" : "text-white hover:bg-white/10"}`}
          >
            {t("login")}
          </Link>
          <Link
            href="/join"
            className={`group inline-flex items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 text-[13px] font-semibold shadow-sm transition-all hover:opacity-90 active:scale-[0.97] ${scrolled ? "bg-[hsl(var(--brand-olive-ink))] text-white" : "bg-white text-[#0b0f0f]"}`}
          >
            {t("start")}
            <span className={`flex h-7 w-7 items-center justify-center rounded-full transition-transform duration-300 group-hover:rotate-45 ${scrolled ? "bg-white text-[hsl(var(--brand-olive-ink))]" : "bg-[hsl(var(--brand-olive))] text-white"}`}>
              <ArrowUpRight size={15} />
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
