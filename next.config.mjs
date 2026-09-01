/** @type {import('next').NextConfig} */
const nextConfig = {
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
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    { key: "Content-Security-Policy", value: "frame-ancestors 'self';" },
                ],
            },
        ];
    },
};

export default nextConfig;
