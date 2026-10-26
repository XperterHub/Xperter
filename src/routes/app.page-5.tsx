import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/app/page-5")({
  head: () => ({
    meta: [
      { title: "Facet — Coming soon · Xperter" },
      { name: "description", content: "The Facet space in Xperter is coming soon." },
      { property: "og:title", content: "Facet — Coming soon · Xperter" },
      { property: "og:description", content: "The Facet space in Xperter is coming soon." },
    ],
  }),
  component: Page,
});

function Page() {
  return <ComingSoon kind="square" name="Facet" index="05" />;
}
