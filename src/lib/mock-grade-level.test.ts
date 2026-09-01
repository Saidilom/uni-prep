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
    expect(gradeLevelFromScore(45.9)).toBe("below_c");
    expect(gradeLevelFromScore(0)).toBe("below_c");
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
