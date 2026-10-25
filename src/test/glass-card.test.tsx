import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GlassCard } from "@/components/GlassCard";

describe("GlassCard component", () => {
  it("applies the glass utility class and default responsive styling", () => {
    render(<GlassCard data-testid="glass-card">Section content</GlassCard>);
    const card = screen.getByTestId("glass-card");
    expect(card).toHaveClass("glass");
    expect(card).toHaveTextContent("Section content");
  });

  it("supports custom semantic elements via the as prop", () => {
    render(
      <GlassCard as="section" variant="panel" padding="sm" aria-label="Workspace section">
        Panel body
      </GlassCard>,
    );
    const section = screen.getByRole("region", { name: "Workspace section" });
    expect(section.tagName).toBe("SECTION");
    expect(section).toHaveClass("glass");
  });
});
