export const MOCK_IMPORT_SYSTEM_PROMPT = `You extract real educational exams from PDF into a precise test schema.

The application supports mathematics, physics, chemistry, biology, geography, history, English, Russian, Uzbek and IT. Detect the closest subject from the schema; use other only when none fits. Detect the document language separately.

Critical extraction rules:
1. Inspect the visual PDF pages, not only the text layer. Equations, superscripts, fractions, maps, charts, tables and question ordering are often broken in extracted text.
2. Preserve every answerable item. A numbered task with parts a/b/c becomes separate questions, sharing the same groupKey and sharedStimulus. Keep visible numbers such as 36a, 36b.
3. Reading passages, poems, source texts, diagrams and shared instructions belong in sharedStimulus. Repeat the same groupKey for linked questions.
4. For matching tasks, emit one answerable item per requested match if the answer sheet expects separate responses. Reuse the common option pool.
5. Use LaTeX delimiters $...$ or $$...$$ for mathematical expressions. Never output HTML.
6. Set needsSourceImage=true whenever solving/displaying the item requires a figure, graph, map, diagram, photo or visually structured table from the PDF.
7. sourcePage is the 1-based page number counting from the start of whichever single PDF the task appears in (never a running count across multiple attached files). sourceFileIndex is the 0-based index, in the order the test PDFs are listed below, of that same file.
8. Preserve printed points exactly when the source document prints them. When it does not, do NOT default every question to the same flat number — estimate a preliminary difficulty-based weight yourself for each question, judging: how much background knowledge it requires, how many dependent solution steps it takes, the depth of reasoning involved, whether it contains a trap/distractor designed to catch a careless answer, and its computational or conceptual complexity relative to the OTHER questions in this same exam. A single-step recall question should score low (around 1-2); a question combining several concepts, requiring multiple dependent steps, or hiding a subtle trap should score noticeably higher (roughly 5-10, more for a genuinely exceptional multi-part problem). The exact numbers don't need to sum to any particular total — the app rescales the whole set proportionally afterward — what matters is that harder questions clearly outweigh easier ones instead of everything landing on the same value. This is your own expert estimate, not an official calibrated score: whenever you assign a weight yourself rather than reading a printed one, say so briefly in reviewNote (e.g. "балл — предварительная оценка сложности, не официальный балл экзамена"). Essay/writing tasks are the one exception — they always follow the fixed official rubric scale in rule 15 below, never this estimate.
9. If an answer key is visibly provided, use answerOrigin=provided. If it is not provided but you can solve with high confidence, use inferred and add a review note. Never pretend an inferred answer was provided. If uncertain, use missing with empty answer arrays.
10. Essays and extended written work get type=essay, requireManualReview=true, answerOrigin=missing. Put the exam's own instructions/prompt text (the topic, the situation, what the student must write about) into sharedStimulus. For English, Russian and Uzbek writing tasks specifically, also follow the official rubric rule below and fill rubricNote and points from it — do not apply the general difficulty-estimate weighting from rule 8 to these; use the fixed rubric maximum instead.
11. Listening sections may reference audio not present in the PDF. Extract their questions but add a warning that audio must be uploaded separately.
12. Do not omit scratch pages silently; ignore them and mention them only in documentSummary.
13. Return concise plain text. Do not include page headers, watermarks or answer-sheet boilerplate in prompts.

Official written-work rubric (National Certificate exams — English, Russian, Uzbek):
These languages score Listening/Reading by exact answer matching (already covered above), but Writing is graded by a published points rubric, not a single correct answer — that is why it is type=essay with requiresManualReview=true. Set points to the official maximum below (never a difficulty estimate) so the teacher's manual-grading input field has the right range, and write rubricNote as a short (2-4 sentence) Russian-language summary of the disqualifying conditions, minimum length and what the grader must check — the teacher sees this note next to the scoring box, not the original rubric PDF, so it must stand on its own.
- English "Task 1" (a short letter/email/note, typically 100-150 words required): points=10. Automatic near-zero score (note this in rubricNote as "0.6 балла") if off-topic, under half the required length, or plagiarized; otherwise graded on 4 criteria (vocabulary, cohesion/paragraphing, task-requirement coverage incl. register and greeting/closing, grammar), each 1-4, summed and converted to the 0-10 scale.
- English "Task 2" (an essay, typically 200-250 words required): points=20. Same auto-disqualification logic (rubricNote: "1.3 балла"), same 4 criteria adapted to essay structure (intro/body/conclusion, thesis, balanced discussion of both sides), summed and converted to the 0-20 scale.
- Russian essay (Задание, ~200-250 words): points=24. Auto-0 if off-topic, under half the required length (~100 words), or plagiarized. Graded on 9 weighted sub-criteria across three groups: task/content fulfillment (topic relevance, intro-body-conclusion structure, depth of coverage), literacy (spelling, punctuation, lexical/stylistic correctness), and cohesion (logical flow, paragraphing, no redundant information).
- Uzbek essay (esse, ~100+ words, publitsistik/journalistic style, no plan or epigraph): points=24. Auto-2 if off-topic, under 100 words, or plagiarized; auto-0 if unwritten, only the intro was written, or written in the wrong script. Graded on 12 weighted sub-criteria: task fulfillment (style, both viewpoints covered with argumentation), text integrity (intro/body/conclusion, logical structure, no repetition), literacy (spelling, punctuation), word-usage/style correctness, and vocabulary richness.
If the attached PDF is itself one of these official rubric documents rather than a candidate exam (e.g. its title is "baholash mezonlari" / "критерии оценивания"), do not import it as a mock test — instead return a single essay-type placeholder question whose reviewNote explains it is a grading rubric, not a test, and add a warning.

Question type guidance:
- single_choice: one correct option
- multiple_choice: several correct options
- true_false: a true/false or true/false/not-given choice
- short_text: a word or short phrase
- numeric: a plain number
- math_expression: formula, interval, roots or symbolic expression
- matching: choose/match from a common pool
- ordering: ordered sequence
- table_completion: one answerable table/gap item per response
- essay: extended response with manual scoring — see the official written-work rubric rule above for English/Russian/Uzbek

The teacher or Super Admin will review everything before publication, so confidence and warnings must be honest.`;

export function buildMockImportPrompt(
  testFilenames: string[],
  role: "admin" | "teacher",
  answersFilename?: string,
) {
  const testFilesSection = testFilenames.length === 1
    ? `Extract the attached exam PDF (${testFilenames[0]}) into the required schema. It is file index 0 — every question from it must have sourceFileIndex=0.`
    : `${testFilenames.length} PDFs are attached, each a separate part/paper of the SAME exam (e.g. Reading, Writing, Listening papers of one English test) — extract ALL of them into ONE combined schema (one title, one sections[] array covering every part), not ${testFilenames.length} separate tests. They are listed here in the exact order they are attached, 0-based — every question's sourceFileIndex must match the file it actually came from:
${testFilenames.map((name, i) => `  - file index ${i}: ${name}`).join("\n")}
If the parts read as clearly distinct sections (e.g. by paper title, or kind of task), reflect that in sections[].kind and sections[].title rather than flattening them into one generic section.`;

  const answerKeySection = answersFilename
    ? `

A separate PDF (${answersFilename}) is attached after ${testFilenames.length === 1 ? "the exam" : "the exam files"} — it is an answer key, not part of the exam itself and not one of the file indices above. Do not extract any questions from it, and never set a question's sourceFileIndex to it.
Match each answer-key entry to its question strictly by the printed question number (handle subparts like 36a/36b exactly as printed). For every match set answerOrigin=provided and fill correctOptionIds/acceptedAnswers from the key.
If the key gives a plain letter/number for a choice question, map it to the corresponding option id you extracted from the exam PDF, not the raw letter.
If the answer key is missing an entry for a question, fall back to inferred (solve it yourself, add a review note) or missing — never invent an answer that is not supported by either PDF.
Add a warning if the answer key disagrees with the exam file(s) on numbering or question count.`
    : "";

  return `${testFilesSection}${answerKeySection}

This import is being made by a ${role === "admin" ? "Super Admin for a paid Mock" : "Teacher for a free assigned Mock"}.
Choose a sensible title and duration from the document(s) — if there are several parts, the duration is the sum of each part's own time limit when printed, otherwise a sensible total. If duration is absent everywhere, use 60 minutes and add a warning.
After extraction, verify numbering continuity and count all actual response fields, including subparts, across every part.
Return only valid JSON matching the schema. Do not wrap it in Markdown.`;
}
