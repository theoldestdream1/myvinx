import { createFileRoute } from "@tanstack/react-router";
import Screen from "@/screens/Dashboard";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Today · Vinx" },
      { name: "description", content: "Your day at a glance: reminders, recent memories and quick capture." },
      { property: "og:title", content: "Today · Vinx" },
      { property: "og:description", content: "Your day at a glance: reminders, recent memories and quick capture." },
    ],
  }),
  component: Screen,
});
