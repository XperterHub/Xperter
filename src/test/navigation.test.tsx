import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  useRouterState: () => "/app/page-3",
  useNavigate: () => vi.fn(),
  Outlet: () => <div>Page content</div>,
  Link: ({ children, to, activeProps: _activeProps, ...props }: any) => <a href={to} {...props}>{children}</a>,
}));
vi.mock("@/components/SilkBackground", () => ({ SilkBackground: () => null }));
vi.mock("@/components/BrandMark", () => ({ BrandMark: () => <span>Xperter</span> }));
vi.mock("@/components/SettingsControl", () => ({
  SettingsControl: () => null,
  triggerSettingsHaptic: () => {},
  playSettingsLiquidSound: () => {},
}));

import { AppShell } from "@/routes/app";

describe("Overlay navigation", () => {
  it("starts closed and opens outside the main content", () => {
    const { container } = render(<AppShell />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(container.querySelector("main")?.contains(screen.getByRole("dialog"))).toBe(false);
  });

  it("retracts on the close button and returns focus to the opener", async () => {
    render(<AppShell />);
    const opener = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("retracts when a destination is selected", () => {
    render(<AppShell />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    fireEvent.click(screen.getByRole("link", { name: /Messages/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});