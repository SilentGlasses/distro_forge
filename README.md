[![Deploy to GitHub Pages](https://github.com/SilentGlasses/distro_forge/actions/workflows/pages.yml/badge.svg)](https://github.com/SilentGlasses/distro_forge/actions/workflows/pages.yml)
[![Validate third-party repos](https://github.com/SilentGlasses/distro_forge/actions/workflows/validate-third-party.yml/badge.svg)](https://github.com/SilentGlasses/distro_forge/actions/workflows/validate-third-party.yml)
[![Update supported releases](https://github.com/SilentGlasses/distro_forge/actions/workflows/update-releases.yml/badge.svg)](https://github.com/SilentGlasses/distro_forge/actions/workflows/update-releases.yml)
[![Prune unreachable mirrors](https://github.com/SilentGlasses/distro_forge/actions/workflows/update-mirrors.yml/badge.svg)](https://github.com/SilentGlasses/distro_forge/actions/workflows/update-mirrors.yml)
[![Smoke tests](https://github.com/SilentGlasses/distro_forge/actions/workflows/smoke-tests.yml/badge.svg)](https://github.com/SilentGlasses/distro_forge/actions/workflows/smoke-tests.yml)

---

# DistroForge APT sources generator
Generate clean, verifiable Debian and Ubuntu APT sources — entirely in your browser.
<img align="right" width="100" alt="distro_forge" src="https://github.com/user-attachments/assets/83264b45-cc10-406d-91f1-5146ceadaa99" />

**DistroForge** is a small, static web tool for composing Debian and Ubuntu `apt` sources directly in the browser.

It helps you build clean, correct `sources.list` or DEB822 `.sources` configurations by combining:

- official distribution repositories
- curated third-party sources
- derived distribution entries

No accounts, no backend, no tracking — just a single HTML/CSS/JS bundle served via GitHub Pages.

**Live site:** https://silentglasses.github.io/distro_forge/

## Why use it?

- Avoid manual `sources.list` errors and outdated examples
- Quickly assemble reproducible APT configurations
- Verify third-party repos with visible key fingerprints
- Stay in control, everything runs client-side, no hidden logic

Built for people who prefer simple, inspectable tools over opaque web apps.

## Pages

| Path | What it does |
|------|--------------|
| `/` | Emits a ready-to-use `sources.list` or DEB822 `.sources`. |
| `/third-party/` | Curated catalog of third-party apt repos. |
| `/variants/` | Sources for Debian and Ubuntu derived distros|
| `/help/` | FAQ / troubleshooting |

## Features

- Progressive-disclosure UI: options unlock based on upstream selections; nothing is pre-selected.
- Correct Ubuntu architecture routing: non-amd64 architectures automatically use `ports.ubuntu.com/ubuntu-ports`, including security updates.
- Optional mirror selection with country-grouped lists for Debian and Ubuntu.
- Outputs both traditional `sources.list` and DEB822 `.sources` formats.
- Copy-to-clipboard on all outputs; per-page reset to start clean.
- Light/dark theme with persistence via `localStorage`.
- Third-party entries include keyring paths and full GPG fingerprints for manual verification.

## Local preview

Pure static site with ES modules, testing locally:

```bash
cd distro_forge
python3 -m http.server 8080
# open http://localhost:8080
```

Don't open `index.html` via `file://`, browsers block ES-module imports from that protocol.

## Keeping data fresh

Three datasets are tracked in the repo and refreshed automatically via scheduled GitHub Actions workflows. Every workflow opens a **pull request** rather than committing straight to `main`, so changes are reviewable.

### Supported releases, `assets/data/releases.js`

- **Source**: the canonical `distro-info-data` CSVs for [Debian](https://salsa.debian.org/debian/distro-info-data/-/raw/main/debian.csv) and [Ubuntu](https://salsa.debian.org/debian/distro-info-data/-/raw/main/ubuntu.csv).
- **Script**: `scripts/update-releases.mjs` regenerates the file and writes a human-readable diff to `.release-notes.md` (added / removed / status-changed releases).
- **Workflow**: `.github/workflows/update-releases.yml` runs every Monday at 06:00 UTC and via `workflow_dispatch`; opens a PR labelled `release-data` with the diff as the body.

### Mirror list, `assets/data/mirrors-list.js`

- **Script**: `scripts/update-mirrors.mjs` HEADs every mirror URL and drops any that fail within 8 s.
- **Workflow**: `.github/workflows/update-mirrors.yml` runs every Wednesday at 06:00 UTC; opens a PR labeled `mirror-data` with the pruned list and the list of dropped mirrors.
- Adding a new mirror is a manual PR edit, the pruner only removes.

### Third-party repos, `data/third-party/repos.json` + `index.txt`

- **Script**: `scripts/validate-third-party.mjs` checks schema, HEADs `homepage` / `uri` / `gpg.url`, and verifies the declared GPG fingerprint against the actual key (requires `gpg`; Actions runners have it).
- **Workflow**: `.github/workflows/validate-third-party.yml` runs on every push/PR touching third-party data and weekly on Thursdays. Push/PR runs fail the build on any validation error; scheduled runs open or update an issue labeled `third-party-validation` instead.

## Manual regeneration

```bash
node scripts/update-releases.mjs
node scripts/update-mirrors.mjs
node scripts/validate-third-party.mjs
```

All scripts need Node 18+ (for global `fetch`). The validator also shells out to `gpg` for fingerprint verification.

## Deploying

`.github/workflows/pages.yml` deploys the repo root to GitHub Pages on every push to `main`. Source set to **GitHub Actions** in **Settings → Pages**. The `.nojekyll` file keeps Pages from running Jekyll.

## Project layout

```
deb_sources/
├── index.html
├── help/index.html
├── third-party/
│   ├── index.html
│   └── app.js
├── variants/
│   ├── index.html
│   └── app.js
├── assets/
│   ├── styles.css
│   ├── app.js                              # main generator wiring
│   ├── data/
│   │   ├── releases.js                     # AUTO-GENERATED distro/release data
│   │   ├── mirrors-list.js                 # AUTO-PRUNED mirror list
│   │   └── variants.js                     # hand-curated variants data
│   └── lib/
│       ├── generate.js                     # pure generator for main page
│       ├── third-party.js                  # builder for /third-party/
│       ├── variant.js                      # builder for /variants/
│       └── ui.js                           # shared theme + active-nav helpers
├── data/third-party/
│   ├── repos.json                          # curated repos
│   └── index.txt                           # enabled repo IDs
├── scripts/
│   ├── update-releases.mjs
│   ├── update-mirrors.mjs
│   └── validate-third-party.mjs
├── .github/
│   ├── workflows/
│   │   ├── pages.yml
│   │   ├── update-releases.yml
│   │   ├── update-mirrors.yml
│   │   └── validate-third-party.yml
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml
│   │   ├── feature_request.yml
│   │   ├── third_party_request.yml
│   │   └── config.yml
│   └── PULL_REQUEST_TEMPLATE.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── LICENSE
├── .gitignore
├── .nojekyll
├── package.json
└── README.md
```

## Contributing & Support

Contributions are welcome, especially:

- adding or verifying third-party repositories
- improving mirror coverage
- fixing edge cases in source generation

If you find this tool useful, consider:

- opening issues for gaps or inaccuracies
- submitting PRs for data updates or improvements
- sponsoring to support ongoing maintenance and data curation

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full rundown of data formats, validation scripts, conventions, and what to check before opening a PR. Participation is subject to our [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

Issue templates are available for bug reports, feature requests, and new third-party repo requests. The third-party template asks for the upstream docs link and the full GPG fingerprint up-front.

## License

MIT, see [`LICENSE`](./LICENSE).
