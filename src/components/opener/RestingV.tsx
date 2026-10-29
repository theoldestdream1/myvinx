import { useEffect, useRef, useState } from "react";
import vSit from "@/assets/v-sit.png";
import { REST, restHeight } from "./restingV";

/** V sitting in the corner of the landing page. Stays put while you scroll and leans with it. */
export function RestingV() {
  const [h, setH] = useState(restHeight());
  const [lean, setLean] = useState(0);
  const [bubble, setBubble] = useState(false);
  const lastY = useRef(0);
  const settle = useRef<number | undefined>(undefined);

  useEffect(() => {
    lastY.current = scrollY;
    const onScroll = () => {
      const dy = scrollY - lastY.current;
      lastY.current = scrollY;
      setLean(Math.max(-10, Math.min(10, dy * 0.6)));
      clearTimeout(settle.current);
      settle.current = window.setTimeout(() => setLean(0), 160);
    };
    const onResize = () => setH(restHeight());
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onResize);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("resize", onResize); clearTimeout(settle.current); };
  }, []);

  return (
    <div className="fixed z-40" style={{ right: REST.margin, bottom: REST.margin, height: h, width: h * REST.aspect }}>
      {bubble && (
        <div className="v-opener-caption absolute bottom-full right-0 mb-2 w-48 rounded-2xl border border-border bg-card/90 px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur">
          I'm watching everything. Sign in and I'll start remembering for you.
        </div>
      )}
      <button
        type="button"
        aria-label="V, your Vinx guide"
        onClick={() => setBubble((b) => !b)}
        className="h-full w-full"
        style={{ transform: `rotate(${lean}deg) translateY(${Math.abs(lean) * -0.6}px)`, transition: "transform 380ms cubic-bezier(.34,1.56,.64,1)" }}
      >
        <img src={vSit} alt="V sitting" className="v-rest-bob h-full w-full object-contain drop-shadow-[0_6px_18px_oklch(0.7_0.12_240/0.35)]" />
      </button>
    </div>
  );
}

export default RestingV;
