# Contributing

Thanks for your interest in improving the APT sources generator. This
repo is a small static site, so contributing should be painless.

## Quick setup

```bash
git clone https://github.com/SilentGlasses/deb-sources.git
cd deb-sources
npm run serve       # or: python3 -m http.server 8080
# open http://localhost:8080
```

Don't open `index.html` via `file://` as browsers block ES-module imports
from that protocol.

## Repository layout

- `index.html`, `help/`, `third-party/`, `variants/`: one HTML file per
  page. No build step, no framework.
- `assets/styles.css`: palette and all shared styling.
- `assets/app.js`: main generator page wiring.
- `assets/lib/`
  - `generate.js`: pure generator for the main page (Debian/Ubuntu).
  - `third-party.js`: pure builder used by `/third-party/`.
  - `variant.js`: pure builder used by `/variants/`.
  - `ui.js`: shared theme toggle + active-nav highlighting.
- `assets/data/`
  - `releases.js`: **auto-generated** Debian/Ubuntu release list.
  - `mirrors-list.js`: **auto-pruned** mirror list.
  - `variants.js`: hand-curated Linux-variants data.
- `data/third-party/`: curated third-party repo data.
  - `repos.json`: one JSON array of all known repos.
  - `index.txt`: plain list of enabled repo IDs (one per line).
- `scripts/`: Node ≥ 18 scripts used by the update workflows.
- `.github/workflows/`: Pages deploy + data-refresh workflows.

## Coding conventions

- Plain HTML + CSS + vanilla ES modules. No bundler, no framework.
- Prefer `<details>`/`<summary>` and semantic elements over JS-only
  widgets where it makes sense.
- Keep `generate.js`, `third-party.js`, and `variant.js` **pure**: no
  DOM access, no globals.
- All palette values live in CSS custom properties in `:root` /
  `:root[data-theme="dark"]`. Don't hard-code colors elsewhere.
- Use `currentColor` in SVGs so icons follow the theme.
- Share the theme toggle + nav highlighting via
  `assets/lib/ui.js#initUi()`: every page-level `<script type="module">`
  should call it.

## Adding a third-party repo

1. Add a new entry to `data/third-party/repos.json`. Required fields:
   - `id` (kebab-case, unique)
   - `name`, `category`, `homepage`, `description`
   - `supports`: `{ debian: ["codename", ...], ubuntu: [...] }`
   - `uri`: archive URL, optionally with `{distro}` / `{codename}`
     placeholders
   - `suite` and `components`
   - `gpg`: `{ url, fingerprint, keyring }`: the fingerprint must be
     the full 40-hex-char form and the keyring should live under
     `/etc/apt/keyrings/`.
2. Add the `id` to `data/third-party/index.txt` to enable it in the UI.
3. Open a PR and link the vendor's official install docs.
   `validate-third-party` will check that the JSON is well-formed, the
   URLs resolve, and the declared fingerprint matches the actual key.

## Adding a Linux variant

Edit `assets/data/variants.js` and append an entry to the `variants`
array. Each variant declares:

- `id` (kebab-case), `name`, `family` (`"debian"` or `"ubuntu"`)
- `description`, `homepage`
- `releases[]`: each `{ codename, version, label }`, plus an
  `ubuntuCodename` on Ubuntu-derived variants so the base stanzas can be
  pinned to the right Ubuntu release.
- `sources[]`: DEB822-style stanzas with `name`, `uri`, `suites[]`,
  `components[]`, optional `architectures[]`, and `signedBy`. Both
  `uri` and each `suites[]` entry support the `{codename}` and
  `{ubuntuCodename}` placeholders.

## Running the data scripts locally

```bash
npm run update:releases         # node scripts/update-releases.mjs
npm run update:mirrors          # node scripts/update-mirrors.mjs
npm run validate:third-party    # node scripts/validate-third-party.mjs
```

Each requires Node 18+ (for global `fetch`). The third-party validator
also shells out to `gpg` for fingerprint verification.

Two transient artifacts are ignored in git:

- `.release-notes.md`: human-readable release diff; used as the body
  of the auto-opened PR.
- `.third-party-report.txt`: validator report; attached to the
  tracking issue on scheduled failures.

## Commit style

Short imperative subject lines, optionally prefixed with a scope
(`third-party:`, `variants:`, `mirrors:`, `releases:`, `docs:`). Wrap
bodies at ~72 columns. Include `Co-Authored-By:` lines for
collaborators.

## Before opening a PR

- Walk through every affected page in both light and dark themes with
  `npm run serve`.
- Check the browser console is clean.
- If you touched a generator helper (`generate.js`, `third-party.js`,
  `variant.js`), generate a few representative outputs in the UI and
  eyeball the results.
- If you touched third-party data, run
  `npm run validate:third-party` locally, the workflow will do this on
  your PR anyway, but it's quicker to catch issues here.
- Update `README.md` if you add, rename, or remove a page, data file,
  script, or workflow.

## Reporting bugs / requesting features

Use the issue templates under **Issues → New issue**. There's a
template specifically for requesting a new third-party repo that asks
for the upstream docs link and the full GPG fingerprint up-front.
