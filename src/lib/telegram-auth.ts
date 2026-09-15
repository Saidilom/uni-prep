import crypto from "node:crypto";

// Чистая логика проверки Telegram Login Widget/popup, вынесена из
// src/app/api/auth/telegram/route.ts (CLAUDE.md: decision-логика из
// API route — в src/lib/ рядом с тестом). Ничего сетевого/БД тут нет —
// только HMAC над уже полученными данными.

export type TelegramAuthPayload = {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    auth_date: number;
    hash: string;
};

export function isValidTelegramPayload(body: unknown): body is TelegramAuthPayload {
    if (!body || typeof body !== "object") return false;
    const b = body as Record<string, unknown>;
    return typeof b.id === "number" && typeof b.first_name === "string"
        && typeof b.auth_date === "number" && typeof b.hash === "string";
}

// Официальный алгоритм проверки подписи Telegram Login Widget: строка
// key=value по всем полям кроме hash, отсортированным по ключу, через \n;
// секрет — sha256 от токена бота; итог — hmac-sha256 этим секретом.
//
// crypto.timingSafeEqual, не === — иначе сравнение хэшей утекает временем
// исполнения (посимвольное сравнение строк останавливается на первом
// несовпадении), что в принципе позволяет подобрать hash по замеру задержки.
export function verifyTelegramSignature(payload: TelegramAuthPayload, botToken: string): boolean {
    const { hash, ...rest } = payload;
    const dataCheckString = Object.keys(rest)
        .sort()
        .map((key) => `${key}=${(rest as Record<string, unknown>)[key]}`)
        .join("\n");
    const secretKey = crypto.createHash("sha256").update(botToken).digest();
    const hmac = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    const received = Buffer.from(hash, "hex");
    const expected = Buffer.from(hmac, "hex");
    // timingSafeEqual бросает исключение на буферах разной длины, а не
    // возвращает false — длину надо проверить отдельно ДО вызова.
    if (received.length !== expected.length) return false;
    return crypto.timingSafeEqual(received, expected);
}

// Защита от replay: подписанный payload из старого перехваченного запроса не
// должен работать вечно. auth_date подписан тем же HMAC — подделать его без
// токена бота нельзя, так что верхней границы на "будущее" время не нужно,
// только на "слишком давно".
export function isTelegramAuthDateFresh(authDateSeconds: number, nowSeconds: number, maxAgeSeconds: number): boolean {
    return nowSeconds - authDateSeconds <= maxAgeSeconds;
}
