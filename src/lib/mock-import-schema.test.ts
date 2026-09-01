import { describe, expect, it } from "vitest";
import { getPublicationIssues, ImportedMock } from "./mock-import-schema";

const baseDraft: ImportedMock = {
  title: "Milliy sertifikat — matematika",
  description: "",
  subject: "math",
  detectedSubjectLabel: "Matematika",
  language: "uz",
  durationMinutes: 150,
  instructions: "",
  warnings: [],
  documentSummary: "",
  sections: [{
    title: "Test",
    kind: "general",
    instructions: "",
    order: 0,
    questions: [{
      number: "1",
      type: "single_choice",
      prompt: "2 + 2 = ?",
      options: [{ id: "a", text: "3" }, { id: "b", text: "4" }],
      correctOptionIds: ["b"],
      acceptedAnswers: [],
      answerOrigin: "inferred",
      points: 75,
      order: 0,
      groupKey: null,
      sharedStimulus: null,
      sourcePage: 1,
      sourceFileIndex: 0,
      needsSourceImage: false,
      requiresManualReview: false,
      confidence: 0.99,
      reviewNote: null,
      rubricNote: null,
    }],
  }],
};

describe("getPublicationIssues", () => {
  it("accepts a complete auto-graded question", () => {
    expect(getPublicationIssues(baseDraft)).toEqual([]);
  });

  it("blocks choice questions without an answer key", () => {
    const draft = structuredClone(baseDraft);
    draft.sections[0].questions[0].correctOptionIds = [];
    expect(getPublicationIssues(draft)).toContain("Задание 1: не указан правильный вариант");
  });

  it("blocks a draft whose points don't sum to 75", () => {
    const draft = structuredClone(baseDraft);
    draft.sections[0].questions[0].points = 10;
    expect(getPublicationIssues(draft)).toContain("Сумма баллов должна быть равна 75 (сейчас: 10)");
  });

  it("allows an essay without an automatic answer key", () => {
    const draft = structuredClone(baseDraft);
    draft.sections[0].questions[0] = {
      ...draft.sections[0].questions[0],
      type: "essay",
      options: [],
      correctOptionIds: [],
      answerOrigin: "missing",
      requiresManualReview: true,
    };
    expect(getPublicationIssues(draft)).toEqual([]);
  });
});
