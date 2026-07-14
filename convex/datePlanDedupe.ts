export type DatePlanItemKeyBackfillInput<ItemId extends string = string> = {
  _id: string;
  itemIds: readonly ItemId[];
  itemKey?: string | null;
};

export type DatePlanItemKeyBackfillCandidate<ItemId extends string = string> = {
  datePlanId: string;
  itemIds: ItemId[];
  itemKey: string;
};

export type DatePlanItemKeyBackfillPreview<ItemId extends string = string> = {
  scanned: number;
  alreadyKeyed: number;
  wouldPatchCount: number;
  wouldPatch: Array<DatePlanItemKeyBackfillCandidate<ItemId>>;
};

export type ExistingDatePlanItems<ItemId extends string = string> = {
  itemIds: readonly ItemId[];
};

export function createDatePlanItemKey<ItemId extends string>(itemIds: readonly ItemId[]): string {
  return [...new Set(itemIds)].sort().join("|");
}

export function shouldCreateDatePlanForItems<ItemId extends string>(
  itemIds: readonly ItemId[],
  existingDatePlans: ReadonlyArray<ExistingDatePlanItems<ItemId>>,
): boolean {
  const itemKey = createDatePlanItemKey(itemIds);
  return !existingDatePlans.some((datePlan) => createDatePlanItemKey(datePlan.itemIds) === itemKey);
}

export function previewDatePlanItemKeyBackfill<ItemId extends string>(
  datePlans: ReadonlyArray<DatePlanItemKeyBackfillInput<ItemId>>,
): DatePlanItemKeyBackfillPreview<ItemId> {
  const wouldPatch: Array<DatePlanItemKeyBackfillCandidate<ItemId>> = [];
  let alreadyKeyed = 0;

  for (const datePlan of datePlans) {
    if (datePlan.itemKey !== undefined && datePlan.itemKey !== null) {
      alreadyKeyed += 1;
      continue;
    }

    wouldPatch.push({
      datePlanId: datePlan._id,
      itemIds: [...new Set(datePlan.itemIds)].sort(),
      itemKey: createDatePlanItemKey(datePlan.itemIds),
    });
  }

  return {
    scanned: datePlans.length,
    alreadyKeyed,
    wouldPatchCount: wouldPatch.length,
    wouldPatch,
  };
}
