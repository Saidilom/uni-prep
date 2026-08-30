"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, CreditCard, X, CheckCircle2, Loader2 } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { useTranslations } from "@/lib/i18n/locale-provider";

type PaymentRow = {
    id: string;
    mock_test_id: string;
    mock_test_title: string;
    amount: number;
    currency: string;
    status: "pending" | "success" | "failed" | "cancelled";
};

const TEST_MODE = process.env.NEXT_PUBLIC_PAYMENTS_TEST_MODE === "true";

export default function MockCheckoutPage() {
    const { paymentId } = useParams();
    const router = useRouter();
    const t = useTranslations("checkout");
    const [payment, setPayment] = useState<PaymentRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<"success" | "cancelled" | null>(null);
    const [error, setError] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const load = useCallback(async () => {
        const { data } = await supabase
            .from("payments")
            .select("id, mock_test_id, mock_test_title, amount, currency, status")
            .eq("id", paymentId as string)
            .single();
        setPayment((data as PaymentRow) || null);
        setLoading(false);
        return (data as PaymentRow) || null;
    }, [paymentId]);

    useEffect(() => { load(); }, [load]);

    // Payme/Click redirect the browser back here right after their own
    // hosted checkout, but the actual status change comes from their
    // server-to-server webhook (/api/payments/payme, /click), which can
    // land a moment before or after this redirect — poll briefly instead
    // of assuming either order.
    useEffect(() => {
        if (!payment || payment.status !== "pending") return;
        pollRef.current = setInterval(async () => {
            const fresh = await load();
            if (fresh && fresh.status !== "pending" && pollRef.current) {
                clearInterval(pollRef.current);
            }
        }, 2000);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payment?.status]);

    const confirmTestMode = async (outcome: "success" | "cancelled") => {
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
                setError(data.error || t("paymentFailed"));
                return;
            }
            if (outcome === "success") {
                router.push(`/mock/${data.mockTestId}`);
            } else {
                router.push("/mock");
            }
        } catch {
            setError(t("paymentFailed"));
        } finally {
            setProcessing(null);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <div className="h-10 w-28 animate-pulse rounded-3xl border border-border bg-muted" />
            </div>
        );
    }

    if (!payment) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center px-4">
                <div className="max-w-md rounded-3xl border border-border bg-card px-6 py-10 text-center shadow-sm">
                    <h2 className="mb-3 text-2xl font-bold text-foreground">{t("paymentNotFound")}</h2>
                    <p className="text-sm text-muted-foreground">{t("checkLinkAndRetry")}</p>
                </div>
            </div>
        );
    }

    if (payment.status !== "pending") {
        return (
            <div className="flex min-h-[60vh] items-center justify-center px-4">
                <div className="max-w-md rounded-3xl border border-border bg-card px-8 py-10 text-center shadow-sm">
                    {payment.status === "success" ? (
                        <>
                            <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-emerald-500" />
                            <h2 className="mb-2 text-2xl font-bold text-foreground">{t("paymentSuccessTitle")}</h2>
                            <p className="text-sm text-muted-foreground">{t("testAlreadyOpen").replace("{title}", payment.mock_test_title)}</p>
                        </>
                    ) : (
                        <>
                            <X className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                            <h2 className="mb-2 text-2xl font-bold text-foreground">{t("paymentCancelledTitle")}</h2>
                        </>
                    )}
                    <button
                        onClick={() => router.push(`/mock/${payment.mock_test_id}`)}
                        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90"
                    >
                        {t("toTest")}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-10">
            {!TEST_MODE && (
                <div className="flex items-start gap-3 rounded-xl border border-[hsl(var(--brand-blue))]/20 bg-[hsl(var(--brand-blue-soft))] px-4 py-3 text-sm text-[hsl(var(--brand-blue-ink))]">
                    <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin" />
                    <p>{t("waitingConfirmation")}</p>
                </div>
            )}

            <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                    <CreditCard size={26} className="text-muted-foreground" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{payment.mock_test_title}</h1>
                <p className="mt-2 text-4xl font-extrabold tabular-nums text-foreground">
                    {payment.amount.toLocaleString()} <span className="text-lg font-semibold text-muted-foreground">{payment.currency}</span>
                </p>

                {error ? (
                    <div className="mt-6 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : null}

                {TEST_MODE && (
                    <>
                        <div className="mt-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <p>{t("testModeNotice")}</p>
                        </div>
                        <div className="mt-6 flex flex-col gap-3">
                            <button
                                onClick={() => confirmTestMode("success")}
                                disabled={processing !== null}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
                            >
                                {processing === "success" ? t("processing") : t("payTestMode")}
                            </button>
                            <button
                                onClick={() => confirmTestMode("cancelled")}
                                disabled={processing !== null}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50"
                            >
                                {processing === "cancelled" ? t("cancelling") : t("cancel")}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
