export const QUALITY_TIME_CATEGORIES = [
  "eat",
  "drink",
  "explore_adventure",
  "entertainment",
  "romance",
] as const;

export const MOCK_QUALITY_TIME_ACTORS = ["initiator", "responder"] as const;
export const MOCK_QUALITY_TIME_SCENARIOS = [
  "mixed",
  "all_match",
  "all_no_match",
  "expired",
  "canceled",
  "stale",
] as const;

export type MockQualityTimeCategory = (typeof QUALITY_TIME_CATEGORIES)[number];
export type MockQualityTimeActor = (typeof MOCK_QUALITY_TIME_ACTORS)[number];
export type MockQualityTimeScenario = (typeof MOCK_QUALITY_TIME_SCENARIOS)[number];
export type MockQualityTimeTiming = { kind: "now" } | { kind: "future"; scheduledFor: number };
export type MockQualityTimeDecision = "accept" | "pass";
export type MockQualityTimeStatus =
  | "draft"
  | "sent"
  | "responding"
  | "completed"
  | "canceled"
  | "expired";

export type MockQualityTimeCard = {
  planIdeaId: string;
  title: string;
  description: string;
  kind: "food" | "drinks" | "activity" | "entertainment" | "intimacy";
  costLevel: number;
  durationMinutes: number;
  vibeTags: string[];
};

type MockResponderOption = Omit<MockQualityTimeCard, "planIdeaId"> & { optionId: string };

type MockQualityTimeRequest = {
  requestId: string;
  status: MockQualityTimeStatus;
  version: number;
  timing: MockQualityTimeTiming;
  selectedCategories: MockQualityTimeCategory[];
  initiatorDecisions: Map<string, MockQualityTimeDecision>;
  options: Map<string, { category: MockQualityTimeCategory; card: MockQualityTimeCard }>;
  responderCategories: MockQualityTimeCategory[] | null;
  responderDecisions: Map<string, MockQualityTimeDecision>;
  outcomes: Map<MockQualityTimeCategory, string>;
  staleProjectionArmed: boolean;
};

type Clock = () => number;

const CATEGORY_SET = new Set<string>(QUALITY_TIME_CATEGORIES);
const ACTOR_SET = new Set<string>(MOCK_QUALITY_TIME_ACTORS);
const SCENARIO_SET = new Set<string>(MOCK_QUALITY_TIME_SCENARIOS);
const FIXED_REQUEST_ID = "mock_quality_time_request_fixture";
const FIXED_CATEGORIES: MockQualityTimeCategory[] = ["eat", "entertainment"];
const KIND_BY_CATEGORY: Record<MockQualityTimeCategory, MockQualityTimeCard["kind"]> = {
  eat: "food",
  drink: "drinks",
  explore_adventure: "activity",
  entertainment: "entertainment",
  romance: "intimacy",
};
const LABEL_BY_CATEGORY: Record<MockQualityTimeCategory, string> = {
  eat: "Eat",
  drink: "Drink",
  explore_adventure: "Explore",
  entertainment: "Entertainment",
  romance: "Romance",
};
const IDEA_NAMES: Record<MockQualityTimeCategory, string[]> = {
  eat: [
    "Taco tasting",
    "Breakfast picnic",
    "Pasta night",
    "Bakery crawl",
    "Soup and bread",
    "Sushi sampler",
  ],
  drink: [
    "Tea flight",
    "Coffee tasting",
    "Mocktail hour",
    "Cider stop",
    "Hot cocoa walk",
    "Smoothie sampler",
  ],
  explore_adventure: [
    "Sunset trail",
    "Museum wander",
    "Scenic bike ride",
    "Neighborhood photo walk",
    "Botanical garden",
    "Bookstore quest",
  ],
  entertainment: [
    "Comedy show",
    "Arcade challenge",
    "Outdoor movie",
    "Live music set",
    "Puzzle night",
    "Trivia evening",
  ],
  romance: [
    "Candlelit dessert",
    "Love-letter exchange",
    "Stargazing blanket",
    "Slow-dance playlist",
    "Sunrise coffee",
    "Memory-lane walk",
  ],
};

function buildInventory(category: MockQualityTimeCategory): MockQualityTimeCard[] {
  return IDEA_NAMES[category].map((title, index) => ({
    planIdeaId: `mock_quality_time_${category}_${index + 1}`,
    title,
    description: `${LABEL_BY_CATEGORY[category]} together with a simple, low-pressure plan.`,
    kind: KIND_BY_CATEGORY[category],
    costLevel: index % 3,
    durationMinutes: 45 + index * 15,
    vibeTags: index % 2 === 0 ? ["easy", "cozy"] : ["playful", "local"],
  }));
}

const INVENTORY: Record<MockQualityTimeCategory, readonly MockQualityTimeCard[]> = {
  eat: buildInventory("eat"),
  drink: buildInventory("drink"),
  explore_adventure: buildInventory("explore_adventure"),
  entertainment: buildInventory("entertainment"),
  romance: buildInventory("romance"),
};

function copyTiming(timing: MockQualityTimeTiming): MockQualityTimeTiming {
  return timing.kind === "now" ? { kind: "now" } : { ...timing };
}

function copyCard(card: MockQualityTimeCard): MockQualityTimeCard {
  return { ...card, vibeTags: [...card.vibeTags] };
}

function toResponderOption(optionId: string, card: MockQualityTimeCard): MockResponderOption {
  const { planIdeaId: _privatePlanIdeaId, ...neutralCard } = copyCard(card);
  return { optionId, ...neutralCard };
}

function validateCategories(value: unknown): asserts value is MockQualityTimeCategory[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > QUALITY_TIME_CATEGORIES.length) {
    throw new Error("Choose at least one Quality Time category.");
  }
  const seen = new Set<string>();
  for (const category of value) {
    if (typeof category !== "string" || !CATEGORY_SET.has(category) || seen.has(category)) {
      throw new Error("Invalid Quality Time categories.");
    }
    seen.add(category);
  }
}

function validateTiming(value: unknown, now: number): asserts value is MockQualityTimeTiming {
  if (!value || typeof value !== "object") {
    throw new Error("Choose when Quality Time should happen.");
  }
  const timing = value as Record<string, unknown>;
  if (timing.kind === "now") {
    if (Object.keys(timing).length !== 1) throw new Error("Invalid Quality Time timing.");
    return;
  }
  if (
    timing.kind !== "future" ||
    Object.keys(timing).length !== 2 ||
    typeof timing.scheduledFor !== "number" ||
    !Number.isFinite(timing.scheduledFor) ||
    timing.scheduledFor <= now
  ) {
    throw new Error("Choose a valid future date and time.");
  }
}

function isResolved(current: MockQualityTimeRequest, category: MockQualityTimeCategory): boolean {
  if (current.outcomes.has(category)) return true;
  const categoryOptions = [...current.options.entries()].filter(
    ([, option]) => option.category === category,
  );
  return (
    categoryOptions.length >= 3 &&
    categoryOptions.every(([optionId]) => current.responderDecisions.has(optionId))
  );
}

export function createMockQualityTimeState(clock: Clock = Date.now) {
  let request: MockQualityTimeRequest | null = null;
  let requestSequence = 0;
  let actor: MockQualityTimeActor = "initiator";
  let revision = 0;
  const listeners = new Set<() => void>();

  function notify() {
    revision += 1;
    for (const listener of listeners) listener();
  }

  function requireRequest(requestId: unknown): MockQualityTimeRequest {
    if (typeof requestId !== "string" || !request || request.requestId !== requestId) {
      throw new Error("Request not found.");
    }
    return request;
  }

  function requireExactVersion(current: MockQualityTimeRequest, expectedVersion: unknown) {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== current.version) {
      throw new Error("Quality Time request changed. Refresh and try again.");
    }
  }

  function requireWritableVersion(current: MockQualityTimeRequest, expectedVersion: unknown) {
    requireExactVersion(current, expectedVersion);
    if (current.staleProjectionArmed) {
      throw new Error("Quality Time request changed. Refresh and try again.");
    }
  }

  function requireDraft(requestId: unknown, expectedVersion?: unknown): MockQualityTimeRequest {
    const current = requireRequest(requestId);
    if (actor !== "initiator" || current.status !== "draft") throw new Error("Request not found.");
    if (expectedVersion !== undefined) requireWritableVersion(current, expectedVersion);
    return current;
  }

  function neutralProjection<TStatus extends MockQualityTimeStatus>(
    current: MockQualityTimeRequest,
    status: TStatus,
  ) {
    return {
      requestId: current.requestId,
      status,
      version: current.version,
      timing: copyTiming(current.timing),
      selectedCategories: [...current.selectedCategories],
    };
  }

  function completedCategoryResults(current: MockQualityTimeRequest) {
    return (current.responderCategories ?? []).map((category) => {
      const optionId = current.outcomes.get(category);
      if (!optionId) return { category, status: "no_match" as const };
      const option = current.options.get(optionId);
      if (!option || option.category !== category) throw new Error("Request not found.");
      return {
        category,
        status: "matched" as const,
        option: toResponderOption(optionId, option.card),
      };
    });
  }

  function project(current: MockQualityTimeRequest) {
    if (current.status === "draft") {
      if (actor !== "initiator") throw new Error("Request not found.");
      return {
        requestId: current.requestId,
        status: "draft" as const,
        version: current.version,
        timing: copyTiming(current.timing),
        selectedCategories: [...current.selectedCategories],
        shortlistCounts: current.selectedCategories.map((category) => {
          let acceptedCount = 0;
          let decidedCount = 0;
          for (const card of INVENTORY[category]) {
            const decision = current.initiatorDecisions.get(card.planIdeaId);
            if (!decision) continue;
            decidedCount += 1;
            if (decision === "accept") acceptedCount += 1;
          }
          return { category, acceptedCount, decidedCount };
        }),
      };
    }
    if (current.status === "completed") {
      return {
        ...neutralProjection(current, "completed"),
        status: "completed" as const,
        categoryResults: completedCategoryResults(current),
      };
    }
    if (current.status !== "responding") {
      return neutralProjection(current, current.status);
    }
    if (actor === "initiator") {
      return neutralProjection(current, "responding");
    }
    if (!current.responderCategories) throw new Error("Request not found.");
    return {
      ...neutralProjection(current, "responding"),
      status: "responding" as const,
      responderCategories: [...current.responderCategories],
      categoryResults: current.responderCategories.map((category) => {
        const matchedOptionId = current.outcomes.get(category);
        if (matchedOptionId) {
          const matchedOption = current.options.get(matchedOptionId);
          if (!matchedOption || matchedOption.category !== category)
            throw new Error("Request not found.");
          return {
            category,
            status: "matched" as const,
            option: toResponderOption(matchedOptionId, matchedOption.card),
          };
        }
        const options = [...current.options.entries()]
          .filter(
            ([optionId, option]) =>
              option.category === category && !current.responderDecisions.has(optionId),
          )
          .map(([optionId, option]) => toResponderOption(optionId, option.card));
        return { category, status: "pending" as const, options };
      }),
    };
  }

  function createSentFixture(status: MockQualityTimeStatus = "sent"): MockQualityTimeRequest {
    const options = new Map<
      string,
      { category: MockQualityTimeCategory; card: MockQualityTimeCard }
    >();
    for (const category of FIXED_CATEGORIES) {
      for (const card of INVENTORY[category].slice(0, 3)) {
        const index = INVENTORY[category].indexOf(card) + 1;
        options.set(`mock_quality_time_option_${category}_${index}`, { category, card });
      }
    }
    return {
      requestId: FIXED_REQUEST_ID,
      status,
      version: 7,
      timing: { kind: "now" },
      selectedCategories: [...FIXED_CATEGORIES],
      initiatorDecisions: new Map(),
      options,
      responderCategories: null,
      responderDecisions: new Map(),
      outcomes: new Map(),
      staleProjectionArmed: false,
    };
  }

  const state = {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getRevision() {
      return revision;
    },
    reset() {
      request = null;
      requestSequence = 0;
      actor = "initiator";
      notify();
    },
    setActor(nextActor: MockQualityTimeActor) {
      if (typeof nextActor !== "string" || !ACTOR_SET.has(nextActor)) {
        throw new Error("Invalid Quality Time mock actor.");
      }
      actor = nextActor;
      notify();
    },
    seed(scenario: MockQualityTimeScenario) {
      if (typeof scenario !== "string" || !SCENARIO_SET.has(scenario)) {
        throw new Error("Invalid Quality Time mock scenario.");
      }
      actor = "initiator";
      request = createSentFixture();
      if (scenario === "expired" || scenario === "canceled") {
        request.status = scenario;
      } else if (scenario === "stale") {
        request.staleProjectionArmed = true;
      } else if (scenario === "all_match") {
        request.status = "completed";
        request.responderCategories = [...FIXED_CATEGORIES];
        request.outcomes.set("eat", "mock_quality_time_option_eat_2");
        request.outcomes.set("entertainment", "mock_quality_time_option_entertainment_2");
      } else if (scenario === "all_no_match") {
        request.status = "completed";
        request.responderCategories = [...FIXED_CATEGORIES];
        for (const optionId of request.options.keys()) {
          request.responderDecisions.set(optionId, "pass");
        }
      }
      notify();
      return { requestId: request.requestId, status: request.status, version: request.version };
    },
    advanceStaleProjection() {
      if (!request || !request.staleProjectionArmed) {
        throw new Error("No stale Quality Time projection is waiting.");
      }
      request.staleProjectionArmed = false;
      request.version += 1;
      notify();
      return { requestId: request.requestId, status: request.status, version: request.version };
    },
    createDraft(args: {
      timing: MockQualityTimeTiming;
      selectedCategories: MockQualityTimeCategory[];
    }) {
      if (actor !== "initiator" || (request && request.status !== "canceled")) {
        throw new Error("Finish or cancel the current Quality Time request first.");
      }
      validateTiming(args?.timing, clock());
      validateCategories(args?.selectedCategories);
      requestSequence += 1;
      request = {
        requestId: `mock_quality_time_request_${requestSequence}`,
        status: "draft",
        version: 1,
        timing: copyTiming(args.timing),
        selectedCategories: [...args.selectedCategories],
        initiatorDecisions: new Map(),
        options: new Map(),
        responderCategories: null,
        responderDecisions: new Map(),
        outcomes: new Map(),
        staleProjectionArmed: false,
      };
      notify();
      return { requestId: request.requestId, status: "draft" as const, version: 1 };
    },
    getRequest(args: { requestId: string }) {
      return project(requireRequest(args?.requestId));
    },
    listDraftInventory(args: {
      requestId: string;
      category: MockQualityTimeCategory;
      paginationOpts: { numItems: number; cursor: string | null };
    }) {
      const current = requireDraft(args?.requestId);
      if (!current.selectedCategories.includes(args.category)) {
        throw new Error("Category is not selected.");
      }
      const numItems = args.paginationOpts?.numItems;
      if (!Number.isSafeInteger(numItems) || numItems < 1 || numItems > 12) {
        throw new Error("Inventory page size must be an integer from 1 to 12.");
      }
      const cursor = args.paginationOpts?.cursor;
      const offset = cursor === null ? 0 : Number(String(cursor).replace(/^mock:/, ""));
      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid inventory cursor.");
      const undecided = INVENTORY[args.category].filter(
        (card) => !current.initiatorDecisions.has(card.planIdeaId),
      );
      const page = undecided.slice(offset, offset + numItems).map(copyCard);
      const nextOffset = offset + page.length;
      return {
        page,
        isDone: nextOffset >= undecided.length,
        continueCursor: `mock:${nextOffset}`,
      };
    },
    recordDecision(
      args:
        | {
            requestId: string;
            expectedVersion: number;
            planIdeaId: string;
            decision: MockQualityTimeDecision;
          }
        | {
            requestId: string;
            expectedVersion: number;
            optionId: string;
            decision: MockQualityTimeDecision;
          },
    ) {
      if (args?.decision !== "accept" && args?.decision !== "pass") {
        throw new Error("Invalid Quality Time decision.");
      }
      if (actor === "initiator") {
        const current = requireDraft(args?.requestId, args?.expectedVersion);
        if (!("planIdeaId" in args) || "optionId" in args || typeof args.planIdeaId !== "string") {
          throw new Error("Invalid draft decision evidence.");
        }
        if (current.initiatorDecisions.has(args.planIdeaId)) {
          throw new Error("Invalid draft decision evidence.");
        }
        let cardCategory: MockQualityTimeCategory | null = null;
        for (const category of current.selectedCategories) {
          if (INVENTORY[category].some((card) => card.planIdeaId === args.planIdeaId)) {
            cardCategory = category;
            break;
          }
        }
        if (!cardCategory) throw new Error("Invalid Quality Time inventory choice.");
        if (args.decision === "accept") {
          const acceptedCount = INVENTORY[cardCategory].filter(
            (card) => current.initiatorDecisions.get(card.planIdeaId) === "accept",
          ).length;
          if (acceptedCount >= 5) throw new Error("A category can shortlist at most five options.");
        }
        current.initiatorDecisions.set(args.planIdeaId, args.decision);
        current.version += 1;
        notify();
        return { requestId: current.requestId, status: "draft" as const, version: current.version };
      }

      const current = requireRequest(args?.requestId);
      if (current.status !== "responding" || !current.responderCategories) {
        throw new Error("Request not found.");
      }
      requireWritableVersion(current, args?.expectedVersion);
      if (!("optionId" in args) || "planIdeaId" in args || typeof args.optionId !== "string") {
        throw new Error("Invalid responder decision evidence.");
      }
      const option = current.options.get(args.optionId);
      if (
        !option ||
        !current.responderCategories.includes(option.category) ||
        current.outcomes.has(option.category) ||
        current.responderDecisions.has(args.optionId)
      ) {
        throw new Error("Invalid responder decision evidence.");
      }
      current.responderDecisions.set(args.optionId, args.decision);
      if (args.decision === "accept") current.outcomes.set(option.category, args.optionId);
      current.version += 1;
      if (current.responderCategories.every((category) => isResolved(current, category))) {
        current.status = "completed";
      }
      notify();
      return { requestId: current.requestId, status: current.status, version: current.version };
    },
    sendRequest(args: { requestId: string; expectedVersion: number }) {
      const current = requireDraft(args?.requestId, args?.expectedVersion);
      for (const category of current.selectedCategories) {
        const acceptedCards = INVENTORY[category].filter(
          (card) => current.initiatorDecisions.get(card.planIdeaId) === "accept",
        );
        if (acceptedCards.length < 3 || acceptedCards.length > 5) {
          throw new Error(
            "Choose three to five options in every selected category before sending.",
          );
        }
        for (const card of acceptedCards) {
          const index = INVENTORY[category].indexOf(card) + 1;
          current.options.set(`mock_quality_time_option_${category}_${index}`, { category, card });
        }
      }
      current.status = "sent";
      current.version += 1;
      notify();
      return { requestId: current.requestId, status: "sent" as const, version: current.version };
    },
    beginResponse(args: {
      requestId: string;
      expectedVersion: number;
      categories: MockQualityTimeCategory[];
    }) {
      const current = requireRequest(args?.requestId);
      if (actor !== "responder" || current.status !== "sent") throw new Error("Request not found.");
      requireWritableVersion(current, args?.expectedVersion);
      validateCategories(args?.categories);
      if (args.categories.some((category) => !current.selectedCategories.includes(category))) {
        throw new Error("Invalid responder categories.");
      }
      current.responderCategories = [...args.categories];
      current.status = "responding";
      current.version += 1;
      notify();
      return {
        requestId: current.requestId,
        status: "responding" as const,
        version: current.version,
      };
    },
    cancelRequest(args: { requestId: string; expectedVersion: number }) {
      const current = requireRequest(args?.requestId);
      const actorCanCancel =
        (current.status === "draft" && actor === "initiator") ||
        current.status === "sent" ||
        current.status === "responding";
      if (!actorCanCancel) throw new Error("Request not found.");
      requireWritableVersion(current, args?.expectedVersion);
      current.status = "canceled";
      current.version += 1;
      notify();
      return {
        requestId: current.requestId,
        status: "canceled" as const,
        version: current.version,
      };
    },
  };

  return state;
}

export type MockQualityTimeState = ReturnType<typeof createMockQualityTimeState>;

export function createMockQualityTimeTestBridge(state: MockQualityTimeState) {
  return {
    reset: () => state.reset(),
    seed: (scenario: MockQualityTimeScenario) => state.seed(scenario),
    setActor: (nextActor: MockQualityTimeActor) => state.setActor(nextActor),
    advanceStaleProjection: () => state.advanceStaleProjection(),
  };
}

export type MockQualityTimeTestBridge = ReturnType<typeof createMockQualityTimeTestBridge>;

export function installMockQualityTimeTestBridge(
  target: { __OUR_CUTE_LIFE_QUALITY_TIME_MOCK__?: MockQualityTimeTestBridge },
  enabled: boolean,
  state: MockQualityTimeState,
) {
  if (enabled) {
    target.__OUR_CUTE_LIFE_QUALITY_TIME_MOCK__ = createMockQualityTimeTestBridge(state);
  } else {
    delete target.__OUR_CUTE_LIFE_QUALITY_TIME_MOCK__;
  }
}

export const mockQualityTimeState = createMockQualityTimeState();
