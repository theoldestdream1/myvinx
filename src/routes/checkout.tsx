import { createFileRoute } from "@tanstack/react-router";
import Screen from "@/screens/Checkout";

export const Route = createFileRoute("/checkout")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Checkout · Vinx" },
      { name: "description", content: "Choose how to pay for your Vinx plan: Paystack or Lemon Squeezy." },
      { property: "og:title", content: "Checkout · Vinx" },
      { property: "og:description", content: "Choose how to pay for your Vinx plan: Paystack or Lemon Squeezy." },
    ],
  }),
  component: Screen,
});
