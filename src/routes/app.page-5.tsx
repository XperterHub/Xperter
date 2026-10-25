import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/app/page-5")({
  head: () => ({
    meta: [
      { title: "Facet — Coming soon · Lumen" },
      { name: "description", content: "The Facet space in Lumen is coming soon." },
      { property: "og:title", content: "Facet — Coming soon · Lumen" },
      { property: "og:description", content: "The Facet space in Lumen is coming soon." },
    ],
  }),
  component: Page,
});

function Page() {
  return <ComingSoon kind="square" name="Facet" index="05" />;
}
