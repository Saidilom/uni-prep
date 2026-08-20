"use client";

import { useEffect, useState } from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { useToastStore, Toast } from "@/store/useToastStore";

const icons: Record<Toast["type"], React.ComponentType<{ className?: string }>> = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
};

const colors: Record<Toast["type"], string> = {
    success: "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30",
    error: "border-red-200 bg-red-50 dark:bg-red-950/30",
    warning: "border-amber-200 bg-amber-50 dark:bg-amber-950/30",
    info: "border-blue-200 bg-blue-50 dark:bg-blue-950/30",
};

export function Toaster() {
    const { toasts, removeToast } = useToastStore();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    if (!mounted) return null;

    return (
        <div className="fixed top-4 right-4 z-[400] flex flex-col gap-2 w-[min(360px,90vw)]">
            {toasts.map((t) => {
                const Icon = icons[t.type];
                return (
                    <div
                        key={t.id}
                        className={`animate-in slide-in-from-top-2 flex items-start gap-3 rounded-2xl border p-4 text-sm shadow-lg ${colors[t.type]}`}
                    >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-current" />
                        <div className="flex-1">
                            <p className="font-semibold text-foreground">{t.title}</p>
                            {t.description && <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>}
                        </div>
                        <button
                            onClick={() => removeToast(t.id)}
                            className="rounded-lg p-1 text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
                            aria-label="Close"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
