/** @type {import('next').NextConfig} */
const nextConfig = {
    // mupdf — WASM-модуль с top-level await; вырезка рисунков заданий грузит
    // его динамически в серверном роуте импорта. Бандлеру его отдавать нельзя:
    // .wasm рядом с кодом он не разложит, и на сервере модуль просто не
    // найдётся. serverExternalPackages оставляет его обычным require из
    // node_modules.
    serverExternalPackages: ["mupdf"],
    // Одного serverExternalPackages мало. Он говорит «не бандлить», но не
    // говорит «положить рядом»: трассировщик Next видит только импорт mupdf.js
    // и не догадывается про .wasm, который тот грузит уже во время работы. На
    // сервере файла не оказывается, и вырезка падает у всех заданий сразу —
    // ровно это и вышло на первом прогоне: «вырезано 0, сбой у 10».
    outputFileTracingIncludes: {
        "/api/mock-tests/import": ["./node_modules/mupdf/**"],
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
