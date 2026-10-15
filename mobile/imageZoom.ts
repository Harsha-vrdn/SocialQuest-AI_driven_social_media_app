export type Transform = {scale: number; x: number; y: number};
export type Size = {width: number; height: number};
export type Point = {x: number; y: number};
export const clamp = (value: number, min: number, max: number) => {
  'worklet';
  return Math.min(max, Math.max(min, value));
};

export function containSize(image: Size, viewport: Size): Size {
  const ratio = Math.min(viewport.width / Math.max(1, image.width), viewport.height / Math.max(1, image.height));
  return {width: image.width * ratio, height: image.height * ratio};
}

export function imageRenderLayout(source: Size, viewport: Size, pixelRatio: number) {
  if (![source.width, source.height, viewport.width, viewport.height].every(value => Number.isFinite(value) && value > 0)) return null;
  const fitted = containSize(source, viewport);
  const density = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  // Decode enough real pixels for zoom, then scale down for the initial view.
  // Keep large originals bounded to a 4096 px edge, without enlarging the file.
  const rasterScale = Math.max(1, Math.min(4, source.width / (fitted.width * density), 4096 / (Math.max(fitted.width, fitted.height) * density)));
  return {fitted, raster: {width: fitted.width * rasterScale, height: fitted.height * rasterScale}, displayScale: 1 / rasterScale};
}

export function boundTransform(value: Transform, image: Size, viewport: Size): Transform {
  'worklet';
  const scale = clamp(value.scale, 1, 4);
  const maxX = Math.max(0, (image.width * scale - viewport.width) / 2);
  const maxY = Math.max(0, (image.height * scale - viewport.height) / 2);
  return {scale, x: clamp(value.x, -maxX, maxX), y: clamp(value.y, -maxY, maxY)};
}

// Keep the image point beneath the gesture's focal point under the fingers.
export function focalZoom(start: Transform, scale: number, origin: Point, focal: Point): Transform {
  'worklet';
  const nextScale = clamp(scale, 1, 4), ratio = nextScale / start.scale;
  return {scale: nextScale, x: focal.x - (origin.x - start.x) * ratio, y: focal.y - (origin.y - start.y) * ratio};
}
