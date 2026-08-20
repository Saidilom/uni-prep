"use client";

export async function sendPhoneVerificationCode(rawPhone: string): Promise<void> {
  void rawPhone;
  throw new Error("Phone OTP пока не поддерживается, используйте вход через Google.");
}

export async function verifyPhoneCode(code: string) {
  void code;
  throw new Error("Phone OTP пока не поддерживается, используйте вход через Google.");
}

export function resetPhoneAuth(): void {
  // no-op for Supabase
}
