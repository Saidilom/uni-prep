// Фильтр и порядок групп по предмету.
//
// ═══ ЗАЧЕМ МОДУЛЬ, А НЕ ДВЕ СТРОКИ В КОМПОНЕНТЕ ═══
//
// Одинаково нужен и супер-админу, и админу филиала, а внутри две вещи, которые
// легко сделать по-разному в двух местах и потом не заметить расхождения:
//
//   * 'russian' и 'uzbek' — тот же «родной язык», что 'native'
//     (NATIVE_LANGUAGE_SUBJECT_IDS). Группа с subject_id = 'uzbek' должна
//     попадать под фильтр «Родной язык», а не висеть отдельной вкладкой;
//   * порядок предметов — как в CORE_SUBJECTS, а не по алфавиту: математика
//     первой, потому что так их и перечисляют, а «Биология» перед
//     «Математикой» читается как случайность.
//
// Группы без предмета собираются в свою вкладку. Прятать их нельзя: у групп
// без предмета не работает раздача «Ойлик»-тестов, и увидеть их надо.

import { CORE_SUBJECTS, CoreSubject, coreSubjectMatches } from "./mock-import-schema";

/** Метка «все предметы». Не uuid и не subject_id, поэтому не столкнётся. */
export const SUBJECT_ALL = "__all__";
/** Метка «без предмета». */
export const SUBJECT_NONE = "__none__";

export type SubjectFilterValue = typeof SUBJECT_ALL | typeof SUBJECT_NONE | CoreSubject | string;

/** Минимум, который нужен от группы. */
export type SubjectBearing = { subjectId: string | null };

/**
 * К какому предмету относится группа.
 *
 * null — предмет не задан или не входит в CORE_SUBJECTS. Второй случай не
 * выдумка: у уже созданных тестов встречаются 'geography' и 'it'.
 */
export function classSubject(subjectId: string | null): CoreSubject | null {
    if (!subjectId) return null;
    return CORE_SUBJECTS.find((core) => coreSubjectMatches(subjectId, core)) ?? null;
}

export type SubjectTab = { value: CoreSubject | typeof SUBJECT_NONE; count: number };

/**
 * Вкладки предметов, у которых есть хотя бы одна группа.
 *
 * Пустые не показываются: вкладка со счётчиком «0» ничего не сообщает, а
 * нажатие на неё выглядит как поломка.
 */
export function subjectTabs(classes: readonly SubjectBearing[]): SubjectTab[] {
    const counts = new Map<CoreSubject | typeof SUBJECT_NONE, number>();
    for (const item of classes) {
        const key = classSubject(item.subjectId) ?? SUBJECT_NONE;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // Порядок берётся из CORE_SUBJECTS, «без предмета» — всегда последним.
    const tabs: SubjectTab[] = CORE_SUBJECTS
        .filter((core) => (counts.get(core) ?? 0) > 0)
        .map((core) => ({ value: core, count: counts.get(core)! }));
    const none = counts.get(SUBJECT_NONE) ?? 0;
    if (none > 0) tabs.push({ value: SUBJECT_NONE, count: none });
    return tabs;
}

/** Отбор по выбранной вкладке. */
export function filterBySubject<T extends SubjectBearing>(
    classes: readonly T[],
    value: SubjectFilterValue,
): T[] {
    if (value === SUBJECT_ALL) return [...classes];
    if (value === SUBJECT_NONE) return classes.filter((c) => classSubject(c.subjectId) === null);
    return classes.filter((c) => classSubject(c.subjectId) === value);
}

/**
 * Порядок: сначала по предмету (как в CORE_SUBJECTS), внутри — как пришло.
 *
 * Нужен, когда выбраны «все предметы»: иначе группы одного предмета
 * разбросаны по списку, и именно на это жаловались — «там все группы
 * смешаны». Сортировка стабильная, поэтому внутри предмета порядок
 * сохраняется тем, который задал загрузчик.
 */
export function sortBySubject<T extends SubjectBearing>(classes: readonly T[]): T[] {
    const rank = (item: T) => {
        const core = classSubject(item.subjectId);
        // Без предмета — в конец, а не в начало: это остаток, а не первый по
        // важности предмет.
        return core === null ? CORE_SUBJECTS.length : CORE_SUBJECTS.indexOf(core);
    };
    return classes
        .map((item, index) => ({ item, index }))
        .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
        .map((x) => x.item);
}
