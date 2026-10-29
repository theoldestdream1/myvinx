import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import Screen from "@/screens/Index";
import { VOpener, shouldShowOpener } from "@/components/opener/VOpener";

function Landing() {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(shouldShowOpener()); }, []);
  return (
    <>
      <Screen />
      {show && <VOpener onDone={() => setShow(false)} />}
    </>
  );
}

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Vinx: remember everything, find it by describing it" },
      { name: "description", content: "Save notes, voice memos and screenshots in seconds. Later, describe what you remember, even vaguely, and Vinx finds it." },
      { property: "og:title", content: "Vinx: remember everything, find it by describing it" },
      { property: "og:description", content: "Save notes, voice memos and screenshots in seconds. Later, describe what you remember, even vaguely, and Vinx finds it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});
