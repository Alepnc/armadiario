import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ImageError, processImage } from "@/lib/images/process";

describe("server-side image processing", () => {
  it("re-encodes to bounded WebP, strips metadata and produces a thumbnail and hash", async () => {
    const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#884422" } })
      .withMetadata({ exif: { IFD0: { Copyright: "secret-gps-owner" } } })
      .jpeg()
      .toBuffer();
    const out = await processImage(big);
    const meta = await sharp(out.main).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1400);
    expect(meta.exif).toBeUndefined();
    expect((await sharp(out.thumb).metadata()).width).toBeLessThanOrEqual(420);
    expect(out.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("rejects files that are not images even with an image name/type", async () => {
    await expect(processImage(Buffer.from("<svg onload=alert(1)></svg>".padEnd(64, " ")))).rejects.toMatchObject({ code: "bad_type" });
    await expect(processImage(Buffer.from("MZ" + "x".repeat(100)))).rejects.toBeInstanceOf(ImageError);
  });

  it("rejects corrupt images", async () => {
    const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#fff" } }).png().toBuffer();
    await expect(processImage(png.subarray(0, 40))).rejects.toMatchObject({ code: "corrupt" });
  });

  it("rejects oversized uploads before decoding", async () => {
    const huge = Buffer.alloc(13 * 1024 * 1024);
    huge[0] = 0xff; huge[1] = 0xd8; huge[2] = 0xff;
    await expect(processImage(huge)).rejects.toMatchObject({ code: "too_large" });
  });
});
