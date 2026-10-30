import { createFileRoute } from "@tanstack/react-router";
import Screen from "@/screens/Quick";

export const Route = createFileRoute("/quick")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Quick note · Vinx" },
      { name: "description", content: "The fastest way to tell V something." },
      { property: "og:title", content: "Quick note · Vinx" },
      { property: "og:description", content: "The fastest way to tell V something." },
    ],
  }),
  component: Screen,
});
