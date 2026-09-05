// Приведение сохранённых ответов к читаемому виду.
//
// В mock_answer_details.correct_answer лежит не буква, а JSON ключа проверки:
//
//   {"values": ["a"], "accepted": []}                  — выбор варианта
//   {"values": [], "accepted": ["mensirar"]}           — короткий ответ
//   {"values": [], "accepted": ["nomard", "nomard kimsalar"]}  — несколько форм
//   {"values": [], "accepted": []}                     — эссе, ключа нет
//
// На экране проверки это выводилось как есть, и учитель видел
// «Правильный: {"values": ["a"], "accepted": []}» вместо «a».
//
// `values` и `accepted` различаются по смыслу: первое — выбранные варианты
// (порядок значим, показываем через запятую), второе — равноправные формы
// одного ответа (показываем через «/», чтобы читалось как «или»).

type AnswerKey = { values?: unknown; accepted?: unknown };

const asStrings = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((v) => String(v)).filter((v) => v.trim() !== "") : [];

// Ответ не дан. В базе это либо SQL NULL, либо строка "null" — вторая приходит
// оттуда, где значение сериализовали до записи, и на экране читалась как
// настоящий ответ ученика «null».
const isBlank = (raw: string | null | undefined): boolean =>
    raw === null || raw === undefined || raw.trim() === "" || raw.trim() === "null" || raw.trim() === "undefined";

export function formatCorrectAnswer(raw: string | null | undefined): string {
    if (isBlank(raw)) return "";
    const text = String(raw).trim();
    if (!text.startsWith("{") && !text.startsWith("[")) return text;

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        // Не JSON — значит уже готовая строка. Старые тесты хранили ключ так.
        return text;
    }

    if (Array.isArray(parsed)) return asStrings(parsed).join(", ");
    if (parsed === null || typeof parsed !== "object") return text;

    const key = parsed as AnswerKey;
    const values = asStrings(key.values);
    if (values.length > 0) return values.join(", ");
    const accepted = asStrings(key.accepted);
    if (accepted.length > 0) return accepted.join(" / ");
    // Оба пустые — это эссе: правильного ответа не существует, его оценивают
    // по критерию. Пустая строка, а не «{}», чтобы экран показал прочерк.
    return "";
}

export function formatStudentAnswer(raw: string | null | undefined): string {
    if (isBlank(raw)) return "";
    const text = String(raw).trim();
    if (!text.startsWith("{") && !text.startsWith("[")) return text;

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return text;
    }

    if (Array.isArray(parsed)) return asStrings(parsed).join(", ");
    if (parsed === null || typeof parsed !== "object") return text;

    // Вопрос на соответствие: ученик присылает пары «пункт → вариант».
    const pairs = Object.entries(parsed as Record<string, unknown>)
        .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
        .map(([k, v]) => `${k} → ${String(v)}`);
    return pairs.join(", ");
}
