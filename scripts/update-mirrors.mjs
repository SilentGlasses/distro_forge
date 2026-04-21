#!/usr/bin/env node
// Health-checks the mirror lists in assets/data/mirrors-list.js.
// Any mirror that doesn't respond 2xx/3xx to a HEAD request within
// the timeout is dropped from the list. The script overwrites the JS
// file with the pruned data; a GitHub Actions workflow opens a PR
// with the diff when anything changed.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  countryNames,
  debianMirrorList,
  ubuntuMirrorList,
} from "../assets/data/mirrors-list.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(HERE, "..", "assets", "data", "mirrors-list.js");
const TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 1000;

// Exponential backoff retry helper for transient network failures
async function withRetry(fn, context = "", maxRetries = MAX_RETRIES) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

async function alive(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    // Many apt mirrors respond to HEAD on /, but some prefer GET; try HEAD first,
    // then fall back to GET of a lightweight file.
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal })
      .catch(() => null);
    if (!res || !res.ok) {
      res = await fetch(url + "/dists/", { method: "GET", redirect: "follow", signal: controller.signal })
        .catch(() => null);
    }
    clearTimeout(timer);
    return !!(res && (res.ok || (res.status >= 200 && res.status < 400)));
  } catch (err) {
    // Retry on transient network errors (timeout, ECONNREFUSED, etc)
    // but not on 4xx/5xx HTTP errors (those are permanent)
    const isTransient = err.name === "AbortError" || 
                       err.code === "ECONNREFUSED" || 
                       err.code === "ECONNRESET" ||
                       err.code === "ETIMEDOUT";
    if (isTransient) {
      return withRetry(() => alive(url), url, 1);
    }
    return false;
  }
}

async function prune(list, label) {
  const results = await Promise.all(list.map((m) => alive(m.url).then((ok) => ({ ...m, ok }))));
  const kept = results.filter((m) => m.ok).map(({ ok, ...rest }) => rest);
  const dropped = results.filter((m) => !m.ok).map(({ ok, ...rest }) => rest);
  if (dropped.length) {
    console.log(`[${label}] dropping ${dropped.length} unreachable mirror(s):`);
    for (const m of dropped) console.log(`  - ${m.country} ${m.name} (${m.url})`);
  } else {
    console.log(`[${label}] all ${list.length} mirrors healthy.`);
  }
  return kept;
}

function emitMirrorItem(m) {
  const c = JSON.stringify(m.country);
  const n = JSON.stringify(m.name);
  const u = JSON.stringify(m.url);
  return `  { country: ${c}, name: ${n.padEnd(40)}, url: ${u} },`;
}

function emit(debian, ubuntu) {
  const countriesBlock = Object.entries(countryNames)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, label]) => `  ${code}: ${JSON.stringify(label)},`)
    .join("\n");

  return `// Curated list of public primary apt mirrors, grouped by country code.
//
// This file is AUTO-MAINTAINED by scripts/update-mirrors.mjs, which runs
// weekly and prunes any mirror that fails a HEAD / GET health check. To
// add a new mirror, edit this file by hand and open a PR \u2014 the pruner
// only removes entries, it never adds them.

// Country names keyed by ISO 3166-1 alpha-2 code.
export const countryNames = {
${countriesBlock}
};

// Debian mirrors.
export const debianMirrorList = [
${debian.map(emitMirrorItem).join("\n")}
];

// Ubuntu mirrors (primary arches only \u2014 ports.ubuntu.com handled by the generator).
export const ubuntuMirrorList = [
${ubuntu.map(emitMirrorItem).join("\n")}
];

// Grouped by country for <optgroup> rendering.
export function groupByCountry(list) {
  const groups = new Map();
  for (const m of list) {
    if (!groups.has(m.country)) groups.set(m.country, []);
    groups.get(m.country).push(m);
  }
  return [...groups.entries()]
    .sort((a, b) => (countryNames[a[0]] || a[0]).localeCompare(countryNames[b[0]] || b[0]))
    .map(([code, mirrors]) => ({
      code,
      label: countryNames[code] || code,
      mirrors: mirrors.slice().sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
`;
}

async function main() {
  console.log(`Checking ${debianMirrorList.length} Debian + ${ubuntuMirrorList.length} Ubuntu mirrors\u2026`);
  const [debian, ubuntu] = await Promise.all([
    prune(debianMirrorList, "debian"),
    prune(ubuntuMirrorList, "ubuntu"),
  ]);

  // Refuse to write if everything got pruned \u2014 something systemic is wrong.
  if (debian.length === 0 || ubuntu.length === 0) {
    throw new Error("Health check wiped an entire distro's list; aborting to avoid self-harm.");
  }

  await writeFile(OUT_PATH, emit(debian, ubuntu), "utf8");
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
