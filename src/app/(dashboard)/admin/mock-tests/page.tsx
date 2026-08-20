"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Edit3, Save, X } from "lucide-react";
import { MockTest } from "@/lib/firestore-schema";
import supabase from "@/lib/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function emptyQuestion(_id: string, _sectionId: string): QuestionInput {
    return {
        id: crypto.randomUUID(),
        text: "",
        options: { a: "", b: "", c: "", d: "" },
        correct_answer: "a",
        points: 1,
        order: 0,
    };
}

type QuestionInput = {
    id: string;
    section_id?: string;
    text: string;
    options: Record<string, string>;
    correct_answer: string;
    points: number;
    order: number;
};

type SectionInput = {
    id?: string;
    title: string;
    order: number;
    questions: QuestionInput[];
};

type MockForm = {
    id?: string;
    title: string;
    description: string;
    type: "free" | "paid";
    price: number;
    durationMinutes: number;
    sections: SectionInput[];
};

export default function AdminMockTestsPage() {
    const [tests, setTests] = useState<MockTest[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<MockForm | null>(null);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        const { data } = await supabase.from("mock_tests").select("*").order("created_at", { ascending: false });
        if (data) setTests(data as MockTest[]);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const startCreate = () => {
        setEditing({
            title: "",
            description: "",
            type: "free",
            price: 0,
            durationMinutes: 60,
            sections: [{ title: "Раздел 1", order: 0, questions: [emptyQuestion(crypto.randomUUID(), crypto.randomUUID())] }],
        });
    };

    const startEdit = async (t: MockTest) => {
        const sections: SectionInput[] = [];
        const { data: secs } = await supabase.from("mock_sections").select("*").eq("mock_test_id", t.id).order("order");
        if (secs) {
            for (const sec of secs) {
                const { data: qs } = await supabase.from("mock_questions").select("*").eq("section_id", sec.id).order("order");
                sections.push({
                    id: sec.id,
                    title: sec.title,
                    order: sec.order,
                    questions: (qs || []).map((q: { id: string; text: string; options: Record<string, string>; correct_answer: string; points: number; order: number; section_id?: string }) => ({ ...q, section_id: q.section_id })),
                });
            }
        }
        setEditing({
            id: t.id,
            title: t.title,
            description: t.description || "",
            type: t.type,
            price: t.price,
            durationMinutes: t.durationMinutes,
            sections,
        });
    };

    const save = async () => {
        if (!editing) return;
        setSaving(true);
        try {
            let testId = editing.id;
            if (!testId) {
                testId = crypto.randomUUID();
                await supabase.from("mock_tests").insert({ id: testId, ...editing });
            } else {
                await supabase.from("mock_tests").update(editing).eq("id", testId);
            }
            await supabase.from("mock_sections").delete().eq("mock_test_id", testId);
            await supabase.from("mock_questions").delete().in("section_id", editing.sections.map((s) => s.id || "x"));
            for (const sec of editing.sections) {
                const secId = sec.id || crypto.randomUUID();
                await supabase.from("mock_sections").insert({ id: secId, mock_test_id: testId, title: sec.title, order: sec.order });
                for (const q of sec.questions) {
                    await supabase.from("mock_questions").insert({ ...q, id: q.id || crypto.randomUUID(), section_id: secId });
                }
            }
            setEditing(null);
            load();
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: string) => {
        if (!confirm("Удалить этот Mock-тест?")) return;
        await supabase.from("mock_tests").delete().eq("id", id);
        load();
    };

    return (
        <div className="flex flex-col gap-10">
            <section className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Mock-тесты</h1>
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                        Управление шаблонами Mock-экзаменов.
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5 sm:col-span-2">
                            <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Название</label>
                            <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground" required />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                            <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Описание</label>
                            <textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground" rows={2} />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Тип</label>
                            <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as "free" | "paid" })} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground">
                                <option value="free">Бесплатный</option>
                                <option value="paid">Платный</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Цена (UZS)</label>
                            <input type="number" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black tracking-[0.18em] uppercase text-muted-foreground">Время (мин)</label>
                            <input type="number" value={editing.durationMinutes} onChange={(e) => setEditing({ ...editing, durationMinutes: Number(e.target.value) })} className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-foreground" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-foreground">Секции и вопросы</h3>
                            <button onClick={() => setEditing({ ...editing, sections: [...editing.sections, { title: `Раздел ${editing.sections.length + 1}`, order: editing.sections.length, questions: [emptyQuestion(crypto.randomUUID(), crypto.randomUUID())] }] })} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors"><Plus size={16} /> Секция</button>
                        </div>
                        {editing.sections.map((sec, secIdx) => (
                            <div key={sec.id || secIdx} className="rounded-2xl border border-border bg-muted/50 p-5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Секция {secIdx + 1}</span>
                                    <button onClick={() => setEditing({ ...editing, sections: editing.sections.filter((_, i) => i !== secIdx) })} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors"><Trash2 size={16} /></button>
                                </div>
                                <input value={sec.title} onChange={(e) => { const s = [...editing.sections]; s[secIdx] = { ...s[secIdx], title: e.target.value }; setEditing({ ...editing, sections: s }); }} placeholder="Название секции" className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-foreground text-sm" />
                                {sec.questions.map((q, qIdx) => (
                                    <div key={q.id || qIdx} className="rounded-xl border border-border bg-background p-4 space-y-2">
                                        <input value={q.text} onChange={(e) => { const qs = [...editing.sections[secIdx].questions]; qs[qIdx] = { ...qs[qIdx], text: e.target.value }; const s = [...editing.sections]; s[secIdx] = { ...s[secIdx], questions: qs }; setEditing({ ...editing, sections: s }); }} placeholder="Текст вопроса" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground text-sm" />
                                        <div className="grid grid-cols-2 gap-2">
                                            {["a", "b", "c", "d"].map((key) => (
                                                <input key={key} value={q.options[key] || ""} onChange={(e) => { const qs = [...editing.sections[secIdx].questions]; qs[qIdx] = { ...qs[qIdx], options: { ...qs[qIdx].options, [key]: e.target.value } }; const s = [...editing.sections]; s[secIdx] = { ...s[secIdx], questions: qs }; setEditing({ ...editing, sections: s }); }} placeholder={key.toUpperCase()} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground text-sm" />
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <select value={q.correct_answer} onChange={(e) => { const qs = [...editing.sections[secIdx].questions]; qs[qIdx] = { ...qs[qIdx], correct_answer: e.target.value }; const s = [...editing.sections]; s[secIdx] = { ...s[secIdx], questions: qs }; setEditing({ ...editing, sections: s }); }} className="rounded-lg border border-border bg-background px-3 py-2 text-foreground text-sm">
                                                <option value="a">A</option>
                                                <option value="b">B</option>
                                                <option value="c">C</option>
                                                <option value="d">D</option>
                                            </select>
                                            <input type="number" value={q.points} onChange={(e) => { const qs = [...editing.sections[secIdx].questions]; qs[qIdx] = { ...qs[qIdx], points: Number(e.target.value) }; const s = [...editing.sections]; s[secIdx] = { ...s[secIdx], questions: qs }; setEditing({ ...editing, sections: s }); }} placeholder="Баллы" className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-foreground text-sm" />
                                            <button onClick={() => { const qs = editing.sections[secIdx].questions.filter((_, i) => i !== qIdx); const s = [...editing.sections]; s[secIdx] = { ...s[secIdx], questions: qs }; setEditing({ ...editing, sections: s }); }} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors"><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                ))}
                                <button onClick={() => { const qs = [...editing.sections[secIdx].questions, emptyQuestion(crypto.randomUUID(), sec.id || crypto.randomUUID())]; const s = [...editing.sections]; s[secIdx] = { ...s[secIdx], questions: qs }; setEditing({ ...editing, sections: s }); }} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted transition-colors"><Plus size={14} /> Вопрос</button>
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
                        <p className="font-medium text-muted-foreground">Пока нет Mock-тестов.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {tests.map((t) => (
                            <div key={t.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-all hover:bg-muted/40 sm:flex-row sm:items-center">
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-foreground">{t.title}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{t.type === "paid" ? `Платный • ${t.price} UZS` : "Бесплатный"} • {t.durationMinutes} мин</p>
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
        </div>
    );
}
