import { Redirect } from "expo-router";
import type { JSX } from "react";

import { useSession } from "@/lib/betterAuth";

export default function EntryRoute(): JSX.Element | null {
  const betterAuthSession = useSession();

  if (betterAuthSession.isPending) return null;

  return <Redirect href={betterAuthSession.data?.session ? "/pairing" : "/auth"} />;
}
