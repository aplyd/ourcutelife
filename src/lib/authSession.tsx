import type { Id } from "../../convex/_generated/dataModel";
import type React from "react";
import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { storage } from "@/lib/storage";

const USER_ID_STORAGE_KEY = "auth.userId";
const SESSION_TOKEN_STORAGE_KEY = "auth.sessionToken";

type AuthSession = {
  userId: Id<"users"> | null;
  sessionToken: string | null;
  setSession: (session: { userId: Id<"users">; sessionToken: string }) => void;
  signOut: () => void;
};

const AuthSessionContext = createContext<AuthSession | null>(null);

export function AuthSessionProvider({ children }: PropsWithChildren): React.ReactElement {
  const [userId, setUserIdState] = useState<Id<"users"> | null>(() => {
    return (storage.getString(USER_ID_STORAGE_KEY) as Id<"users"> | undefined) ?? null;
  });
  const [sessionToken, setSessionTokenState] = useState<string | null>(() => {
    return storage.getString(SESSION_TOKEN_STORAGE_KEY) ?? null;
  });

  const setSession = useCallback((session: { userId: Id<"users">; sessionToken: string }) => {
    storage.set(USER_ID_STORAGE_KEY, session.userId);
    storage.set(SESSION_TOKEN_STORAGE_KEY, session.sessionToken);
    setUserIdState(session.userId);
    setSessionTokenState(session.sessionToken);
  }, []);

  const signOut = useCallback(() => {
    storage.remove(USER_ID_STORAGE_KEY);
    storage.remove(SESSION_TOKEN_STORAGE_KEY);
    setUserIdState(null);
    setSessionTokenState(null);
  }, []);

  const value = useMemo(
    () => ({ userId, sessionToken, setSession, signOut }),
    [sessionToken, setSession, signOut, userId],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSession {
  const context = useContext(AuthSessionContext);
  if (!context) throw new Error("useAuthSession must be used inside AuthSessionProvider");
  return context;
}
