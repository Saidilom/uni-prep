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
      points: 1,
      order: 0,
      groupKey: null,
      sharedStimulus: null,
      sourcePage: 1,
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
