import { useAppQuery } from "@/lib/devMock";
import { Redirect } from "expo-router";
import type { JSX } from "react";

import { api } from "../../convex/_generated/api";
import { useSession } from "@/lib/betterAuth";

export default function EntryRoute(): JSX.Element | null {
  const betterAuthSession = useSession();
  const viewer = useAppQuery(
    api.auth.viewer,
    betterAuthSession.data?.session && !betterAuthSession.isPending ? {} : "skip",
  );

  if (betterAuthSession.isPending) return null;
  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined) return null;
  if (viewer?.couple && viewer.memberCount >= 2) return <Redirect href="/(tabs)" />;
  return <Redirect href="/pairing" />;
}
