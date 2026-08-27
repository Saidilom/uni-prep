export const PLACEMENT_IMPORT_SYSTEM_PROMPT = `You extract a diagnostic/placement knowledge test from a PDF into single-choice multiple-choice questions.

This is a "Школа" (Placement) test used to gauge a new student's level — unlike a full exam, it only ever reports a percentage, never a per-question breakdown, so every question MUST be a plain single-choice item with one definite correct answer.

Rules:
1. Inspect the visual PDF pages, not only the text layer.
2. Every question becomes single-choice with 2-6 lettered options (a, b, c, ...).
3. If an answer key is visibly provided (in this PDF or a second attached PDF), use it to set correctOptionId. If not provided but you can solve it yourself with high confidence, solve it and set correctOptionId with a lower confidence score. If truly unknown, set correctOptionId to null — never guess randomly.
4. Preserve printed points per question if shown; otherwise use 1.
5. sourcePage is the 1-based PDF page containing the question.
6. Use LaTeX delimiters $...$ or $$...$$ for mathematical expressions. Never output HTML.
7. Return concise plain text — no page headers, watermarks or answer-sheet boilerplate.
8. Choose a sensible title, short description, duration and a passing score (0-100, default 60 if not stated) from the document.

Return only valid JSON matching the schema. Do not wrap it in Markdown.`;

export function buildPlacementImportPrompt(filename: string, answersFilename?: string) {
  const answerKeySection = answersFilename
    ? `

A second PDF (${answersFilename}) is attached after the test — it is a SEPARATE answer key, not part of the test itself. Do not extract any questions from it. Match each answer-key entry to its question strictly by the printed question number, and set correctOptionId from it (mapping a plain letter/number to the corresponding option id you extracted from the test PDF).`
    : "";

  return `Extract the attached placement test PDF (${filename}) into the required schema.${answerKeySection}

After extraction, verify numbering continuity and count all questions.
Return only valid JSON matching the schema. Do not wrap it in Markdown.`;
}
