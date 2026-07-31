/** Нормализация узбекского номера в формат +998XXXXXXXXX */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("998") && digits.length === 12) return `+${digits}`;
  if (digits.length === 9) return `+998${digits}`;
  if (digits.startsWith("998") && digits.length > 12) return `+${digits.slice(0, 12)}`;
  if (raw.startsWith("+")) return raw.replace(/\s/g, "");
  return `+${digits}`;
}

export function isValidUzPhone(raw: string): boolean {
  const normalized = normalizePhone(raw);
  return /^\+998\d{9}$/.test(normalized);
}

export function formatPhoneDisplay(phone: string): string {
  const m = phone.match(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/);
  if (!m) return phone;
  return `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
}
