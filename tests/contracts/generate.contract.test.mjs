import test from "node:test";
import assert from "node:assert/strict";
import { distros } from "../../assets/data/releases.js";
import { generate } from "../../assets/lib/generate.js";

test("generate() emits oneline Debian output with security suite", () => {
  const release = distros.debian.releases.find((r) => r.status === "stable");
  assert.ok(release, "expected a Debian stable release in data");

  const out = generate({
    distro: "debian",
    release,
    format: "oneline",
    architectures: ["amd64"],
    components: ["main"],
    suites: {
      release: true,
      updates: true,
      backports: true,
      security: true,
    },
    includeSrc: false,
    primaryMirror: "",
    securityMirror: "",
  });

  assert.equal(out.filename, "sources.list");
  assert.match(out.contents, /^# Debian /);
  assert.match(out.contents, /-security/);
  assert.match(out.contents, /^deb /m);
  assert.doesNotMatch(out.contents, /\[arch=/);
});

test("generate() routes Ubuntu arm64 through ports mirror", () => {
  const release = distros.ubuntu.releases.find((r) => r.status === "LTS");
  assert.ok(release, "expected an Ubuntu LTS release in data");

  const out = generate({
    distro: "ubuntu",
    release,
    format: "deb822",
    architectures: ["arm64"],
    components: ["main", "universe"],
    suites: {
      release: true,
      updates: true,
      backports: false,
      security: true,
    },
    includeSrc: false,
    primaryMirror: "https://example.invalid/ubuntu",
    securityMirror: "https://example.invalid/security",
  });

  assert.equal(out.filename, "ubuntu.sources");
  assert.match(out.contents, /^# Ubuntu /m);
  assert.match(out.contents, /URIs: https:\/\/ports\.ubuntu\.com\/ubuntu-ports/);
  assert.match(out.contents, /Architectures: arm64/);
  assert.match(out.contents, /Signed-By: \/usr\/share\/keyrings\/ubuntu-archive-keyring\.gpg/);
});

test("generate() emits install instructions without markdown fences", () => {
  const release = distros.debian.releases.find((r) => r.status === "stable");
  assert.ok(release, "expected a Debian stable release in data");

  const out = generate({
    distro: "debian",
    release,
    format: "deb822",
    architectures: ["amd64"],
    components: ["main"],
    suites: {
      release: true,
      updates: true,
      backports: false,
      security: true,
    },
    includeSrc: false,
    primaryMirror: "",
    securityMirror: "",
  });

  assert.doesNotMatch(out.instructions, /```/);
  assert.match(out.instructions, /^  sudo /m);
  assert.doesNotMatch(out.instructions, /paste the generated content here/);
  assert.match(out.instructions, /\tTypes: deb/m);
  const escapedCodename = release.codename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const plainReleaseSuite = new RegExp(`\\tSuites:\\s+[^\\n]*\\b${escapedCodename}\\b(?!-)`);
  const plainReleaseInContents = new RegExp(`^Suites:\\s+[^\\n]*\\b${escapedCodename}\\b(?!-)`, "m");
  // The base release suite must be kept: -updates/-security only carry changes.
  assert.match(out.contents, plainReleaseInContents);
  assert.match(out.instructions, plainReleaseSuite);
  // Backups copy to a unique name and never move the live file away first.
  assert.doesNotMatch(out.instructions, /sudo mv /);
  assert.match(out.instructions, /sudo cp -a \/etc\/apt\/sources\.list "\/etc\/apt\/sources\.list\.bak\.\$\(date/);
});
