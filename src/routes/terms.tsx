import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileText, CheckCircle2 } from "lucide-react";
import { SilkBackground } from "@/components/SilkBackground";
import { BrandMark } from "@/components/BrandMark";
import { SettingsControl } from "@/components/SettingsControl";
import { APP_NAME } from "@/lib/config";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: `Terms of Service — ${APP_NAME}` },
      {
        name: "description",
        content: `Terms of Service and acceptable use policies for ${APP_NAME}.`,
      },
      { property: "og:title", content: `Terms of Service — ${APP_NAME}` },
    ],
  }),
  component: TermsOfService,
});

function TermsOfService() {
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
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Terms of Service
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Last updated: {lastUpdated} · Effective immediately
              </p>
            </div>
          </div>

          <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                1. Acceptance of Terms
              </h2>
              <p>
                By signing in, accessing, or using {APP_NAME}, you agree to be bound by these
                Terms of Service. If you do not agree with any part of these terms, you may not
                access the service.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                2. User Accounts &amp; Authentication
              </h2>
              <p>
                You are responsible for maintaining the confidentiality of your credentials and
                account security. You agree to notify us immediately of any unauthorized access
                or security breach.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                3. Acceptable Use
              </h2>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>You agree not to misuse, disrupt, or compromise the integrity of the workspace.</li>
                <li>You agree not to transmit illegal, malicious, or abusive content.</li>
                <li>We reserve the right to suspend accounts that violate these security conditions.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-foreground mb-2">
                4. Contact
              </h2>
              <p>
                Inquiries regarding these terms can be directed to:{" "}
                <a href="mailto:nagarajamutha0@gmail.com" className="underline hover:text-primary">
                  nagarajamutha0@gmail.com
                </a>
              </p>
            </section>
          </div>

          <div className="mt-10 pt-6 border-t border-glass-edge flex items-center justify-between text-xs text-muted-foreground">
            <Link to="/privacy" className="hover:underline">
              Privacy Policy
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
