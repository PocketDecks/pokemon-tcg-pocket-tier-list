import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  User,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, googleProvider } from "../config/firebase";
import { resetPremiumCodeCache } from "../app/premium-code";
import { resetPremiumDataCache } from "../app/premium-data";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const previousUid = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const uid = user?.uid ?? null;
      if (previousUid.current !== uid) {
        const isPremiumQuery = (query: { queryKey: readonly unknown[] }) =>
          query.queryKey.at(-1) === "full" ||
          (query.queryKey[0] === "decks" &&
            (query.queryKey[1] === "30d" || query.queryKey[1] === "all")) ||
          query.queryKey[0] === "entitlement";
        void queryClient.cancelQueries({ predicate: isPremiumQuery });
        queryClient.removeQueries({ predicate: isPremiumQuery });
        resetPremiumCodeCache();
        resetPremiumDataCache();
        previousUid.current = uid;
      }
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [queryClient]);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in with Google:", error);
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
