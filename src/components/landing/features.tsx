"use client";

import { motion } from "framer-motion";
import { ClipboardCheck, FileText, BarChart3, GraduationCap, Shield, type LucideIcon } from "lucide-react";
import { useTranslations } from "@/lib/i18n/locale-provider";

// Возможности платформы.
//
// ═══ ПОЧЕМУ ВЁРСТКА ПЕРЕПИСАНА ═══
//
// Здесь была закреплённая прокрутка на 280vh: логотип плыл по центру, карточки
// подъезжали слева и справа. Красиво, но чтобы прочитать пять пунктов, нужно
// было промотать почти три экрана, а на лендинге это самая нетерпеливая часть
// пути.
//
// Взята раскладка из присланного макета: сетка карточек с крупной меткой в
// углу. Пять пунктов видно сразу, мобильная и настольная версии — одна и та же
// разметка, а не две расходящиеся.
//
// Содержание не менялось: те же пять возможностей из словарей.

type Feature = { icon: LucideIcon; tag: string; title: string; description: string };

function useFeatures(): Feature[] {
  const t = useTranslations("landingFeatures");
  return [
    { icon: ClipboardCheck, tag: "MAP", title: t("schoolTitle"), description: t("schoolDescription") },
    { icon: FileText, tag: "MOCK", title: t("mockTitle"), description: t("mockDescription") },
    { icon: BarChart3, tag: "DATA", title: t("resultsTitle"), description: t("resultsDescription") },
    { icon: GraduationCap, tag: "TEAM", title: t("teacherTitle"), description: t("teacherDescription") },
    { icon: Shield, tag: "ADMIN", title: t("adminTitle"), description: t("adminDescription") },
  ];
}

export default function LandingFeatures() {
  const t = useTranslations("landingFeatures");
  const features = useFeatures();

  return (
    <section id="features" className="scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-olive-ink))]">
          {t("sectionLabel")}
        </p>
        <div className="mt-3 max-w-xl">
          <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{t("mobileTitle")}</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">{t("mobileSubtitle")}</p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <motion.article
              key={feature.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              className="group relative flex flex-col rounded-3xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-[hsl(var(--brand-olive))]/40"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--brand-olive-ink))]/10 text-[hsl(var(--brand-olive-ink))]">
                  <feature.icon size={20} strokeWidth={1.75} />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
                  {feature.tag}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold leading-snug text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
