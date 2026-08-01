import { describe, expect, test } from "vitest";

import { rankApprovedDailyPrompt } from "./dailyPromptSelection";

type CandidateOverrides = Partial<{
  id: string;
  normalizedFingerprint: string;
  principle: string;
  category: string;
  completionCount: number;
}>;

function candidate(id: string, overrides: CandidateOverrides = {}) {
  return {
    id,
    normalizedFingerprint: `fingerprint ${id}`,
    principle: `principle ${id}`,
    category: `category ${id}`,
    completionCount: 0,
    ...overrides,
  };
}

test("aggregate completion evidence ranks the least-completed approved prompt first", () => {
  const selected = rankApprovedDailyPrompt({
    candidates: [
      candidate("popular", { completionCount: 8 }),
      candidate("least-used", { completionCount: 1 }),
      candidate("middle", { completionCount: 3 }),
    ],
    recentAssignments: [],
    selectionSeed: "completion-evidence",
  });

  expect(selected).toBe("least-used");
});

test("bounded recent assignments are excluded whenever a fresh candidate exists", () => {
  const selected = rankApprovedDailyPrompt({
    candidates: [candidate("recent"), candidate("fresh", { completionCount: 4 })],
    recentAssignments: [
      { promptId: "recent", principle: "principle recent", category: "category recent" },
    ],
    selectionSeed: "recent-exclusion",
  });

  expect(selected).toBe("fresh");
});

test("equal completion evidence prefers category and principle diversity", () => {
  const selected = rankApprovedDailyPrompt({
    candidates: [
      candidate("repeated", { principle: "repair", category: "connection" }),
      candidate("diverse", { principle: "appreciation", category: "gratitude" }),
    ],
    recentAssignments: [
      { promptId: "old-1", principle: "repair", category: "connection" },
      { promptId: "old-2", principle: "repair", category: "support" },
    ],
    selectionSeed: "diversity",
  });

  expect(selected).toBe("diverse");
});

test("selection is deterministic regardless of candidate input order", () => {
  const candidates = [candidate("a"), candidate("b"), candidate("c")];
  const input = { recentAssignments: [], selectionSeed: "stable-tie" };

  expect(rankApprovedDailyPrompt({ ...input, candidates })).toBe(
    rankApprovedDailyPrompt({ ...input, candidates: candidates.toReversed() }),
  );
});

test("when every candidate is recent the least-completed inventory remains an automatic fallback", () => {
  const selected = rankApprovedDailyPrompt({
    candidates: [candidate("a", { completionCount: 2 }), candidate("b", { completionCount: 1 })],
    recentAssignments: [
      { promptId: "a", principle: "principle a", category: "category a" },
      { promptId: "b", principle: "principle b", category: "category b" },
    ],
    selectionSeed: "all-recent",
  });

  expect(selected).toBe("b");
});

describe("fail-closed ranking evidence", () => {
  test("rejects duplicate fingerprints before selecting", () => {
    expect(() =>
      rankApprovedDailyPrompt({
        candidates: [
          candidate("a", { normalizedFingerprint: "same" }),
          candidate("b", { normalizedFingerprint: "same" }),
        ],
        recentAssignments: [],
        selectionSeed: "duplicate",
      }),
    ).toThrow("Duplicate daily prompt fingerprint.");
  });

  test("rejects duplicate candidate IDs and malformed aggregate counts", () => {
    expect(() =>
      rankApprovedDailyPrompt({
        candidates: [candidate("same"), candidate("same", { normalizedFingerprint: "other" })],
        recentAssignments: [],
        selectionSeed: "duplicate-id",
      }),
    ).toThrow("Duplicate daily prompt candidate.");

    expect(() =>
      rankApprovedDailyPrompt({
        candidates: [candidate("bad", { completionCount: -1 })],
        recentAssignments: [],
        selectionSeed: "bad-count",
      }),
    ).toThrow("Invalid daily prompt ranking evidence.");
  });

  test("enforces the existing bounded candidate and recency windows", () => {
    expect(() =>
      rankApprovedDailyPrompt({
        candidates: Array.from({ length: 65 }, (_, index) => candidate(String(index))),
        recentAssignments: [],
        selectionSeed: "too-many-candidates",
      }),
    ).toThrow("Daily prompt ranking evidence exceeds its bound.");

    expect(() =>
      rankApprovedDailyPrompt({
        candidates: [candidate("only")],
        recentAssignments: Array.from({ length: 13 }, (_, index) => ({
          promptId: `old-${index}`,
          principle: `principle-${index}`,
          category: `category-${index}`,
        })),
        selectionSeed: "too-much-history",
      }),
    ).toThrow("Daily prompt ranking evidence exceeds its bound.");
  });
});
