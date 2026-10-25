import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Menu, PanelLeftClose, User } from "lucide-react";
import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { SilkBackground } from "@/components/SilkBackground";
import { BrandMark } from "@/components/BrandMark";
import { SettingsControl } from "@/components/SettingsControl";
import { WorkspaceInboxControl } from "@/components/WorkspaceInboxControl";
import { APP_PAGES, type GlyphKind } from "@/lib/config";

export const Route = createFileRoute("/app")({
  component: AppShell,
});

function WorkspaceNavIcon({ kind }: { kind: GlyphKind }) {
  switch (kind) {
    case "messages":
      return (
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0" fill="none" aria-hidden="true">
          <path d="M17.2 5.2A8.5 8.5 0 1 0 18.8 16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M14.8 8.3A5.3 5.3 0 1 0 15.8 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.78" />
          <circle cx="11.8" cy="12" r="2.1" fill="currentColor" fillOpacity="0.88" />
        </svg>
      );
    case "rings":
      return (
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
          <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.55" strokeOpacity="0.68" />
          <circle cx="12" cy="12" r="2.2" fill="currentColor" />
        </svg>
      );
    case "cross":
      return (
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0" fill="none" aria-hidden="true">
          <path d="M5.5 5.5L18.5 18.5M18.5 5.5L5.5 18.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M5.5 10V5.5H10M14 5.5H18.5V10M18.5 14V18.5H14M10 18.5H5.5V14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "knot":
      return (
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0" fill="none" aria-hidden="true">
          <rect x="4" y="4" width="6.5" height="6.5" rx="2.2" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.7" />
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="2.2" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.7" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="2.2" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.7" />
          <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2.2" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      );
    case "square":
      return (
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0" fill="none" aria-hidden="true">
          <path d="M8.2 3.8H15.8L20.2 8.2V15.8L15.8 20.2H8.2L3.8 15.8V8.2L8.2 3.8Z" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          <path d="M12 3.8V9.2M12 14.8V20.2M3.8 12H9.2M14.8 12H20.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="12" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "segments":
    default:
      return (
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0" fill="none" aria-hidden="true">
          <path d="M9.5 4.2A8.2 8.2 0 0 0 4.2 9.5" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
          <path d="M14.5 4.2A8.2 8.2 0 0 1 19.8 9.5" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
          <path d="M19.8 14.5A8.2 8.2 0 0 1 14.5 19.8" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
          <path d="M4.2 14.5A8.2 8.2 0 0 0 9.5 19.8" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
          <circle cx="12" cy="12" r="3.2" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      );
  }
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const navFooterRef = useRef<HTMLDivElement>(null);
  const path = useRouterState({ select: (r) => r.location.pathname });
  const activeIndex = Math.max(0, APP_PAGES.findIndex((p) => path.startsWith(p.to)));
  return (
    <div className="h-dvh p-2.5 text-foreground sm:p-3 md:p-4">
      <SilkBackground />
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation" title="Open navigation" className="glass liquid-press fixed left-5 top-5 z-30 h-10 w-10 rounded-full sm:left-6 sm:top-6 sm:h-11 sm:w-11">
            <Menu className="h-4 w-4" />
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="workspace-nav-overlay fixed inset-0 z-40" />
          <Dialog.Content aria-describedby={undefined} className="workspace-nav-panel glass fixed inset-y-2.5 left-2.5 z-50 flex w-72 max-w-[calc(100vw-1.25rem)] flex-col rounded-[1.5rem] p-4 text-foreground outline-none sm:inset-y-3 sm:left-3 sm:rounded-[1.75rem] md:inset-y-4 md:left-4">
            <Dialog.Title className="sr-only">Workspace navigation</Dialog.Title>
            <div className="flex items-center justify-between gap-3 px-1 py-1">
              <BrandMark />
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Close navigation" title="Close navigation" className="liquid-press shrink-0 rounded-full"><PanelLeftClose /></Button>
              </Dialog.Close>
            </div>
            <nav className="glass-scroll relative mt-8 flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden" aria-label="Workspace">
              <span aria-hidden className="btn-ink pointer-events-none absolute inset-x-0 top-0 h-12 rounded-2xl transition-transform duration-700 ease-[cubic-bezier(0.34,1.45,0.64,1)]" style={{ transform: `translateY(${activeIndex * 54}px)` }} />
              {APP_PAGES.map((p) => (
                <Link key={p.to} to={p.to} onClick={() => setOpen(false)}
                  className="relative mb-1.5 flex h-12 items-center gap-3.5 rounded-2xl px-4 text-lg font-medium tracking-[-0.015em] text-muted-foreground transition-transform duration-500 hover:translate-x-1 hover:text-foreground"
                  activeProps={{ className: "!text-primary-foreground hover:!translate-x-0" }}>
                  <WorkspaceNavIcon kind={p.glyph as GlyphKind} />
                  <span className="flex-1 truncate">{p.label}</span>
                </Link>
              ))}
            </nav>
            <div ref={navFooterRef} className="mt-3 flex items-center justify-between gap-2 pt-2">
              <Link
                to="/welcome"
                onClick={() => setOpen(false)}
                className="glass liquid-press inline-flex h-11 items-center gap-2.5 rounded-full pl-2.5 pr-4 text-sm font-medium text-foreground/90 transition-colors hover:bg-glass-strong hover:text-foreground"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/10 text-foreground">
                  <User className="h-3.5 w-3.5" strokeWidth={2} />
                </span>
                <span>Account</span>
              </Link>
              <div className="flex items-center gap-2">
                <WorkspaceInboxControl onRequestCloseSidebar={() => setOpen(false)} />
                <SettingsControl
                  side="top"
                  align="end"
                  sideOffset={12}
                  collisionPadding={12}
                  popoverClassName="w-64 max-w-[calc(100vw-2.5rem)]"
                />
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <main className="h-full min-w-0"><div key={path} className="animate-liquid h-full"><Outlet /></div></main>
    </div>
  );
}
