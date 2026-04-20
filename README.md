# DistroForge APT sources generator

<img align="left" width="100" alt="distro_forge" src="https://github.com/user-attachments/assets/83264b45-cc10-406d-91f1-5146ceadaa99" />

A small static site for building Debian & Ubuntu `apt` sources, curated third-party repos, and derived-distro sources, all in the browser.

**Live site:** https://silentglasses.github.io/distro_forge/

No backend, no tracking. One HTML/CSS/JS tree served via GitHub Pages.

## Pages

| Path | What it does |
|------|--------------|
| `/` | Emits a ready-to-use `sources.list` or DEB822 `.sources`. |
| `/third-party/` | Curated catalog of third-party apt repos. |
| `/variants/` | Sources for Debian and Ubuntu derived distros|
| `/help/` | FAQ / troubleshooting |

## Features

- Progressive-disclosure forms: nothing is pre-selected, downstream fields unlock as you pick upstream ones.
- Ubuntu architecture routing: selecting `arm64`, `armhf`, `ppc64el`, `riscv64` or `s390x` automatically switches both primary and security URIs to `ports.ubuntu.com/ubuntu-ports` (even if an explicit mirror was chosen).
- Optional mirror picker with country-grouped `<optgroup>` lists for Debian and Ubuntu.
- Copy buttons on every output block. Per-page Reset buttons to start over.
- Light / dark theme toggle shared across pages, persisted in `localStorage`.
- Keyring paths and fingerprints displayed prominently on third-party entries so you can cross-check against the vendor's docs.

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

- Source: the canonical
  [`distro-info-data`](https://salsa.debian.org/debian/distro-info-data) CSVs for Debian and Ubuntu.
- Script: `scripts/update-releases.mjs` regenerates the file and writes a human-readable diff to `.release-notes.md` (added / removed / status-changed releases).
- Workflow: `.github/workflows/update-releases.yml` runs every Monday at 06:00 UTC and via `workflow_dispatch`; opens a PR labelled `release-data` with the diff as the body.

### Mirror list, `assets/data/mirrors-list.js`

- Script: `scripts/update-mirrors.mjs` HEADs every mirror URL and drops any that fail within 8 s.
- Workflow: `.github/workflows/update-mirrors.yml` runs every Wednesday at 06:00 UTC; opens a PR labelled `mirror-data` with the pruned list and the list of dropped mirrors.
- Adding a new mirror is a manual PR edit, the pruner only removes.

### Third-party repos, `data/third-party/repos.json` + `index.txt`

- Script: `scripts/validate-third-party.mjs` checks schema, HEADs `homepage` / `uri` / `gpg.url`, and verifies the declared GPG fingerprint against the actual key (requires `gpg`; Actions runners have it).
- Workflow: `.github/workflows/validate-third-party.yml` runs on every push/PR touching third-party data and weekly on Thursdays. Push/PR runs fail the build on any validation error; scheduled runs open or update an issue labelled `third-party-validation` instead.

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

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full rundown of data formats, validation scripts, conventions, and what to check before opening a PR. Participation is subject to our [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

Issue templates are available for bug reports, feature requests, and new third-party repo requests. The third-party template asks for the upstream docs link and the full GPG fingerprint up-front.

## License

MIT, see [`LICENSE`](./LICENSE).
