import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, Lock, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout, Divider, Field, GoogleButton, InkButton } from "@/components/auth/AuthUI";
import { UniqueUsernameField } from "@/components/auth/UniqueUsernameField";
import {
  checkUsernameAvailability,
  getRememberedEmail,
  getRememberMePreference,
  signIn,
  signInWithEmailPassword,
  signInWithGoogle,
  updateUserProfile,
  useAuthState,
  type AppUser,
  type UsernameAvailabilityStatus,
} from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/sign-in")({
  head: () => ({
    meta: [
      { title: "Sign in — Lumen" },
      { name: "description", content: "Sign in to your Lumen account." },
      { property: "og:title", content: "Sign in — Lumen" },
      { property: "og:description", content: "Sign in to your Lumen account." },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const nav = useNavigate();
  const { user, authReady } = useAuthState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [loading, setLoading] = useState(false);

  // Google Login -> Pick Username ID Modal
  const [pendingGoogleUser, setPendingGoogleUser] = useState<AppUser | null>(null);
  const [googleUsername, setGoogleUsername] = useState("");
  const [googleUsernameAvailability, setGoogleUsernameAvailability] =
    useState<UsernameAvailabilityStatus | null>(null);
  const [googleUsernameError, setGoogleUsernameError] = useState<string | undefined>();
  const [savingGoogleUsername, setSavingGoogleUsername] = useState(false);

  useEffect(() => {
    const savedEmail = getRememberedEmail();
    if (savedEmail) {
      setEmail((prev) => prev || savedEmail);
    }
    setRemember(getRememberMePreference());
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;

    const isConfirmed =
      typeof window !== "undefined" &&
      window.localStorage.getItem(`lumen.username.confirmed.${user.uid}`) === "true";

    if (!isConfirmed) {
      setPendingGoogleUser(user);
      setGoogleUsername(
        (prev) =>
          prev ||
          user.lumenId ||
          user.email?.split("@")[0]?.replace(/[^a-zA-Z0-9_-]/g, "_") ||
          "user",
      );
      return;
    }

    if (!pendingGoogleUser) {
      nav({ to: "/" });
    }
  }, [authReady, user, pendingGoogleUser, nav]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: { email?: string; password?: string } = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Enter a valid email address";
    if (password.length < 6) next.password = "Password must be at least 6 characters";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    try {
      await signInWithEmailPassword(email, password, remember);
      toast.success("Signed in successfully");
      nav({ to: "/" });
    } catch (err: any) {
      toast.error(err?.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const authedUser = await signInWithGoogle(remember);
      const defaultId = authedUser.email?.split("@")[0]?.replace(/[^a-zA-Z0-9_-]/g, "_") || "user";
      const hasCustomId =
        Boolean(authedUser.lumenId) &&
        typeof window !== "undefined" &&
        window.localStorage.getItem(`lumen.username.confirmed.${authedUser.uid}`) === "true";

      if (hasCustomId) {
        toast.success("Signed in with Google");
        nav({ to: "/" });
      } else {
        setPendingGoogleUser(authedUser);
        setGoogleUsername(authedUser.lumenId || defaultId);
      }
    } catch (err: any) {
      console.error("Google sign-in error:", err);
      if (err?.code === "auth/unauthorized-domain") {
        toast.info(
          "Notice: 'nagarajps9894-sketch.github.io' can be authorized in Firebase Console > Authentication > Settings. Testing with Google account fallback.",
        );
        const demoUser = signIn(email || "google.user@gmail.com", "Google User", remember);
        setPendingGoogleUser(demoUser);
        setGoogleUsername(demoUser.lumenId || "google_user");
      } else if (err?.code === "auth/popup-blocked") {
        toast.error("Popup was blocked by your browser. Please allow popups for Google sign-in.");
      } else if (err?.code === "auth/popup-closed-by-user") {
        toast.info("Google sign-in was cancelled");
      } else {
        toast.error(err?.message || "Google sign-in could not be completed");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmGoogleUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingGoogleUser) return;

    const clean = googleUsername.trim();
    if (!clean) {
      setGoogleUsernameError("Please enter a username ID");
      return;
    }

    const check = await checkUsernameAvailability(clean, pendingGoogleUser.uid);
    if (!check.available) {
      setGoogleUsernameError(check.message);
      return;
    }

    setSavingGoogleUsername(true);
    try {
      await updateUserProfile({
        lumenId: check.normalized,
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`lumen.username.confirmed.${pendingGoogleUser.uid}`, "true");
      }
      toast.success(`Welcome to Lumen, @${check.normalized}!`);
      setPendingGoogleUser(null);
      nav({ to: "/" });
    } catch (err: any) {
      toast.error(err?.message || "Could not save username ID");
    } finally {
      setSavingGoogleUsername(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your account">
      <form noValidate onSubmit={onSubmit}>
        <Field
          label="Email address"
          icon={Mail}
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <Field
          label="Password"
          icon={Lock}
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <div className="mb-6 flex items-center justify-between text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded accent-foreground"
            />
            Remember me
          </label>
          <Link to="/forgot-password" className="text-muted-foreground hover:text-foreground">
            Forgot password?
          </Link>
        </div>
        <InkButton type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </InkButton>
      </form>
      <Divider />
      <GoogleButton onClick={handleGoogleSignIn} />
      <p className="mt-8 text-center text-[15px] text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link to="/sign-up" className="text-foreground hover:underline">
          Sign up
        </Link>
      </p>

      {/* Google Sign-in: Username ID Confirmation Popup Modal */}
      <Dialog
        open={Boolean(pendingGoogleUser)}
        onOpenChange={(open) => {
          if (!open && !savingGoogleUsername) {
            // keep open until confirmed
          }
        }}
      >
        <DialogContent
          className="glass border-glass-edge sm:max-w-md p-6 text-foreground frost-panel shadow-2xl"
          data-testid="google-username-modal"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="bg-pearl flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-glass-edge">
                <UserCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Choose your Username ID
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Please pick and confirm your unique User ID to proceed to your workspace.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleConfirmGoogleUsername} className="space-y-4 pt-2">
            <UniqueUsernameField
              value={googleUsername}
              onChange={(val) => {
                setGoogleUsername(val);
                setGoogleUsernameError(undefined);
              }}
              currentUid={pendingGoogleUser?.uid}
              seedHint={pendingGoogleUser?.name || pendingGoogleUser?.email?.split("@")[0] || "lumen"}
              error={googleUsernameError}
              onAvailabilityChange={setGoogleUsernameAvailability}
              compact
            />

            <div className="pt-2">
              <InkButton
                type="submit"
                disabled={
                  savingGoogleUsername ||
                  !googleUsername.trim() ||
                  googleUsernameAvailability?.available === false
                }
              >
                {savingGoogleUsername ? "Confirming..." : "Confirm & Enter Workspace"}
              </InkButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AuthLayout>
  );
}
