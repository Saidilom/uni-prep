"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Plus, Trash2, Edit3, Save, X, UserPlus, Library, Upload } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { useAuthStore } from "@/store/useAuthStore";
import QuestionBankPicker, { BankQuestion } from "@/components/question-bank-picker";
import QuestionBankJsonImport, { ImportedBankRow } from "@/components/question-bank-json-import";

// Raw row shape as Postgres/PostgREST actually returns it (snake_case) —
// NOT the camelCase `PlacementTest` type from firestore-schema.ts, which
// doesn't match these columns at all (passingScore/durationMinutes vs the
// real passing_score/time_limit_minutes). Writing with the wrong names is
// what caused the 400 on placement_tests insert; since that error wasn't
// checked, the code went on to insert questions referencing a test_id that
// was never actually created — hence the follow-up 409 FK violation.
type TestRow = {
    id: string;
    title: string;
    description: string | null;
    passing_score: number;
    time_limit_minutes: number | null;
};

type StudentOption = { id: string; name: string; surname: string | null; phone: string | null };

type AssignmentRow = {
    id: string;
    user_id: string;
    test_id: string;
    test_title: string;
    status: string;
    assigned_at: string;
    users: { name: string; surname: string | null; phone: string | null } | null;
};

type QuestionInput = {
    id: string;
    text: string;
    options: Record<string, string>;
    correct_answer: string;
    points: number;
    order: number;
    bank_id?: string | null;
    image_url?: string | null;
};

type TestForm = {
    id?: string;
    title: string;
    description: string;
    passingScore: number;
    durationMinutes: number | null;
    questions: QuestionInput[];
};

const emptyQuestion = (idx: number): QuestionInput => ({
    id: crypto.randomUUID(),
    text: "",
    options: { a: "", b: "", c: "", d: "" },
    correct_answer: "a",
    points: 1,
    order: idx,
    bank_id: null,
    image_url: null,
});

export default function AdminPlacementPage() {
    const { user: admin } = useAuthStore();
    const [tests, setTests] = useState<TestRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<TestForm | null>(null);
    const [saving, setSaving] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const [showJsonImport, setShowJsonImport] = useState(false);

    const [students, setStudents] = useState<StudentOption[]>([]);
    const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
    const [assignUserId, setAssignUserId] = useState("");
    const [assignTestId, setAssignTestId] = useState("");
    const [assigning, setAssigning] = useState(false);

    const load = async () => {
        setLoading(true);
        const { data } = await supabase.from("placement_tests").select("*").order("created_at", { ascending: false });
        if (data) setTests(data as TestRow[]);
        setLoading(false);
    };

    const loadStudents = async () => {
        const { data } = await supabase
            .from("users")
            .select("id, name, surname, phone")
            .eq("role", "student")
            .order("name");
        if (data) setStudents(data as StudentOption[]);
    };

    const loadAssignments = async () => {
        const { data } = await supabase
            .from("placement_assignments")
            .select("id, user_id, test_id, test_title, status, assigned_at, users(name, surname, phone)")
            .order("assigned_at", { ascending: false })
            .limit(50);
        if (data) setAssignments(data as unknown as AssignmentRow[]);
    };

    useEffect(() => { load(); loadStudents(); loadAssignments(); }, []);

    const assignedTestIdsByUser = useMemo(() => {
        const map = new Map<string, Set<string>>();
        for (const a of assignments) {
            if (a.status === "completed") continue;
            if (!map.has(a.user_id)) map.set(a.user_id, new Set());
            map.get(a.user_id)!.add(a.test_id);
        }
        return map;
    }, [assignments]);

    const handleAssign = async () => {
        if (!assignUserId || !assignTestId) return;
        const alreadyActive = assignedTestIdsByUser.get(assignUserId)?.has(assignTestId);
        if (alreadyActive) {
            alert("У этого пользователя уже есть активное назначение на этот тест.");
            return;
        }
        setAssigning(true);
        try {
            const test = tests.find((t) => t.id === assignTestId);
            const { error } = await supabase.from("placement_assignments").insert({
                id: crypto.randomUUID(),
                user_id: assignUserId,
                test_id: assignTestId,
                test_title: test?.title || "",
                status: "assigned",
                assigned_by: admin?.id || "",
                assigned_at: new Date().toISOString(),
            });
            if (error) {
                alert(`Не удалось назначить тест: ${error.message}`);
                return;
            }
            setAssignUserId("");
            setAssignTestId("");
            loadAssignments();
        } finally {
            setAssigning(false);
        }
    };

    const startCreate = () => {
        setEditing({
            title: "",
            description: "",
            passingScore: 60,
            durationMinutes: 60,
            questions: [emptyQuestion(0), emptyQuestion(1), emptyQuestion(2), emptyQuestion(3)],
        });
    };

    const startEdit = (t: TestRow) => {
        setEditing({
            id: t.id,
            title: t.title,
            description: t.description || "",
            passingScore: t.passing_score ?? 0,
            durationMinutes: t.time_limit_minutes ?? null,
            questions: [],
        });
        supabase.from("placement_questions").select("*").eq("test_id", t.id).order("order").then(({ data }) => {
            if (data && data.length > 0) {
                setEditing((prev) => prev && prev.id === t.id ? {
                    ...prev,
                    questions: data.map((q: { id: string; text: string; options: Record<string, string>; correct_answer: string; points: number; order: number; bank_id?: string | null; image_url?: string | null }) => ({
                        id: q.id,
                        text: q.text,
                        options: q.options,
                        correct_answer: q.correct_answer,
                        points: q.points,
                        order: q.order,
                        bank_id: q.bank_id ?? null,
                        image_url: q.image_url ?? null,
                    })),
                } : prev);
            }
        });
    };

    const save = async () => {
        if (!editing) return;
        setSaving(true);
        try {
            if (editing.id) {
                const { error } = await supabase.from("placement_tests").update({
                    title: editing.title,
                    description: editing.description,
                    passing_score: editing.passingScore,
                    time_limit_minutes: editing.durationMinutes,
                    updated_at: new Date().toISOString(),
                }).eq("id", editing.id);
                if (error) {
                    alert(`Не удалось сохранить тест: ${error.message}`);
                    return;
                }
                await supabase.from("placement_questions").delete().eq("test_id", editing.id);
            } else {
                const newId = crypto.randomUUID();
                const { error } = await supabase.from("placement_tests").insert({
                    id: newId,
                    title: editing.title,
                    description: editing.description,
                    passing_score: editing.passingScore,
                    time_limit_minutes: editing.durationMinutes,
                });
                if (error) {
                    alert(`Не удалось создать тест: ${error.message}`);
                    return;
                }
                editing.id = newId;
            }
            const questions = editing.questions.map((q) => ({
                id: q.id || crypto.randomUUID(),
                test_id: editing.id,
                text: q.text,
                options: q.options,
                correct_answer: q.correct_answer,
                points: q.points,
                order: q.order,
                bank_id: q.bank_id ?? null,
                image_url: q.image_url ?? null,
            }));
            const { error: questionsError } = await supabase.from("placement_questions").insert(questions);
            if (questionsError) {
                alert(`Тест сохранён, но не удалось сохранить вопросы: ${questionsError.message}`);
                return;
            }
            setEditing(null);
            load();
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: string) => {
        if (!confirm("Удалить этот Placement-тест?")) return;
        await supabase.from("placement_tests").delete().eq("id", id);
        load();
    };

    const updateQuestion = (idx: number, patch: Partial<QuestionInput>) => {
        setEditing((prev) => prev ? {
            ...prev,
            questions: prev.questions.map((q, i) => i === idx ? { ...q, ...patch } : q),
        } : null);
    };

    const addQuestion = () => {
        setEditing((prev) => prev ? { ...prev, questions: [...prev.questions, emptyQuestion(prev.questions.length)] } : null);
    };

    const addFromBank = (q: BankQuestion) => {
        setEditing((prev) => prev ? {
            ...prev,
            questions: [...prev.questions, {
                id: crypto.randomUUID(),
                text: q.text,
                options: q.options,
                correct_answer: q.correct_answer,
                points: q.points,
                order: prev.questions.length,
                bank_id: q.id,
                image_url: q.image_url,
            }],
        } : null);
    };

    const removeQuestion = (idx: number) => {
        setEditing((prev) => prev ? { ...prev, questions: prev.questions.filter((_, i) => i !== idx) } : null);
    };

    return (
        <div className="flex flex-col gap-10">
            <section className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Placement</h1>
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                        Шаблоны вступительного тестирования. Создавайте тесты и добавляйте вопросы.
                    </p>
                </div>
                {!editing && (
                    <button onClick={startCreate} className="inline-flex items-center gap-2 rounded-2xl bg-foreground px-5 py-3 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.97]">
                        <Plus size={18} /> Создать
                    </button>
                )}
            </section>

            {editing && (
                <div className="rounded-3xl border border-border bg-card p-8 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1.5 sm:col-span-3">
                            <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Название</label>
                            <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground" required />
                        </div>
                        <div className="space-y-1.5 sm:col-span-3">
                            <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Описание</label>
                            <textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground" rows={3} />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Проходной балл (%)</label>
                            <input type="number" value={editing.passingScore} onChange={(e) => setEditing({ ...editing, passingScore: Number(e.target.value) })} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Время (мин)</label>
                            <input type="number" value={editing.durationMinutes ?? ""} onChange={(e) => setEditing({ ...editing, durationMinutes: e.target.value ? Number(e.target.value) : null })} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-foreground">Вопросы</h3>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setShowJsonImport(true)} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors"><Upload size={16} /> Импорт из JSON</button>
                                <button onClick={() => setShowPicker(true)} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors"><Library size={16} /> Из банка</button>
                                <button onClick={addQuestion} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors"><Plus size={16} /> Добавить</button>
                            </div>
                        </div>
                        {editing.questions.map((q, idx) => (
                            <div key={q.id} className="rounded-2xl border border-border bg-muted/50 p-5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Вопрос {idx + 1}{q.bank_id ? " • из банка" : ""}</span>
                                    <button onClick={() => removeQuestion(idx)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors"><Trash2 size={16} /></button>
                                </div>
                                {q.image_url && (
                                    <Image src={q.image_url} alt="" width={200} height={120} className="max-h-32 w-auto rounded-lg object-contain border border-border" />
                                )}
                                <input value={q.text} onChange={(e) => updateQuestion(idx, { text: e.target.value })} placeholder="Текст вопроса" className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-foreground text-sm" />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {["a", "b", "c", "d"].map((key) => (
                                        <input key={key} value={q.options[key] || ""} onChange={(e) => updateQuestion(idx, { options: { ...q.options, [key]: e.target.value } })} placeholder={`Вариант ${key.toUpperCase()}`} className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-foreground text-sm" />
                                    ))}
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <select value={q.correct_answer} onChange={(e) => updateQuestion(idx, { correct_answer: e.target.value })} className="rounded-xl border border-border bg-background px-4 py-2.5 text-foreground text-sm">
                                        <option value="a">A</option>
                                        <option value="b">B</option>
                                        <option value="c">C</option>
                                        <option value="d">D</option>
                                    </select>
                                    <input type="number" value={q.points} onChange={(e) => updateQuestion(idx, { points: Number(e.target.value) })} placeholder="Баллы" className="w-24 rounded-xl border border-border bg-background px-4 py-2.5 text-foreground text-sm" />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-3">
                        <button onClick={save} disabled={saving || !editing.title.trim()} className="inline-flex items-center gap-2 rounded-2xl bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50">
                            <Save size={18} /> {saving ? "Сохранение…" : "Сохранить"}
                        </button>
                        <button onClick={() => setEditing(null)} className="inline-flex items-center gap-2 rounded-2xl border border-border px-6 py-3 text-sm font-semibold hover:bg-muted transition-colors"><X size={18} /> Отмена</button>
                    </div>
                </div>
            )}

            <section>
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((n) => (
                            <div key={n} className="h-24 animate-pulse rounded-2xl border border-border bg-muted" />
                        ))}
                    </div>
                ) : tests.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">Пока нет Placement-тестов.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {tests.map((t) => (
                            <div key={t.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:bg-muted/40 sm:flex-row sm:items-center">
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-foreground">{t.title}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">Проходной балл: {t.passing_score ?? 0}% • Время: {t.time_limit_minutes ?? "—"} мин</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => startEdit(t)} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors"><Edit3 size={16} /> Редактировать</button>
                                    <button onClick={() => remove(t.id)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 hover:bg-red-100 transition-colors"><Trash2 size={16} /> Удалить</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="flex flex-col gap-4 border-t border-border pt-10">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground">Назначения</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Назначьте вступительный тест конкретному ученику.</p>
                </div>

                <div className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-6 sm:flex-row sm:items-end">
                    <div className="flex-1 space-y-1.5">
                        <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Ученик</label>
                        <select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground">
                            <option value="">Выберите ученика</option>
                            {students.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name} {s.surname || ""} {s.phone ? `— ${s.phone}` : ""}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 space-y-1.5">
                        <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Тест</label>
                        <select value={assignTestId} onChange={(e) => setAssignTestId(e.target.value)} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground">
                            <option value="">Выберите тест</option>
                            {tests.map((t) => (
                                <option key={t.id} value={t.id}>{t.title}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={handleAssign}
                        disabled={!assignUserId || !assignTestId || assigning}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-foreground px-6 py-3 text-sm font-semibold text-background shadow-sm transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
                    >
                        <UserPlus size={18} /> {assigning ? "Назначение…" : "Назначить"}
                    </button>
                </div>

                {assignments.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-muted/50 py-10 text-center dark:bg-muted/30">
                        <p className="font-medium text-muted-foreground">Пока нет назначений.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {assignments.map((a) => (
                            <div key={a.id} className="flex flex-col justify-between gap-2 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-foreground">
                                        {a.users ? `${a.users.name} ${a.users.surname || ""}` : a.user_id}
                                        {a.users?.phone ? ` — ${a.users.phone}` : ""}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{a.test_title} • {new Date(a.assigned_at).toLocaleString("ru-RU")}</p>
                                </div>
                                <span className={`inline-block w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                                    a.status === "completed"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40"
                                        : a.status === "in_progress"
                                            ? "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/40"
                                            : "border-border bg-muted text-muted-foreground"
                                }`}>
                                    {a.status === "completed" ? "Завершён" : a.status === "in_progress" ? "В процессе" : "Назначен"}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {showPicker && <QuestionBankPicker onAdd={addFromBank} onClose={() => setShowPicker(false)} />}
            {showJsonImport && (
                <QuestionBankJsonImport
                    onDone={(rows: ImportedBankRow[]) => rows.forEach((r) => addFromBank(r))}
                    onClose={() => setShowJsonImport(false)}
                />
            )}
        </div>
    );
}
