import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { distros, architectures } from "../../assets/data/releases.js";
import { variants } from "../../assets/data/variants.js";
import { generate } from "../../assets/lib/generate.js";
import { build as buildThirdParty } from "../../assets/lib/third-party.js";
import { build as buildVariant } from "../../assets/lib/variant.js";

test("main generator can produce output for every listed distro release", () => {
  for (const [distroKey, distro] of Object.entries(distros)) {
    for (const release of distro.releases) {
      const arch = distroKey === "ubuntu"
        ? architectures.find((a) => a.id === "arm64")?.id || "amd64"
        : "amd64";
      const out = generate({
        distro: distroKey,
        release,
        format: "deb822",
        architectures: [arch],
        components: distro.defaultComponents.slice(0, 2),
        suites: {
          release: true,
          updates: release.status !== "unstable",
          backports: release.hasBackports !== false && release.status !== "unstable",
          security: release.status !== "unstable",
        },
        includeSrc: false,
        primaryMirror: "",
        securityMirror: "",
      });
      assert.ok(out.contents.length > 0, `expected output for ${distroKey}:${release.codename}`);
    }
  }
});

test("variant builder can render every declared variant release", () => {
  for (const variant of variants) {
    for (const release of variant.releases) {
      const out = buildVariant({ variant, release });
      assert.ok(out.contents.includes(variant.name), `expected variant name for ${variant.id}:${release.codename}`);
      assert.ok(out.contents.includes("Types: deb"), `expected deb stanza for ${variant.id}:${release.codename}`);
    }
  }
});

test("third-party builder can render each enabled repository for one supported release", () => {
  const repos = JSON.parse(readFileSync(new URL("../../data/third-party/repos.json", import.meta.url), "utf8"));
  const enabled = new Set(
    readFileSync(new URL("../../data/third-party/index.txt", import.meta.url), "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
  );
  const enabledRepos = repos.filter((r) => enabled.has(r.id));

  for (const repo of enabledRepos) {
    const supportedDistros = Object.entries(repo.supports || {}).filter(([, list]) => Array.isArray(list) && list.length);
    assert.ok(supportedDistros.length > 0, `expected supports for ${repo.id}`);

    const [distro, codenames] = supportedDistros[0];
    const codename = codenames[0];
    const out = buildThirdParty({ repos: [repo], distro, codename });

    assert.ok(out.sources.includes("Types: deb"), `expected DEB822 stanza for ${repo.id}`);
    assert.ok(out.keyInstall.includes('if [ "$KEY_FPRS" = '), `expected automated fingerprint check for ${repo.id}`);
    assert.ok(!out.keyInstall.includes("has no valid fingerprint"), `expected a valid fingerprint on record for ${repo.id}`);
  }
});
