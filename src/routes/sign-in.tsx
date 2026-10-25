import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, Lock } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout, Divider, Field, GoogleButton, InkButton } from "@/components/auth/AuthUI";
import { UniqueUsernameField } from "@/components/auth/UniqueUsernameField";
import {
  checkUsernameAvailability,
  getRememberedEmail,
  getRememberedUsername,
  getRememberMePreference,
  signIn,
  signInWithEmailPassword,
  signInWithGoogle,
  useAuthState,
  type UsernameAvailabilityStatus,
} from "@/lib/auth";
import { sanitizeId } from "@/lib/firebase";

export const Route = createFileRoute("/sign-in")({
  head: () => ({
    meta: [
      { title: "Sign in — Lumen" },
      { name: "description", content: "Sign in to your Lumen account with your unique User ID." },
      { property: "og:title", content: "Sign in — Lumen" },
      { property: "og:description", content: "Sign in to your Lumen account with your unique User ID." },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const nav = useNavigate();
  const { user, authReady } = useAuthState();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [availability, setAvailability] = useState<UsernameAvailabilityStatus | null>(null);
  const [errors, setErrors] = useState<{
    email?: string;
    username?: string;
    password?: string;
  }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedEmail = getRememberedEmail();
    const savedUsername = getRememberedUsername();
    if (savedEmail) {
      setEmail((prev) => prev || savedEmail);
    }
    if (savedUsername) {
      setUsername((prev) => prev || savedUsername);
    }
    setRemember(getRememberMePreference());
  }, []);

  useEffect(() => {
    if (authReady && user) {
      nav({ to: "/" });
    }
  }, [authReady, user, nav]);

  const prospectiveUid = email.trim()
    ? sanitizeId(`usr_${email.trim().toLowerCase()}`)
    : undefined;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: { email?: string; username?: string; password?: string } = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Enter a valid email address";
    if (password.length < 6) next.password = "Password must be at least 6 characters";

    const check = await checkUsernameAvailability(
      username,
      prospectiveUid,
      email.split("@")[0] || "lumen",
    );
    setAvailability(check);
    if (!check.available) {
      next.username = check.message;
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    try {
      await signInWithEmailPassword(email, password, remember, check.normalized);
      toast.success(`Signed in with Unique ID: ${check.normalized}`);
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
      let chosenUsername = username.trim();
      if (chosenUsername) {
        const check = await checkUsernameAvailability(chosenUsername, prospectiveUid);
        if (!check.available) {
          setAvailability(check);
          setErrors((prev) => ({ ...prev, username: check.message }));
          toast.error("Please pick an available Unique User ID or click Randomize ID");
          setLoading(false);
          return;
        }
        chosenUsername = check.normalized;
      }
      await signInWithGoogle(remember, chosenUsername || undefined);
      toast.success("Signed in with Google");
      nav({ to: "/" });
    } catch {
      toast.error("Google sign-in could not be completed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in with your unique User ID">
      <form noValidate onSubmit={onSubmit}>
        <UniqueUsernameField
          value={username}
          onChange={(val) => {
            setUsername(val);
            if (errors.username) setErrors((prev) => ({ ...prev, username: undefined }));
          }}
          currentUid={prospectiveUid}
          seedHint={email.split("@")[0] || username || "lumen"}
          error={errors.username}
          onAvailabilityChange={setAvailability}
        />
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
        <InkButton
          type="submit"
          disabled={loading || (Boolean(username.trim()) && availability?.available === false)}
        >
          Sign in
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
