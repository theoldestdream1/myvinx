// Shared geometry so the opener's flight lands exactly where the resting V sits.
export const REST = { margin: 14, flyMs: 1300, aspect: 530 / 974 };

export function restHeight() {
  return typeof window !== "undefined" && window.innerWidth < 640 ? 96 : 128;
}

function restBottom() {
  // Resolve the same CSS safe-area offset used by V and her return button.
  const probe = document.createElement("span");
  probe.className = "v-landing-seat";
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const bottom = parseFloat(getComputedStyle(probe).bottom);
  probe.remove();
  return Number.isFinite(bottom) ? bottom : window.innerWidth < 640 ? 76 : REST.margin;
}

export function restRect() {
  const height = restHeight();
  const width = height * REST.aspect;
  return {
    left: window.innerWidth - REST.margin - width,
    top: window.innerHeight - restBottom() - height,
    width,
    height,
  };
}
