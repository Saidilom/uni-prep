"use client";

import { useRef, useState } from "react";
import { X, Copy, Check, Upload, FileJson, AlertTriangle } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { SUBJECTS } from "@/lib/constants";
import {
    parseAndValidateQuestions,
    ImportParseResult,
    ImportableRow,
} from "@/lib/question-bank-import";

export type ImportedBankRow = ImportableRow & { id: string };

const PROMPT_TEMPLATE = `Ты помогаешь оцифровать вопросы теста из прикреплённого файла (PDF или Excel) в JSON.

Извлеки ВСЕ вопросы с вариантами ответов из прикреплённого файла и верни их СТРОГО в следующем формате JSON, без каких-либо пояснений до или после, без markdown-разметки (без \`\`\`), только сам JSON:

{
  "questions": [
    {
      "text": "Текст вопроса",
      "options": { "a": "Вариант A", "b": "Вариант B", "c": "Вариант C", "d": "Вариант D" },
      "correctAnswer": "a",
      "points": 1,
      "subject": "math",
      "topic": "Короткое название темы",
      "difficulty": "medium"
    }
  ]
}

Правила:
- "correctAnswer" — буква правильного варианта: a, b, c или d.
- "subject" — один из: history, math, biology, geography, chemistry, physics, english, russian, it (если не уверен — оставь пустой строкой).
- "difficulty" — easy, medium или hard (если не уверен — используй medium).
- "topic" — короткая тема вопроса (1-4 слова), если не удаётся определить — оставь пустой строкой.
- "points" — количество баллов за вопрос, если не указано в файле — используй 1.
- Сохраняй оригинальный порядок вопросов из файла.
- Если у вопроса не ровно 4 варианта ответа — всё равно верни столько, сколько есть, под соответствующими буквами.
- Верни ТОЛЬКО JSON, без вступительного текста и без markdown-обрамления.`;

const difficultyLabel: Record<string, string> = { easy: "Простой", medium: "Средний", hard: "Сложный" };
const CHUNK_SIZE = 200;

type Phase = "input" | "preview";
type InputMode = "paste" | "file";

export default function QuestionBankJsonImport({ onDone, onClose }: { onDone: (imported: ImportedBankRow[]) => void; onClose: () => void }) {
    const [phase, setPhase] = useState<Phase>("input");
    const [mode, setMode] = useState<InputMode>("paste");
    const [jsonText, setJsonText] = useState("");
    const [error, setError] = useState("");
    const [result, setResult] = useState<ImportParseResult | null>(null);
    const [copied, setCopied] = useState(false);
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const copyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(PROMPT_TEMPLATE);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            alert("Не удалось скопировать. Выделите текст промта вручную.");
        }
    };

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setJsonText(await file.text());
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const check = () => {
        setError("");
        let parsed: unknown;
        try {
            parsed = JSON.parse(jsonText);
        } catch {
            setError("Не удалось разобрать JSON: проверьте, что скопирован текст целиком, без лишних символов до/после.");
            return;
        }
        const res = parseAndValidateQuestions(parsed);
        if (res.topLevelError) {
            setError(res.topLevelError);
            return;
        }
        setResult(res);
        setPhase("preview");
    };

    const doImport = async () => {
        if (!result || result.valid.length === 0) return;
        setImporting(true);
        try {
            const payload = result.valid.map((v) => ({ id: crypto.randomUUID(), ...v.row }));
            let insertedCount = 0;
            for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
                const chunk = payload.slice(i, i + CHUNK_SIZE);
                const { error: insertError } = await supabase.from("question_bank").insert(chunk);
                if (insertError) {
                    onDone(payload.slice(0, insertedCount));
                    alert(`Импортировано ${insertedCount} из ${payload.length} — ошибка на дальнейших: ${insertError.message}`);
                    setImporting(false);
                    return;
                }
                insertedCount += chunk.length;
            }
            onDone(payload);
            alert(`Импортировано: ${result.valid.length}, пропущено с ошибками: ${result.invalid.length}`);
            onClose();
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[500] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-3xl border border-border bg-card shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 border-b border-border flex items-center justify-between shrink-0">
                    <h2 className="text-xl font-bold text-foreground">Импорт вопросов из JSON</h2>
                    <button onClick={onClose} className="h-9 w-9 rounded-2xl border border-border bg-card hover:bg-muted transition-colors flex items-center justify-center">
                        <X size={16} className="text-muted-foreground" />
                    </button>
                </div>

                {phase === "input" && (
                    <>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div className="space-y-3">
                                <h3 className="text-sm font-bold text-foreground">Шаг 1. Скопируйте промт и вставьте в Claude вместе с вашим PDF/Excel</h3>
                                <p className="text-xs text-muted-foreground">Откройте claude.ai (можно бесплатно), прикрепите файл теста и вставьте этот промт — Claude вернёт готовый JSON.</p>
                                <textarea readOnly value={PROMPT_TEMPLATE} rows={8} className="w-full rounded-2xl border border-border bg-muted/40 px-4 py-3 text-xs text-foreground font-mono" />
                                <button onClick={copyPrompt} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors">
                                    {copied ? <><Check size={16} className="text-emerald-600" /> Скопировано</> : <><Copy size={16} /> Скопировать промт</>}
                                </button>
                            </div>

                            <div className="space-y-3">
                                <h3 className="text-sm font-bold text-foreground">Шаг 2. Вставьте JSON, который вернул Claude</h3>
                                <div className="flex items-center gap-2 p-1 bg-muted rounded-xl w-fit">
                                    <button onClick={() => setMode("paste")} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${mode === "paste" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Вставить текст</button>
                                    <button onClick={() => setMode("file")} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${mode === "file" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Загрузить файл</button>
                                </div>
                                {mode === "paste" ? (
                                    <textarea
                                        value={jsonText}
                                        onChange={(e) => setJsonText(e.target.value)}
                                        rows={10}
                                        placeholder="Вставьте сюда JSON, который вернул Claude…"
                                        className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground font-mono"
                                    />
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 bg-muted border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-all w-fit">
                                            <Upload size={16} /> Выбрать .json файл
                                        </button>
                                        {jsonText && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><FileJson size={13} /> Файл загружен, {jsonText.length} симв.</p>}
                                        <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleFile} className="hidden" />
                                    </div>
                                )}
                                {error && (
                                    <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30">
                                        <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="p-4 border-t border-border shrink-0">
                            <button onClick={check} disabled={!jsonText.trim()} className="w-full rounded-2xl bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 disabled:opacity-50">
                                Проверить
                            </button>
                        </div>
                    </>
                )}

                {phase === "preview" && result && (
                    <>
                        <div className="px-6 py-4 border-b border-border shrink-0 text-sm text-muted-foreground">
                            Найдено вопросов: {result.valid.length + result.invalid.length}. Готовы к импорту: <span className="font-semibold text-foreground">{result.valid.length}</span>. С ошибками: <span className="font-semibold text-red-600">{result.invalid.length}</span>.
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {[...result.valid.map((v) => ({ kind: "valid" as const, item: v })), ...result.invalid.map((v) => ({ kind: "invalid" as const, item: v }))]
                                .sort((a, b) => a.item.sourceIndex - b.item.sourceIndex)
                                .map((entry) => {
                                    if (entry.kind === "valid") {
                                        const v = entry.item;
                                        const subjectName = SUBJECTS.find((s) => s.id === v.row.subject)?.name;
                                        return (
                                            <div key={`v${v.sourceIndex}`} className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
                                                <p className="text-sm font-medium text-foreground">#{v.sourceIndex + 1}. {v.row.text}</p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {subjectName || "Без предмета"}{v.row.topic ? ` • ${v.row.topic}` : ""} • {difficultyLabel[v.row.difficulty]} • Правильно: {v.row.correct_answer.toUpperCase()}
                                                </p>
                                                {v.warnings.map((w, i) => (
                                                    <p key={i} className="mt-1 text-xs text-amber-600">⚠ {w}</p>
                                                ))}
                                            </div>
                                        );
                                    }
                                    const inv = entry.item;
                                    return (
                                        <div key={`i${inv.sourceIndex}`} className="rounded-xl border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
                                            <p className="text-sm font-medium text-foreground">#{inv.sourceIndex + 1}. {inv.text || "(нет текста)"}</p>
                                            <p className="mt-1 text-xs text-red-600">Ошибки: {inv.reasons.join("; ")}</p>
                                        </div>
                                    );
                                })}
                        </div>
                        <div className="p-4 border-t border-border shrink-0 flex items-center gap-3">
                            <button onClick={() => setPhase("input")} className="rounded-2xl border border-border px-6 py-3 text-sm font-semibold hover:bg-muted transition-colors">Назад</button>
                            <button onClick={doImport} disabled={result.valid.length === 0 || importing} className="flex-1 rounded-2xl bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 disabled:opacity-50">
                                {importing ? "Импортируем…" : `Импортировать ${result.valid.length}`}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
