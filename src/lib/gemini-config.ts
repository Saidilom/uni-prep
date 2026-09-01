import { ThinkingLevel, type ThinkingConfig } from "@google/genai";

// The single biggest lever found while auditing why PDF import/essay-grading
// took 2-3 minutes: nothing in this codebase ever set thinkingConfig, so
// every call ran with the model's default (uncapped) extended-reasoning
// budget before it started emitting the actual structured JSON output — a
// modest 7MB/50-question exam still took ~264s (see the comment in
// mock-tests/import/route.ts). These are structured-extraction/grading
// tasks (read a document, fill in a known schema), not open-ended reasoning
// problems, so a capped thinking level is the right tradeoff: still some
// judgment for ambiguous cases (question-type classification, confidence
// scoring, essay rubric matching), but not an unbounded budget.
// Configurable via env so it can be tuned without a redeploy if LOW turns
// out too shallow (or too slow) for a particular model.
const LEVELS: Record<string, ThinkingLevel> = {
  MINIMAL: ThinkingLevel.MINIMAL,
  LOW: ThinkingLevel.LOW,
  MEDIUM: ThinkingLevel.MEDIUM,
  HIGH: ThinkingLevel.HIGH,
};

export function getGeminiThinkingConfig(): ThinkingConfig {
  const configured = (process.env.GEMINI_THINKING_LEVEL || "LOW").toUpperCase();
  return { thinkingLevel: LEVELS[configured] ?? ThinkingLevel.LOW };
}
