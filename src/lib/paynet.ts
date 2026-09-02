import { timingSafeEqual } from "crypto";

// Paynet Merchant API (JSON-RPC 2.0 over HTTP Basic Auth) — pure helpers
// only, no I/O. Unlike Payme/Click, Paynet has no public self-service docs;
// this follows the protocol as specified in Paynet's own certification
// test plan (5 methods: GetInformation, PerformTransaction, CheckTransaction,
// CancelTransaction, GetStatement) handed to us directly, not a published
// spec URL. Amounts on the wire are tiyin (1 UZS = 100 tiyin), same
// convention as Payme — everywhere else in this app amounts are plain UZS.
//
// Unlike Payme (fixed "Paycom" login) or Click (service_id + secret_key),
// Paynet's Basic Auth username/password are OURS to define — we pick them,
// put them in PAYNET_USERNAME/PAYNET_PASSWORD, and hand them to Paynet's
// integration team alongside our endpoint URL. Both sides of the pair are
// secret here, so both are compared with a constant-time check.

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyPaynetAuth(authHeader: string | null, username: string, password: string): boolean {
  if (!authHeader?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return false;
  const suppliedUser = decoded.slice(0, separatorIndex);
  const suppliedPass = decoded.slice(separatorIndex + 1);
  return safeEqual(suppliedUser, username) && safeEqual(suppliedPass, password);
}

// Error codes as specified in Paynet's certification test plan. 301/304/305
// aren't individually documented beyond "client/service not found" — 302 is
// the one with a confirmed message ("Клиент не найден") and is what this
// integration returns for every not-found case; ask Paynet's integration
// contact if the others need to be distinguished before going live.
export const PAYNET_ERROR = {
  NOT_FOUND: 302,
  WRONG_AMOUNT: 413,
  DUPLICATE_TRANSACTION: 201,
  ALREADY_CANCELLED: 202,
} as const;

export function amountToTiyin(uzs: number): number {
  return Math.round(uzs * 100);
}

export function tiyinToAmount(tiyin: number): number {
  return Math.round(tiyin) / 100;
}

// Paynet's test data uses "yyyy-mm-dd hh:mm:ss" in Asia/Tashkent local time
// (their Test Parameters table pairs it with "UZT" example timestamps) —
// not ISO 8601, and not UTC, which matters since the server may run in UTC.
export function formatPaynetTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}
