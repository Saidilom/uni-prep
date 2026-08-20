import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  // don't throw during import — allow server-side scripts to run without browser keys
  console.warn("Supabase client: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
}

// createBrowserClient (not the plain supabase-js createClient) keeps the
// session in cookies, not just localStorage — middleware.ts and Route
// Handlers read the session from cookies via @supabase/ssr's server client.
// With the plain client, the browser had a session but the server never saw
// it, so every navigation (which round-trips through middleware) looked
// unauthenticated and bounced back to /login.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

export default supabase;
