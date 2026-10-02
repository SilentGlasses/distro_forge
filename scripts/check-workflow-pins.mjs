#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const WORKFLOWS_DIR = join(ROOT, ".github", "workflows");
const PIN_RE = /^[a-f0-9]{40}$/;

function parseUsesRef(raw) {
  const at = raw.lastIndexOf("@");
  if (at === -1) return null;
  return {
    target: raw.slice(0, at),
    ref: raw.slice(at + 1),
  };
}

async function main() {
  const files = (await readdir(WORKFLOWS_DIR))
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

  const failures = [];

  for (const file of files) {
    const absPath = join(WORKFLOWS_DIR, file);
    const text = await readFile(absPath, "utf8");
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?\s*$/);
      if (!m) continue;
      const raw = m[1];
      if (raw.startsWith("./") || raw.startsWith("docker://")) continue;
      const parsed = parseUsesRef(raw);
      if (!parsed) {
        failures.push(`${file}:${i + 1} missing @ref in uses: ${raw}`);
        continue;
      }
      if (!PIN_RE.test(parsed.ref)) {
        failures.push(`${file}:${i + 1} action must be SHA-pinned (40 hex): ${raw}`);
      }
    }
  }

  if (failures.length) {
    console.error("Workflow pinning check failed:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("Workflow pinning check passed.");
}

main().catch((err) => {
  const where = err?.stack || err?.message || String(err);
  console.error(`check-workflow-pins failed: ${where}`);
  process.exit(1);
});
