import sharp from "sharp";

/** Deterministic, visually distinct test pictures (so duplicate detection does not fire between them). */
export async function fakeGarment(seed: number, base: string): Promise<Buffer> {
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const rects = Array.from({ length: 14 }, () => {
    const x = Math.floor(rnd() * 360);
    const y = Math.floor(rnd() * 460);
    const w = 30 + Math.floor(rnd() * 160);
    const h = 30 + Math.floor(rnd() * 200);
    const c = Math.floor(rnd() * 255);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgb(${c},${255 - c},${Math.floor(rnd() * 255)})"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="${base}"/>${rects}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
