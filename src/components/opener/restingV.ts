// Shared geometry so the opener's flight lands exactly where the resting V sits.
export const REST = { margin: 14, flyMs: 1300, aspect: 530 / 974 };

export function restHeight() {
  return typeof window !== "undefined" && window.innerWidth < 640 ? 96 : 128;
}

export function restRect() {
  const height = restHeight();
  const width = height * REST.aspect;
  return {
    left: window.innerWidth - REST.margin - width,
    top: window.innerHeight - REST.margin - height,
    width,
    height,
  };
}
