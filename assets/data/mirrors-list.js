// Curated list of public primary apt mirrors, grouped by country code.
//
// This file is AUTO-MAINTAINED by scripts/update-mirrors.mjs, which runs
// weekly and prunes any mirror that fails a HEAD / GET health check. To
// add a new mirror, edit this file by hand and open a PR — the pruner
// only removes entries, it never adds them.

// Country names keyed by ISO 3166-1 alpha-2 code.
export const countryNames = {
  AU: "Australia",
  BR: "Brazil",
  CA: "Canada",
  DE: "Germany",
  FR: "France",
  GB: "United Kingdom",
  IT: "Italy",
  JP: "Japan",
  NL: "Netherlands",
  SE: "Sweden",
  US: "United States",
};

// Debian mirrors.
export const debianMirrorList = [
  { country: "AU", name: "mirror.aarnet.edu.au"                  , url: "http://mirror.aarnet.edu.au/pub/debian" },
  { country: "BR", name: "ftp.br.debian.org"                     , url: "http://ftp.br.debian.org/debian" },
  { country: "CA", name: "mirror.csclub.uwaterloo.ca"            , url: "http://mirror.csclub.uwaterloo.ca/debian" },
  { country: "DE", name: "ftp.de.debian.org"                     , url: "http://ftp.de.debian.org/debian" },
  { country: "FR", name: "ftp.fr.debian.org"                     , url: "http://ftp.fr.debian.org/debian" },
  { country: "GB", name: "ftp.uk.debian.org"                     , url: "http://ftp.uk.debian.org/debian" },
  { country: "IT", name: "ftp.it.debian.org"                     , url: "http://ftp.it.debian.org/debian" },
  { country: "NL", name: "ftp.nl.debian.org"                     , url: "http://ftp.nl.debian.org/debian" },
  { country: "SE", name: "ftp.se.debian.org"                     , url: "http://ftp.se.debian.org/debian" },
  { country: "US", name: "mirrors.edge.kernel.org"               , url: "http://mirrors.edge.kernel.org/debian" },
  { country: "US", name: "debian.osuosl.org"                     , url: "http://debian.osuosl.org/debian" },
];

// Ubuntu mirrors (primary arches only — ports.ubuntu.com handled by the generator).
export const ubuntuMirrorList = [
  { country: "AU", name: "au.archive.ubuntu.com"                 , url: "http://au.archive.ubuntu.com/ubuntu" },
  { country: "BR", name: "br.archive.ubuntu.com"                 , url: "http://br.archive.ubuntu.com/ubuntu" },
  { country: "CA", name: "ca.archive.ubuntu.com"                 , url: "http://ca.archive.ubuntu.com/ubuntu" },
  { country: "DE", name: "de.archive.ubuntu.com"                 , url: "http://de.archive.ubuntu.com/ubuntu" },
  { country: "FR", name: "fr.archive.ubuntu.com"                 , url: "http://fr.archive.ubuntu.com/ubuntu" },
  { country: "GB", name: "gb.archive.ubuntu.com"                 , url: "http://gb.archive.ubuntu.com/ubuntu" },
  { country: "IT", name: "it.archive.ubuntu.com"                 , url: "http://it.archive.ubuntu.com/ubuntu" },
  { country: "JP", name: "jp.archive.ubuntu.com"                 , url: "http://jp.archive.ubuntu.com/ubuntu" },
  { country: "NL", name: "nl.archive.ubuntu.com"                 , url: "http://nl.archive.ubuntu.com/ubuntu" },
  { country: "SE", name: "se.archive.ubuntu.com"                 , url: "http://se.archive.ubuntu.com/ubuntu" },
  { country: "US", name: "us.archive.ubuntu.com"                 , url: "http://us.archive.ubuntu.com/ubuntu" },
];

// Grouped by country for <optgroup> rendering.
export function groupByCountry(list) {
  const groups = new Map();
  for (const m of list) {
    if (!groups.has(m.country)) groups.set(m.country, []);
    groups.get(m.country).push(m);
  }
  return [...groups.entries()]
    .sort((a, b) => (countryNames[a[0]] || a[0]).localeCompare(countryNames[b[0]] || b[0]))
    .map(([code, mirrors]) => ({
      code,
      label: countryNames[code] || code,
      mirrors: mirrors.slice().sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
