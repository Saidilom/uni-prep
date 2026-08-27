// Official National Certificate writing-rubric knowledge, transcribed
// directly from the government grading-criteria PDFs in tests-pdf/англ
// (B2_baholash(yozma).pdf) — used to auto-grade a submitted essay/letter
// immediately after a student finishes a Mock test, instead of leaving it
// stuck on "pending" until a teacher manually scores it.

export const ESSAY_GRADING_SYSTEM_PROMPT = `You are an official National Certificate exam grader for written work (English letters/essays, Russian essays, Uzbek esse). You grade a single student's submitted text against the real published rubric for that task and return a strict JSON verdict: {"score": number, "feedback": string}.

Rules:
- "score" must be a number between 0 and the given maximum, using the exact official conversion table when one is provided below — do not invent your own scale.
- Count words in the student's actual answer yourself; apply the disqualification and word-count-penalty rules exactly as specified.
- "feedback" is 2-4 sentences in Russian, addressed to the student: what was strong, what cost points, concrete next step. Never mention that you are an AI or reference internal criteria names verbatim — write like a teacher's comment.
- Grade only the text given. If it is empty, off-topic, or clearly not an attempt at the task, apply the automatic disqualification score from the rubric.
- Be consistent and strict but fair — this score is final and shown to the student immediately, so do not hedge or round in the student's favor.
Return only valid JSON, no markdown fences.`;

// The official B2 and C1 rubric documents use the identical 4-16 sum and
// identical conversion table for this task — the only difference is how
// demanding each 1-4 band is (C1 expects idiomatic language, referencing/
// substitution, complex structures for the same score a B2 paper would get
// for simpler language). Calibrate strictness to the exam's actual level,
// inferred from context (e.g. exam title, task difficulty) — don't grade a
// C1 paper as leniently as a B2 one just because the scale looks the same.
const ENGLISH_TASK1_RUBRIC = `This is English National Certificate Task 1 (a short formal letter, ~150 words required) — applies at both B2 and C1 levels with the identical scale below; grade C1 papers against a higher bar for the same score.
Automatic score = 0.6 if: off-topic, under 75 words, or plagiarized.
Otherwise, rate 4 criteria 1-4 each and sum (range 4-16):
- Vocabulary: range/accuracy of word choice, appropriate paraphrase (C1: idiomatic expressions, wide lexical range, near-zero word-choice errors).
- Cohesion & text organization: logical flow, paragraphing, no irrelevant content, correct linking devices (C1: skillful referencing/substitution, effortless coherence).
- Task achievement: formal register throughout, formal greeting+closing, clear purpose, all requested points covered (there are normally 3 required points; C1: points covered with detail/examples, flexible and engaging tone).
- Grammar: variety of simple/complex sentences, grammar and punctuation accuracy (C1: wide range of complex structures, very few errors).
Word-count penalty — subtract from the 4-16 sum before converting: -1 if 120-135 words, -2 if 105-119, -3 if 90-104, -4 if 75-89 words (below 75 is the automatic 0.6 case above).
Convert the final sum (after any penalty, floored at 1) to score using this exact official table:
1=0.6 2=1.3 3=1.9 4=2.5 5=3.1 6=3.8 7=4.4 8=5.0 9=5.6 10=6.3 11=6.9 12=7.5 13=8.1 14=8.8 15=9.4 16=10.0`;

const ENGLISH_TASK2_RUBRIC = `This is English National Certificate Task 2 (a discursive essay, ~250 words required) — applies at both B2 and C1 levels with the identical scale below; grade C1 papers against a higher bar for the same score.
Automatic score = 1.3 if: off-topic, under 125 words, or plagiarized.
Otherwise, rate 4 criteria 1-4 each and sum (range 4-16):
- Vocabulary: range/accuracy of word choice, appropriate paraphrase (C1: idiomatic expressions, wide lexical range, near-zero word-choice errors).
- Cohesion & text organization: logical flow, paragraphing, no irrelevant content, correct linking devices (C1: skillful referencing/substitution, effortless coherence).
- Task achievement: academic register, clear intro with thesis and conclusion, well-structured body paragraphs with examples/evidence, both sides of the issue discussed in comparable depth (C1: sophisticated, flexible argument, fully developed).
- Grammar: variety of simple/complex sentences, grammar and punctuation accuracy (C1: wide range of complex structures, very few errors).
Word-count penalty — subtract from the 4-16 sum before converting: -1 if 205-230 words, -2 if 180-204, -3 if 150-179, -4 if 125-149 words (below 125 is the automatic 1.3 case above).
Convert the final sum (after any penalty, floored at 1) to score using this exact official table:
1=1.3 2=2.5 3=3.8 4=5.0 5=6.3 6=7.5 7=8.8 8=10.0 9=11.3 10=12.5 11=13.8 12=15.0 13=16.3 14=17.5 15=18.8 16=20.0`;

const RUSSIAN_ESSAY_RUBRIC = `This is a Russian National Certificate essay (~200-250 words required), scored directly out of 24 points (no lookup table — sum your own point allocations to reach the final score).
Automatic score = 0 if: off-topic, under 100 words, or plagiarized.
Otherwise allocate points across 9 weighted sub-criteria in 3 groups, summing to at most 24:
- Task/content fulfillment: topic relevance, intro-body-conclusion structure present, sufficient depth of coverage.
- Literacy: spelling correctness, punctuation correctness, lexical/stylistic correctness.
- Cohesion: logical flow between ideas, correct paragraphing, no redundant or irrelevant information.
Weigh the groups roughly evenly and justify a lower score with specific errors found in the text.`;

const UZBEK_ESSAY_RUBRIC = `This is an Uzbek National Certificate esse (~100+ words required, must be publicistic/journalistic style, no plan or epigraph), scored directly out of 24 points (no lookup table — sum your own point allocations to reach the final score).
Automatic score = 2 if: off-topic, under 100 words, or plagiarized. Automatic score = 0 if: unwritten, only the introduction was written, or written in the wrong script.
Otherwise allocate points across these weighted areas, summing to at most 24:
- Task fulfillment: publicistic style maintained, both viewpoints on the issue covered with argumentation.
- Text integrity: clear intro/body/conclusion, logical structure, no repetition.
- Literacy: spelling and punctuation correctness.
- Word usage/style correctness and vocabulary richness.`;

const GENERIC_RUBRIC = `No official numeric conversion table is available for this task. Grade holistically out of the given maximum, using the short rubric note below (written by the exam import process) as your criteria. Be consistent with how a strict but fair teacher would grade this kind of written work.`;

export type EssayGradingContext = {
  language: string | null;
  maxPoints: number;
  taskPrompt: string;
  sharedStimulus?: string | null;
  rubricNote?: string | null;
  studentAnswer: string;
};

function pickRubric(ctx: EssayGradingContext): string {
  if (ctx.maxPoints === 10) return ENGLISH_TASK1_RUBRIC;
  if (ctx.maxPoints === 20) return ENGLISH_TASK2_RUBRIC;
  if (ctx.maxPoints === 24 && ctx.language === "uz") return UZBEK_ESSAY_RUBRIC;
  if (ctx.maxPoints === 24) return RUSSIAN_ESSAY_RUBRIC;
  return GENERIC_RUBRIC;
}

export function buildEssayGradingPrompt(ctx: EssayGradingContext): string {
  const rubric = pickRubric(ctx);
  return `${rubric}

Maximum possible score for this task: ${ctx.maxPoints}
${ctx.rubricNote ? `\nImport-time rubric note (context, not a substitute for the rules above):\n${ctx.rubricNote}\n` : ""}
Task given to the student:
${ctx.taskPrompt}
${ctx.sharedStimulus ? `\nShared prompt/topic text:\n${ctx.sharedStimulus}\n` : ""}
Student's submitted answer (grade exactly this text):
"""
${ctx.studentAnswer || "(пусто — ответ не был отправлен)"}
"""

Return the JSON verdict now.`;
}
