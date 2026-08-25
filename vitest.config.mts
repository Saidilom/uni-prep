import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        env: {
            NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "./src"),
        },
    },
});
