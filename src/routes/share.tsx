import { createFileRoute } from "@tanstack/react-router";
import Screen from "@/screens/Share";

export const Route = createFileRoute("/share")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Saved to V · Vinx" },
      { name: "description", content: "Save something shared from another app." },
      { property: "og:title", content: "Saved to V · Vinx" },
      { property: "og:description", content: "Save something shared from another app." },
    ],
  }),
  component: Screen,
});
