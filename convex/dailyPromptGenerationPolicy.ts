import { DAILY_PROMPT_SEEDS, normalizeDailyPromptText } from "./dailyPromptLibrary";

export const DAILY_PROMPT_GENERATION_PROMPT_VERSION = "daily-prompt-generation-v1";
export const MAX_DAILY_PROMPT_CANDIDATES = 5;
export const MAX_DUPLICATE_CONTEXT = 12;
const MAX_TEXT_UTF8_BYTES = 240;

export const DAILY_PROMPT_PRINCIPLES = [
  "appreciation",
  "love maps",
  "bids for connection",
  "repair",
  "stress reducing conversation",
  "shared meaning",
] as const;

export const DAILY_PROMPT_CATEGORIES = [
  "appreciation",
  "curiosity",
  "connection",
  "repair",
  "support",
  "rituals",
] as const;

export type DailyPromptGenerationCandidate = {
  text: string;
  principle: (typeof DAILY_PROMPT_PRINCIPLES)[number];
  category: (typeof DAILY_PROMPT_CATEGORIES)[number];
  normalizedFingerprint: string;
};

export type DailyPromptCandidateRejectionCode =
  | "invalid_shape"
  | "invalid_text"
  | "invalid_format"
  | "invalid_metadata"
  | "unsafe_content";

const GENERATION_SYSTEM_POLICY = `Generate warm, concise daily questions for couples.
The guidance is inspired by evidence-based relationship principles but is not affiliated with Gottman or any other clinical or commercial program.
Return exactly one answerable, non-leading question per candidate as structured fields: text, principle, and category.
Encourage appreciation, curiosity, connection, repair, support, or shared meaning.
Do not diagnose, provide treatment or therapy, mediate abuse, counsel crises, manipulate, blame, shame, threaten, coerce, request secrets, or ask for highly sensitive records.
Do not assume gender, marriage, monogamy, cohabitation, finances, children, sex, health, religion, or relationship stage.
Do not copy proprietary language, claim professional affiliation, provide instructions, or produce multiple-part questions.`;

export function buildDailyPromptGenerationRequest(args: {
  candidateCount: number;
  existingPromptTexts?: readonly string[];
}) {
  const requested = Number.isSafeInteger(args.candidateCount) ? args.candidateCount : 1;
  const candidateCount = Math.min(MAX_DAILY_PROMPT_CANDIDATES, Math.max(1, requested));
  const existingFingerprints = [
    ...new Set((args.existingPromptTexts ?? []).map(normalizeDailyPromptText)),
  ]
    .filter(Boolean)
    .slice(0, MAX_DUPLICATE_CONTEXT);
  return {
    version: DAILY_PROMPT_GENERATION_PROMPT_VERSION,
    system: GENERATION_SYSTEM_POLICY,
    candidateCount,
    principles: DAILY_PROMPT_PRINCIPLES,
    categories: DAILY_PROMPT_CATEGORIES,
    existingFingerprints,
  } as const;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactCandidateShape(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === 3 &&
    keys[0] === "category" &&
    keys[1] === "principle" &&
    keys[2] === "text" &&
    typeof value.text === "string" &&
    typeof value.principle === "string" &&
    typeof value.category === "string"
  );
}

const UNSAFE_CONTENT_PATTERNS = [
  /https?:\/\/|www\./iu,
  /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/iu,
  /\b(?:\+?\d[\d ()-]{7,}\d)\b/u,
  /\b(?:system prompt|developer message|ignore (?:all |previous )?instructions|language model|\bai\b|model output)\b/iu,
  /\b(?:gottman(?:-certified)?|certified therapist|officially affiliated|clinical affiliation)\b/iu,
  /\b(?:diagnos(?:e|is|tic)|therap(?:y|ist)|treatment|medical advice|mental illness)\b/iu,
  /\b(?:or else|coerc(?:e|ion)|comply|force(?:d)?|blackmail|ultimatum)\b/iu,
  /\b(?:threat|hurt|kill|violence|self[- ]?harm|suicide)\b/iu,
  /\b(?:explicit sexual|sexual act|pornograph|nonconsensual|rape)\b/iu,
  /\b(?:secret|password|private record|medical record|bank statement|location history)\b/iu,
  /\b(?:hate|slur|humiliat|shame|worthless)\b/iu,
];

export function validateDailyPromptCandidate(
  input: unknown,
):
  | { ok: true; candidate: DailyPromptGenerationCandidate }
  | { ok: false; code: DailyPromptCandidateRejectionCode } {
  if (!isPlainObject(input) || !hasExactCandidateShape(input)) {
    return { ok: false, code: "invalid_shape" };
  }

  const text = (input.text as string).trim();
  const principle = (input.principle as string).trim();
  const category = (input.category as string).trim();
  if (!text || new TextEncoder().encode(text).length > MAX_TEXT_UTF8_BYTES) {
    return { ok: false, code: "invalid_text" };
  }
  if (
    text.includes("\n") ||
    text.includes("\r") ||
    /^\s*(?:[-*•]|\d+[.)])\s/u.test(text) ||
    !text.endsWith("?") ||
    (text.match(/\?/gu) ?? []).length !== 1
  ) {
    return { ok: false, code: "invalid_format" };
  }
  if (
    !DAILY_PROMPT_PRINCIPLES.includes(principle as (typeof DAILY_PROMPT_PRINCIPLES)[number]) ||
    !DAILY_PROMPT_CATEGORIES.includes(category as (typeof DAILY_PROMPT_CATEGORIES)[number])
  ) {
    return { ok: false, code: "invalid_metadata" };
  }
  if (UNSAFE_CONTENT_PATTERNS.some((pattern) => pattern.test(text))) {
    return { ok: false, code: "unsafe_content" };
  }

  const normalizedFingerprint = normalizeDailyPromptText(text);
  if (!normalizedFingerprint) return { ok: false, code: "invalid_text" };
  if (DAILY_PROMPT_SEEDS.some((seed) => seed.normalizedFingerprint === normalizedFingerprint)) {
    return { ok: false, code: "unsafe_content" };
  }

  return {
    ok: true,
    candidate: {
      text,
      principle: principle as DailyPromptGenerationCandidate["principle"],
      category: category as DailyPromptGenerationCandidate["category"],
      normalizedFingerprint,
    },
  };
}
