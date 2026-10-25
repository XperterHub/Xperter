import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import gsap from "gsap";
import { SilkBackground } from "@/components/SilkBackground";
import { BrandMark } from "@/components/BrandMark";
import { SettingsControl } from "@/components/SettingsControl";
import { useAuthState } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lumen — Conversations, cast in chrome" },
      {
        name: "description",
        content:
          "An immersive chrome-and-glass workspace for instant threads, live polls, voice rooms, and encrypted notes.",
      },
      { property: "og:title", content: "Lumen — Conversations, cast in chrome" },
      {
        property: "og:description",
        content:
          "An immersive chrome-and-glass workspace for instant threads, live polls, voice rooms, and encrypted notes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const rootRef = useRef<HTMLDivElement>(null);
  const navPillRef = useRef<HTMLElement>(null);
  const { user } = useAuthState();

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".animate-rise",
        { opacity: 0, y: 18, filter: "blur(6px)" },
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.9,
          stagger: 0.12,
          ease: "power3.out",
        }
      );
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} className="min-h-dvh overflow-hidden text-foreground">
      <SilkBackground />

      {/* Top Navigation Bar — Combined Nav Pill */}
      <header className="fixed inset-x-0 top-0 z-50 mx-auto flex max-w-7xl items-center justify-center px-4 py-3.5 sm:px-6 sm:py-4 lg:px-10 lg:py-5">
        <nav
          ref={navPillRef}
          className="glass flex items-center gap-2 rounded-full p-1.5 pl-2 text-sm"
        >
          <BrandMark />
          <span aria-hidden="true" className="h-4 w-px bg-glass-edge" />
          <Link
            to={user ? "/welcome" : "/sign-in"}
            className="liquid-press whitespace-nowrap rounded-full px-3.5 py-1.5 hover:bg-glass-strong md:px-4 md:py-2"
          >
            {user ? "Account" : "Sign in"}
          </Link>
          <SettingsControl
            className="h-9.5 w-9.5"
            side="bottom"
            align="end"
            sideOffset={12}
          />
        </nav>
      </header>

      {/* Focused Single-Screen Hero Section */}
      <section className="relative mx-auto flex min-h-dvh max-w-7xl flex-col items-center justify-center px-5 pt-24 pb-16 sm:px-8 lg:px-10">
        <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center rounded-[2.25rem] border border-solid border-glass-edge px-6 py-10 text-center sm:px-12 sm:py-14">
          <h1 className="animate-rise text-2xl font-light tracking-[-0.03em] leading-[1.18] sm:text-4xl md:text-5xl lg:text-[3.25rem]">
            <span className="block sm:whitespace-nowrap">
              Instant threads, live polls, voice rooms &amp; vault
            </span>
            <span className="mt-1.5 block text-muted-foreground sm:whitespace-nowrap">
              unified in one distraction-free team workspace.
            </span>
          </h1>

          <div className="animate-rise mt-8 flex items-center justify-center">
            <Link
              to={user ? "/app/messages" : "/sign-in"}
              className="btn-ink liquid-press inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium"
            >
              <span>Launch workspace</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
