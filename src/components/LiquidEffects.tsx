import { useEffect } from "react";
import { getUser } from "@/lib/auth";
import { syncPrefsForUserSession } from "@/lib/prefs";

/** Applies saved glass settings and syncs user preferences without cursor lag or tracking. */
export function LiquidEffects() {
  useEffect(() => {
    const currentUser = getUser();
    syncPrefsForUserSession(currentUser?.uid ?? null);
  }, []);
  return null;
}
