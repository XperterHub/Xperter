import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft, LogOut } from "lucide-react";
import { toast } from "sonner";
import { SilkBackground } from "@/components/SilkBackground";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { signOut, useAuthState } from "@/lib/auth";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Account — Xperter" },
      { name: "description", content: "Manage your signed-in Xperter account profile." },
      { property: "og:title", content: "Account — Xperter" },
      { property: "og:description", content: "Manage your signed-in Xperter account profile." },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  const nav = useNavigate();
  const { user, authReady } = useAuthState();

  useEffect(() => {
    if (authReady && !user) {
      nav({ to: "/sign-in" });
    }
  }, [authReady, user, nav]);

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
    nav({ to: "/sign-in" });
  };

  if (!authReady) {
    return (
      <main className="relative flex min-h-dvh items-center justify-center px-4 py-8 text-foreground">
        <SilkBackground />
        <div className="py-8 text-center text-sm text-muted-foreground">
          Checking authentication state…
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12 text-foreground">
      <SilkBackground />

      {/* Centered Profile Card */}
      <div className="w-full max-w-2xl animate-liquid">
        <ProfileCard />
      </div>

      {/* Neatly aligned controls directly below the profile card */}
      <div className="mt-5 flex w-full max-w-2xl items-center justify-between px-1">
        <Link
          to="/app/messages"
          className="glass-pill liquid-press inline-flex h-10 items-center gap-2 rounded-full px-5 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge shadow-sm"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Workspace</span>
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className="glass-pill liquid-press inline-flex h-10 items-center gap-2 rounded-full px-4.5 text-xs font-medium text-muted-foreground hover:text-destructive border border-glass-edge shadow-sm transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign out</span>
        </button>
      </div>
    </main>
  );
}
