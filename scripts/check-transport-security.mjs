#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const POLICY = [
  {
    file: "assets/data/releases.js",
    allowedHttp: [],
  },
  {
    file: "assets/data/variants.js",
    allowedHttp: [
      "http://raspbian.raspberrypi.org/raspbian",
      "http://download.proxmox.com/debian/pve",
      "http://packages.linuxmint.com",
    ],
  },
];

const HTTP_URL_RE = /"(http:\/\/[^"\s]+)"/g;

function uniq(values) {
  return [...new Set(values)];
}

async function extractHttpUrls(absPath) {
  const text = await readFile(absPath, "utf8");
  return uniq([...text.matchAll(HTTP_URL_RE)].map((m) => m[1]));
}

async function main() {
  const failures = [];
  const notes = [];

  for (const entry of POLICY) {
    const absPath = join(ROOT, entry.file);
    const found = await extractHttpUrls(absPath);
    const allow = new Set(entry.allowedHttp);

    for (const url of found) {
      if (!allow.has(url)) {
        failures.push(`${entry.file}: disallowed HTTP URL ${url}`);
      }
    }
    for (const url of allow) {
      if (!found.includes(url)) {
        notes.push(`${entry.file}: allowlist URL not present anymore (${url})`);
      }
    }
  }

  if (failures.length) {
    console.error("Transport security policy check failed:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("Transport security policy check passed.");
  if (notes.length) {
    console.log("Notes:");
    for (const n of notes) console.log(`  - ${n}`);
  }
}

main().catch((err) => {
  const where = err?.stack || err?.message || String(err);
  console.error(`check-transport-security failed: ${where}`);
  process.exit(1);
});
