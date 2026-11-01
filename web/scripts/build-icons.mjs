// Genera los PNG (favicon, PWA, apple-touch) a partir de public/crest.svg.
// Usa el Chromium de Playwright para respetar tipografías. Uso: npm run icons
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const svg = await readFile(new URL("../public/crest.svg", import.meta.url), "utf8");
const targets = [
  { file: "icon-192.png", size: 192, pad: 0.08, bg: "transparent" },
  { file: "icon-512.png", size: 512, pad: 0.08, bg: "transparent" },
  { file: "icon-maskable-512.png", size: 512, pad: 0.22, bg: "#000000" },
  { file: "apple-touch-icon.png", size: 180, pad: 0.12, bg: "#000000" },
  { file: "favicon-32.png", size: 32, pad: 0.02, bg: "transparent" },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  const inner = Math.round(t.size * (1 - 2 * t.pad));
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:${t.bg};display:grid;place-items:center;width:${t.size}px;height:${t.size}px">
       <div style="width:${inner}px;height:${inner}px;display:grid;place-items:center">${svg.replace("<svg", '<svg style="height:100%;width:auto"')}</div>
     </body></html>`,
  );
  const buf = await page.screenshot({ omitBackground: t.bg === "transparent" });
  await writeFile(new URL(`../public/icons/${t.file}`, import.meta.url), buf);
  console.log("✓", t.file);
}
await browser.close();
