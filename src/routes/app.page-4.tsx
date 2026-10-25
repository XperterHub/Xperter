import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/app/page-4")({
  head: () => ({
    meta: [
      { title: "Loop — Coming soon · Lumen" },
      { name: "description", content: "The Loop space in Lumen is coming soon." },
      { property: "og:title", content: "Loop — Coming soon · Lumen" },
      { property: "og:description", content: "The Loop space in Lumen is coming soon." },
    ],
  }),
  component: Page,
});

function Page() {
  return <ComingSoon kind="knot" name="Loop" index="04" />;
}
