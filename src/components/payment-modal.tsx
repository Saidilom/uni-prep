"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CreditCard, X, CheckCircle2, ExternalLink } from "lucide-react";
import { useTranslations } from "@/lib/i18n/locale-provider";

type Props = {
    mockTestId: string;
    title: string;
    price: number;
    onClose: () => void;
    onSuccess: () => void;
};

// Test-mode fake checkout only shows up when explicitly enabled (local dev
// without real Payme/Click sandbox credentials) — never in production,
// where real money is on the line.
const TEST_MODE = process.env.NEXT_PUBLIC_PAYMENTS_TEST_MODE === "true";

export default function PaymentModal({ mockTestId, title, price, onClose, onSuccess }: Props) {
    const t = useTranslations("paymentModal");
    const [paymentId, setPaymentId] = useState<string | null>(null);
    const [paymeUrl, setPaymeUrl] = useState<string | null>(null);
    const [clickUrl, setClickUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [processing, setProcessing] = useState<"success" | "cancelled" | null>(null);
    const [succeeded, setSucceeded] = useState(false);
    const tRef = useRef(t);
    tRef.current = t;

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const res = await fetch("/api/payments/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mockTestId }),
                });
                const data = await res.json();
                if (!active) return;
                if (!res.ok) {
                    setError(data.error || tRef.current("startPaymentFailed"));
                    return;
                }
                setPaymentId(data.paymentId);
                setPaymeUrl(data.paymeUrl ?? null);
                setClickUrl(data.clickUrl ?? null);
            } catch {
                if (active) setError(tRef.current("startPaymentFailed"));
            }
        })();
        return () => {
            active = false;
        };
    }, [mockTestId]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    // Test-mode only — instantly resolves the payment without a real provider.
    const confirmTestMode = async (outcome: "success" | "cancelled") => {
        if (!paymentId) return;
        setError(null);
        setProcessing(outcome);
        try {
            const res = await fetch("/api/payments/mock-confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ paymentId, outcome }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || t("processFailed"));
                return;
            }
            if (outcome === "success") {
                setSucceeded(true);
                setTimeout(onSuccess, 900);
            } else {
                onClose();
            }
        } catch {
            setError(t("processFailed"));
        } finally {
            setProcessing(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-card shadow-xl animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600" />
                <div className="px-6 py-8 text-center">
                    <button
                        onClick={onClose}
                        className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
                        aria-label={t("close")}
                    >
                        <X size={18} />
                    </button>

                    {succeeded ? (
                        <>
                            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
                            <h2 className="text-xl font-bold text-foreground">{t("paymentSuccessTitle")}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">{t("redirecting")}</p>
                        </>
                    ) : (
                        <>
                            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/40">
                                <CreditCard size={24} className="text-blue-600" />
                            </div>
                            <h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
                            <p className="mt-2 text-3xl font-extrabold tabular-nums text-foreground">
                                {price.toLocaleString()} <span className="text-base font-semibold text-muted-foreground">UZS</span>
                            </p>

                            {error ? (
                                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                                    {error}
                                </div>
                            ) : null}

                            {TEST_MODE ? (
                                <>
                                    <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                                        <p>{t("testModeNotice")}</p>
                                    </div>
                                    <div className="mt-6 flex flex-col gap-3">
                                        <button
                                            onClick={() => confirmTestMode("success")}
                                            disabled={!paymentId || processing !== null}
                                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-[0.97] disabled:opacity-50"
                                        >
                                            {!paymentId ? t("preparing") : processing === "success" ? t("processing") : t("payTestMode")}
                                        </button>
                                        <button
                                            onClick={() => confirmTestMode("cancelled")}
                                            disabled={!paymentId || processing !== null}
                                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border px-6 py-3 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50"
                                        >
                                            {processing === "cancelled" ? t("cancelling") : t("cancel")}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="mt-6 flex flex-col gap-3">
                                    {paymeUrl && (
                                        <a
                                            href={paymeUrl}
                                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#00c8b3] px-6 py-3.5 text-sm font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
                                        >
                                            {t("payViaPayme")} <ExternalLink size={15} />
                                        </a>
                                    )}
                                    {clickUrl && (
                                        <a
                                            href={clickUrl}
                                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0091e2] px-6 py-3.5 text-sm font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.97]"
                                        >
                                            {t("payViaClick")} <ExternalLink size={15} />
                                        </a>
                                    )}
                                    {!paymeUrl && !clickUrl && !error && (
                                        <p className="text-sm text-muted-foreground">
                                            {!paymentId ? t("preparing") : t("paymentUnavailable")}
                                        </p>
                                    )}
                                    <button
                                        onClick={onClose}
                                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border px-6 py-3 text-sm font-semibold transition-colors hover:bg-muted"
                                    >
                                        {t("cancel")}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
