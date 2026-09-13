"use client";

import LandingNavbar from "./navbar";
import LandingHero from "./hero";
import LandingSpecPlate from "./spec-plate";
import LandingResults from "./results";
import LandingFeatures from "./features";
import LandingHowItWorks from "./how-it-works";
import LandingFaq from "./faq";
import LandingCtaSection from "./cta-section";
import LandingFooter from "./footer";
import type { LandingStats } from "@/lib/landing-stats";

// Лендинг по макету Claude Design («Registan Landing.dc.html»).
//
// ═══ ПОЧЕМУ ВСЁ ЗАВЁРНУТО В .landing-root ═══
//
// Это отдельная визуальная система: свой фон, стальной акцент, узкий гротеск и
// НУЛЕВЫЕ скругления. У кабинета радиус 1.25rem и своя палитра. Токены живут в
// globals.css под .landing-root — вынеси их на :root, и поедет весь кабинет.
//
// Порядок разделов из макета: доказательство (сводка и результаты), потом
// устройство (платформа, шаги), потом возражения (вопросы), потом призыв.
//
// stats приходит ПРОПОМ с серверной страницы: числа должны попасть в разметку
// до того, как её увидит поисковый робот.
export default function LandingView({ stats = null }: { stats?: LandingStats | null }) {
  return (
    <div className="landing-root min-h-dvh pb-1">
      <LandingNavbar />
      <div className="mx-auto max-w-[1200px] px-[clamp(20px,5vw,72px)]">
        <LandingHero stats={stats} />
        <LandingSpecPlate stats={stats} />
        <LandingResults stats={stats} />
        <LandingFeatures />
        <LandingHowItWorks />
        <LandingFaq />
        <LandingCtaSection />
        <LandingFooter />
      </div>
    </div>
  );
}
