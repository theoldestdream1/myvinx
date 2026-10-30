import { createFileRoute } from "@tanstack/react-router";
import Screen from "@/screens/Capture";

export const Route = createFileRoute("/capture")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Capture · Vinx" },
      { name: "description", content: "Save a note, voice memo or screenshot to V." },
      { property: "og:title", content: "Capture · Vinx" },
      { property: "og:description", content: "Save a note, voice memo or screenshot to V." },
    ],
  }),
  component: Screen,
});
