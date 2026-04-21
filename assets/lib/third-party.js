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
  lines.push(`# ${repo.name}`);
  lines.push(`# ${repo.homepage}`);
  lines.push(`Types: deb`);
  lines.push(`URIs: ${substitute(repo.uri, vars)}`);
  lines.push(`Suites: ${substitute(repo.suite, vars)}`);
  lines.push(`Components: ${repo.components.join(" ")}`);
  if (Array.isArray(repo.architectures) && repo.architectures.length) {
    lines.push(`Architectures: ${repo.architectures.join(" ")}`);
  }
  lines.push(`Signed-By: ${repo.gpg.keyring}`);
  return lines.join("\n");
}

function renderKeyInstall(repo, distro) {
  const keyringPath = repo.gpg.keyring;
  const keyUrl = substitute(repo.gpg.url, { distro });
  // If the keyring target ends in .asc, keep the ASCII-armored key as-is.
  // Otherwise, dearmor into a .gpg binary keyring (traditional style).
  const isAsc = keyringPath.endsWith(".asc");
  const lines = [];
  lines.push(`# ${repo.name} \u2014 install the signing key`);
  lines.push(`sudo install -d -m 0755 /etc/apt/keyrings`);
  if (isAsc) {
    lines.push(`sudo ${DEFAULT_TOOL} -fsSL ${keyUrl} -o ${keyringPath}`);
  } else {
    lines.push(`${DEFAULT_TOOL} -fsSL ${keyUrl} \\`);
    lines.push(`  | sudo gpg --dearmor -o ${keyringPath}`);
  }
  lines.push(`sudo chmod 0644 ${keyringPath}`);
  lines.push(`# Verify the fingerprint matches: ${formatFingerprint(repo.gpg.fingerprint)}`);
  lines.push(`gpg --show-keys --with-fingerprint ${keyringPath}`);
  return lines.join("\n");
}

function sanitiseFilename(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "third-party";
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
  const keyBlocks = supported.map((r) => renderKeyInstall(r, distro));

  const filename = supported.length === 1
    ? `${sanitiseFilename(supported[0].id)}.sources`
    : "third-party.sources";

  const sources = `# Generated third-party apt sources for ${distro} ${codename}.\n` +
    `# Review each Signed-By path and verify the upstream fingerprint.\n\n` +
    stanzas.join("\n\n") + "\n";

  const keyInstall = keyBlocks.join("\n\n") + "\n";

  const install = [
    `Save the generated content as /etc/apt/sources.list.d/${filename}`,
    "",
    "Then install each signing key with the commands in the \u201cKey install\u201d",
    "block below, verifying every fingerprint against the vendor\u2019s docs.",
    "Finally run:",
    "",
    "  sudo apt update",
  ].join("\n");

  return { filename, sources, keyInstall, install, selected: supported };
}

export function uniqueCategories(repos) {
  return [...new Set(repos.map((r) => r.category || "Other"))].sort((a, b) => a.localeCompare(b));
}
