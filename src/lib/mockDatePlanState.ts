export type MockDatePlanStatus = "saved" | "scheduled" | "completed";

export type MockDatePlanState = {
  likedByViewer: boolean;
  likeCount: number;
  isSaved: boolean;
  savedStatus: MockDatePlanStatus;
  scheduledFor: number | null;
  completedAt: number | null;
  ratingAverage: number | null;
  updatedAt: number;
};

export type MockDatePlanMutationName =
  | "plans:likeDate"
  | "plans:saveDate"
  | "plans:scheduleDate"
  | "plans:completeDate"
  | "plans:rateDate";

export type MockDatePlanMutationResult<T extends MockDatePlanState> = Omit<
  T,
  keyof MockDatePlanState
> &
  MockDatePlanState;

export function applyMockDatePlanMutation<T extends MockDatePlanState>(
  state: T,
  mutationName: MockDatePlanMutationName,
  args: Record<string, unknown>,
  timestamp: number,
): MockDatePlanMutationResult<T> {
  const currentState = state as MockDatePlanMutationResult<T>;
  switch (mutationName) {
    case "plans:likeDate":
      if (state.likedByViewer) return currentState;
      return {
        ...state,
        likedByViewer: true,
        likeCount: state.likeCount + 1,
        updatedAt: timestamp,
      };
    case "plans:saveDate":
      if (state.isSaved) return currentState;
      return {
        ...state,
        isSaved: true,
        savedStatus: "saved",
        updatedAt: timestamp,
      };
    case "plans:scheduleDate": {
      if (!state.isSaved) throw new Error("Save this date to Our Dates before scheduling it.");
      const scheduledFor = args.scheduledFor;
      if (typeof scheduledFor !== "number") throw new Error("A scheduled time is required.");
      return {
        ...state,
        savedStatus: "scheduled",
        scheduledFor,
        completedAt: null,
        updatedAt: timestamp,
      };
    }
    case "plans:completeDate":
      if (!state.isSaved) throw new Error("Save this date to Our Dates before completing it.");
      return {
        ...state,
        savedStatus: "completed",
        completedAt: timestamp,
        updatedAt: timestamp,
      };
    case "plans:rateDate": {
      if (state.savedStatus !== "completed")
        throw new Error("Complete this date before rating it.");
      const rating = args.rating;
      if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5)
        throw new Error("Rating must be a whole number from 1-5.");
      return { ...state, ratingAverage: rating, updatedAt: timestamp };
    }
  }
}
