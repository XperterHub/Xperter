import { useState, type ReactNode, type InputHTMLAttributes } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { SilkBackground } from "@/components/SilkBackground";
import { BrandIcon } from "@/components/BrandMark";
import { GlassCard } from "@/components/GlassCard";

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <SilkBackground />
      <GlassCard
        variant="default"
        padding="lg"
        className="animate-liquid w-full max-w-[470px]"
      >
        <div className="flex justify-center"><BrandIcon size={62} /></div>
        <h1 className="mt-5 text-center text-2xl font-normal text-foreground sm:mt-6 sm:text-[1.75rem]">{title}</h1>
        <p className="mt-1.5 text-center text-sm text-muted-foreground sm:text-[15px]">{subtitle}</p>
        <div className="mt-7 sm:mt-9">{children}</div>
      </GlassCard>
    </main>
  );
}

export function Field({ label, icon: Icon, type = "text", error, ...rest }: { label: string; icon: LucideIcon; error?: string | undefined } & InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  const isPw = type === "password";
  return (
    <div className="mb-5">
      <label className="mb-2 block text-sm text-foreground">
        {label}
        <div className="glass-input mt-2 flex h-[52px] items-center gap-3 rounded-xl px-4 focus-within:ring-2 focus-within:ring-ring/40">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input {...rest} type={isPw && show ? "text" : type} className="w-full bg-transparent text-[15px] outline-none placeholder:text-faint" />
          {isPw && (
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="text-muted-foreground hover:text-foreground">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
      </label>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function InkButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`btn-ink liquid-press h-[52px] w-full rounded-full text-[15px] font-medium disabled:opacity-60 ${rest.className ?? ""}`}>
      {children}
    </button>
  );
}

export function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="glass-input flex h-[52px] w-full items-center justify-center gap-3 rounded-xl text-[15px] text-foreground transition-colors hover:bg-glass-strong">
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
      Continue with Google
    </button>
  );
}

export function Divider() {
  return (
    <div className="my-7 flex items-center gap-4 text-sm text-muted-foreground">
      <span className="h-px flex-1 bg-faint/40" />or continue with<span className="h-px flex-1 bg-faint/40" />
    </div>
  );
}
