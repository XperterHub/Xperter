import { useEffect, useState } from "react";
import { AtSign, CheckCircle2, AlertCircle, Shuffle, Loader2 } from "lucide-react";
import { checkUsernameAvailability, type UsernameAvailabilityStatus } from "@/lib/auth";
import {
  formatVaultFolderName,
  generateUsernameSuggestions,
  sanitizeUsernameId,
} from "@/lib/username-id";

interface UniqueUsernameFieldProps {
  value: string;
  onChange: (nextValue: string) => void;
  currentUid?: string;
  seedHint?: string;
  error?: string;
  onAvailabilityChange?: (status: UsernameAvailabilityStatus) => void;
  compact?: boolean;
}

export function UniqueUsernameField({
  value,
  onChange,
  currentUid,
  seedHint,
  error,
  onAvailabilityChange,
  compact = false,
}: UniqueUsernameFieldProps) {
  const [status, setStatus] = useState<UsernameAvailabilityStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setStatus(null);
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);

    const timer = setTimeout(async () => {
      try {
        const res = await checkUsernameAvailability(
          trimmed,
          currentUid,
          seedHint || trimmed,
        );
        if (!cancelled) {
          setStatus(res);
          onAvailabilityChange?.(res);
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, currentUid, seedHint]);

  const handleRandomize = async () => {
    const baseSeed = seedHint || value || "lumen_user";
    const suggestions = generateUsernameSuggestions(
      baseSeed,
      status?.normalized ? [status.normalized] : [],
      4,
    );
    const picked = suggestions[0] || `user_${Math.floor(Math.random() * 899 + 100)}`;
    onChange(picked);
  };

  const normalizedPreview = sanitizeUsernameId(value);
  const folderPreview = normalizedPreview ? formatVaultFolderName(normalizedPreview) : "username_doc";

  return (
    <div className={compact ? "space-y-2" : "mb-5 space-y-2"}>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor="unique-username-input"
          className="text-xs font-medium text-foreground"
        >
          Username ID
        </label>
        <button
          type="button"
          onClick={handleRandomize}
          data-testid="username-randomizer-btn"
          title="Generate an available username variation"
          className="glass-pill liquid-press inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-glass-strong"
        >
          <Shuffle className="h-3 w-3" />
          <span>Randomize ID</span>
        </button>
      </div>

      <div
        className={`glass-input flex ${
          compact ? "h-10" : "h-11"
        } items-center gap-2.5 rounded-xl px-3.5 focus-within:ring-1 focus-within:ring-primary/40`}
      >
        <AtSign className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          id="unique-username-input"
          data-testid="unique-username-input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter username ID"
          aria-label="Username ID"
          className="w-full min-w-0 bg-transparent font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted-foreground"
        />
        {checking ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : status ? (
          status.available ? (
            <CheckCircle2
              aria-label="Username available"
              className="h-4 w-4 shrink-0 text-emerald-500 dark:text-emerald-400"
            />
          ) : (
            <AlertCircle
              aria-label="Username unavailable"
              className="h-4 w-4 shrink-0 text-rose-500 dark:text-rose-400"
            />
          )
        ) : null}
      </div>

      {/* Live status text only (no colored background box) */}
      {status && (
        <div
          data-testid="username-availability-status"
          className="flex flex-col gap-1 text-xs transition-opacity duration-300"
        >
          <div className="flex items-center justify-between">
            <span
              className={`font-mono text-xs font-medium lowercase tracking-wide transition-colors duration-200 ${
                status.available
                  ? "text-emerald-500 dark:text-emerald-400"
                  : "text-rose-500 dark:text-rose-400"
              }`}
            >
              {status.available ? "available" : "occupied"}
            </span>
          </div>

          {!status.available && status.suggestions.length > 0 && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Try:</span>
              {status.suggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => onChange(sug)}
                  data-testid={`username-suggestion-${sug}`}
                  className="glass-pill liquid-press rounded-full px-2 py-0.5 font-mono text-[11px] text-foreground transition-colors hover:bg-glass-strong"
                >
                  {sug}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
