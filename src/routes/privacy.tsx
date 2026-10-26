import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Shield, Lock, Eye, RefreshCw, Mail } from "lucide-react";
import { SilkBackground } from "@/components/SilkBackground";
import { BrandMark } from "@/components/BrandMark";
import { SettingsControl } from "@/components/SettingsControl";
import { APP_NAME } from "@/lib/config";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: `Privacy Policy — ${APP_NAME}` },
      {
        name: "description",
        content: `Privacy Policy and data protection details for ${APP_NAME} workspace.`,
      },
      { property: "og:title", content: `Privacy Policy — ${APP_NAME}` },
      {
        property: "og:description",
        content: `Privacy Policy and data protection details for ${APP_NAME} workspace.`,
      },
    ],
  }),
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  const lastUpdated = "October 26, 2026";

  return (
    <div className="min-h-dvh overflow-x-hidden text-foreground">
      <SilkBackground />

      {/* Top Header */}
      <header className="fixed inset-x-0 top-0 z-50 mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 sm:py-4 lg:px-10 lg:py-5">
        <BrandMark />
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="glass flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium hover:bg-glass-strong sm:text-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Home</span>
          </Link>
          <SettingsControl
            className="h-9.5 w-9.5"
            side="bottom"
            align="end"
            sideOffset={12}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="relative mx-auto max-w-3xl px-5 pt-28 pb-20 sm:px-8">
        <div className="glass rounded-[2rem] border border-glass-edge p-6 sm:p-10 shadow-glass">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-glass border border-glass-edge text-foreground">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Privacy Policy
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Last updated: {lastUpdated} · Effective immediately
              </p>
            </div>
          </div>

          <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
            <section>
              <h2 className="text-base font-semibold text-foreground mb-2 flex items-center gap-2">
                <Lock className="h-4 w-4 text-foreground/80" />
                1. Overview
              </h2>
              <p>
                {APP_NAME} (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is committed to
                protecting your privacy. This Privacy Policy explains how we collect, use,
                and safeguard your information when you access or use our web platform and services.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2 flex items-center gap-2">
                <Eye className="h-4 w-4 text-foreground/80" />
                2. Information We Collect
              </h2>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong className="text-foreground font-medium">Authentication Data:</strong> When
                  you sign in with Google or create an account, we collect your name, email address,
                  profile photo URL, and unique authentication identifier.
                </li>
                <li>
                  <strong className="text-foreground font-medium">Workspace Content:</strong> Messages,
                  workspace notes, preferences, and workspace metadata you create within the app.
                </li>
                <li>
                  <strong className="text-foreground font-medium">Usage Information:</strong> Device
                  information, browser type, and interaction timestamps strictly used for reliability
                  and performance.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2 flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-foreground/80" />
                3. How We Use Google User Data
              </h2>
              <p className="mb-2">
                Our application accesses only the standard, non-sensitive Google OAuth scopes
                (<code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">email</code>,
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">profile</code>,
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">openid</code>).
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>We use this data solely to authenticate your identity and set up your workspace profile.</li>
                <li>We do <strong className="text-foreground font-medium">not</strong> sell, rent, or trade Google user data to third parties.</li>
                <li>We do <strong className="text-foreground font-medium">not</strong> use your personal data for advertising or marketing profiling.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                4. Data Storage and Security
              </h2>
              <p>
                Your data is stored and secured using industry-standard protocols on Firebase and Google Cloud
                infrastructure. All transmissions are protected with end-to-end TLS encryption.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                5. Data Retention and Deletion
              </h2>
              <p>
                You may request deletion of your account and associated workspace data at any time by
                contacting our support team. Upon verification, all your personal information and
                messages will be permanently purged within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2 flex items-center gap-2">
                <Mail className="h-4 w-4 text-foreground/80" />
                6. Contact Information
              </h2>
              <p>
                If you have questions regarding this Privacy Policy or your data, please contact our
                support team at:
              </p>
              <p className="mt-2 text-foreground font-medium">
                Email: <a href="mailto:nagarajamutha0@gmail.com" className="underline hover:text-primary">nagarajamutha0@gmail.com</a>
              </p>
            </section>
          </div>

          <div className="mt-10 pt-6 border-t border-glass-edge flex items-center justify-between text-xs text-muted-foreground">
            <Link to="/terms" className="hover:underline">
              Terms of Service
            </Link>
            <Link to="/" className="hover:underline">
              Return to {APP_NAME}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
