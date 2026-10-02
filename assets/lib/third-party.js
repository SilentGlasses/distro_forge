// Pure helpers for the /third-party/ builder.
// Given a selection of repo descriptors and a target distro + codename,
// produce the DEB822 sources file contents and the key-install snippet.

const DEFAULT_TOOL = "curl"; // curl / wget are both common; curl is near-universal.

function substitute(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : `{${key}}`
  );
}

function formatFingerprint(fp) {
  // Insert a space every 4 hex chars for readability.
  return fp.replace(/\s+/g, "").match(/.{1,4}/g)?.join(" ") ?? fp;
}
// Collapse CR/LF and other control characters so a data field can never start
// a new line in the generated output (escaping a "#" comment, or closing the
// install heredoc early with a bare "EOF" line).
function oneLine(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim();
}
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}
export function filterSupported(repos, distro, codename) {
  if (!distro || !codename) return [];
  return repos.filter((r) => {
    const list = r.supports && r.supports[distro];
    return Array.isArray(list) && list.includes(codename);
  });
}

export function isSupported(repo, distro, codename) {
  const list = repo.supports && repo.supports[distro];
  return Array.isArray(list) && list.includes(codename);
}

function renderStanza(repo, distro, codename) {
  const vars = { distro, codename };
  const lines = [];
  lines.push(`# ${oneLine(repo.name)}`);
  lines.push(`# ${oneLine(repo.homepage)}`);
  lines.push(`Types: deb`);
  lines.push(`URIs: ${oneLine(substitute(repo.uri, vars))}`);
  lines.push(`Suites: ${oneLine(substitute(repo.suite, vars))}`);
  if (Array.isArray(repo.components) && repo.components.length > 0) {
    lines.push(`Components: ${oneLine(repo.components.join(" "))}`);
  }
  if (Array.isArray(repo.architectures) && repo.architectures.length) {
    lines.push(`Architectures: ${oneLine(repo.architectures.join(" "))}`);
  }
  lines.push(`Signed-By: ${oneLine(repo.gpg.keyring)}`);
  return lines.join("\n");
}

// Every primary-key fingerprint the downloaded key file is expected to hold:
// the declared one plus any rotation keys the vendor ships alongside it.
export function expectedFingerprints(repo) {
  const declared = [repo.gpg.fingerprint, ...(repo.gpg.additionalFingerprints || [])];
  return [...new Set(declared.map((fp) => String(fp).replace(/\s+/g, "").toUpperCase()))].sort();
}

function renderKeyInstall(repo, distro, codename) {
  const name = oneLine(repo.name);
  const keyringQ = shellQuote(oneLine(repo.gpg.keyring));
  const keyUrlQ = shellQuote(oneLine(substitute(repo.gpg.url, { distro, codename })));
  const expected = expectedFingerprints(repo);
  const lines = [];
  lines.push(`# ${name} — install the signing key`);
  lines.push(`# Expected key fingerprint(s): ${expected.map(formatFingerprint).join(", ")}`);
  if (!expected.every((fp) => /^[A-F0-9]{40}$/.test(fp))) {
    // Never emit an install path we can't verify.
    lines.push(`echo ${shellQuote(`ERROR: ${name} has no valid fingerprint on record; key NOT installed.`)} >&2`);
    return lines.join("\n");
  }
  // The key is only installed when the set of primary-key fingerprints in the
  // downloaded file exactly matches the expected set. An extra key smuggled
  // into the file fails the check just like a wrong one. if/else (not `exit`)
  // keeps a failure from closing the user's terminal when pasted.
  lines.push(`TMP_KEY="$(mktemp)"`);
  lines.push(`if ${DEFAULT_TOOL} -fsSL ${keyUrlQ} -o "$TMP_KEY"; then`);
  lines.push(`  KEY_FPRS="$(gpg --show-keys --with-colons "$TMP_KEY" 2>/dev/null | awk -F: '$1=="pub"{p=1} $1=="fpr"&&p{print $10;p=0}' | LC_ALL=C sort | tr '\\n' ' ')"`);
  lines.push(`  if [ "$KEY_FPRS" = ${shellQuote(expected.join(" ") + " ")} ]; then`);
  lines.push(`    sudo install -d -m 0755 /etc/apt/keyrings`);
  if (repo.gpg.keyring.endsWith(".asc")) {
    // .asc keyrings keep the ASCII-armored key as-is.
    lines.push(`    sudo install -m 0644 "$TMP_KEY" ${keyringQ}`);
  } else {
    // .gpg keyrings are binary; --dearmor passes already-binary keys through unchanged.
    lines.push(`    gpg --dearmor < "$TMP_KEY" | sudo tee ${keyringQ} > /dev/null`);
    lines.push(`    sudo chmod 0644 ${keyringQ}`);
  }
  lines.push(`    echo ${shellQuote(`OK: ${name} signing key verified and installed.`)}`);
  lines.push(`  else`);
  lines.push(`    echo ${shellQuote(`ERROR: ${name} key fingerprint mismatch; key NOT installed. Got:`)} "$KEY_FPRS" >&2`);
  lines.push(`  fi`);
  lines.push(`else`);
  lines.push(`  echo ${shellQuote(`ERROR: could not download the ${name} key; nothing installed.`)} >&2`);
  lines.push(`fi`);
  lines.push(`rm -f "$TMP_KEY"`);
  return lines.join("\n");
}

function sanitiseFilename(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "third-party";
}
function appendHereDoc(lines, targetPath, generatedContents) {
  const body = String(generatedContents || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n$/, "")
    .split("\n");
  lines.push(`  sudo tee ${targetPath} > /dev/null <<-'EOF'`);
  for (const line of body) lines.push(`\t${line}`);
  lines.push("\tEOF");
}

export function build({ repos, distro, codename }) {
  if (!distro || !codename) {
    throw new Error("Pick a distribution and release first.");
  }
  if (!Array.isArray(repos) || repos.length === 0) {
    throw new Error("Select at least one repository.");
  }
  const supported = repos.filter((r) => isSupported(r, distro, codename));
  if (supported.length === 0) {
    throw new Error(`None of the selected repositories list support for ${distro} ${codename}.`);
  }

  const stanzas = supported.map((r) => renderStanza(r, distro, codename));
  const keyBlocks = supported.map((r) => renderKeyInstall(r, distro, codename));

  const filename = supported.length === 1
    ? `${sanitiseFilename(supported[0].id)}.sources`
    : "third-party.sources";

  const sources = `# Generated third-party apt sources for ${distro} ${codename}.\n` +
    `# Review each Signed-By path and verify the upstream fingerprint.\n\n` +
    stanzas.join("\n\n") + "\n";

  const keyInstall = keyBlocks.join("\n\n") + "\n";

  const installLines = [
    "Follow these steps to install the selected third-party repositories:",
    "",
    "Step 1: Run the commands in `Key install`. Each key is installed only if its fingerprint matches the one on record; look for an `OK:` line per repository and stop if you see `ERROR:`. For extra assurance, compare the fingerprints against the vendor's official documentation.",
    "",
    `Step 2: Generate the new \`${filename}\` file (your existing apt sources are left untouched):`,
    "",
  ];
  appendHereDoc(installLines, `/etc/apt/sources.list.d/${filename}`, sources);
  installLines.push("");
  installLines.push("Step 3: Set ownership and mode.");
  installLines.push("");
  installLines.push("- Set ownership:");
  installLines.push("");
  installLines.push(`  sudo chown root:root /etc/apt/sources.list.d/${filename}`);
  installLines.push("");
  installLines.push("- Set mode:");
  installLines.push("");
  installLines.push(`  sudo chmod 644 /etc/apt/sources.list.d/${filename}`);
  installLines.push("");
  installLines.push("Step 4: Refresh package metadata, then choose an upgrade path.");
  installLines.push("");
  installLines.push("- Run update:");
  installLines.push("");
  installLines.push("  sudo apt update");
  installLines.push("");
  installLines.push("- Base upgrade:");
  installLines.push("");
  installLines.push("  sudo apt upgrade");
  installLines.push("");
  installLines.push("- Full dist-upgrade:");
  installLines.push("");
  installLines.push("  sudo apt full-upgrade");

  const install = installLines.join("\n");

  return { filename, sources, keyInstall, install, selected: supported };
}

export function uniqueCategories(repos) {
  return [...new Set(repos.map((r) => r.category || "Other"))].sort((a, b) => a.localeCompare(b));
}
