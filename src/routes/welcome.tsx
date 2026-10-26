import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Copy, FolderLock, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout, InkButton } from "@/components/auth/AuthUI";
import { signOut, useAuthState } from "@/lib/auth";
import { formatVaultFolderName } from "@/lib/username-id";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Account — Xperter" },
      { name: "description", content: "Manage your signed-in Xperter account." },
      { property: "og:title", content: "Account — Xperter" },
      { property: "og:description", content: "Manage your signed-in Xperter account." },
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

  const copyLumenId = () => {
    if (!user?.lumenId) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(user.lumenId).catch(() => {});
    }
    toast.success(`Copied Unique User ID: ${user.lumenId}`);
  };

  if (!authReady) {
    return (
      <AuthLayout title="Loading account…" subtitle="Verifying your session">
        <div className="py-8 text-center text-sm text-muted-foreground">
          Checking authentication state…
        </div>
      </AuthLayout>
    );
  }

  const vaultFolder = formatVaultFolderName(user?.lumenId || user?.name || "user");

  return (
    <AuthLayout
      title={`Welcome, ${user?.name ?? "there"}`}
      subtitle="Your identity & encrypted workspace are ready"
    >
      <div className="glass-input mb-4 flex items-center gap-4 rounded-2xl p-4">
        {user?.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.name}
            referrerPolicy="no-referrer"
            className="h-12 w-12 rounded-full border border-glass-edge object-cover"
          />
        ) : (
          <div className="btn-ink flex h-12 w-12 items-center justify-center rounded-full text-sm font-medium">
            {user?.name?.[0]?.toUpperCase() ?? "U"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user?.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      {user?.lumenId && (
        <div className="glass-input mb-4 flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Unique Customized User ID
            </p>
            <p className="mt-0.5 font-mono text-sm font-medium tracking-wider text-foreground">
              {user.lumenId}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Google Drive Vault folder: <span className="font-mono text-foreground">{vaultFolder}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={copyLumenId}
            className="glass-pill flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-foreground transition-colors hover:bg-glass-strong"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy ID
          </button>
        </div>
      )}

      <div className="space-y-3">
        <Link to="/app/page-2" className="block">
          <button
            type="button"
            className="glass-input liquid-press flex h-[50px] w-full items-center justify-center gap-2 rounded-full text-sm font-medium text-foreground transition-colors hover:bg-glass-strong"
          >
            <UserCheck className="h-4 w-4" />
            <span>Open Profile &amp; Document Vault ({vaultFolder})</span>
          </button>
        </Link>
        <Link to="/app/messages" className="block">
          <InkButton>Open Messages Workspace</InkButton>
        </Link>
      </div>

      <button
        type="button"
        onClick={handleSignOut}
        className="mt-5 w-full text-center text-sm text-muted-foreground hover:text-foreground"
      >
        Sign out
      </button>
    </AuthLayout>
  );
}
