import { Redirect } from "expo-router";
import type { JSX } from "react";

import { useAuthSession } from "@/lib/authSession";

export default function EntryRoute(): JSX.Element {
  const { userId, sessionToken } = useAuthSession();
  return <Redirect href={userId && sessionToken ? "/pairing" : "/auth"} />;
}
