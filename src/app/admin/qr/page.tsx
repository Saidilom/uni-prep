"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download } from "lucide-react";

export default function AdminQRPage() {
    const [qrUrl, setQrUrl] = useState("");
    const [dataUrl, setDataUrl] = useState("");

    useEffect(() => {
        const base = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "https://registan.uz");
        const url = `${base}/join?source=reception`;
        setQrUrl(url);
        QRCode.toDataURL(url, { width: 240, margin: 2 }).then(setDataUrl);
    }, []);

    const downloadPng = () => {
        if (!dataUrl) return;
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "registan-qr.png";
        a.click();
    };

    return (
        <div className="flex flex-col gap-10">
            <section>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">QR-код</h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    QR-код для ресепшена. Сканируйте, чтобы зарегистрироваться через /join.
                </p>
            </section>

            <section className="flex flex-col items-center gap-6">
                <div className="rounded-3xl border border-border bg-white p-8 shadow-sm">
                    {dataUrl && <img src={dataUrl} alt="QR код" width={240} height={240} />}
                </div>
                <p className="text-sm text-muted-foreground">{qrUrl}</p>
                <button onClick={downloadPng} disabled={!dataUrl} className="inline-flex items-center gap-2 rounded-2xl bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50">
                    <Download size={18} /> Скачать PNG
                </button>
            </section>
        </div>
    );
}
