"use client";

import { motion, useScroll, useSpring } from "framer-motion";
import Navbar from "@/components/navbar";
import Hero from "@/components/hero";
import Features from "@/components/features";
import HowItWorks from "@/components/how-it-works";
import CtaSection from "@/components/cta-section";
import Footer from "@/components/footer";

export default function LandingPage() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 300, damping: 40, restDelta: 0.001 });

  return (
    <main>
      <motion.div
        style={{ scaleX }}
        className="fixed left-0 right-0 top-0 z-[60] h-[3px] origin-left bg-[hsl(var(--brand-blue-ink))]"
      />
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <CtaSection />
      <Footer />
    </main>
  );
}
