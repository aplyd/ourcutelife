/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { filterMockPlanIdeas, filterMockPlanMatches } from "../../src/lib/mockPlanMatches";

const activityIdea = {
  _id: "mock_plan_idea",
  title: "Sunset picnic QA date",
  category: "activity",
};

const activityMatch = {
  _id: "mock_match",
  idea: {
    title: "Sunset picnic QA date",
    category: "activity",
  },
};

void test("mock plans:matches honors its optional category argument", () => {
  assert.deepEqual(filterMockPlanMatches([activityMatch]), [activityMatch]);
  assert.deepEqual(filterMockPlanMatches([activityMatch], "activity"), [activityMatch]);
  assert.deepEqual(filterMockPlanMatches([activityMatch], "entertainment"), []);

  const devMockSource = readFileSync("src/lib/devMock.ts", "utf8");
  assert.match(devMockSource, /category: "activity" as const/);
  assert.match(devMockSource, /case "plans:matches":[\s\S]{0,200}filterMockPlanMatches/);
});

void test("mock plans:list honors its requested category", () => {
  assert.deepEqual(filterMockPlanIdeas([activityIdea]), [activityIdea]);
  assert.deepEqual(filterMockPlanIdeas([activityIdea], "activity"), [activityIdea]);
  assert.deepEqual(filterMockPlanIdeas([activityIdea], "food"), []);

  const devMockSource = readFileSync("src/lib/devMock.ts", "utf8");
  assert.match(devMockSource, /case "plans:list":[\s\S]{0,200}filterMockPlanIdeas/);
});
