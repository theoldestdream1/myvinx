import { createFileRoute } from "@tanstack/react-router";
import Screen from "@/screens/Intents";

export const Route = createFileRoute("/intents")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reminders · Vinx" },
      { name: "description", content: "Everything V is reminding you about." },
      { property: "og:title", content: "Reminders · Vinx" },
      { property: "og:description", content: "Everything V is reminding you about." },
    ],
  }),
  component: Screen,
});
