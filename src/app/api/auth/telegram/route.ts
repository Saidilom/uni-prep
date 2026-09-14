import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";

// nodejs, не edge: нужен встроенный node:crypto для HMAC-проверки подписи
// Telegram-виджета — в edge-рантайме его нет.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Мост Telegram Login Widget → настоящая Supabase-сессия.
//
// У Supabase Auth нет встроенного провайдера Telegram. Вместо подмены auth-
// модели — сервер проверяет подпись виджета, создаёт (или находит) через
// admin-API настоящего пользователя auth.users, и отдаёт браузеру token_hash,
// которым тот сам получает штатную Supabase-сессию (supabase.auth.verifyOtp).
// Дальше вся остальная система (RLS, auth-provider.tsx, онбординг) не видит
// разницы между Google- и Telegram-пользователем — id всё так же
// auth.users.id::text.
//
// Регистрация полностью самостоятельная: решение владельца от 2026-09-14—
// можно завести аккаунт только через Telegram, без Google. Один и тот же
// человек, пришедший через оба провайдера, получит два разных аккаунта —
// принятый компромисс, Telegram не отдаёт email, сверить личность не с чем.
type TelegramAuthPayload = {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    auth_date: number;
    hash: string;
};

const AUTH_DATE_MAX_AGE_SECONDS = 60;

function isValidPayload(body: unknown): body is TelegramAuthPayload {
    if (!body || typeof body !== "object") return false;
    const b = body as Record<string, unknown>;
    return typeof b.id === "number" && typeof b.first_name === "string"
        && typeof b.auth_date === "number" && typeof b.hash === "string";
}

// Официальный алгоритм проверки подписи Telegram Login Widget: строка
// key=value по всем полям кроме hash, отсортированным по ключу, через \n;
// секрет — sha256 от токена бота; итог — hmac-sha256 этим секретом.
function verifyTelegramSignature(payload: TelegramAuthPayload, botToken: string): boolean {
    const { hash, ...rest } = payload;
    const dataCheckString = Object.keys(rest)
        .sort()
        .map((key) => `${key}=${(rest as Record<string, unknown>)[key]}`)
        .join("\n");
    const secretKey = crypto.createHash("sha256").update(botToken).digest();
    const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    const received = Buffer.from(hash, "hex");
    const expected = Buffer.from(hmac, "hex");
    if (received.length !== expected.length) return false;
    return crypto.timingSafeEqual(received, expected);
}

export async function POST(req: NextRequest) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
        console.error("[auth/telegram] TELEGRAM_BOT_TOKEN не настроен");
        return NextResponse.json({ error: "Вход через Telegram временно недоступен" }, { status: 503 });
    }

    const ip = requestIp(req);
    // До любой криптографии и обращений к БД — дёшево остановить перебор.
    // Пре-сессионный путь: клиент — service_role, не создаём сессию до
    // самого конца, идентификатор — IP.
    const allowed = await checkRateLimit(supabaseServer, "telegram_auth", ip, 10, 5 * 60);
    if (!allowed) {
        return NextResponse.json({ error: "Слишком много попыток, попробуйте позже" }, { status: 429 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
    }
    if (!isValidPayload(body)) {
        return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
    }

    if (!verifyTelegramSignature(body, botToken)) {
        return NextResponse.json({ error: "Подпись не прошла проверку" }, { status: 401 });
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds - body.auth_date > AUTH_DATE_MAX_AGE_SECONDS) {
        return NextResponse.json({ error: "Запрос устарел, попробуйте снова" }, { status: 401 });
    }

    try {
        const telegramId = body.id;
        const fullName = [body.first_name, body.last_name].filter(Boolean).join(" ").trim() || "Ученик";
        const syntheticEmail = `tg_${telegramId}@telegram.registan.local`;

        const { data: existing } = await supabaseServer
            .from("users")
            .select("id, email")
            .eq("telegram_id", telegramId)
            .maybeSingle();

        let email = (existing as { email: string } | null)?.email ?? syntheticEmail;

        if (!existing) {
            const created = await checkRateLimit(supabaseServer, "telegram_signup", ip, 5, 60 * 60);
            if (!created) {
                return NextResponse.json({ error: "Слишком много регистраций, попробуйте позже" }, { status: 429 });
            }
            const { error: createError } = await supabaseServer.auth.admin.createUser({
                email: syntheticEmail,
                email_confirm: true,
                user_metadata: {
                    provider: "telegram",
                    telegram_id: telegramId,
                    full_name: fullName,
                    telegram_username: body.username ?? null,
                },
            });
            // Гонка (два запроса одновременно создают одного и того же
            // Telegram-пользователя) — не сбой: ON CONFLICT в handle_new_user
            // и уникальный индекс telegram_id уже защищают от дубля, дальше
            // просто продолжаем тем же synthetic email.
            if (createError && !/already been registered|already exists/i.test(createError.message)) {
                console.error("[auth/telegram] createUser failed:", createError.message);
                return NextResponse.json({ error: "Не удалось создать аккаунт" }, { status: 500 });
            }
            email = syntheticEmail;
        }

        const { data: linkData, error: linkError } = await supabaseServer.auth.admin.generateLink({
            type: "magiclink",
            email,
        });
        if (linkError || !linkData?.properties?.hashed_token) {
            console.error("[auth/telegram] generateLink failed:", linkError?.message);
            return NextResponse.json({ error: "Не удалось выполнить вход" }, { status: 500 });
        }

        return NextResponse.json({ token_hash: linkData.properties.hashed_token });
    } catch (error) {
        // Ошибка без деталей наружу: иначе по различию текста ошибки можно
        // перебором узнавать, какие telegram_id уже зарегистрированы.
        console.error("[auth/telegram] unexpected error:", error);
        return NextResponse.json({ error: "Не удалось выполнить вход" }, { status: 500 });
    }
}
