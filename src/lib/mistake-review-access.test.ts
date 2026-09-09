import { describe, it, expect } from "vitest";
import { mistakeReviewAccess, canReviewMistakes, MockReviewSubject } from "./mistake-review-access";

const mock = (p: Partial<MockReviewSubject> = {}): MockReviewSubject => ({
    type: "free", isOylik: false, assignedByTeacher: false, ...p,
});

describe("что разрешено", () => {
    it("бесплатный мок — да", () => {
        expect(canReviewMistakes(mock({ type: "free" }))).toBe(true);
    });

    it("мок, назначенный учителем классу — да", () => {
        expect(canReviewMistakes(mock({ type: "class_only", assignedByTeacher: true }))).toBe(true);
    });

    it("платный, но назначенный учителем — да", () => {
        // Учитель дал его группе, значит разбирать ошибки уместно.
        expect(canReviewMistakes(mock({ type: "paid", assignedByTeacher: true }))).toBe(true);
    });
});

describe("что запрещено", () => {
    it("платный, купленный самим учеником — нет", () => {
        expect(mistakeReviewAccess(mock({ type: "paid" })))
            .toEqual({ allowed: false, reason: "PAID_SELF_PURCHASED" });
    });

    it("class_only без назначения — нет", () => {
        expect(mistakeReviewAccess(mock({ type: "class_only" })))
            .toEqual({ allowed: false, reason: "UNKNOWN_TYPE" });
    });

    it("тип неизвестен — нет, а не «разрешить на всякий случай»", () => {
        expect(mistakeReviewAccess(mock({ type: null })))
            .toEqual({ allowed: false, reason: "UNKNOWN_TYPE" });
    });
});

describe("«Ойлик» отсекается ПЕРВЫМ", () => {
    // Главная ловушка модуля. Месячные тесты — это class_only, и они назначены
    // классам: на проде из трёх class_only-тестов два из комплекта «Ойлик».
    // Проверь «назначен учителем» раньше — и они пройдут как разрешённые.
    it("месячный тест, назначенный классу, всё равно запрещён", () => {
        expect(mistakeReviewAccess(mock({ type: "class_only", isOylik: true, assignedByTeacher: true })))
            .toEqual({ allowed: false, reason: "OYLIK" });
    });

    it("месячный тест не спасает даже тип free", () => {
        expect(mistakeReviewAccess(mock({ type: "free", isOylik: true })))
            .toEqual({ allowed: false, reason: "OYLIK" });
    });

    it("причина отказа именно OYLIK, а не общий запрет", () => {
        // По причине видно, что это решение про месячные тесты, а не побочный
        // эффект неизвестного типа.
        const denial = mistakeReviewAccess(mock({ type: "class_only", isOylik: true, assignedByTeacher: true }));
        expect(denial.allowed).toBe(false);
        if (!denial.allowed) expect(denial.reason).toBe("OYLIK");
    });
});

describe("реальный расклад прода", () => {
    it("4 бесплатных теста открыты, 2 месячных закрыты", () => {
        const prod: MockReviewSubject[] = [
            ...Array.from({ length: 4 }, () => mock({ type: "free" })),
            mock({ type: "class_only", isOylik: true, assignedByTeacher: true }),
            mock({ type: "class_only", isOylik: true, assignedByTeacher: true }),
            mock({ type: "class_only", assignedByTeacher: true }),
        ];
        expect(prod.filter(canReviewMistakes)).toHaveLength(5);
    });
});
