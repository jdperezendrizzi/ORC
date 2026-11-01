// Genera los PNG (favicon, PWA, apple-touch) a partir del escudo original
// public/crest.png. El escudo se escala PROPORCIONALMENTE y se centra en un
// lienzo cuadrado: nunca se estira ni se redibuja. Uso: npm run icons
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const png = await readFile(new URL("../public/crest.png", import.meta.url));
const src = `data:image/png;base64,${png.toString("base64")}`;
const targets = [
  { file: "icon-192.png", size: 192, pad: 0.06, bg: "transparent" },
  { file: "icon-512.png", size: 512, pad: 0.06, bg: "transparent" },
  { file: "icon-maskable-512.png", size: 512, pad: 0.2, bg: "#231F20" },
  { file: "apple-touch-icon.png", size: 180, pad: 0.1, bg: "#231F20" },
  { file: "favicon-32.png", size: 32, pad: 0, bg: "transparent" },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  const inner = Math.round(t.size * (1 - 2 * t.pad));
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:${t.bg};display:grid;place-items:center;width:${t.size}px;height:${t.size}px">
       <img src="${src}" style="max-width:${inner}px;max-height:${inner}px;width:auto;height:auto;object-fit:contain">
     </body></html>`,
  );
  await page.waitForFunction(() => document.images[0]?.complete);
  const buf = await page.screenshot({ omitBackground: t.bg === "transparent" });
  await writeFile(new URL(`../public/icons/${t.file}`, import.meta.url), buf);
  console.log("✓", t.file);
}
await browser.close();
