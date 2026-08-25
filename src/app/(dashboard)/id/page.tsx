"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Check } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { APP_NAME } from "@/lib/app-config";

export default function StudentIdPage() {
    const { user } = useAuthStore();
    const [qrDataUrl, setQrDataUrl] = useState("");
    const [copied, setCopied] = useState(false);

    const studentId = user?.shortId || user?.id || "";

    useEffect(() => {
        if (!studentId) return;
        QRCode.toDataURL(studentId, { width: 220, margin: 1, color: { dark: "#1e3a8a", light: "#ffffff" } }).then(setQrDataUrl);
    }, [studentId]);

    const copyId = () => {
        if (!studentId) return;
        navigator.clipboard.writeText(studentId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!user) return null;

    return (
        <div className="flex flex-col gap-8 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Мой ID</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    Покажите этот ID учителю или администратору, чтобы вас нашли в системе.
                </p>
            </section>

            <section className="mx-auto w-full max-w-sm">
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 p-7 shadow-xl shadow-blue-900/20">
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 opacity-[0.15]"
                        style={{
                            backgroundImage: "radial-gradient(circle, white 1.5px, transparent 1.5px)",
                            backgroundSize: "18px 18px",
                        }}
                    />

                    <div className="relative flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-widest text-blue-100">{APP_NAME}</span>
                        <span className="rounded-full border border-white/30 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                            {user.role === "teacher" ? "Учитель" : "Ученик"}
                        </span>
                    </div>

                    <div className="relative mt-6 flex items-center gap-4">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl font-bold text-white ring-1 ring-white/25">
                            {user.name[0]?.toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-lg font-bold text-white">
                                {user.name} {user.surname || ""}
                            </p>
                            <p className="truncate text-sm text-blue-100">{user.email}</p>
                        </div>
                    </div>

                    <div className="relative mt-7 flex items-end justify-between gap-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-100">Student ID</p>
                            <button
                                onClick={copyId}
                                className="mt-1 flex items-center gap-2 font-mono text-2xl font-extrabold tracking-wider text-white"
                            >
                                {studentId}
                                {copied ? <Check size={18} className="text-emerald-300" /> : <Copy size={18} className="text-blue-200" />}
                            </button>
                        </div>
                        {qrDataUrl ? (
                            <div className="shrink-0 rounded-xl bg-white p-1.5 shadow-sm">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={qrDataUrl} alt="QR-код Student ID" width={64} height={64} />
                            </div>
                        ) : null}
                    </div>
                </div>
            </section>
        </div>
    );
}
