"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { APP_NAME } from "@/lib/app-config";
import HeroBanner from "@/components/hero-banner";
import AuthFloatingPaths from "@/components/auth-floating-paths";
import { useTranslations } from "@/lib/i18n/locale-provider";

// Экран во весь рост, разбит пополам на lg+ — раньше форма была карточкой
// по центру страницы; макет владельца просил ровно эту раскладку (тёмная
// брендовая панель слева на весь рост, форма справа), адаптированную под
// наши токены, а не под чужой набор shadcn-примитивов: проект не на shadcn
// (нет /components/ui, CVA, Radix Slot) — заводить их ради одной страницы
// значило бы завести вторую систему кнопок рядом с уже принятой в проекте.
//
// Flex, не CSS Grid: на flex-контейнере обе колонки растягиваются на всю
// высоту сами (align-items: stretch по умолчанию), без отдельного
// подгона высоты каждой колонки под содержимое соседней.
export default function AuthShell({ children }: { children: React.ReactNode }) {
    const t = useTranslations("auth");

    return (
        <div className="relative flex min-h-dvh flex-col lg:flex-row">
            {/* Левая панель — только на lg+. Чёрный фон вместо оливы, лого
                крупно по центру вместо строки «значок + название» в углу. */}
            <HeroBanner className="relative hidden shrink-0 items-center justify-center overflow-hidden rounded-none bg-none bg-black p-10 lg:flex lg:w-[42%] xl:w-[38%]">
                <AuthFloatingPaths />
                <div className="relative z-10 h-48 w-64 xl:h-56 xl:w-72">
                    <Image src="/registan-logo.png" alt={APP_NAME} fill className="object-contain brightness-0 invert" priority />
                </div>
            </HeroBanner>

            {/* Правая панель — форма */}
            <div className="relative flex flex-1 flex-col justify-center bg-background px-4 py-10 text-foreground sm:px-8">
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                        backgroundImage: "radial-gradient(circle, rgb(212 212 212) 1px, transparent 1px)",
                        backgroundSize: "22px 22px",
                        maskImage: "radial-gradient(ellipse 60% 55% at 50% 35%, black 30%, transparent 100%)",
                        WebkitMaskImage: "radial-gradient(ellipse 60% 55% at 50% 35%, black 30%, transparent 100%)",
                    }}
                />

                <Link
                    href="/"
                    className="absolute left-5 top-6 z-10 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:left-8 sm:top-7"
                >
                    <ChevronLeft size={16} />
                    {t("backHome")}
                </Link>

                <div className="relative z-10 mx-auto w-full max-w-sm">
                    <div className="relative mx-auto mb-8 h-12 w-36 lg:hidden">
                        <Image src="/registan-logo.png" alt={APP_NAME} fill className="object-contain" priority />
                    </div>

                    {children}
                </div>
            </div>
        </div>
    );
}
