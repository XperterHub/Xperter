import { createFileRoute } from "@tanstack/react-router";
import { TodoView } from "@/components/task-page";

export const Route = createFileRoute("/app/page-3")({
  head: () => ({
    meta: [
      { title: "Task — Xperter" },
      { name: "description", content: "Personal task and habit management with offline AI auto-planner in Xperter." },
      { property: "og:title", content: "Task — Xperter" },
      { property: "og:description", content: "Personal task and habit management with offline AI auto-planner in Xperter." },
    ],
  }),
  component: Page,
});

function Page() {
  return <TodoView />;
}
