"use client";

import { useTranslations } from "@/lib/i18n/locale-provider";

// «Вопросы» — две колонки, как в макете: слева заголовок и призыв, справа
// список с плюсом-минусом.
//
// На <details>/<summary>, а не на состоянии React: аккордеон ровно для этого
// и существует, и побочно он раскрывается без JavaScript — ответы попадают в
// индекс поиска вместе со страницей.

const ITEMS = ["mock", "placement", "online", "guarantee", "center"] as const;

export default function LandingFaq() {
  const t = useTranslations("landingFaq");

  return (
    <section id="faq" className="grid scroll-mt-16 gap-[clamp(24px,4vw,56px)] py-[clamp(40px,5vw,72px)] lg:grid-cols-2">
      <div>
        <span className="eyebrow">{t("sectionLabel")}</span>
        <div className="rule" />
        <h2 className="max-w-[16ch] text-[clamp(30px,3.6vw,46px)] leading-[1.06]">{t("title")}</h2>
        <p className="mt-5 max-w-[40ch] text-[16px] leading-6" style={{ color: "color-mix(in srgb, var(--color-text) 82%, transparent)" }}>
          {t("subtitle")}
        </p>
      </div>

      <div>
        {ITEMS.map((item) => (
          <details key={item} className="group" style={{ borderBottom: "1px solid var(--color-divider)" }}>
            <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-4 text-[16px] font-semibold marker:hidden">
              <span>{t(`${item}Question` as "mockQuestion")}</span>
              <span className="shrink-0 text-[22px] leading-none" style={{ color: "var(--color-accent-700)" }}>
                <span className="group-open:hidden">+</span>
                <span className="hidden group-open:inline">–</span>
              </span>
            </summary>
            <p className="pb-5 text-[15px] leading-6" style={{ color: "color-mix(in srgb, var(--color-text) 82%, transparent)" }}>
              {t(`${item}Answer` as "mockAnswer")}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
