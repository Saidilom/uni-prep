import crypto from "crypto";

// Click Merchant API (Shop API v2, JSON webhook) — pure helpers only, no I/O.
// Protocol reference: https://docs.click.uz/en/click-api-request/

export const CLICK_ERROR = {
  SUCCESS: 0,
  SIGN_CHECK_FAILED: -1,
  INCORRECT_AMOUNT: -2,
  ACTION_NOT_FOUND: -3,
  ALREADY_PAID: -4,
  USER_NOT_FOUND: -5,
  TRANSACTION_NOT_FOUND: -6,
  FAILED_TO_UPDATE: -7,
  BAD_REQUEST: -8,
  TRANSACTION_CANCELLED: -9,
} as const;

export type ClickSignatureParams = {
  clickTransId: string | number;
  serviceId: string | number;
  merchantTransId: string;
  merchantPrepareId?: string | number | null;
  amount: string | number;
  action: string | number;
  signTime: string;
};

// action=0 (Prepare) signs without merchant_prepare_id; action=1 (Complete)
// includes it — the field literally doesn't exist yet at Prepare time.
export function buildClickSignSource(params: ClickSignatureParams, secretKey: string): string {
  const action = Number(params.action);
  const parts =
    action === 1
      ? [params.clickTransId, params.serviceId, secretKey, params.merchantTransId, params.merchantPrepareId ?? "", params.amount, params.action, params.signTime]
      : [params.clickTransId, params.serviceId, secretKey, params.merchantTransId, params.amount, params.action, params.signTime];
  return parts.join("");
}

export function verifyClickSignature(params: ClickSignatureParams & { signString: string }, secretKey: string): boolean {
  const expected = crypto.createHash("md5").update(buildClickSignSource(params, secretKey)).digest("hex");
  // Plain === short-circuits on the first differing byte, which leaks a
  // (tiny but real) timing signal — the standard hardening for a signature
  // comparison. MD5 hex digests are a fixed 32 chars, but signString is
  // attacker-supplied, so the length check still guards Buffer.from below.
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(params.signString, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

// Click compares amounts as decimal UZS (not tiyin, unlike Payme) — but
// still needs a tolerant comparison since it may arrive as "50000.00" vs a
// plain integer 50000 in our own records.
export function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

export function buildClickCheckoutUrl(opts: {
  serviceId: string;
  merchantId: string;
  amountUzs: number;
  orderId: string;
  returnUrl: string;
}): string {
  const params = new URLSearchParams({
    service_id: opts.serviceId,
    merchant_id: opts.merchantId,
    amount: String(opts.amountUzs),
    transaction_param: opts.orderId,
    return_url: opts.returnUrl,
  });
  return `https://my.click.uz/services/pay?${params.toString()}`;
}
