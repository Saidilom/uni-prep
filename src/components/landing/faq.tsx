"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "@/lib/i18n/locale-provider";

// Вопросы и ответы.
//
// На <details>/<summary>, без состояния и без библиотеки: аккордеон — ровно то,
// для чего этот тег и существует. Побочно он раскрывается и без JavaScript,
// поэтому ответы попадают в индекс поиска вместе со страницей.

const ITEMS = ["mock", "placement", "online", "guarantee", "center"] as const;

export default function LandingFaq() {
  const t = useTranslations("landingFaq");

  return (
    <section id="faq" className="scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-olive-ink))]">
            {t("sectionLabel")}
          </p>
          <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        <div className="divide-y divide-border border-y border-border">
          {ITEMS.map((item) => (
            <details key={item} className="group py-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-[15px] font-semibold text-foreground marker:hidden">
                {t(`${item}Question` as "mockQuestion")}
                <span className="mt-0.5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45">
                  <Plus size={18} />
                </span>
              </summary>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {t(`${item}Answer` as "mockAnswer")}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
