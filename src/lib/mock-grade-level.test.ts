import { describe, expect, it } from "vitest";
import { gradeLevelDisplay, gradeLevelFromScore } from "./mock-grade-level";

describe("gradeLevelFromScore", () => {
  it("returns A+ at the top boundary", () => {
    expect(gradeLevelFromScore(70)).toBe("A+");
    expect(gradeLevelFromScore(80)).toBe("A+");
  });

  it("returns each band at its own lower boundary", () => {
    expect(gradeLevelFromScore(65)).toBe("A");
    expect(gradeLevelFromScore(60)).toBe("B+");
    expect(gradeLevelFromScore(55)).toBe("B");
    expect(gradeLevelFromScore(50)).toBe("C+");
    expect(gradeLevelFromScore(46)).toBe("C");
  });

  it("returns below_c just under the C boundary", () => {
    expect(gradeLevelFromScore(45.4)).toBe("below_c");
    expect(gradeLevelFromScore(0)).toBe("below_c");
  });

  // Решение владельца: «если ближе к 65 баллам, то уровень тот, что получает
  // 65». Балл при этом остаётся дробным, а порог сравнивается с ближайшим
  // целым T. Тест — страховка от того, что округление внутри функции уберут
  // «за ненадобностью»: без него ученик с T = 64,79 потерял бы A и получил B+,
  // уже увидев свой результат.
  it("сравнивает порог с ближайшим целым, а не с точным T", () => {
    expect(gradeLevelFromScore(64.79)).toBe("A");   // 64.79 → 65
    expect(gradeLevelFromScore(64.5)).toBe("A");    // ровно половина — вверх
    expect(gradeLevelFromScore(64.4)).toBe("B+");   // 64.4 → 64
    expect(gradeLevelFromScore(45.5)).toBe("C");    // 45.5 → 46
  });

  it("буква не зависит от того, дробный балл или целый", () => {
    // Ниже 0.5 от порога буква та же, что у целого — иначе десятичная часть
    // молча переехала бы порогами.
    expect(gradeLevelFromScore(70.4)).toBe(gradeLevelFromScore(70));
    expect(gradeLevelFromScore(69.6)).toBe(gradeLevelFromScore(70));
  });
});

describe("gradeLevelDisplay", () => {
  it("shows letter badges as-is regardless of locale", () => {
    expect(gradeLevelDisplay("A+", "ru")).toBe("A+");
    expect(gradeLevelDisplay("B", "uz")).toBe("B");
  });

  it("localizes below_c", () => {
    expect(gradeLevelDisplay("below_c", "ru")).toBe("Ниже C");
    expect(gradeLevelDisplay("below_c", "uz")).toBe("C dan quyi");
  });
});
