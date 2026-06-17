import * as AppleAuthentication from "expo-apple-authentication";
import { useMutation } from "convex/react";

import { api } from "../../convex/_generated/api";

export function useAppleSignIn() {
  const signInWithApple = useMutation(api.auth.signInWithApple);

  return async () => {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      throw new Error("Apple did not return an identity token.");
    }

    return signInWithApple({
      appleSubject: credential.user,
      email: credential.email ?? undefined,
      fullName:
        [credential.fullName?.givenName, credential.fullName?.familyName]
          .filter(Boolean)
          .join(" ") || undefined,
      identityToken: credential.identityToken,
    });
  };
}
