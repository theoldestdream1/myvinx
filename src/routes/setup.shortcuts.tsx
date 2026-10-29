import { createFileRoute } from "@tanstack/react-router";
import Screen from "@/screens/SetupShortcuts";

export const Route = createFileRoute("/setup/shortcuts")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set up Siri & shortcuts · Vinx" },
      { name: "description", content: "Set up Hey Siri, Back Tap and other shortcuts for Vinx." },
      { property: "og:title", content: "Set up Siri & shortcuts · Vinx" },
      { property: "og:description", content: "Set up Hey Siri, Back Tap and other shortcuts for Vinx." },
    ],
  }),
  component: Screen,
});
