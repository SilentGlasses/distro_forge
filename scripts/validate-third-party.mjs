#!/usr/bin/env node
// Validates data/third-party/repos.json + data/third-party/index.txt.
//
// For every enabled entry it:
//  1. Checks required fields are present.
//  2. HEADs homepage, uri, and gpg.url and confirms 2xx/3xx.
//  3. Downloads the GPG key and verifies the fingerprint matches what the
//     JSON declares (requires the `gpg` binary \u2014 always present on
//     ubuntu-latest runners; falls back to a warning locally if absent).
//
// Exit status is 0 on full success, 1 if any validation failed.

import { readFile, mkdtemp, writeFile, unlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const TIMEOUT_MS = 10000;
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

const REQUIRED_TOP = ["id", "name", "category", "homepage", "description",
                      "supports", "uri", "suite", "components", "gpg"];
const REQUIRED_GPG = ["url", "fingerprint", "keyring"];
const FP_RE = /^[A-F0-9]{40}$/;

function substitute(t, vars) {
  return t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

async function checkUrl(url, method = "HEAD") {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    const res = await fetch(url, { method, redirect: "follow", signal: ac.signal });
    clearTimeout(timer);
    if (!res.ok && method === "HEAD") return checkUrl(url, "GET");
    return { ok: res.ok, status: res.status };
  } catch (err) {
    // Retry on transient network errors but not on 4xx/5xx (permanent)
    const isTransient = err.name === "AbortError" || 
                       err.code === "ECONNREFUSED" || 
                       err.code === "ECONNRESET" ||
                       err.code === "ETIMEDOUT";
    if (isTransient) {
      return withRetry(() => checkUrl(url, method), url, 1);
    }
    return { ok: false, status: 0, error: err.message || String(err) };
  }
}

async function fetchKeyBody(url) {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    const res = await fetch(url, { redirect: "follow", signal: ac.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status} for key ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf;
  } catch (err) {
    // Retry on transient network errors but not on 4xx/5xx (permanent)
    const isTransient = err.name === "AbortError" || 
                       err.code === "ECONNREFUSED" || 
                       err.code === "ECONNRESET" ||
                       err.code === "ETIMEDOUT" ||
                       !err.message.match(/HTTP \d{3}/); // Not a 4xx/5xx error
    if (isTransient) {
      return withRetry(() => fetchKeyBody(url), url, 1);
    }
    throw err;
  }
}

async function gpgFingerprints(keyBuf) {
  let gpgAvailable = true;
  try { execFileSync("gpg", ["--version"], { stdio: "ignore" }); }
  catch { gpgAvailable = false; }
  if (!gpgAvailable) {
    return { skipped: true, fingerprints: [] };
  }
  const tmpKey = join(tmpdir(), `tp-key-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    // Write key to temporary file using Node.js fs API with restrictive permissions
    await writeFile(tmpKey, keyBuf, { mode: 0o600 });
    const out = execFileSync("gpg", [
      "--with-colons", "--show-keys", "--with-fingerprint", tmpKey,
    ], { encoding: "utf8" });
    const fps = out.split("\n")
      .filter((line) => line.startsWith("fpr:"))
      .map((line) => line.split(":")[9])
      .filter(Boolean);
    return { skipped: false, fingerprints: fps };
  } finally {
    try { await unlink(tmpKey); } catch {}
  }
}

function enabledIdsFromIndex(text) {
  return new Set(
    text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
  );
}

function validateSchema(repo) {
  const errors = [];
  for (const k of REQUIRED_TOP) if (!(k in repo)) errors.push(`missing field: ${k}`);
  if (repo.gpg && typeof repo.gpg === "object") {
    for (const k of REQUIRED_GPG) if (!(k in repo.gpg)) errors.push(`missing gpg.${k}`);
    if (repo.gpg.fingerprint && !FP_RE.test(String(repo.gpg.fingerprint))) {
      errors.push(`fingerprint must be 40 hex chars, got: ${repo.gpg.fingerprint}`);
    }
  }
  if (repo.supports && typeof repo.supports === "object") {
    const d = repo.supports.debian, u = repo.supports.ubuntu;
    if (!Array.isArray(d) && !Array.isArray(u)) {
      errors.push(`supports.debian or supports.ubuntu must be a non-empty array`);
    }
  }
  return errors;
}

async function main() {
  const reposPath = join(ROOT, "data", "third-party", "repos.json");
  const indexPath = join(ROOT, "data", "third-party", "index.txt");

  const repos = JSON.parse(await readFile(reposPath, "utf8"));
  const enabled = enabledIdsFromIndex(await readFile(indexPath, "utf8"));

  const byId = new Map(repos.map((r) => [r.id, r]));
  const failures = [];
  const warnings = [];

  // Every enabled ID must refer to an existing entry.
  for (const id of enabled) {
    if (!byId.has(id)) failures.push({ id, kind: "missing", detail: "listed in index.txt but not in repos.json" });
  }

  for (const id of enabled) {
    const repo = byId.get(id);
    if (!repo) continue;

    // Schema.
    for (const e of validateSchema(repo)) failures.push({ id, kind: "schema", detail: e });

    // Reachability.
    const varsFor = (distro) => ({ distro, codename: "_" });
    for (const distro of Object.keys(repo.supports || {})) {
      const uri = substitute(repo.uri, varsFor(distro));
      const gpgUrl = substitute(repo.gpg.url, varsFor(distro));
      for (const [label, url] of [
        ["homepage", repo.homepage],
        [`uri (${distro})`, uri],
        [`gpg.url (${distro})`, gpgUrl],
      ]) {
        const r = await checkUrl(url);
        if (!r.ok) failures.push({ id, kind: "unreachable", detail: `${label} \u2192 ${url} (HTTP ${r.status}${r.error ? ` / ${r.error}` : ""})` });
      }
    }

    // Fingerprint verification (using any supported distro for the URL).
    try {
      const distro = Object.keys(repo.supports || {})[0];
      const keyUrl = substitute(repo.gpg.url, { distro, codename: "_" });
      const buf = await fetchKeyBody(keyUrl);
      const { skipped, fingerprints } = await gpgFingerprints(buf);
      if (skipped) {
        warnings.push({ id, detail: "gpg binary not available; skipped fingerprint check" });
      } else if (!fingerprints.includes(repo.gpg.fingerprint.toUpperCase())) {
        failures.push({
          id, kind: "fingerprint",
          detail: `declared ${repo.gpg.fingerprint} but upstream key contains [${fingerprints.join(", ") || "none"}]`,
        });
      }
    } catch (err) {
      failures.push({ id, kind: "fingerprint", detail: `failed to fetch/parse key: ${err.message}` });
    }
  }

  // Render a human-readable report.
  const lines = [];
  lines.push(`Validated ${enabled.size} enabled repo(s) out of ${repos.length} total.`);
  if (warnings.length) {
    lines.push("", "Warnings:");
    for (const w of warnings) lines.push(`  - ${w.id}: ${w.detail}`);
  }
  if (failures.length) {
    lines.push("", "Failures:");
    for (const f of failures) lines.push(`  - [${f.kind}] ${f.id}: ${f.detail}`);
  } else {
    lines.push("", "All checks passed.");
  }
  const report = lines.join("\n") + "\n";
  await writeFile(join(ROOT, ".third-party-report.txt"), report, "utf8");
  console.log(report);

  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
