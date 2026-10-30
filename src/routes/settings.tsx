import { createFileRoute } from "@tanstack/react-router";
import Screen from "@/screens/Settings";

export const Route = createFileRoute("/settings")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Settings · Vinx" },
      { name: "description", content: "Notifications, V, quick capture, Telegram, email and calendar." },
      { property: "og:title", content: "Settings · Vinx" },
      { property: "og:description", content: "Notifications, V, quick capture, Telegram, email and calendar." },
    ],
  }),
  component: Screen,
});
