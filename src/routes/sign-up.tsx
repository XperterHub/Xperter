import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { User, Mail, Lock } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout, Divider, Field, GoogleButton, InkButton } from "@/components/auth/AuthUI";
import { UniqueUsernameField } from "@/components/auth/UniqueUsernameField";
import {
  checkUsernameAvailability,
  signIn,
  signUpWithEmailPassword,
  signInWithGoogle,
  type UsernameAvailabilityStatus,
} from "@/lib/auth";
import { sanitizeId } from "@/lib/firebase";

export const Route = createFileRoute("/sign-up")({
  head: () => ({
    meta: [
      { title: "Create account — Lumen" },
      { name: "description", content: "Create your Lumen account and claim your unique User ID." },
      { property: "og:title", content: "Create account — Lumen" },
      { property: "og:description", content: "Create your Lumen account and claim your unique User ID." },
    ],
  }),
  component: SignUp,
});

function SignUp() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [availability, setAvailability] = useState<UsernameAvailabilityStatus | null>(null);
  const [errors, setErrors] = useState<{
    name?: string;
    username?: string;
    email?: string;
    password?: string;
    confirm?: string;
    agree?: string;
  }>({});
  const [loading, setLoading] = useState(false);

  const prospectiveUid = email.trim()
    ? sanitizeId(`usr_${email.trim().toLowerCase()}`)
    : undefined;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Enter your full name";
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Enter a valid email address";
    if (password.length < 8) next.password = "Password must be at least 8 characters";
    if (confirm !== password) next.confirm = "Passwords do not match";
    if (!agree) next.agree = "Please accept the terms to continue";

    const check = await checkUsernameAvailability(
      username,
      prospectiveUid,
      name || email.split("@")[0] || "lumen",
    );
    setAvailability(check);
    if (!check.available) {
      next.username = check.message;
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    try {
      await signUpWithEmailPassword(email, password, name, check.normalized);
      toast.success(`Account created with Unique ID: ${check.normalized}`);
      nav({ to: "/" });
    } catch (err: any) {
      toast.error(err?.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setLoading(true);
    try {
      let chosenUsername = username.trim();
      if (chosenUsername) {
        const check = await checkUsernameAvailability(chosenUsername, prospectiveUid, name);
        if (!check.available) {
          setAvailability(check);
          setErrors((prev) => ({ ...prev, username: check.message }));
          toast.error("Please select an available Unique User ID variation first");
          setLoading(false);
          return;
        }
        chosenUsername = check.normalized;
      }
      const authed = await signInWithGoogle(true, chosenUsername || undefined);
      if (chosenUsername && typeof window !== "undefined") {
        window.localStorage.setItem(`lumen.username.confirmed.${authed.uid}`, "true");
        toast.success(`Signed up with Google · ID: @${chosenUsername}`);
        nav({ to: "/" });
      } else {
        nav({ to: "/sign-in" });
      }
    } catch (err: any) {
      if (err?.code === "auth/unauthorized-domain") {
        toast.info(
          "Notice: 'nagarajps9894-sketch.github.io' can be authorized in Firebase Console > Authentication > Settings. Redirecting to setup.",
        );
        signIn(email || "google.user@gmail.com", name || "Google User", true);
        nav({ to: "/sign-in" });
      } else {
        toast.error(err?.message || "Google authentication could not be completed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create account" subtitle="Claim your unique User ID & get started">
      <GoogleButton onClick={handleGoogleSignUp} />
      <Divider />
      <form noValidate onSubmit={onSubmit}>
        <Field
          label="Full name"
          icon={User}
          placeholder="Jane Appleseed"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <UniqueUsernameField
          value={username}
          onChange={(val) => {
            setUsername(val);
            if (errors.username) setErrors((prev) => ({ ...prev, username: undefined }));
          }}
          currentUid={prospectiveUid}
          seedHint={name || email.split("@")[0] || "lumen"}
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
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <Field
          label="Confirm password"
          icon={Lock}
          type="password"
          placeholder="Re-enter your password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
        <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="h-4 w-4 rounded accent-foreground"
          />
          <span>I agree to the Terms of Service and Privacy Policy</span>
        </label>
        {errors.agree && <p className="mb-4 text-xs text-destructive">{errors.agree}</p>}
        <InkButton
          type="submit"
          className="mt-4"
          disabled={loading || (Boolean(username.trim()) && availability?.available === false)}
        >
          Create account
        </InkButton>
      </form>
      <p className="mt-8 text-center text-[15px] text-muted-foreground">
        Already have an account?{" "}
        <Link to="/sign-in" className="text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
