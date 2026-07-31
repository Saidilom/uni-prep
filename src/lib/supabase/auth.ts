import supabase from "./client";

export async function sendOtp(phone: string) {
  // Supabase JS: auth.signInWithOtp
  return supabase.auth.signInWithOtp({ phone });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({ provider: "google" });
}

export default { sendOtp, signOut, signInWithGoogle };
