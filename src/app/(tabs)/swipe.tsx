import { Redirect } from "expo-router";
import type { JSX } from "react";

export default function LegacySwipeTabRedirect(): JSX.Element {
  return <Redirect href="/plans" />;
}
