import { createFileRoute } from "@tanstack/react-router";
import Screen from "@/screens/Pricing";

export const Route = createFileRoute("/pricing")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Plans & pricing · Vinx" },
      { name: "description", content: "Vinx Free, Pro ($12) and Premium ($20) plans for your second brain." },
      { property: "og:title", content: "Plans & pricing · Vinx" },
      { property: "og:description", content: "Vinx Free, Pro ($12) and Premium ($20) plans for your second brain." },
    ],
  }),
  component: Screen,
});
