export type DatePlanRatingInput = {
  rating: number;
};

export type DatePlanRatingSummary = {
  ratingAverage: number;
  ratingCount: number;
};

export type SavedDatePlanStatus = "saved" | "scheduled" | "completed" | "archived";

export type ScheduledDatePlanState = {
  status: "scheduled";
  scheduledFor: number;
  completedAt: undefined;
  updatedAt: number;
};

export function isValidDatePlanRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

export function summarizeDatePlanRatings(
  ratings: ReadonlyArray<DatePlanRatingInput>,
): DatePlanRatingSummary {
  if (!ratings.length) return { ratingAverage: 0, ratingCount: 0 };

  const ratingTotal = ratings.reduce((sum, rating) => sum + rating.rating, 0);
  return {
    ratingAverage: ratingTotal / ratings.length,
    ratingCount: ratings.length,
  };
}

export function shouldCountDateSaveEngagement(status: SavedDatePlanStatus | null): boolean {
  return status === null || status === "archived";
}

export function shouldCountDateLikeEngagement(alreadyLiked: boolean): boolean {
  return !alreadyLiked;
}

export function shouldCountDateCompletionEngagement(status: SavedDatePlanStatus | null): boolean {
  return status !== "completed";
}

export function createScheduledDatePlanState(
  scheduledFor: number,
  updatedAt: number,
): ScheduledDatePlanState {
  return {
    status: "scheduled",
    scheduledFor,
    completedAt: undefined,
    updatedAt,
  };
}
