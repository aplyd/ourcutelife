import { Redirect } from "expo-router";
import type { JSX } from "react";

export default function LegacyReviewTabRedirect(): JSX.Element {
  return <Redirect href="/chat" />;
}
