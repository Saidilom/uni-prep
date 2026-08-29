"use client";

import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { APP_NAME, LOGIN_URL, JOIN_URL } from "@/lib/config";

const NAV_LINKS = [
  { label: "Возможности", id: "features" },
  { label: "Как это работает", id: "how-it-works" },
];

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function Navbar() {
  return (
    <div className="sticky top-4 z-50 px-4 sm:px-6">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 rounded-full border border-border bg-card/90 px-3 py-2 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2 pl-2">
          <div className="relative h-8 w-8 shrink-0">
            <Image src="/registan-logo.png" alt={APP_NAME} fill className="object-contain" priority />
          </div>
          <span className="text-base font-bold tracking-tight text-foreground">{APP_NAME}</span>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => scrollToId(link.id)}
              className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={LOGIN_URL}
            className="hidden rounded-full px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted sm:inline-block"
          >
            Войти
          </a>
          <a
            href={JOIN_URL}
            className="group inline-flex items-center gap-2 rounded-full bg-[hsl(var(--brand-blue-ink))] py-1.5 pl-4 pr-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
          >
            Начать
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[hsl(var(--brand-blue-ink))] transition-transform duration-300 group-hover:rotate-45">
              <ArrowUpRight size={15} />
            </span>
          </a>
        </div>
      </header>
    </div>
  );
}
