"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
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

// В Telegram на бота обычно ссылаются с "@" (@my_bot) — естественно ввести
// переменную окружения так же, но виджету нужно имя БЕЗ "@" в самом
// атрибуте data-telegram-login, иначе он рисует "Username invalid" вместо
// кнопки. Срезаем здесь, а не полагаемся на то, что значение в Vercel всегда
// введут без "@".
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim();

export default function TelegramLoginButton({ onError }: TelegramLoginButtonProps) {
    const t = useTranslations("auth");
    const containerRef = useRef<HTMLDivElement>(null);
    const rawId = useId();
    const callbackName = `onTelegramAuth_${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
    // Живой баг: на бою один вход дал три строки в auth.sessions за 2 секунды
    // — виджет позвал onauth несколько раз подряд на одну авторизацию (само
    // Telegram-окно к этому склонно, не только повторный клик человека).
    // Флаг вне React-состояния, чтобы сработать до первого лишнего рендера:
    // первый вызов запускает обмен токеном, все последующие до его исхода —
    // молча игнорируются.
    const firedRef = useRef(false);
    const [connecting, setConnecting] = useState(false);

    useEffect(() => {
        const container = containerRef.current;
        if (!BOT_USERNAME || !container) return;

        (window as unknown as Record<string, unknown>)[callbackName] = async (tgUser: TelegramAuthUser) => {
            if (firedRef.current) return;
            firedRef.current = true;
            setConnecting(true);
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
                // Успех — виджет намеренно не возвращаем: страница вот-вот
                // уйдёт редиректом, а повторный показ кнопки только даёт
                // шанс повторить ту же гонку до того, как редирект случится.
            } catch (err) {
                onError?.(err instanceof Error ? err.message : t("telegramLoginError"));
                firedRef.current = false;
                setConnecting(false);
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

    return (
        <div className="flex w-full items-center justify-center" style={{ minHeight: 40 }}>
            {/* Виджет прячется, а не размонтируется, пока идёт обмен
                токеном: React не должен трогать DOM-узел, которым управляет
                сам telegram-widget.js, иначе он потеряет внутреннее
                состояние iframe. */}
            <div ref={containerRef} className={connecting ? "hidden" : "flex w-full justify-center"} />
            {connecting && <Loader2 size={20} className="animate-spin text-muted-foreground" />}
        </div>
    );
}
