import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";

const MAX_PDF_BYTES = 32 * 1024 * 1024;
const RequestSchema = z.object({
  filename: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_PDF_BYTES),
  importId: z.string().uuid().optional(),
  kind: z.enum(["test", "answers"]).default("test"),
});

export async function POST(req: NextRequest) {
  const client = createRouteHandlerClient();
  const { data: authData } = await client.auth.getUser();
  const user = authData.user;
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const { data: profile } = await supabaseServer.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "teacher") {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY не настроен в .env.local" }, { status: 503 });
  }

  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !parsed.data.filename.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Разрешены PDF до 32 MB" }, { status: 400 });
  }
  const importId = parsed.data.importId || crypto.randomUUID();
  const safeName = parsed.data.filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "exam.pdf";
  // Multiple "test" files can now be uploaded to the same importId (up to 4
  // exam-part PDFs) — without a unique slot per upload, two files that
  // happen to share an original filename (or even just both landing on
  // kind="test") would silently overwrite each other in storage.
  const slot = crypto.randomUUID().slice(0, 8);
  const path = `${user.id}/${importId}/${parsed.data.kind}-${slot}-${safeName}`;
  const { data, error } = await supabaseServer.storage.from("test-imports").createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: `Не удалось подготовить загрузку: ${error?.message || "unknown"}` }, { status: 500 });
  }
  return NextResponse.json({ importId, path, token: data.token });
}
