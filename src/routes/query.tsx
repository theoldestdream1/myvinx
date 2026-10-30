import { createFileRoute } from "@tanstack/react-router";
import Screen from "@/screens/Query";

export const Route = createFileRoute("/query")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Ask your memory · Vinx" },
      { name: "description", content: "Describe what you remember and V finds it." },
      { property: "og:title", content: "Ask your memory · Vinx" },
      { property: "og:description", content: "Describe what you remember and V finds it." },
    ],
  }),
  component: Screen,
});
