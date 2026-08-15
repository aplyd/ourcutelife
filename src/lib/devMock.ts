import { getFunctionName } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useSyncExternalStore } from "react";

import { applyMockDatePlanMutation, type MockDatePlanMutationName } from "@/lib/mockDatePlanState";
import {
  installMockQualityTimeTestBridge,
  mockQualityTimeState,
  type MockQualityTimeTestBridge,
} from "@/lib/mockQualityTimeState";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export const isDevMockAuthEnabled =
  __DEV__ && TRUE_VALUES.has(String(process.env.EXPO_PUBLIC_MOCK_AUTH ?? "").toLowerCase());

const qualityTimeMockGlobal = globalThis as typeof globalThis & {
  __OUR_CUTE_LIFE_QUALITY_TIME_MOCK__?: MockQualityTimeTestBridge;
};
installMockQualityTimeTestBridge(qualityTimeMockGlobal, isDevMockAuthEnabled, mockQualityTimeState);

const now = Date.now();
const startedDatingAt = new Date("2022-02-14T12:00:00Z").getTime();

const mockUser = {
  _id: "mock_user" as never,
  _creationTime: now,
  authUserId: "mock-auth-user",
  email: "agent@ourcutelife.local",
  fullName: "Agent User",
  createdAt: now,
  updatedAt: now,
};

const mockPartner = {
  _id: "mock_partner" as never,
  _creationTime: now,
  authUserId: "mock-auth-partner",
  email: "partner@ourcutelife.local",
  fullName: "Test Partner",
  createdAt: now,
  updatedAt: now,
};

const mockCouple = {
  _id: "mock_couple" as never,
  _creationTime: now,
  name: "Agent + Test Partner",
  anniversaryDate: startedDatingAt,
  createdByUserId: mockUser._id,
  createdAt: now,
  updatedAt: now,
};

const mockViewer = {
  user: mockUser,
  partner: mockPartner,
  membership: {
    _id: "mock_membership" as never,
    _creationTime: now,
    coupleId: mockCouple._id,
    userId: mockUser._id,
    role: "partner" as const,
    joinedAt: now,
  },
  couple: mockCouple,
  memberCount: 2,
  activePairingCode: "123-456",
  activePairingCodeExpiresAt: now + 86_400_000,
};

const mockMoments = [
  {
    _id: "mock_moment_1" as never,
    _creationTime: now,
    coupleId: mockCouple._id,
    authorUserId: mockUser._id,
    happenedAt: now - 86_400_000,
    createdAt: now - 86_400_000,
    summary: "Mocked a sweet product moment so agents can verify the timeline.",
    feeling: "Proud and cozy",
    tone: "good" as const,
    tags: ["agent", "demo"],
  },
];

const mockPlanIdea = {
  _id: "mock_plan_idea" as never,
  _creationTime: now,
  coupleId: mockCouple._id,
  title: "Sunset picnic QA date",
  description: "A mock plan idea used for local simulator verification.",
  kind: "activity" as const,
  category: "date" as const,
  costLevel: 2,
  durationMinutes: 90,
  vibeTags: ["cozy", "easy"],
  source: "seed" as const,
  createdAt: now,
};

const mockMatch = {
  _id: "mock_match" as never,
  _creationTime: now,
  coupleId: mockCouple._id,
  ideaId: mockPlanIdea._id,
  idea: mockPlanIdea,
  createdAt: now,
  status: "matched" as const,
};

let mockDatePlan = {
  _id: "mock_date_plan" as never,
  _creationTime: now,
  coupleId: mockCouple._id,
  title: "Coffee walk",
  summary: "Grab coffee and take a long walk somewhere pretty.",
  itemIds: [],
  freeformSteps: [],
  durationMinutes: 60,
  costLevel: 1,
  matchedItemCount: 0,
  likedByViewer: false,
  likeCount: 0,
  ratingAverage: null as number | null,
  isSaved: true,
  savedStatus: "saved" as "saved" | "scheduled" | "completed",
  scheduledFor: (now + 172_800_000) as number | null,
  completedAt: null as number | null,
  createdAt: now,
  updatedAt: now,
};

let mockVersion = 0;
const mockListeners = new Set<() => void>();

mockQualityTimeState.subscribe(() => {
  mockVersion += 1;
  for (const listener of mockListeners) listener();
});

function updateMockDatePlan(mutationName: MockDatePlanMutationName, args: Record<string, unknown>) {
  const nextDatePlan = applyMockDatePlanMutation(mockDatePlan, mutationName, args, Date.now());
  if (nextDatePlan === mockDatePlan) return;
  mockDatePlan = nextDatePlan;
  mockVersion += 1;
  for (const listener of mockListeners) listener();
}

function subscribeToMockData(listener: () => void) {
  mockListeners.add(listener);
  return () => mockListeners.delete(listener);
}

function getMockVersion() {
  return mockVersion;
}

const mockPrompt = {
  promptDate: new Date(now).toISOString().slice(0, 10),
  prompt: "What small thing made you feel loved today?",
  response: null,
  partnerResponse: null,
  partnerHasAnswered: true,
  isRevealed: false,
  weeklyGame: {
    title: "Two-minute memory game",
    description: "Pick one tiny shared memory and compare what each of you remembers.",
  },
  quiz: {
    title: "Tiny check-in",
    question: "What would make tonight feel 10% sweeter?",
  },
};

const mockChatMessages = [
  {
    _id: "mock_chat_1" as never,
    _creationTime: now,
    coupleId: mockCouple._id,
    senderKind: "ai" as const,
    text: "Mock auth is on, so agents can verify this chat screen without signing in.",
    createdAt: now,
  },
];

const mockReviews = [
  {
    _id: "mock_review" as never,
    _creationTime: now,
    coupleId: mockCouple._id,
    ownerUserId: mockUser._id,
    month: "2026-06",
    status: "draft" as const,
    generatedAt: now,
    summary: "A mocked monthly review for simulator QA.",
    highlights: ["Verified the app through Argent"],
    patterns: ["Agents need deterministic auth bypass"],
    questions: ["What should we polish next?"],
    ownerWorkOns: ["Keep QA loops tight"],
    partnerRequests: ["Make login-free demo mode obvious"],
    agreements: [],
  },
];

const mockStats = {
  momentsCount: 1,
  promptsAnswered: 3,
  planMatches: 1,
  currentStreak: 2,
};

function mockQueryResult(query: unknown, args: unknown): unknown {
  if (args === "skip") return undefined;
  switch (getFunctionName(query as never)) {
    case "auth:viewer":
      return mockViewer;
    case "prompts:today":
      return mockPrompt;
    case "moments:listMine":
      return mockMoments;
    case "moments:getMine":
      return mockMoments[0];
    case "plans:list":
      return [mockPlanIdea];
    case "plans:matches":
      return [mockMatch];
    case "plans:randomMatchesByCategories":
      return [mockPlanIdea];
    case "plans:randomByCategories":
      return [mockPlanIdea];
    case "plans:dateLeaderboard":
      return [mockDatePlan];
    case "plans:ourDates":
      return [mockDatePlan];
    case "qualityTime:getRequest":
      return mockQualityTimeState.getRequest(args as never);
    case "qualityTime:listPendingResponses":
      return mockQualityTimeState.listPendingResponses();
    case "qualityTime:listDraftInventory":
      return mockQualityTimeState.listDraftInventory(args as never);
    case "chat:list":
      return mockChatMessages;
    case "reviews:latestMine":
      return mockReviews;
    case "reviews:chatMessages":
      return mockChatMessages;
    case "stats:mine":
      return mockStats;
    default:
      return [];
  }
}

export const useAppQuery: typeof useQuery = ((query: any, args: any): any => {
  if (isDevMockAuthEnabled) {
    useSyncExternalStore(subscribeToMockData, getMockVersion, getMockVersion);
    return mockQueryResult(query, args);
  }
  return useQuery(query, args);
}) as typeof useQuery;

export const useAppMutation: typeof useMutation = ((mutation: any): any => {
  if (isDevMockAuthEnabled) {
    const mutationName = getFunctionName(mutation as never);
    return async (args: Record<string, unknown> = {}) => {
      switch (mutationName) {
        case "plans:likeDate":
        case "plans:saveDate":
        case "plans:scheduleDate":
        case "plans:completeDate":
        case "plans:rateDate":
          updateMockDatePlan(mutationName, args);
          break;
        case "qualityTime:createDraft":
          return mockQualityTimeState.createDraft(args as never);
        case "qualityTime:beginResponse":
          return mockQualityTimeState.beginResponse(args as never);
        case "qualityTime:recordDecision":
          return mockQualityTimeState.recordDecision(args as never);
        case "qualityTime:sendRequest":
          return mockQualityTimeState.sendRequest(args as never);
        case "qualityTime:cancelRequest":
          return mockQualityTimeState.cancelRequest(args as never);
      }
      return {
        code: "123-456",
        expiresAt: now + 86_400_000,
        id: "mock_mutation_result",
      };
    };
  }
  return useMutation(mutation);
}) as typeof useMutation;

export const mockSession = {
  data: {
    session: {
      id: "mock-session",
      userId: "mock-auth-user",
      token: "mock-token",
      createdAt: new Date(now),
      updatedAt: new Date(now),
      expiresAt: new Date(now + 30 * 86_400_000),
    },
    user: {
      id: "mock-auth-user",
      email: mockUser.email,
      name: mockUser.fullName,
    },
  },
  isPending: false,
  error: null,
};
