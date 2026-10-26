import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/app/page-6")({
  head: () => ({
    meta: [
      { title: "Halo — Coming soon · Xperter" },
      { name: "description", content: "The Halo space in Xperter is coming soon." },
      { property: "og:title", content: "Halo — Coming soon · Xperter" },
      { property: "og:description", content: "The Halo space in Xperter is coming soon." },
    ],
  }),
  component: Page,
});

function Page() {
  return <ComingSoon kind="segments" name="Halo" index="06" />;
}
