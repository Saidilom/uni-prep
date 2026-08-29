"use client";

import Image from "next/image";
import { APP_NAME } from "@/lib/app-config";
import HeroBanner from "@/components/hero-banner";

export default function AuthShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background text-foreground">
            <div className="absolute inset-x-0 top-0 z-20 h-1 bg-[hsl(var(--brand-olive))]" />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                    backgroundImage: "radial-gradient(circle, rgb(212 212 212) 1px, transparent 1px)",
                    backgroundSize: "22px 22px",
                    maskImage: "radial-gradient(ellipse 55% 50% at 50% 38%, black 35%, transparent 100%)",
                    WebkitMaskImage: "radial-gradient(ellipse 55% 50% at 50% 38%, black 35%, transparent 100%)",
                }}
            />
            <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
                <div className="flex w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-card shadow-xl shadow-foreground/[0.06]">
                    {/* Decorative left panel — hidden on mobile */}
                    <HeroBanner className="hidden w-[300px] shrink-0 items-center justify-center rounded-none bg-none bg-[hsl(var(--brand-olive))] p-10 md:flex">
                        <div className="relative h-40 w-52">
                            <Image
                                src="/registan-logo.png"
                                alt={APP_NAME}
                                fill
                                className="object-contain brightness-0 invert"
                                priority
                            />
                        </div>
                    </HeroBanner>

                    {/* Form panel */}
                    <div className="flex-1 px-6 py-10 sm:px-10 sm:py-12">
                        <div className="relative mx-auto mb-8 h-14 w-40 md:hidden">
                            <Image src="/registan-logo.png" alt={APP_NAME} fill className="object-contain" priority />
                        </div>

                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
