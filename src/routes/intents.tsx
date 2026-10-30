import { createFileRoute } from "@tanstack/react-router";
import Screen from "@/screens/Intents";

export const Route = createFileRoute("/intents")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Reminders · Vinx" },
      { name: "description", content: "Everything V is reminding you about." },
      { property: "og:title", content: "Reminders · Vinx" },
      { property: "og:description", content: "Everything V is reminding you about." },
    ],
  }),
  component: Screen,
});
