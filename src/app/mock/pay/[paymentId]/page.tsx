"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, CreditCard, X, CheckCircle2 } from "lucide-react";
import supabase from "@/lib/supabase/client";

type PaymentRow = {
    id: string;
    mock_test_id: string;
    mock_test_title: string;
    amount: number;
    currency: string;
    status: "pending" | "success" | "failed" | "cancelled";
};

export default function MockCheckoutPage() {
    const { paymentId } = useParams();
    const router = useRouter();
    const [payment, setPayment] = useState<PaymentRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<"success" | "cancelled" | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase
            .from("payments")
            .select("id, mock_test_id, mock_test_title, amount, currency, status")
            .eq("id", paymentId as string)
            .single();
        setPayment((data as PaymentRow) || null);
        setLoading(false);
    }, [paymentId]);

    useEffect(() => { load(); }, [load]);

    const confirm = async (outcome: "success" | "cancelled") => {
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
                setError(data.error || "Не удалось обработать оплату");
                return;
            }
            if (outcome === "success") {
                router.push(`/mock/${data.mockTestId}`);
            } else {
                router.push("/mock");
            }
        } catch {
            setError("Не удалось обработать оплату");
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
                    <h2 className="mb-3 text-2xl font-bold text-foreground">Платёж не найден</h2>
                    <p className="text-sm text-muted-foreground">Проверьте ссылку и попробуйте снова.</p>
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
                            <h2 className="mb-2 text-2xl font-bold text-foreground">Оплата прошла</h2>
                            <p className="text-sm text-muted-foreground">Тест «{payment.mock_test_title}» уже открыт.</p>
                        </>
                    ) : (
                        <>
                            <X className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                            <h2 className="mb-2 text-2xl font-bold text-foreground">Оплата отменена</h2>
                        </>
                    )}
                    <button
                        onClick={() => router.push(`/mock/${payment.mock_test_id}`)}
                        className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90"
                    >
                        К тесту
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-10">
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <p>Тестовый режим оплаты — реальная оплата не производится. Провайдер (Payme/Click/Uzum) будет подключён позже.</p>
            </div>

            <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                    <CreditCard size={26} className="text-muted-foreground" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{payment.mock_test_title}</h1>
                <p className="mt-2 text-4xl font-extrabold tabular-nums text-foreground">
                    {payment.amount.toLocaleString()} <span className="text-lg font-semibold text-muted-foreground">{payment.currency}</span>
                </p>

                {error ? (
                    <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                        {error}
                    </div>
                ) : null}

                <div className="mt-8 flex flex-col gap-3">
                    <button
                        onClick={() => confirm("success")}
                        disabled={processing !== null}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-foreground px-6 py-3.5 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
                    >
                        {processing === "success" ? "Обработка…" : "Оплатить (тестовый режим)"}
                    </button>
                    <button
                        onClick={() => confirm("cancelled")}
                        disabled={processing !== null}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border px-6 py-3 text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50"
                    >
                        {processing === "cancelled" ? "Отмена…" : "Отменить"}
                    </button>
                </div>
            </div>
        </div>
    );
}
