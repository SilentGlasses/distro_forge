// Pure helper for the /variants/ page.
// Given a variant + a selected release entry, renders a DEB822 file.

function substitute(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : `{${k}}`
  );
}

function renderStanza(stanza, vars) {
  const lines = [];
  lines.push(`# ${stanza.name}`);
  lines.push(`Types: deb`);
  lines.push(`URIs: ${substitute(stanza.uri, vars)}`);
  lines.push(`Suites: ${stanza.suites.map((s) => substitute(s, vars)).join(" ")}`);
  lines.push(`Components: ${stanza.components.join(" ")}`);
  if (Array.isArray(stanza.architectures) && stanza.architectures.length) {
    lines.push(`Architectures: ${stanza.architectures.join(" ")}`);
  }
  if (stanza.signedBy) lines.push(`Signed-By: ${stanza.signedBy}`);
  return lines.join("\n");
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

export function build({ variant, release }) {
  if (!variant || !release) {
    throw new Error("Pick a variant and release first.");
  }
  const vars = {
    codename: release.codename,
    ubuntuCodename: release.ubuntuCodename || release.codename,
  };
  const stanzas = variant.sources.map((s) => renderStanza(s, vars));
  const header = `# ${variant.name} \u2014 ${release.label || release.codename}\n` +
    `# ${variant.homepage}\n\n`;
  const filename = `${variant.id}.sources`;
  const contents = header + stanzas.join("\n\n") + "\n";
  const installLines = [
    "Follow these steps to install the generated variant source file:",
    "",
    "Step 1: Make a backup of your current apt sources file:",
    "",
    // Copy (never move) to a timestamped name so re-running never overwrites an earlier backup.
    '  [ -f /etc/apt/sources.list ] && sudo cp -a /etc/apt/sources.list "/etc/apt/sources.list.bak.$(date +%Y%m%d%H%M%S)"',
    "",
    `Step 2: Generate the new \`${filename}\` file:`,
    "",
  ];
  appendHereDoc(installLines, `/etc/apt/sources.list.d/${filename}`, contents);
  installLines.push("");
  installLines.push("- Then retire the legacy `/etc/apt/sources.list` so apt doesn't see duplicate entries (it was backed up in Step 1):");
  installLines.push("");
  installLines.push("  [ -f /etc/apt/sources.list ] && sudo rm /etc/apt/sources.list");
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
  return { filename, contents, install };
}
