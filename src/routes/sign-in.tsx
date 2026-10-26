import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, Lock } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout, Divider, Field, GoogleButton, InkButton } from "@/components/auth/AuthUI";
import {
  getRememberedEmail,
  getRememberMePreference,
  signInWithEmailPassword,
  signInWithGoogle,
  useAuthState,
} from "@/lib/auth";

export const Route = createFileRoute("/sign-in")({
  head: () => ({
    meta: [
      { title: "Sign in — Xperter" },
      { name: "description", content: "Sign in to your Xperter account." },
      { property: "og:title", content: "Sign in — Xperter" },
      { property: "og:description", content: "Sign in to your Xperter account." },
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

  useEffect(() => {
    const savedEmail = getRememberedEmail();
    if (savedEmail) {
      setEmail((prev) => prev || savedEmail);
    }
    setRemember(getRememberMePreference());
  }, []);

  useEffect(() => {
    if (authReady && user) {
      nav({ to: "/app/messages" });
    }
  }, [authReady, user, nav]);

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
      nav({ to: "/app/messages" });
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
      toast.success(`Welcome back, ${authedUser.name || "User"}!`);
      nav({ to: "/app/messages" });
    } catch (err: any) {
      console.error("Google sign-in error:", err);
      if (err?.code === "auth/unauthorized-domain") {
        const currentDomain =
          typeof window !== "undefined" ? window.location.hostname : "xperter-workspace.web.app";
        toast.error(
          `Google sign-in is blocked: '${currentDomain}' is not authorized in Firebase. Please add '${currentDomain}' to Firebase Console → Authentication → Settings → Authorized domains.`,
          { duration: 12000 },
        );
      } else if (err?.code === "auth/popup-blocked") {
        toast.error("Popup was blocked by your browser. Please allow popups for Google sign-in.");
      } else if (err?.code === "auth/popup-closed-by-user") {
        toast.info("Google sign-in was cancelled.");
      } else {
        toast.error(err?.message || "Google sign-in could not be completed.");
      }
    } finally {
      setLoading(false);
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
    </AuthLayout>
  );
}
