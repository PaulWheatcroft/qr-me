#!/usr/bin/env node
// Generates two printable QR PNGs that point at the deployed scan page.
//
// Usage:
//   node scripts/generate-qr.mjs https://your-app.vercel.app
//
// Output: qr/token-A.png and qr/token-B.png

import QRCode from "qrcode";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOKENS = {
  A: "93ef95eccf1ae899f74e0271ed8397fa",
  B: "8257d4976487b680c6d0bdc360d62b18",
};

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node scripts/generate-qr.mjs <deployed-base-url>");
  console.error("Example: node scripts/generate-qr.mjs https://your-app.vercel.app");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "qr");
await mkdir(outDir, { recursive: true });

const trimmed = baseUrl.replace(/\/+$/, "");

for (const [label, token] of Object.entries(TOKENS)) {
  const url = `${trimmed}/?t=${token}`;
  const file = resolve(outDir, `token-${label}.png`);
  await QRCode.toFile(file, url, {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "H",
  });
  console.log(`Token ${label} -> ${url}`);
  console.log(`  saved ${file}`);
}

console.log("\nDone. Print qr/token-A.png and qr/token-B.png.");
