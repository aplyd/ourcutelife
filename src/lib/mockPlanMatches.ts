export function filterMockPlanMatches<T extends { idea: { category: string } }>(
  matches: readonly T[],
  category?: string,
): T[] {
  return category ? matches.filter((match) => match.idea.category === category) : [...matches];
}

export function filterMockPlanIdeas<T extends { category: string }>(
  ideas: readonly T[],
  category?: string,
): T[] {
  return category ? ideas.filter((idea) => idea.category === category) : [...ideas];
}
