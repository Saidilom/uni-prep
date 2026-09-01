// middleware.ts and auth-provider.tsx both take a `redirectTo` query param
// straight from the URL and hand it to a redirect call. An attacker-crafted
// link like /login?redirectTo=https://evil.example/phish would otherwise
// send an already-authenticated visitor straight off this domain — the
// legitimate-looking initial URL is what makes this a real phishing vector,
// not just a cosmetic bug. Only a same-origin relative path is safe to honor.
export function sanitizeRedirectTarget(raw: string | null | undefined): string {
  if (!raw) return "/";
  // A leading "//" is a protocol-relative URL (browsers resolve it against
  // the current scheme onto whatever host follows) — an external redirect
  // just as much as a full "https://..." one.
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}
