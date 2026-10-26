import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout, Field, InkButton } from "@/components/auth/AuthUI";
import { getRememberedEmail, sendPasswordReset } from "@/lib/auth";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Xperter" },
      { name: "description", content: "Reset the password for your Xperter account." },
      { property: "og:title", content: "Reset password — Xperter" },
      { property: "og:description", content: "Reset the password for your Xperter account." },
    ],
  }),
  component: Forgot,
});

function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const savedEmail = getRememberedEmail();
    if (savedEmail) {
      setEmail((prev) => prev || savedEmail);
    }
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErr("Enter a valid email address");
      return;
    }
    setErr("");
    setSubmitting(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
      toast.success("Password reset link sent to your email");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title={sent ? "Check your inbox" : "Reset password"}
      subtitle={
        sent
          ? `If an account exists for ${email.trim()}, a password reset link is on its way.`
          : "Enter the email linked to your account"
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-6">
          <CheckCircle2 className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <Link to="/sign-in" className="w-full">
            <InkButton>Back to sign in</InkButton>
          </Link>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Try another email address
          </button>
        </div>
      ) : (
        <form noValidate onSubmit={handleReset}>
          <Field
            label="Email address"
            icon={Mail}
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (err) setErr("");
            }}
            error={err}
          />
          <InkButton type="submit" className="mt-2" disabled={submitting}>
            {submitting ? "Sending reset link…" : "Send reset link"}
          </InkButton>
          <p className="mt-8 text-center text-[15px] text-foreground">
            <Link to="/sign-in" className="hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
