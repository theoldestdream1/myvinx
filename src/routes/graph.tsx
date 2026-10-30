import { createFileRoute } from "@tanstack/react-router";
import Screen from "@/screens/Graph";

export const Route = createFileRoute("/graph")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "People & things · Vinx" },
      { name: "description", content: "The people, places and topics in your memories." },
      { property: "og:title", content: "People & things · Vinx" },
      { property: "og:description", content: "The people, places and topics in your memories." },
    ],
  }),
  component: Screen,
});
