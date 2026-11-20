import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  User,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, googleProvider } from "../config/firebase";
import { entitlementKey, supporterScopeKey } from "../app/query-keys";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInFailed: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const CANCELLED_SIGN_IN_CODES = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
]);

const isCancelledSignIn = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "string" &&
  CANCELLED_SIGN_IN_CODES.has(error.code);

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signInFailed, setSignInFailed] = useState(false);
  const queryClient = useQueryClient();
  const previousUid = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const uid = user?.uid ?? null;
      if (previousUid.current !== uid) {
        // The first callback only reports who is already signed in; nothing
        // from another account can be cached yet, and the app's queries are
        // already mounted. Later changes drop the old account's data. Removing
        // (rather than resetting) keeps the old account's queryFn from running
        // again before the new user state arrives.
        if (previousUid.current !== undefined) {
          queryClient.removeQueries({ queryKey: supporterScopeKey });
          queryClient.removeQueries({ queryKey: entitlementKey(previousUid.current) });
        }
        previousUid.current = uid;
      }
      if (user) setSignInFailed(false);
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [queryClient]);

  const signInWithGoogle = async () => {
    setSignInFailed(false);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in with Google:", error);
      if (!isCancelledSignIn(error)) setSignInFailed(true);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const value = {
    user,
    loading,
    signInFailed,
    signInWithGoogle,
    signOut,
  };

  // Always render children. This is a public site (Premium features gate
  // themselves via useIsPremium, which tracks its own loading state), so there's
  // no reason to blank the whole app while auth resolves. Rendering immediately
  // also avoids a blank first paint and keeps the prerendered HTML
  // consistent with the client's initial render, preventing hydration mismatch.
  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
