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

function buildInstructions(cfg, filename) {
  const note = [];
  if (cfg.format === "oneline") {
    note.push("Save the generated content as /etc/apt/sources.list (root-owned, mode 644).");
    note.push("");
    note.push("Quick install (backs up any existing file first):");
    note.push("```");
    note.push("sudo cp /etc/apt/sources.list /etc/apt/sources.list.bak 2>/dev/null || true");
    note.push(`sudo tee /etc/apt/sources.list > /dev/null <<'EOF'`);
    note.push("# (paste the generated content here)");
    note.push("EOF");
    note.push("sudo apt update");
    note.push("```");
  } else {
    note.push(`Save the generated content as /etc/apt/sources.list.d/${filename} (root-owned, mode 644).`);
    note.push("");
    note.push("If /etc/apt/sources.list still contains legacy entries for the same suites, comment them out");
    note.push("or delete that file to avoid duplicate-sources warnings from apt.");
    note.push("");
    note.push("Quick install:");
    note.push("```");
    note.push(`sudo tee /etc/apt/sources.list.d/${filename} > /dev/null <<'EOF'`);
    note.push("# (paste the generated content here)");
    note.push("EOF");
    note.push(`sudo chmod 644 /etc/apt/sources.list.d/${filename}`);
    note.push("sudo apt update");
    note.push("```");
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
  const instructions = buildInstructions(cfg, filename);
  return { filename, contents, instructions };
}
