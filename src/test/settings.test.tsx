import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsControl } from "@/components/SettingsControl";
import {
  applyPrefs,
  DEFAULT_PREFS,
  getUserPrefsKey,
  loadPrefs,
  PREFS_KEY,
  syncPrefsForUserSession,
} from "@/lib/prefs";

vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("Minimal appearance settings", () => {
  it("starts in light theme on first visit and persists the light/dark toggle", () => {
    applyPrefs(loadPrefs());
    expect(document.documentElement).not.toHaveClass("dark");
    render(<SettingsControl />);
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    const toggle = screen.getByRole("switch", { name: "Dark theme" });
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    fireEvent.click(toggle);
    expect(loadPrefs().theme).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
    fireEvent.click(toggle);
    expect(loadPrefs().theme).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("keeps the frost slider functional and saves its value", () => {
    render(<SettingsControl />);
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    fireEvent.keyDown(screen.getByRole("slider", { name: "Frost" }), { key: "ArrowRight" });
    expect(loadPrefs().blur).toBe(DEFAULT_PREFS.blur + 1);
    expect(document.documentElement.style.getPropertyValue("--glass-blur")).toBe("27px");
  });

  it("loads existing preferences without losing their frost value and restores user theme after login", () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ blur: 48 }));
    expect(loadPrefs().blur).toBe(48);
    expect(loadPrefs().theme).toBe("light");

    localStorage.setItem(getUserPrefsKey("usr_alice"), JSON.stringify({ theme: "dark", blur: 36 }));
    const synced = syncPrefsForUserSession("usr_alice");
    expect(synced.theme).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("dismisses the anchored settings and restores trigger focus", async () => {
    render(<SettingsControl />);
    const trigger = screen.getByRole("button", { name: "Open settings" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("triggers a subtle haptic pulse via the Vibration API when opened and closed", () => {
    const vibrateMock = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });

    render(<SettingsControl />);
    const trigger = screen.getByRole("button", { name: "Open settings" });
    fireEvent.click(trigger);
    expect(vibrateMock).toHaveBeenCalledWith(10);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss settings" }));
    expect(vibrateMock).toHaveBeenCalledWith(8);
  });
});