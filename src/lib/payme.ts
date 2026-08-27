// Payme Business Merchant API (JSON-RPC 2.0) — pure helpers only, no I/O.
// Protocol reference: https://developer.help.paycom.uz/
// Amounts on the wire are always tiyin (1 UZS = 100 tiyin); everywhere else
// in this app (payments.amount, mock_tests.price) amounts are plain UZS.

export const PAYME_ERROR = {
  INVALID_AMOUNT: -31001,
  TRANSACTION_NOT_FOUND: -31003,
  CANNOT_PERFORM: -31008,
  ORDER_NOT_FOUND: -31050,
  ORDER_NOT_PAYABLE: -31051,
  INSUFFICIENT_PRIVILEGE: -32504,
  METHOD_NOT_FOUND: -32601,
  PARSE_ERROR: -32700,
} as const;

// Standard Payme cancellation reason codes (sent back by Payme in
// CancelTransaction, stored as-is — not produced by us).
export const PAYME_CANCEL_REASON = {
  RECIPIENT_NOT_FOUND: 1,
  DEBIT_ERROR: 2,
  TRANSACTION_ERROR: 3,
  TIMEOUT: 4,
  REFUND: 5,
  UNKNOWN: 10,
} as const;

export function amountToTiyin(uzs: number): number {
  return Math.round(uzs * 100);
}

export function tiyinToAmount(tiyin: number): number {
  return Math.round(tiyin) / 100;
}

// Payme calls the merchant endpoint with HTTP Basic Auth: login is
// conventionally "Paycom", password is the merchant's secret key (test key
// while integrating, production key once approved). Only the key is
// actually checked — the login value itself isn't secret.
export function verifyPaymeAuth(authHeader: string | null, merchantKey: string): boolean {
  if (!authHeader?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return false;
  const password = decoded.slice(separatorIndex + 1);
  return password === merchantKey;
}

export function buildPaymeCheckoutUrl(opts: {
  merchantId: string;
  orderId: string;
  amountUzs: number;
  returnUrl?: string;
  testMode?: boolean;
}): string {
  const segments = [`m=${opts.merchantId}`, `ac.order_id=${opts.orderId}`, `a=${amountToTiyin(opts.amountUzs)}`];
  if (opts.returnUrl) segments.push(`c=${opts.returnUrl}`);
  const encoded = Buffer.from(segments.join(";")).toString("base64");
  const host = opts.testMode ? "checkout.test.paycom.uz" : "checkout.paycom.uz";
  return `https://${host}/${encoded}`;
}
