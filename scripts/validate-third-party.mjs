#!/usr/bin/env node
// Validates data/third-party/repos.json + data/third-party/index.txt.
//
// For every enabled entry it:
//  1. Checks required fields are present.
//  2. Checks homepage + apt URI reachability.
//  3. Downloads one GPG key URL and verifies the fingerprint matches what the
//     JSON declares (requires the `gpg` binary \u2014 always present on
//     ubuntu-latest runners; falls back to a warning locally if absent).
//  4. For every distro/codename the entry claims to support, fetches the
//     repo's signed release file and checks it the way apt does: at least one
//     valid signature from the declared key, and every listed component exists.
//     This catches vendor key rotations and dropped releases before users do.
//
// Exit status is 0 on full success, 1 if any validation failed.

import { readFile, writeFile, unlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 1000;
const FETCH_HEADERS = {
  "user-agent": "distro-forge-third-party-validator/1.0",
  "accept": "*/*",
};

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
async function checkAptUri(url, suite) {
  const base = String(url).replace(/\/+$/, "");
  const resolvedSuite = String(suite || "").trim();
  const candidates = [];
  if (resolvedSuite === "/") {
    candidates.push(`${base}/Release`, `${base}/InRelease`);
  } else if (resolvedSuite.length > 0) {
    candidates.push(`${base}/dists/${resolvedSuite}/Release`, `${base}/dists/${resolvedSuite}/InRelease`);
  }
  candidates.push(`${base}/dists/`, base);
  let last = { ok: false, status: 0 };
  for (const candidate of candidates) {
    const result = await checkUrl(candidate);
    if (result.ok) return { ...result, checkedUrl: candidate };
    last = { ...result, checkedUrl: candidate };
  }
  return last;
}

const REQUIRED_TOP = ["id", "name", "category", "homepage", "description",
                      "supports", "uri", "suite", "components", "gpg"];
const REQUIRED_GPG = ["url", "fingerprint", "keyring"];
const FP_RE = /^[A-F0-9]{40}$/;
const REPO_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KEYRING_RE = /^\/etc\/apt\/keyrings\/[A-Za-z0-9._-]+\.(gpg|asc)$/;
const FIELD_TOKEN_RE = /^[A-Za-z0-9._:+-]+$/;
// Suite tokens may also contain template placeholders and path separators.
const SUITE_TOKEN_RE = /^[A-Za-z0-9._:+\/{}-]+$/;
// Fields are copied into shell snippets users run with sudo; a control
// character (newline especially) could smuggle in an extra command.
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f\u2028\u2029]/;
const NO_WHITESPACE_RE = /^\S+$/;

function substitute(t, vars) {
  return t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}
function isHttpsUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function checkUrl(url, method = "HEAD") {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    const res = await fetch(url, { method, headers: FETCH_HEADERS, redirect: "follow", signal: ac.signal });
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
    const res = await fetch(url, { headers: FETCH_HEADERS, redirect: "follow", signal: ac.signal });
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
    // Primary keys only: the first "fpr:" record after each "pub:" record.
    // Subkey fingerprints don't count, so a declared fingerprint must name a
    // top-level key the vendor actually publishes.
    const fps = [];
    let awaitingPrimary = false;
    for (const line of out.split("\n")) {
      if (line.startsWith("pub:")) awaitingPrimary = true;
      else if (awaitingPrimary && line.startsWith("fpr:")) {
        fps.push(line.split(":")[9]);
        awaitingPrimary = false;
      }
    }
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

function validateSchema(repo, { strictFingerprint = false } = {}) {
  const errors = [];
  for (const k of REQUIRED_TOP) if (!(k in repo)) errors.push(`missing field: ${k}`);
  if (repo.id && !REPO_ID_RE.test(String(repo.id))) {
    errors.push(`id must be kebab-case ([a-z0-9-]), got: ${repo.id}`);
  }
  for (const k of ["name", "category", "description", "uri", "suite"]) {
    if (k in repo && (typeof repo[k] !== "string" || repo[k].trim().length === 0)) {
      errors.push(`${k} must be a non-empty string`);
    }
  }
  for (const k of ["name", "category", "description", "homepage", "uri", "suite"]) {
    if (typeof repo[k] === "string" && CONTROL_CHAR_RE.test(repo[k])) {
      errors.push(`${k} must not contain control characters or line breaks`);
    }
  }
  for (const k of ["homepage", "uri"]) {
    if (typeof repo[k] === "string" && !NO_WHITESPACE_RE.test(repo[k])) {
      errors.push(`${k} must not contain whitespace, got: ${JSON.stringify(repo[k])}`);
    }
  }
  if (typeof repo.suite === "string" && repo.suite.trim().split(/ +/).some((t) => !SUITE_TOKEN_RE.test(t))) {
    errors.push(`suite entries must match ${SUITE_TOKEN_RE}, got: ${JSON.stringify(repo.suite)}`);
  }
  if ("architectures" in repo && (!Array.isArray(repo.architectures) ||
      repo.architectures.some((a) => typeof a !== "string" || !FIELD_TOKEN_RE.test(a)))) {
    errors.push(`architectures must be an array of strings matching ${FIELD_TOKEN_RE}`);
  }
  if ("homepage" in repo && !isHttpsUrl(repo.homepage)) {
    errors.push(`homepage must be an https URL, got: ${repo.homepage}`);
  }
  if (typeof repo.uri === "string" && !isHttpsUrl(substitute(repo.uri, { distro: "debian", codename: "bookworm" }))) {
    errors.push(`uri must resolve to an https URL, got: ${repo.uri}`);
  }
  if (!Array.isArray(repo.components) || repo.components.length === 0) {
    if (!Array.isArray(repo.components)) {
      errors.push("components must be an array");
    } else if (!String(repo.suite || "").trim().endsWith("/")) {
      // Flat repositories (suite "/" or a path like "binary/") must omit Components.
      errors.push("components must be a non-empty array unless suite is a flat-repository path ending in '/'");
    }
  } else if (String(repo.suite || "").trim().endsWith("/")) {
    errors.push("components must be empty for flat repositories (suite ending in '/'); apt rejects them otherwise");
  } else if (repo.components.some((c) => typeof c !== "string" || !FIELD_TOKEN_RE.test(c))) {
    errors.push(`components entries must match ${FIELD_TOKEN_RE}, got: ${JSON.stringify(repo.components)}`);
  }
  if (repo.gpg && typeof repo.gpg === "object") {
    for (const k of REQUIRED_GPG) if (!(k in repo.gpg)) errors.push(`missing gpg.${k}`);
    if (typeof repo.gpg.url !== "string" || !NO_WHITESPACE_RE.test(repo.gpg.url)) {
      errors.push(`gpg.url must not contain whitespace or control characters, got: ${JSON.stringify(repo.gpg.url)}`);
    } else if (!isHttpsUrl(repo.gpg.url)) {
      errors.push(`gpg.url must be an https URL, got: ${repo.gpg.url}`);
    }
    if ("additionalFingerprints" in repo.gpg && (!Array.isArray(repo.gpg.additionalFingerprints) ||
        repo.gpg.additionalFingerprints.some((fp) => !FP_RE.test(String(fp).toUpperCase())))) {
      errors.push("gpg.additionalFingerprints must be an array of 40-hex-char fingerprints");
    }
    if (!KEYRING_RE.test(String(repo.gpg.keyring || ""))) {
      errors.push(`gpg.keyring must match ${KEYRING_RE}, got: ${repo.gpg.keyring}`);
    }
    const fp = String(repo.gpg.fingerprint || "").toUpperCase();
    if (strictFingerprint && !FP_RE.test(fp)) {
      errors.push(`fingerprint must be 40 hex chars, got: ${repo.gpg.fingerprint}`);
    } else if (fp && !FP_RE.test(fp)) {
      errors.push(`fingerprint must be 40 hex chars, got: ${repo.gpg.fingerprint}`);
    }
  }
  if (repo.supports && typeof repo.supports === "object") {
    const d = repo.supports.debian, u = repo.supports.ubuntu;
    if ((!Array.isArray(d) || d.length === 0) && (!Array.isArray(u) || u.length === 0)) {
      errors.push(`supports.debian or supports.ubuntu must be a non-empty array`);
    } else {
      const badDebian = Array.isArray(d) && d.some((c) => typeof c !== "string" || !FIELD_TOKEN_RE.test(c));
      const badUbuntu = Array.isArray(u) && u.some((c) => typeof c !== "string" || !FIELD_TOKEN_RE.test(c));
      if (badDebian || badUbuntu) {
        errors.push(`supports.* entries must match ${FIELD_TOKEN_RE}`);
      }
    }
  }
  return errors;
}

// --- per-release signature verification ----------------------------------

const RELEASE_CHECK_CONCURRENCY = 8;

async function fetchBytes(url) {
  return withRetry(async () => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: FETCH_HEADERS, redirect: "follow", signal: ac.signal });
      return { status: res.status, buf: res.ok ? Buffer.from(await res.arrayBuffer()) : null };
    } finally {
      clearTimeout(timer);
    }
  }, url);
}

// Base URL apt would read release files from: dists/<suite> for normal
// repositories, or the suite path itself for flat ones ("/", "binary/").
function releaseDir(uri, suite) {
  const base = uri.replace(/\/+$/, "");
  if (!suite.endsWith("/")) return `${base}/dists/${suite}`;
  const path = suite.replace(/^\/+|\/+$/g, "");
  return path ? `${base}/${path}` : base;
}

// Returns null when apt would accept the release, or a reason it wouldn't.
async function checkSignedRelease({ dir, keyringFile, components }) {
  const tmp = join(tmpdir(), `tp-rel-${process.pid}-${Math.random().toString(36).slice(2)}`);
  try {
    const inRelease = await fetchBytes(`${dir}/InRelease`);
    let gpgvArgs, releaseText;
    if (inRelease.buf) {
      await writeFile(tmp, inRelease.buf);
      gpgvArgs = [tmp];
      releaseText = inRelease.buf.toString("utf8");
    } else {
      const [rel, sig] = await Promise.all([fetchBytes(`${dir}/Release`), fetchBytes(`${dir}/Release.gpg`)]);
      if (!rel.buf) return `no release file (InRelease HTTP ${inRelease.status}, Release HTTP ${rel.status})`;
      // apt refuses an unsigned repository, so a missing signature is a failure.
      if (!sig.buf) return `Release is unsigned (Release.gpg HTTP ${sig.status})`;
      await writeFile(tmp, rel.buf);
      await writeFile(`${tmp}.gpg`, sig.buf);
      gpgvArgs = [`${tmp}.gpg`, tmp];
      releaseText = rel.buf.toString("utf8");
    }
    // Like apt, accept if any signature is valid for a key in the keyring
    // (repos may be dual-signed during a rotation).
    let status = "";
    try {
      status = execFileSync("gpgv", ["--status-fd", "1", "--keyring", keyringFile, ...gpgvArgs],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch (err) {
      status = err.stdout || "";
    }
    if (!/^\[GNUPG:\] VALIDSIG /m.test(status)) {
      const signers = [...status.matchAll(/^\[GNUPG:\] (?:ERRSIG|NO_PUBKEY) (\S+)/gm)].map((m) => m[1]);
      return `release is not signed by the declared key${signers.length ? ` (signed by ${[...new Set(signers)].join(", ")})` : ""}`;
    }
    const available = releaseText.match(/^Components: (.*)$/m)?.[1]?.trim().split(/\s+/);
    if (available && components.length) {
      const missing = components.filter((c) => !available.includes(c));
      if (missing.length) return `components ${missing.join(", ")} not in repo (has ${available.join(", ")})`;
    }
    return null;
  } finally {
    for (const f of [tmp, `${tmp}.gpg`]) { try { await unlink(f); } catch {} }
  }
}

async function verifyReleases(repos, { failures, warnings }) {
  try { execFileSync("gpgv", ["--version"], { stdio: "ignore" }); }
  catch {
    warnings.push({ id: "(all)", detail: "gpgv binary not available; skipped per-release signature checks" });
    return 0;
  }
  // Build each distinct keyring once; key URLs may vary by distro/codename.
  const keyrings = new Map();
  const keyringFor = (url) => {
    if (!keyrings.has(url)) {
      // Name the file before any await so concurrent downloads never share one.
      const file = join(tmpdir(), `tp-keyring-${process.pid}-${keyrings.size}.gpg`);
      keyrings.set(url, (async () => {
        const { buf, status } = await fetchBytes(url);
        if (!buf) throw new Error(`key download failed (HTTP ${status})`);
        // gpgv needs a binary keyring; --dearmor passes binary keys through unchanged.
        await writeFile(file, execFileSync("gpg", ["--dearmor"], { input: buf }));
        return file;
      })());
    }
    return keyrings.get(url);
  };

  const jobs = [];
  for (const repo of repos) {
    for (const [distro, codenames] of Object.entries(repo.supports || {})) {
      for (const codename of Array.isArray(codenames) ? codenames : []) {
        const vars = { distro, codename };
        const uri = substitute(repo.uri, vars);
        const components = Array.isArray(repo.components) ? repo.components : [];
        for (const suite of substitute(repo.suite, vars).trim().split(/\s+/)) {
          jobs.push({ repo, distro, codename, suite, uri, components, keyUrl: substitute(repo.gpg.url, vars) });
        }
      }
    }
  }

  const queue = [...jobs];
  await Promise.all(Array.from({ length: RELEASE_CHECK_CONCURRENCY }, async () => {
    while (queue.length) {
      const job = queue.shift();
      const where = `${job.distro}/${job.codename} suite ${job.suite}`;
      try {
        const keyringFile = await keyringFor(job.keyUrl);
        const problem = await checkSignedRelease({
          dir: releaseDir(job.uri, job.suite), keyringFile, components: job.components,
        });
        if (problem) failures.push({ id: job.repo.id, kind: "release", detail: `${where}: ${problem}` });
      } catch (err) {
        failures.push({ id: job.repo.id, kind: "release", detail: `${where}: ${err.message}` });
      }
    }
  }));

  for (const pending of keyrings.values()) {
    try { await unlink(await pending); } catch {}
  }
  return jobs.length;
}

async function main() {
  const reposPath = join(ROOT, "data", "third-party", "repos.json");
  const indexPath = join(ROOT, "data", "third-party", "index.txt");

  const repos = JSON.parse(await readFile(reposPath, "utf8"));
  const enabled = enabledIdsFromIndex(await readFile(indexPath, "utf8"));
  const failures = [];
  const warnings = [];

  const byId = new Map();
  for (const repo of repos) {
    if (byId.has(repo.id)) {
      failures.push({ id: repo.id || "(unknown)", kind: "schema", detail: "duplicate id in repos.json" });
      continue;
    }
    byId.set(repo.id, repo);
  }

  // Every enabled ID must refer to an existing entry.
  for (const id of enabled) {
    if (!byId.has(id)) failures.push({ id, kind: "missing", detail: "listed in index.txt but not in repos.json" });
  }

  for (const id of enabled) {
    const repo = byId.get(id);
    if (!repo) continue;

    // Schema.
    for (const e of validateSchema(repo, { strictFingerprint: true })) {
      failures.push({ id, kind: "schema", detail: e });
    }

    // Reachability.
    const homepageStatus = await checkUrl(repo.homepage);
    if (!homepageStatus.ok) {
      const isPolicyBlocked = homepageStatus.status === 401 || homepageStatus.status === 403;
      const detail = `homepage → ${repo.homepage} (HTTP ${homepageStatus.status}${homepageStatus.error ? ` / ${homepageStatus.error}` : ""})`;
      if (isPolicyBlocked) warnings.push({ id, detail: `${detail}; treating as warning because some hosts block non-browser probes` });
      else failures.push({ id, kind: "unreachable", detail });
    }
    if (!repo.gpg || typeof repo.gpg !== "object" || typeof repo.gpg.url !== "string") continue;
    for (const distro of Object.keys(repo.supports || {})) {
      const codenames = Array.isArray(repo.supports[distro]) ? repo.supports[distro] : [];
      const codename = codenames[0] || "_";
      const vars = { distro, codename };
      const uri = substitute(repo.uri, vars);
      const suite = substitute(repo.suite, vars);
      for (const [label, url, checker] of [
        [`uri (${distro})`, uri, () => checkAptUri(uri, suite)],
      ]) {
        const r = await checker();
        if (!r.ok) {
          const isPolicyBlocked = r.status === 401 || r.status === 403;
          const target = label.startsWith("uri ") && r.checkedUrl ? `${url} via ${r.checkedUrl}` : url;
          const detail = `${label} \u2192 ${target} (HTTP ${r.status}${r.error ? ` / ${r.error}` : ""})`;
          if (isPolicyBlocked && label.startsWith("uri ")) {
            warnings.push({ id, detail: `${detail}; treating as warning because some apt hosts block non-apt probes` });
          } else {
            failures.push({ id, kind: "unreachable", detail });
          }
        }
      }
    }

    // Fingerprint verification (using any supported distro for the URL).
    try {
      const distro = Object.keys(repo.supports || {})[0];
      const codenames = Array.isArray(repo.supports?.[distro]) ? repo.supports[distro] : [];
      const codename = codenames[0] || "_";
      const keyUrl = substitute(repo.gpg.url, { distro, codename });
      const buf = await fetchKeyBody(keyUrl);
      const { skipped, fingerprints } = await gpgFingerprints(buf);
      if (skipped) {
        warnings.push({ id, detail: "gpg binary not available; skipped fingerprint check" });
      } else {
        // Exact set match: a wrong key fails, and so does an extra key added
        // to the file (every key in it would be trusted by apt).
        const declared = [repo.gpg.fingerprint, ...(repo.gpg.additionalFingerprints || [])]
          .map((fp) => String(fp).toUpperCase());
        const actual = [...new Set(fingerprints.map((fp) => fp.toUpperCase()))].sort();
        const expected = [...new Set(declared)].sort();
        if (actual.join(" ") !== expected.join(" ")) {
          failures.push({
            id, kind: "fingerprint",
            detail: `declared [${expected.join(", ")}] but upstream key file has primary keys [${actual.join(", ") || "none"}]`,
          });
        }
      }
    } catch (err) {
      failures.push({ id, kind: "fingerprint", detail: `failed to fetch/parse key: ${err.message}` });
    }
  }

  // Per-release checks only for entries that passed the schema checks above.
  const schemaFailed = new Set(failures.filter((f) => f.kind === "schema").map((f) => f.id));
  const releaseChecks = await verifyReleases(
    [...enabled].map((id) => byId.get(id)).filter((r) => r && !schemaFailed.has(r.id)),
    { failures, warnings },
  );

  // Render a human-readable report.
  const lines = [];
  lines.push(`Validated ${enabled.size} enabled repo(s) out of ${repos.length} total, including ${releaseChecks} signed-release check(s).`);
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
  const reportJson = {
    validatedEnabledRepos: enabled.size,
    releaseChecks,
    totalRepos: repos.length,
    warnings,
    failures,
  };
  await writeFile(join(ROOT, ".third-party-report.txt"), report, "utf8");
  await writeFile(join(ROOT, ".third-party-report.json"), JSON.stringify(reportJson, null, 2) + "\n", "utf8");
  console.log(report);

  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
