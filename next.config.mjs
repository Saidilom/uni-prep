/** @type {import('next').NextConfig} */
const nextConfig = {
    // ═══ ОБА КЛЮЧА НИЖЕ — ВНУТРИ experimental, И ЭТО НЕ СТИЛЬ ═══
    //
    // Здесь Next 14.2. Верхнеуровневые имена `serverExternalPackages` и
    // `outputFileTracingIncludes` появились только в Next 15, а 14 неизвестные
    // ключи молча выбрасывает — предупреждение «Invalid next.config.mjs
    // options detected» тонет в начале сборки.
    //
    // Ровно так и вышло: оба ключа стояли сверху, ни один не действовал, mupdf
    // попадал в бандл (.next/server/chunks/713.js, 91 KB) и падал у КАЖДОГО
    // рисунка минифицированным «e is not a function». Прод-импорт
    // 7-MOCK MATEMATIKA: «Рисунков вырезано: 0; сбой вырезки у 10».
    //
    // Сторож от повтора — src/lib/next-config-schema.test.ts: конфиг
    // проверяется собственной схемой установленного Next.
    experimental: {
        // mupdf — WASM-модуль с top-level await; вырезка рисунков заданий
        // грузит его динамически в серверном роуте импорта. Бандлеру его
        // отдавать нельзя: .wasm рядом с кодом он не разложит, и на сервере
        // модуль просто не найдётся. Этот ключ оставляет его обычным require
        // из node_modules.
        serverComponentsExternalPackages: ["mupdf"],
        // Одного «не бандлить» мало: он не говорит «положить рядом».
        // Трассировщик Next видит только импорт mupdf.js и не догадывается про
        // .wasm, который тот грузит уже во время работы. Без этой строки на
        // сервере не оказывается самого файла.
        outputFileTracingIncludes: {
            "/api/mock-tests/import": ["./node_modules/mupdf/**"],
        },
    },
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "firebasestorage.googleapis.com",
            },
            {
                protocol: "https",
                hostname: "*.supabase.co",
            },
        ],
    },
    // Deliberately not attempting a full script-src/style-src CSP here —
    // Next.js's own inline hydration scripts would need careful nonce
    // wiring to not break under a strict policy, and getting that wrong is
    // worse than shipping nothing. frame-ancestors alone (clickjacking) is
    // safe to add with zero risk of breaking the app, same as the other
    // headers below — none of them restrict what the app itself can load.
    //
    // X-Frame-Options must stay SAMEORIGIN, not DENY: `source: "/:path*"`
    // covers /api/** too, and the mock runner shows a question's figure by
    // framing /api/mock-tests/[id]/source (which redirects to the source
    // PDF page). DENY blocks that even same-origin, which is exactly what
    // broke it. SAMEORIGIN gives the same clickjacking protection here —
    // and frame-ancestors 'self' below already says the same thing for
    // browsers that honour CSP over the legacy header.
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    { key: "X-Frame-Options", value: "SAMEORIGIN" },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    { key: "Content-Security-Policy", value: "frame-ancestors 'self';" },
                ],
            },
        ];
    },
};

export default nextConfig;
