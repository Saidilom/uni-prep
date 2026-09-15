"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { REGISTERED_VIA_KEY } from "@/lib/app-config";
import { useTranslations } from "@/lib/i18n/locale-provider";

// Своя кнопка вместо встроенного iframe-виджета Telegram.
//
// data-telegram-login (автовиджет) отдаёт ГОТОВУЮ картинку кнопки — цвет,
// форма и размер целиком в руках Telegram, подогнать её под ширину и вид
// кнопки Google рядом было нельзя. У Telegram есть второй, менее заметный
// путь: тот же telegram-widget.js, загруженный без data-атрибутов, кладёт в
// window.Telegram.Login.auth() программный вызов — он открывает попап
// Telegram сам, без встроенного iframe на странице, и возвращает те же
// данные (id, first_name, ..., hash), что и автовиджет. Кнопку целиком рисуем
// сами — тем же классом, что у кнопки Google.
type TelegramAuthUser = {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    auth_date: number;
    hash: string;
};

declare global {
    interface Window {
        Telegram?: {
            Login: {
                auth: (
                    options: { bot_id: string; request_access?: boolean; lang?: string },
                    callback: (user: TelegramAuthUser | false) => void,
                ) => void;
            };
        };
    }
}

export type TelegramLoginButtonProps = {
    onError?: (message: string) => void;
};

// Один <script> на всё приложение, а не по одному на каждое монтирование
// кнопки (/login и /join оба её используют) — Telegram сам решает, что с
// повторной вставкой того же src делать, лучше не проверять.
let scriptLoad: Promise<void> | null = null;
function loadTelegramScript(): Promise<void> {
    if (typeof window !== "undefined" && window.Telegram?.Login) return Promise.resolve();
    if (scriptLoad) return scriptLoad;
    scriptLoad = new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>('script[data-telegram-auth-script="1"]');
        if (existing) {
            existing.addEventListener("load", () => resolve());
            existing.addEventListener("error", () => reject(new Error("telegram-widget.js load failed")));
            return;
        }
        const script = document.createElement("script");
        script.src = "https://telegram.org/js/telegram-widget.js?22";
        script.async = true;
        script.dataset.telegramAuthScript = "1";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("telegram-widget.js load failed"));
        document.head.appendChild(script);
    }).catch((err) => {
        // Без сброса один неудачный запрос «отравляет» кеш навсегда: любой
        // следующий клик по кнопке мгновенно получает тот же отклонённый
        // промис и больше никогда не пробует загрузить скрипт заново — кнопка
        // остаётся сломанной до полной перезагрузки страницы, даже если сеть
        // уже восстановилась.
        scriptLoad = null;
        throw err;
    });
    return scriptLoad;
}

export default function TelegramLoginButton({ onError }: TelegramLoginButtonProps) {
    const t = useTranslations("auth");
    const firedRef = useRef(false);
    // firedRef защищает только от повторного КЛИКА по кнопке (disabled+ref
    // до начала запроса). Сам callback, переданный в Telegram.Login.auth(),
    // ничем не защищён — если виджет вызовет его дважды на один auth(),
    // обе итерации независимо уйдут на /api/auth/telegram и verifyOtp,
    // создав две разные сессии на одного пользователя (ровно так раньше
    // получались тройные записи в auth.sessions с одного логина).
    // callbackHandledRef — отдельный флаг именно на тело callback'а,
    // сбрасывается перед каждым новым auth() и не связан с состоянием кнопки.
    const callbackHandledRef = useRef(false);
    const [connecting, setConnecting] = useState(false);

    const handleClick = async () => {
        if (firedRef.current) return;
        firedRef.current = true;
        setConnecting(true);
        // Тот же ключ, что join/page.tsx пишет перед Google-входом — его же
        // читает /onboarding при первом заполнении профиля. Без этого
        // /onboarding подставлял дефолт "google" (см. константу ниже), и
        // registeredVia в public.users у ВСЕХ Telegram-аккаунтов тихо
        // перезаписывался на "google" сразу после онбординга — телефона у
        // Telegram-пользователей никогда нет, так что через /onboarding
        // проходит буквально каждый.
        sessionStorage.setItem(REGISTERED_VIA_KEY, "telegram");
        try {
            const [, botIdRes] = await Promise.all([
                loadTelegramScript(),
                fetch("/api/auth/telegram/bot-id").then((r) => r.json()),
            ]);
            const botId = botIdRes?.botId as string | undefined;
            if (!botId || !window.Telegram?.Login) {
                throw new Error(t("telegramLoginError"));
            }

            callbackHandledRef.current = false;
            window.Telegram.Login.auth({ bot_id: botId, request_access: true }, (tgUser) => {
                if (callbackHandledRef.current) return;
                callbackHandledRef.current = true;
                void (async () => {
                    if (!tgUser) {
                        // Пользователь закрыл попап сам — не ошибка, тихо
                        // возвращаем кнопку в исходное состояние.
                        firedRef.current = false;
                        setConnecting(false);
                        return;
                    }
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
                        const { error } = await supabase.auth.verifyOtp({
                            token_hash: body.token_hash,
                            type: "magiclink",
                        });
                        if (error) throw error;
                        // Успех — состояние намеренно не сбрасываем: страница
                        // вот-вот уйдёт редиректом (onAuthStateChange в
                        // auth-provider.tsx/странице входа).
                    } catch (err) {
                        onError?.(err instanceof Error ? err.message : t("telegramLoginError"));
                        firedRef.current = false;
                        setConnecting(false);
                    }
                })();
            });
        } catch (err) {
            onError?.(err instanceof Error ? err.message : t("telegramLoginError"));
            firedRef.current = false;
            setConnecting(false);
        }
    };

    return (
        <button
            type="button"
            onClick={() => void handleClick()}
            disabled={connecting}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-card py-4 pl-5 pr-6 text-sm font-semibold text-foreground shadow-sm transition-all duration-200 hover:bg-muted active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
        >
            {connecting ? <Loader2 size={22} className="shrink-0 animate-spin" /> : <TelegramIcon className="h-[22px] w-[22px] shrink-0" />}
            {connecting ? t("connecting") : t("loginWithTelegram")}
        </button>
    );
}

// Официальная эмблема Telegram (круг + бумажный самолётик) — тот же
// подход, что уже применён к Google: узнаваемый цветной логотип рядом с
// текстом, а не абстрактная иконка из общего набора lucide.
function TelegramIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
            <circle cx="120" cy="120" r="120" fill="#26A5E4" />
            <path
                d="M55.57,119.68c34.85-15.18,58.09-25.19,69.71-30.03,33.21-13.81,40.11-16.21,44.6-16.29,0.99-0.02,3.2,0.23,4.64,1.39,1.21,0.98,1.54,2.3,1.7,3.23,0.16,0.93,0.36,3.05,0.2,4.71-1.8,18.93-9.59,64.88-13.55,86.09-1.68,8.98-4.98,11.99-8.18,12.28-6.95,0.64-12.23-4.6-18.96-9.01-10.53-6.91-16.49-11.2-26.72-17.94-11.82-7.79-4.16-12.07,2.58-19.07,1.77-1.84,32.44-29.74,33.04-32.27,0.07-0.32,0.14-1.5-0.56-2.13-0.7-0.62-1.73-0.41-2.48-0.24-1.06,0.24-17.92,11.38-50.6,33.44-4.79,3.29-9.13,4.89-13.02,4.8-4.29-0.09-12.53-2.42-18.66-4.42-7.52-2.46-13.49-3.76-12.97-7.93,0.27-2.17,3.26-4.39,8.97-6.66Z"
                fill="#fff"
            />
        </svg>
    );
}
