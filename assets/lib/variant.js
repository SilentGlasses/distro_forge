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
  const install = [
    `Save the generated content as /etc/apt/sources.list.d/${filename}`,
    "(root-owned, mode 644). Then:",
    "",
    "  sudo apt update",
  ].join("\n");
  return { filename, contents, install };
}
