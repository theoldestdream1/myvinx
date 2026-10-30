import { createFileRoute } from "@tanstack/react-router";
import Screen from "@/screens/Timeline";

export const Route = createFileRoute("/timeline")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Timeline · Vinx" },
      { name: "description", content: "Everything you've saved, over time." },
      { property: "og:title", content: "Timeline · Vinx" },
      { property: "og:description", content: "Everything you've saved, over time." },
    ],
  }),
  component: Screen,
});
