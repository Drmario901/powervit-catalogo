/**
 * Genera public/og-catalog.png (1200×630) para Open Graph / WhatsApp.
 * Fondo blanco para que el logo y el texto se lean bien en previews.
 * Sin sharp: copia logo.png como respaldo.
 */
import { copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const logoPath = join(root, "public/logo.png");
const outPath = join(root, "public/og-catalog.png");

const W = 1200;
const H = 630;

async function main() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    await copyFile(logoPath, outPath);
    console.warn(
      "[generate-og-image] sharp no instalado: se copió logo.png → og-catalog.png. Para imagen 1200×630: pnpm add -D sharp"
    );
    return;
  }

  try {
    const canvas = sharp({
      create: {
        width: W,
        height: H,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    });

    const logoBuf = await sharp(logoPath)
      .resize(480, 480, {
        fit: "inside",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    await canvas
      .composite([{ input: logoBuf, gravity: "center" }])
      .png({ compressionLevel: 9 })
      .toFile(outPath);

    console.log("[generate-og-image] OK →", outPath, `(${W}×${H}, fondo blanco)`);
  } catch (e) {
    console.warn("[generate-og-image]", e.message);
    await copyFile(logoPath, outPath);
  }
}

main();
