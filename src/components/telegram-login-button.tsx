"use client";

import { useEffect, useId, useRef } from "react";
import supabase from "@/lib/supabase/client";
import { useTranslations } from "@/lib/i18n/locale-provider";

// Мост Telegram Login Widget → Supabase-сессия. Виджет сам вставляет себя
// (iframe-кнопку) рядом со своим <script>, поэтому тег создаётся руками при
// каждом монтировании — через next/script он дедуплицируется по src между
// /login и /join при клиентской навигации, и на второй странице виджет
// просто не переинициализируется.
//
// Требует, чтобы домен сайта был прописан у бота через @BotFather →
// /setdomain — на localhost виджет не отрисуется вовсе.
type TelegramAuthUser = {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    auth_date: number;
    hash: string;
};

export type TelegramLoginButtonProps = {
    onError?: (message: string) => void;
};

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

export default function TelegramLoginButton({ onError }: TelegramLoginButtonProps) {
    const t = useTranslations("auth");
    const containerRef = useRef<HTMLDivElement>(null);
    const rawId = useId();
    const callbackName = `onTelegramAuth_${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

    useEffect(() => {
        const container = containerRef.current;
        if (!BOT_USERNAME || !container) return;

        (window as unknown as Record<string, unknown>)[callbackName] = async (tgUser: TelegramAuthUser) => {
            try {
                const res = await fetch("/api/auth/telegram", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(tgUser),
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok || !body.token_hash) {
                    throw new Error(body.error || t("telegramLoginError"));
                }
                // Штатный supabase-otp хэндшейк: реальная сессионная кука
                // ставится этим вызовом, дальше onAuthStateChange страницы
                // входа/auth-provider.tsx сами делают редирект — ничего
                // руками довершать не нужно.
                const { error } = await supabase.auth.verifyOtp({
                    token_hash: body.token_hash,
                    type: "magiclink",
                });
                if (error) throw error;
            } catch (err) {
                onError?.(err instanceof Error ? err.message : t("telegramLoginError"));
            }
        };

        const script = document.createElement("script");
        script.src = "https://telegram.org/js/telegram-widget.js?22";
        script.async = true;
        script.setAttribute("data-telegram-login", BOT_USERNAME);
        script.setAttribute("data-size", "large");
        script.setAttribute("data-radius", "12");
        script.setAttribute("data-onauth", `${callbackName}(user)`);
        script.setAttribute("data-request-access", "write");
        container.appendChild(script);

        return () => {
            delete (window as unknown as Record<string, unknown>)[callbackName];
            container.replaceChildren();
        };
    }, [callbackName, onError, t]);

    // Бот не настроен (нет env-переменной) — кнопки нет вовсе, а не сломанная.
    if (!BOT_USERNAME) return null;

    return <div ref={containerRef} className="flex w-full justify-center" />;
}
