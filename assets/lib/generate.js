// Pure generation logic.
// Given a config object, returns { filename, contents, instructions }.
//
// Config shape:
// {
//   distro: "debian" | "ubuntu",
//   release: { codename, version, status, securitySuite?, isLTS?, hasBackports? },
//   format: "oneline" | "deb822",
//   architectures: string[],          // e.g. ["amd64"]
//   components: string[],             // e.g. ["main","contrib"]
//   suites: {
//     release: boolean,
//     updates: boolean,
//     backports: boolean,
//     security: boolean,
//   },
//   includeSrc: boolean,
//   primaryMirror: string,            // overrides default
//   securityMirror: string,           // overrides default
// }

import { mirrors, architectures as ARCH_TABLE } from "../data/releases.js";

const DEFAULT_ARCH = "amd64";

function buildSuitesList(codename, opts, release) {
  const list = [];
  if (opts.release)   list.push(codename);
  if (opts.updates && release.status !== "unstable") list.push(`${codename}-updates`);
  if (opts.backports && release.hasBackports !== false && release.status !== "unstable") {
    list.push(`${codename}-backports`);
  }
  return list;
}

function archQualifier(arches) {
  // Emit nothing when the selection is just the default amd64.
  if (!arches || arches.length === 0) return "";
  if (arches.length === 1 && arches[0] === DEFAULT_ARCH) return "";
  return `[arch=${arches.join(",")}] `;
}

function archField(arches) {
  if (!arches || arches.length === 0) return null;
  if (arches.length === 1 && arches[0] === DEFAULT_ARCH) return null;
  return arches.join(" ");
}

// --- Ubuntu mirror selection ---------------------------------------------

function ubuntuAllPorts(arches) {
  return arches.every((a) => {
    const entry = ARCH_TABLE.find((x) => x.id === a);
    return entry && entry.primaryFor === "ports";
  });
}

function ubuntuMirrorFor(arches, override) {
  // Ports arches are only hosted on ports.ubuntu.com; ignore any primary
  // mirror override for these arches so we don't emit a 404-bound URL.
  if (ubuntuAllPorts(arches)) return mirrors.ubuntu.ports;
  return override || mirrors.ubuntu.primary;
}

function ubuntuSecurityMirrorFor(arches, override) {
  if (ubuntuAllPorts(arches)) return mirrors.ubuntu.ports;
  return override || mirrors.ubuntu.security;
}

// --- One-line format ------------------------------------------------------

function renderOneLine(cfg) {
  const { distro, release, architectures: arches, components, includeSrc } = cfg;
  const suitesMain = buildSuitesList(release.codename, cfg.suites, release);
  const lines = [];
  const archPrefix = archQualifier(arches);
  const compStr = components.join(" ");

  const primary = distro === "ubuntu"
    ? ubuntuMirrorFor(arches, cfg.primaryMirror)
    : (cfg.primaryMirror || mirrors.debian.primary);

  const header = distro === "ubuntu"
    ? `# Ubuntu ${release.version} (${release.codename})${release.isLTS ? " LTS" : ""}`
    : `# Debian ${release.version || "sid"} (${release.codename}) \u2014 ${release.status}`;
  lines.push(header);

  for (const suite of suitesMain) {
    lines.push(`deb ${archPrefix}${primary} ${suite} ${compStr}`);
    if (includeSrc) lines.push(`deb-src ${archPrefix}${primary} ${suite} ${compStr}`);
  }

  if (cfg.suites.security && release.status !== "unstable") {
    lines.push("");
    lines.push("# Security updates");
    const secMirror = distro === "debian"
      ? (cfg.securityMirror || mirrors.debian.security)
      : ubuntuSecurityMirrorFor(arches, cfg.securityMirror);
    const secSuite = distro === "debian"
      ? (release.securitySuite || `${release.codename}-security`)
      : `${release.codename}-security`;
    lines.push(`deb ${archPrefix}${secMirror} ${secSuite} ${compStr}`);
    if (includeSrc) lines.push(`deb-src ${archPrefix}${secMirror} ${secSuite} ${compStr}`);
  }

  return lines.join("\n") + "\n";
}

// --- DEB822 format --------------------------------------------------------

function renderStanza({ types, uris, suites, components, archField: af, signedBy }) {
  const out = [];
  out.push(`Types: ${types.join(" ")}`);
  out.push(`URIs: ${uris}`);
  out.push(`Suites: ${suites.join(" ")}`);
  out.push(`Components: ${components.join(" ")}`);
  if (af) out.push(`Architectures: ${af}`);
  if (signedBy) out.push(`Signed-By: ${signedBy}`);
  return out.join("\n");
}

function renderDeb822(cfg) {
  const { distro, release, architectures: arches, components, includeSrc } = cfg;
  const suitesMain = buildSuitesList(release.codename, cfg.suites, release);
  const types = includeSrc ? ["deb", "deb-src"] : ["deb"];
  const af = archField(arches);

  const primary = distro === "ubuntu"
    ? ubuntuMirrorFor(arches, cfg.primaryMirror)
    : (cfg.primaryMirror || mirrors.debian.primary);
  const keyring = distro === "debian" ? mirrors.debian.keyring : mirrors.ubuntu.keyring;

  const stanzas = [];
  if (suitesMain.length > 0) {
    stanzas.push(renderStanza({
      types,
      uris: primary,
      suites: suitesMain,
      components,
      archField: af,
      signedBy: keyring,
    }));
  }

  if (cfg.suites.security && release.status !== "unstable") {
    const secMirror = distro === "debian"
      ? (cfg.securityMirror || mirrors.debian.security)
      : ubuntuSecurityMirrorFor(arches, cfg.securityMirror);
    const secSuite = distro === "debian"
      ? (release.securitySuite || `${release.codename}-security`)
      : `${release.codename}-security`;
    stanzas.push(renderStanza({
      types,
      uris: secMirror,
      suites: [secSuite],
      components,
      archField: af,
      signedBy: keyring,
    }));
  }

  const header = distro === "ubuntu"
    ? `# Ubuntu ${release.version} (${release.codename})${release.isLTS ? " LTS" : ""}`
    : `# Debian ${release.version || "sid"} (${release.codename}) \u2014 ${release.status}`;
  return header + "\n" + stanzas.join("\n\n") + "\n";
}

// --- Instructions ---------------------------------------------------------

// Copy (never move) so the system keeps working if a later step fails, and use
// a timestamped name so re-running never overwrites an earlier backup.
const BACKUP_SOURCES_LIST =
  '[ -f /etc/apt/sources.list ] && sudo cp -a /etc/apt/sources.list "/etc/apt/sources.list.bak.$(date +%Y%m%d%H%M%S)"';
function addHereDocBlock(lines, targetPath, generatedContents) {
  const body = String(generatedContents || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n$/, "")
    .split("\n");
  lines.push(`  sudo tee ${targetPath} > /dev/null <<-'EOF'`);
  for (const line of body) lines.push(`\t${line}`);
  lines.push("\tEOF");
}

function buildInstructions(cfg, filename, contents) {
  const note = [];
  if (cfg.format === "oneline") {
    note.push("Follow these steps to install your generated sources file:");
    note.push("");
    note.push("Step 1: Make a backup of your current apt sources file:");
    note.push("");
    note.push(`  ${BACKUP_SOURCES_LIST}`);
    note.push("");
    note.push("Step 2: Generate the new `/etc/apt/sources.list` file:");
    note.push("");
    addHereDocBlock(note, "/etc/apt/sources.list", contents);
    note.push("");
    note.push("Step 3: Set ownership and mode.");
    note.push("");
    note.push("- Set ownership:");
    note.push("");
    note.push("  sudo chown root:root /etc/apt/sources.list");
    note.push("");
    note.push("- Set mode:");
    note.push("");
    note.push("  sudo chmod 644 /etc/apt/sources.list");
    note.push("");
    note.push("Step 4: Refresh package metadata, then choose an upgrade path.");
    note.push("");
    note.push("- Run update:");
    note.push("");
    note.push("  sudo apt update");
    note.push("");
    note.push("- Base upgrade:");
    note.push("");
    note.push("  sudo apt upgrade");
    note.push("");
    note.push("- Full dist-upgrade:");
    note.push("");
    note.push("  sudo apt full-upgrade");
  } else {
    note.push("Follow these steps to install your generated DEB822 source file:");
    note.push("");
    note.push("Step 1: Make a backup of your current apt sources file:");
    note.push("");
    note.push(`  ${BACKUP_SOURCES_LIST}`);
    note.push("");
    note.push(`Step 2: Generate the new \`${filename}\` file:`);
    note.push("");
    addHereDocBlock(note, `/etc/apt/sources.list.d/${filename}`, contents);
    note.push("");
    note.push("- Then retire the legacy `/etc/apt/sources.list` so apt doesn't see duplicate entries (it was backed up in Step 1):");
    note.push("");
    note.push("  [ -f /etc/apt/sources.list ] && sudo rm /etc/apt/sources.list");
    note.push("");
    note.push("- If `/etc/apt/sources.list.d/` also has a distro-provided `debian.sources` or `ubuntu.sources` covering the same suites, back it up and remove it too.");
    note.push("");
    note.push("Step 3: Set ownership and mode.");
    note.push("");
    note.push("- Set ownership:");
    note.push("");
    note.push(`  sudo chown root:root /etc/apt/sources.list.d/${filename}`);
    note.push("");
    note.push("- Set mode:");
    note.push("");
    note.push(`  sudo chmod 644 /etc/apt/sources.list.d/${filename}`);
    note.push("");
    note.push("Step 4: Refresh package metadata, then choose an upgrade path.");
    note.push("");
    note.push("- Run update:");
    note.push("");
    note.push("  sudo apt update");
    note.push("");
    note.push("- Base upgrade:");
    note.push("");
    note.push("  sudo apt upgrade");
    note.push("");
    note.push("- Full dist-upgrade:");
    note.push("");
    note.push("  sudo apt full-upgrade");
  }
  return note.join("\n");
}

// --- Public entry point ---------------------------------------------------

export function generate(cfg) {
  if (!cfg || !cfg.distro || !cfg.release) {
    throw new Error("generate(): missing distro/release");
  }
  if (!cfg.components || cfg.components.length === 0) {
    throw new Error("Select at least one component.");
  }
  if (!cfg.architectures || cfg.architectures.length === 0) {
    throw new Error("Select at least one architecture.");
  }
  const anySuite =
    cfg.suites.release || cfg.suites.updates || cfg.suites.backports || cfg.suites.security;
  if (!anySuite) {
    throw new Error("Select at least one suite (release, updates, backports, or security).");
  }

  const filename = cfg.format === "deb822"
    ? `${cfg.distro}.sources`
    : `sources.list`;

  const contents = cfg.format === "deb822" ? renderDeb822(cfg) : renderOneLine(cfg);
  const instructions = buildInstructions(cfg, filename, contents);
  return { filename, contents, instructions };
}
