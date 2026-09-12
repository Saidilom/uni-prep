import { CERTIFICATE_MAX } from "./certificate-scale";
import type { GradeLevel } from "./mock-grade-level";

// Типы и константы витрины.
//
// ═══ ПОЧЕМУ ОТДЕЛЬНО ОТ ЗАПРОСА ═══
//
// Эти значения нужны КЛИЕНТСКИМ компонентам лендинга, а сам запрос — серверу.
// Пока они лежали в одном файле, импорт константы тянул в браузерный бандл
// supabase/server.ts, а тот — next/headers, и сборка падала целиком.

/** Сколько лучших результатов показывать в блоке «Результаты». */
export const TOP_RESULTS = 8;

/** Общая шкала, к которой приведены баллы в topResults. Для подписи «из 75». */
export const LANDING_SCORE_MAX = CERTIFICATE_MAX;

export type LandingTopResult = {
    /** Балл, приведённый к общей шкале — у тестов она разная (миграция 112). */
    score: number;
    level: GradeLevel;
    subjectId: string | null;
};

export type LandingStats = {
    students: number;
    attempts: number;
    questions: number;
    branches: number;
    /** Лучшие опубликованные работы, БЕЗ имён — решение владельца. */
    topResults: LandingTopResult[];
};
