"use client";

import supabase from "./supabase/client";
import { normalizePhone, isValidUzPhone } from "./phone-utils";

export async function sendPhoneVerificationCode(rawPhone: string): Promise<void> {
  if (!isValidUzPhone(rawPhone)) {
    throw new Error("Введите корректный номер телефона (+998 XX XXX XX XX)");
  }
  const phone = normalizePhone(rawPhone);
  await supabase.auth.signInWithOtp({ phone });
}

export async function verifyPhoneCode(_code: string) {
  // Supabase handles OTP verification automatically via the deep link flow.
  // Client-side confirmation (like Firebase) isn't available in the same way.
  throw new Error("verifyPhoneCode is not implemented for Supabase OTP flow. Use redirect/Deep Link or server-side verification.");
}

export function resetPhoneAuth(): void {
  // no-op for Supabase
}
