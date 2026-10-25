import { createFileRoute } from "@tanstack/react-router";
import { TodoView } from "@/components/task-page";

export const Route = createFileRoute("/app/page-3")({
  head: () => ({
    meta: [
      { title: "Task — Lumen" },
      { name: "description", content: "Personal task and habit management with offline AI auto-planner in Lumen." },
      { property: "og:title", content: "Task — Lumen" },
      { property: "og:description", content: "Personal task and habit management with offline AI auto-planner in Lumen." },
    ],
  }),
  component: Page,
});

function Page() {
  return <TodoView />;
}
