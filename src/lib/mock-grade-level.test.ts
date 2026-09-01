import { describe, it, expect } from "vitest";
import { gradeLevelFromScore } from "./mock-grade-level";

describe("gradeLevelFromScore", () => {
    it("returns A+ at and above 70", () => {
        expect(gradeLevelFromScore(70)).toBe("A+");
        expect(gradeLevelFromScore(75)).toBe("A+");
    });

    it("returns A from 65 to 69.9", () => {
        expect(gradeLevelFromScore(65)).toBe("A");
        expect(gradeLevelFromScore(69.9)).toBe("A");
    });

    it("returns B+ from 60 to 64.9", () => {
        expect(gradeLevelFromScore(60)).toBe("B+");
        expect(gradeLevelFromScore(64.9)).toBe("B+");
    });

    it("returns B from 55 to 59.9", () => {
        expect(gradeLevelFromScore(55)).toBe("B");
        expect(gradeLevelFromScore(59.9)).toBe("B");
    });

    it("returns C+ from 50 to 54.9", () => {
        expect(gradeLevelFromScore(50)).toBe("C+");
        expect(gradeLevelFromScore(54.9)).toBe("C+");
    });

    it("returns C from 46 to 49.9", () => {
        expect(gradeLevelFromScore(46)).toBe("C");
        expect(gradeLevelFromScore(49.9)).toBe("C");
    });

    it("returns null (no certificate) below 46", () => {
        expect(gradeLevelFromScore(45.9)).toBeNull();
        expect(gradeLevelFromScore(0)).toBeNull();
    });
});
