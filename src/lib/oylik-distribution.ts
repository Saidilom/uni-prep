// Кому достанется месячный тест — то же правило, что у раздачи в базе.
//
// Комплект «Ойлик» раздаёт publish_oylik_set (миграция 073): каждый тест уходит
// тем группам, чей предмет совпадает с предметом теста. Считает функция, а
// узнать результат до сих пор можно было только из исчезающего уведомления
// ПОСЛЕ публикации — и «Опубликовано» читалось как «дошло до всех». На проде
// это выстрелило буквально: тест по истории опубликовали, а получили его ноль
// групп, потому что у исторической группы не был проставлен предмет.
//
// Отсюда этот модуль: посчитать то же самое ЗАРАНЕЕ и показать в интерфейсе.
//
// Правило перенесено из SQL дословно:
//
//   c.subject_id = mt.subject_id
//   OR (c.subject_id = 'native' AND mt.subject_id IN ('native','russian','uzbek'))
//
// Расхождение между этой копией и оригиналом означало бы, что интерфейс обещает
// одно, а раздача делает другое, — поэтому список родного языка берётся из той
// же NATIVE_LANGUAGE_SUBJECT_IDS, а не переписывается заново, и на правило
// стоит юнит-тест (oylik-distribution.test.ts).

import { NATIVE_LANGUAGE_SUBJECT_IDS } from "./mock-import-schema";

export function oylikSubjectMatches(
    testSubjectId: string | null | undefined,
    classSubjectId: string | null | undefined,
): boolean {
    // Обе стороны обязаны быть заданы: в SQL стоит `IS NOT NULL` на обеих, и
    // группа без предмета не получает ничего.
    if (!testSubjectId || !classSubjectId) return false;
    if (classSubjectId === testSubjectId) return true;
    // Группы заводятся с общим «родным языком», а тесты импортируются с
    // конкретным — 'uzbek' или 'russian'. Ветка несимметрична намеренно,
    // ровно как в SQL: она про группу 'native', а не наоборот.
    return classSubjectId === "native"
        && (NATIVE_LANGUAGE_SUBJECT_IDS as readonly string[]).includes(testSubjectId);
}

export type DistributionClass = { id: string; subjectId: string | null };

export type OylikDistribution = {
    /** Сколько групп получит каждый тест — по id теста. */
    matchingClassesByTest: Map<string, number>;
    /** Группы без предмета: они не получат ни одного теста ни из какого комплекта. */
    classesWithoutSubject: number;
};

export function summarizeOylikDistribution(
    tests: Array<{ id: string; subjectId: string | null }>,
    classes: DistributionClass[],
): OylikDistribution {
    const matchingClassesByTest = new Map<string, number>();
    for (const test of tests) {
        matchingClassesByTest.set(
            test.id,
            classes.filter((cls) => oylikSubjectMatches(test.subjectId, cls.subjectId)).length,
        );
    }
    return {
        matchingClassesByTest,
        classesWithoutSubject: classes.filter((cls) => !cls.subjectId).length,
    };
}
