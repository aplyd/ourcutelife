export type DatePlanItemPrivacyInput<ItemId extends string, UserId extends string> = {
  itemId: ItemId;
  createdByUserId?: UserId | null;
  viewerUserId: UserId;
  matchedItemIds: ReadonlySet<ItemId>;
};

export function canRevealDatePlanItem<ItemId extends string, UserId extends string>({
  itemId,
  createdByUserId,
  viewerUserId,
  matchedItemIds,
}: DatePlanItemPrivacyInput<ItemId, UserId>): boolean {
  return !createdByUserId || createdByUserId === viewerUserId || matchedItemIds.has(itemId);
}
