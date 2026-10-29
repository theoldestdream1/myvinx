import { createFileRoute } from "@tanstack/react-router";
import Screen from "@/screens/Index";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Vinx: remember everything, find it by describing it" },
      { name: "description", content: "Save notes, voice memos and screenshots in seconds. Later, describe what you remember, even vaguely, and Vinx finds it." },
      { property: "og:title", content: "Vinx: remember everything, find it by describing it" },
      { property: "og:description", content: "Save notes, voice memos and screenshots in seconds. Later, describe what you remember, even vaguely, and Vinx finds it." },
    ],
  }),
  component: Screen,
});
