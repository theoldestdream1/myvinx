import { createFileRoute } from "@tanstack/react-router";
import Screen from "@/screens/Auth";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in · Vinx" },
      { name: "description", content: "Sign in or create your Vinx account." },
      { property: "og:title", content: "Sign in · Vinx" },
      { property: "og:description", content: "Sign in or create your Vinx account." },
    ],
  }),
  component: Screen,
});
