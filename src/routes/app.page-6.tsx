import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/app/page-6")({
  head: () => ({
    meta: [
      { title: "Halo — Coming soon · Lumen" },
      { name: "description", content: "The Halo space in Lumen is coming soon." },
      { property: "og:title", content: "Halo — Coming soon · Lumen" },
      { property: "og:description", content: "The Halo space in Lumen is coming soon." },
    ],
  }),
  component: Page,
});

function Page() {
  return <ComingSoon kind="segments" name="Halo" index="06" />;
}
