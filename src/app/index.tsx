import { Redirect } from "expo-router";
import type { JSX } from "react";

import { useSession } from "@/lib/betterAuth";

export default function EntryRoute(): JSX.Element {
  const betterAuthSession = useSession();

  if (betterAuthSession.isPending) return <Redirect href="/auth" />;

  return <Redirect href={betterAuthSession.data?.session ? "/pairing" : "/auth"} />;
}
