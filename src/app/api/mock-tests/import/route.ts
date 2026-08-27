import { NextRequest, NextResponse } from "next/server";
import { createPartFromUri, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";
import { IMPORTED_MOCK_JSON_SCHEMA, ImportedMock, ImportedMockSchema } from "@/lib/mock-import-schema";
import { buildMockImportPrompt, MOCK_IMPORT_SYSTEM_PROMPT } from "@/lib/mock-import-prompt";

export const runtime = "nodejs";
// A real multi-page exam (measured: a 7MB/50-question biology paper) took
// ~264s for Gemini to fully generate — 300s was already too tight before
// accounting for upload time. No-op locally under `next dev`; Vercel will
// enforce this once deployed (Группа 14) — revisit against whatever plan
// tier is actually provisioned then, since Pro without Fluid Compute caps at
// 300s and this route now assumes more.
export const maxDuration = 500;
export const dynamic = "force-dynamic";

const MAX_PDF_BYTES = 32 * 1024 * 1024;
const StoredFileSchema = z.object({
  path: z.string().min(1),
  filename: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_PDF_BYTES),
});
const StoredImportSchema = z.object({
  importId: z.string().uuid(),
  testFile: StoredFileSchema,
  answersFile: StoredFileSchema.optional(),
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getGeminiModelCandidates() {
  return Array.from(
    new Set([
      process.env.GEMINI_MODEL || "gemini-3.6-flash",
      process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash",
    ]),
  );
}

function isRetryableGeminiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|high demand|overloaded|temporarily unavailable/i.test(message);
}

// A slow/complex PDF (e.g. a two-file test+answer-key pair with reading
// passages) can legitimately need more than one httpOptions.timeout window
// to finish generating — the SDK aborts the request client-side and the
// error message is just "This operation was aborted" / DEADLINE_EXCEEDED,
// which isRetryableGeminiError doesn't match. Worth trying again (ideally
// with a different, possibly faster model), but never worth an artificial
// delay first — the attempt already used its whole time budget.
function isTimeoutGeminiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /aborted|DEADLINE_EXCEEDED|timeout/i.test(message);
}

function parseGeminiJson(text: string): ImportedMock {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const json = JSON.parse(withoutFence);
  const parsed = ImportedMockSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? issue.path.join(".") : "root";
    throw new Error(`Gemini вернул JSON не по схеме: ${path} — ${issue?.message || "validation failed"}`);
  }
  return parsed.data;
}

async function waitForGeminiFile(ai: GoogleGenAI, name: string) {
  const deadline = Date.now() + 60_000;
  let file = await ai.files.get({ name });
  while (file.state === "PROCESSING" && Date.now() < deadline) {
    await sleep(3_000);
    file = await ai.files.get({ name });
  }
  if (file.state === "FAILED") throw new Error("Gemini не смог обработать загруженный PDF");
  if (file.state === "PROCESSING") throw new Error("Gemini слишком долго подготавливал PDF, попробуйте ещё раз");
  return file;
}

async function extractDraftWithGemini(
  ai: GoogleGenAI,
  files: Array<{ file: Awaited<ReturnType<typeof waitForGeminiFile>>; filename: string }>,
  role: "admin" | "teacher",
) {
  const fileParts = files.map(({ file, filename }) => {
    if (!file.uri || !file.mimeType) {
      throw new Error(`Gemini не вернул URI загруженного файла (${filename})`);
    }
    return createPartFromUri(file.uri, file.mimeType);
  });
  const [testFilename, answersFilename] = files.map((f) => f.filename);
  const timeoutMs = Number(process.env.GEMINI_IMPORT_TIMEOUT_MS || 400_000);

  // A two-file exam+key pair can take well over one timeout window, so each
  // attempt already spends most of the available budget — chaining 3
  // attempts per model like before could add up to 6 full-length tries and
  // leave the user waiting many minutes just to see the same timeout again.
  // Only spend a second attempt when it can plausibly go differently: a fast
  // rate-limit-style error (retry after a short delay) or a genuinely
  // different fallback model. A timeout with no other model configured means
  // trying again would just wait out the same clock for the same reason, so
  // fail once and let the user re-run it deliberately instead.
  const candidates = getGeminiModelCandidates();

  let lastError: unknown;
  for (let attempt = 0; attempt < candidates.length; attempt++) {
    const model = candidates[attempt];
    if (attempt > 0 && isRetryableGeminiError(lastError) && !isTimeoutGeminiError(lastError)) {
      await sleep(3_000);
    }
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          ...fileParts,
          { text: buildMockImportPrompt(testFilename, role, answersFilename) },
        ],
        config: {
          httpOptions: { timeout: timeoutMs },
          systemInstruction: MOCK_IMPORT_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: IMPORTED_MOCK_JSON_SCHEMA,
          temperature: 0.1,
          maxOutputTokens: Number(process.env.GEMINI_IMPORT_MAX_TOKENS || 50000),
        },
      });
      return { model, response, draft: parseGeminiJson(response.text || "") };
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error) && !isTimeoutGeminiError(error)) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini временно недоступен");
}

export async function POST(req: NextRequest) {
  const routeClient = createRouteHandlerClient();
  const { data: authData } = await routeClient.auth.getUser();
  const authUser = authData.user;
  if (!authUser) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { data: profile } = await supabaseServer
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();
  const role = profile?.role as "admin" | "teacher" | undefined;
  if (role !== "admin" && role !== "teacher") {
    return NextResponse.json({ error: "Импорт доступен только Super Admin и учителю" }, { status: 403 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY не настроен в .env.local" },
      { status: 503 },
    );
  }

  const parsed = StoredImportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные загруженного PDF" }, { status: 400 });
  const { importId, testFile, answersFile } = parsed.data;

  const loadAndValidate = async (stored: z.infer<typeof StoredFileSchema>): Promise<Buffer | { error: string; status: number }> => {
    if (!stored.path.startsWith(`${authUser.id}/${importId}/`) || !stored.filename.toLowerCase().endsWith(".pdf")) {
      return { error: "Недопустимый путь PDF", status: 403 };
    }
    const { data: storedFile, error: downloadError } = await supabaseServer.storage.from("test-imports").download(stored.path);
    if (downloadError || !storedFile) return { error: "Загруженный PDF не найден", status: 404 };
    const bytes = Buffer.from(await storedFile.arrayBuffer());
    if (bytes.length !== stored.size || bytes.length > MAX_PDF_BYTES) {
      return { error: "Размер загруженного файла не совпадает", status: 400 };
    }
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return { error: "Файл не является корректным PDF", status: 415 };
    }
    return bytes;
  };

  const testResult = await loadAndValidate(testFile);
  if (!Buffer.isBuffer(testResult)) return NextResponse.json({ error: testResult.error }, { status: testResult.status });
  const testBytes = testResult;

  let answersBytes: Buffer | undefined;
  if (answersFile) {
    const answersResult = await loadAndValidate(answersFile);
    if (!Buffer.isBuffer(answersResult)) return NextResponse.json({ error: answersResult.error }, { status: answersResult.status });
    answersBytes = answersResult;
  }

  const model = getGeminiModelCandidates()[0];
  const { error: importRecordError } = await supabaseServer.from("mock_imports").insert({
    id: importId,
    created_by: authUser.id,
    filename: testFile.filename,
    file_path: testFile.path,
    answers_file_path: answersFile?.path ?? null,
    answers_filename: answersFile?.filename ?? null,
    status: "processing",
    model,
  });
  if (importRecordError) {
    return NextResponse.json({ error: `Не удалось создать AI import: ${importRecordError.message}` }, { status: 500 });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const geminiFileNames: string[] = [];
  try {
    const uploadOne = async (bytes: Buffer, filename: string) => {
      const uploaded = await ai.files.upload({
        file: new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
        config: { mimeType: "application/pdf", displayName: filename },
      });
      const name = uploaded.name;
      if (!name) throw new Error(`Gemini не вернул имя загруженного файла (${filename})`);
      geminiFileNames.push(name);
      return { file: await waitForGeminiFile(ai, name), filename };
    };

    const readyFiles = await Promise.all([
      uploadOne(testBytes, testFile.filename),
      ...(answersBytes ? [uploadOne(answersBytes, answersFile!.filename)] : []),
    ]);

    const { model: usedModel, response, draft } = await extractDraftWithGemini(ai, readyFiles, role);

    const { data: signed, error: signedError } = await supabaseServer.storage
      .from("test-imports")
      .createSignedUrl(testFile.path, 60 * 60);
    if (signedError || !signed?.signedUrl) throw signedError || new Error("Не удалось создать preview URL");

    await supabaseServer
      .from("mock_imports")
      .update({
        status: "review",
        model: usedModel,
        detected_subject: draft.subject,
        detected_language: draft.language,
        result: draft,
        warnings: draft.warnings,
        input_tokens: response.usageMetadata?.promptTokenCount || 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount || 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", importId);

    return NextResponse.json({
      importId,
      sourcePdfPath: testFile.path,
      previewUrl: signed.signedUrl,
      model: usedModel,
      inputTokens: response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      draft,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка Gemini";
    await supabaseServer
      .from("mock_imports")
      .update({ status: "failed", error: message.slice(0, 2000), updated_at: new Date().toISOString() })
      .eq("id", importId);
    return NextResponse.json({ error: `Не удалось распознать PDF: ${message}` }, { status: 502 });
  } finally {
    await Promise.all(geminiFileNames.map((name) => ai.files.delete({ name }).catch(() => undefined)));
  }
}
