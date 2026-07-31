import { describe, expect, test, vi } from "vitest";

import { DAILY_PROMPT_SEEDS } from "./dailyPromptLibrary";
import {
  DAILY_PROMPT_GENERATION_PROMPT_VERSION,
  buildDailyPromptGenerationRequest,
  validateDailyPromptCandidate,
} from "./dailyPromptGenerationPolicy";
import { orchestrateDailyPromptGeneration } from "./dailyPromptGenerationOrchestration";

const validCandidate = {
  text: "What small moment helped you feel connected this week?",
  principle: "bids for connection",
  category: "connection",
};

describe("daily prompt generation policy", () => {
  test("keeps versioned warm, non-affiliated guidance and bounded duplicate context", () => {
    const request = buildDailyPromptGenerationRequest({
      candidateCount: 99,
      existingPromptTexts: [
        ...DAILY_PROMPT_SEEDS.map((seed) => seed.text),
        ...Array.from({ length: 20 }, (_, index) => `Extra ${index}`),
      ],
    });

    expect(DAILY_PROMPT_GENERATION_PROMPT_VERSION).toBe("daily-prompt-generation-v1");
    expect(request.candidateCount).toBe(5);
    expect(request.existingFingerprints).toHaveLength(12);
    expect(request.system).toContain("warm");
    expect(request.system).toContain("not affiliated with Gottman");
    expect(Object.keys(request)).not.toEqual(
      expect.arrayContaining([
        "answers",
        "moments",
        "chatMessages",
        "userId",
        "coupleId",
        "devices",
        "notifications",
        "lifecycles",
      ]),
    );
  });

  test("normalizes one valid candidate deterministically", () => {
    expect(validateDailyPromptCandidate(validCandidate)).toEqual({
      ok: true,
      candidate: {
        ...validCandidate,
        normalizedFingerprint: "what small moment helped you feel connected this week",
      },
    });
  });

  test.each([
    ["shape", null, "invalid_shape"],
    ["unknown field", { ...validCandidate, source: "ai" }, "invalid_shape"],
    ["blank", { ...validCandidate, text: " " }, "invalid_text"],
    ["oversized", { ...validCandidate, text: `${"a".repeat(241)}?` }, "invalid_text"],
    [
      "multiple questions",
      { ...validCandidate, text: "What helped? What changed?" },
      "invalid_format",
    ],
    ["no terminal question", { ...validCandidate, text: "What helped today" }, "invalid_format"],
    ["newline", { ...validCandidate, text: "What helped\ntoday?" }, "invalid_format"],
    ["unknown principle", { ...validCandidate, principle: "astrology" }, "invalid_metadata"],
    ["unknown category", { ...validCandidate, category: "finance" }, "invalid_metadata"],
    [
      "url",
      { ...validCandidate, text: "What did https://example.com teach you?" },
      "unsafe_content",
    ],
    [
      "contact",
      { ...validCandidate, text: "What should you email me@example.com about?" },
      "unsafe_content",
    ],
    [
      "model instruction",
      { ...validCandidate, text: "What should the AI system prompt reveal?" },
      "unsafe_content",
    ],
    [
      "affiliation",
      { ...validCandidate, text: "What Gottman-certified exercise should you try?" },
      "unsafe_content",
    ],
    [
      "therapy",
      { ...validCandidate, text: "What should your therapist diagnose today?" },
      "unsafe_content",
    ],
    [
      "coercion",
      { ...validCandidate, text: "What must your partner do or else?" },
      "unsafe_content",
    ],
    [
      "threat",
      { ...validCandidate, text: "What threat would make them comply?" },
      "unsafe_content",
    ],
    [
      "sexual",
      { ...validCandidate, text: "What explicit sexual act must your partner perform?" },
      "unsafe_content",
    ],
    [
      "secret",
      { ...validCandidate, text: "What secret private record should you reveal?" },
      "unsafe_content",
    ],
  ])("rejects %s with a stable code", (_name, input, code) => {
    expect(validateDailyPromptCandidate(input)).toEqual({ ok: false, code });
  });
});

describe("daily prompt generation orchestration", () => {
  test("missing configuration falls back without calling provider or persistence", async () => {
    const provider = vi.fn();
    const persist = vi.fn();
    const result = await orchestrateDailyPromptGeneration({
      configured: false,
      requestedCount: 2,
      provider,
      persist,
    });

    expect(result).toEqual({
      outcome: "provider_unavailable",
      requested: 2,
      generated: 0,
      deduplicated: 0,
      rejected: 0,
    });
    expect(provider).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  test("persists a mixed mocked batch independently with aggregate-only results", async () => {
    const provider = vi
      .fn()
      .mockResolvedValue([
        validCandidate,
        { ...validCandidate, text: "Not a question" },
        { ...validCandidate, text: "What helped you reconnect after a busy day?" },
      ]);
    const persist = vi
      .fn()
      .mockResolvedValueOnce("generated")
      .mockResolvedValueOnce("deduplicated");

    const result = await orchestrateDailyPromptGeneration({
      configured: true,
      requestedCount: 3,
      provider,
      persist,
    });

    expect(result).toEqual({
      outcome: "completed",
      requested: 3,
      generated: 1,
      deduplicated: 1,
      rejected: 1,
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(Object.keys(provider.mock.calls[0][0])).not.toEqual(
      expect.arrayContaining(["answers", "userId", "coupleId", "moments", "chatMessages"]),
    );
  });

  test.each([
    ["throw", vi.fn().mockRejectedValue(new Error("private raw provider error"))],
    ["malformed", vi.fn().mockResolvedValue({ candidates: [validCandidate] })],
    ["too many", vi.fn().mockResolvedValue(Array(6).fill(validCandidate))],
  ])("returns a privacy-safe provider error for %s output", async (_name, provider) => {
    const result = await orchestrateDailyPromptGeneration({
      configured: true,
      requestedCount: 2,
      provider,
      persist: vi.fn(),
    });
    expect(result).toEqual({
      outcome: "provider_error",
      requested: 2,
      generated: 0,
      deduplicated: 0,
      rejected: 0,
    });
    expect(JSON.stringify(result)).not.toContain("private raw provider error");
  });

  test("bounds a provider timeout without exposing provider details", async () => {
    const result = await orchestrateDailyPromptGeneration({
      configured: true,
      requestedCount: 1,
      provider: vi.fn(() => new Promise(() => undefined)),
      persist: vi.fn(),
      timeoutMs: 1,
    });
    expect(result).toEqual({
      outcome: "provider_error",
      requested: 1,
      generated: 0,
      deduplicated: 0,
      rejected: 0,
    });
  });

  test("empty output is a successful fallback result", async () => {
    const result = await orchestrateDailyPromptGeneration({
      configured: true,
      requestedCount: 1,
      provider: vi.fn().mockResolvedValue([]),
      persist: vi.fn(),
    });
    expect(result.outcome).toBe("completed");
    expect(result.generated).toBe(0);
  });
});
