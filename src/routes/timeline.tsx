import { createFileRoute } from "@tanstack/react-router";
import Screen from "@/screens/Timeline";

export const Route = createFileRoute("/timeline")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Timeline · Vinx" },
      { name: "description", content: "Everything you've saved, over time." },
      { property: "og:title", content: "Timeline · Vinx" },
      { property: "og:description", content: "Everything you've saved, over time." },
    ],
  }),
  component: Screen,
});
