// Hand-curated data for Debian- and Ubuntu-derived Linux variants.
//
// Each variant declares one or more `sources` stanzas using the DEB822
// field names. Supported placeholders inside `uri` and each entry of
// `suites`:
//
//   {codename}        \u2014 the selected release codename.
//   {ubuntuCodename}  \u2014 (Ubuntu-derived only) the base Ubuntu codename
//                       declared on the selected release entry.
//
// `family` is purely informational here \u2014 the helper emits DEB822 the
// same way for both.

export const variants = [
  // ---- Debian-derived ----------------------------------------------------
  {
    id: "raspberry-pi-os",
    name: "Raspberry Pi OS",
    family: "debian",
    description: "Debian-derived OS optimised for Raspberry Pi hardware.",
    homepage: "https://www.raspberrypi.com/software/",
    releases: [
      { codename: "bookworm", version: "12", label: "Bookworm (12)" },
      { codename: "bullseye", version: "11", label: "Bullseye (11)" },
    ],
    sources: [
      {
        name: "Raspberry Pi OS base",
        uri: "http://raspbian.raspberrypi.org/raspbian",
        suites: ["{codename}"],
        components: ["main", "contrib", "non-free", "rpi"],
        signedBy: "/usr/share/keyrings/raspbian-archive-keyring.gpg",
      },
      {
        name: "Raspberry Pi archive (kernel, userland)",
        uri: "http://archive.raspberrypi.org/debian",
        suites: ["{codename}"],
        components: ["main"],
        signedBy: "/usr/share/keyrings/raspberrypi-archive-keyring.gpg",
      },
    ],
  },
  {
    id: "kali-linux",
    name: "Kali Linux",
    family: "debian",
    description: "Debian-based distribution for penetration testing and security research.",
    homepage: "https://www.kali.org/",
    releases: [
      { codename: "kali-rolling", version: "rolling", label: "Rolling" },
    ],
    sources: [
      {
        name: "Kali Linux rolling",
        uri: "http://http.kali.org/kali",
        suites: ["{codename}"],
        components: ["main", "contrib", "non-free", "non-free-firmware"],
        signedBy: "/usr/share/keyrings/kali-archive-keyring.gpg",
      },
    ],
  },
  {
    id: "proxmox-ve",
    name: "Proxmox VE",
    family: "debian",
    description: "Virtualisation platform built on Debian; emits the no-subscription repository by default.",
    homepage: "https://pve.proxmox.com/wiki/Package_Repositories",
    releases: [
      { codename: "bookworm", version: "8", label: "Proxmox VE 8 (Debian 12)" },
      { codename: "bullseye", version: "7", label: "Proxmox VE 7 (Debian 11)" },
    ],
    sources: [
      {
        name: "Proxmox VE no-subscription repository",
        uri: "http://download.proxmox.com/debian/pve",
        suites: ["{codename}"],
        components: ["pve-no-subscription"],
        signedBy: "/usr/share/keyrings/proxmox-archive-keyring.gpg",
      },
    ],
  },

  // ---- Ubuntu-derived ----------------------------------------------------
  {
    id: "linux-mint",
    name: "Linux Mint",
    family: "ubuntu",
    description: "Ubuntu-based desktop distribution maintained by the Linux Mint team.",
    homepage: "https://linuxmint.com/",
    releases: [
      { codename: "xia",      version: "22",   ubuntuCodename: "noble", label: "Mint 22 (Xia, on Ubuntu 24.04)" },
      { codename: "virginia", version: "21.3", ubuntuCodename: "jammy", label: "Mint 21.3 (Virginia, on Ubuntu 22.04)" },
    ],
    sources: [
      {
        name: "Linux Mint packages",
        uri: "http://packages.linuxmint.com",
        suites: ["{codename}"],
        components: ["main", "upstream", "import", "backport"],
        signedBy: "/usr/share/keyrings/linuxmint-archive-keyring.gpg",
      },
      {
        name: "Ubuntu base",
        uri: "http://archive.ubuntu.com/ubuntu",
        suites: ["{ubuntuCodename}", "{ubuntuCodename}-updates", "{ubuntuCodename}-backports"],
        components: ["main", "restricted", "universe", "multiverse"],
        signedBy: "/usr/share/keyrings/ubuntu-archive-keyring.gpg",
      },
      {
        name: "Ubuntu security",
        uri: "http://security.ubuntu.com/ubuntu",
        suites: ["{ubuntuCodename}-security"],
        components: ["main", "restricted", "universe", "multiverse"],
        signedBy: "/usr/share/keyrings/ubuntu-archive-keyring.gpg",
      },
    ],
  },
  {
    id: "pop-os",
    name: "Pop!_OS",
    family: "ubuntu",
    description: "System76's Ubuntu-based desktop distribution.",
    homepage: "https://pop.system76.com/",
    releases: [
      { codename: "noble", version: "24.04", ubuntuCodename: "noble", label: "Pop!_OS 24.04 (on Ubuntu 24.04)" },
      { codename: "jammy", version: "22.04", ubuntuCodename: "jammy", label: "Pop!_OS 22.04 (on Ubuntu 22.04)" },
    ],
    sources: [
      {
        name: "Pop!_OS release",
        uri: "http://apt.pop-os.org/release",
        suites: ["{codename}"],
        components: ["main"],
        signedBy: "/usr/share/keyrings/pop-archive-keyring.gpg",
      },
      {
        name: "Ubuntu base",
        uri: "http://archive.ubuntu.com/ubuntu",
        suites: ["{ubuntuCodename}", "{ubuntuCodename}-updates", "{ubuntuCodename}-backports"],
        components: ["main", "restricted", "universe", "multiverse"],
        signedBy: "/usr/share/keyrings/ubuntu-archive-keyring.gpg",
      },
      {
        name: "Ubuntu security",
        uri: "http://security.ubuntu.com/ubuntu",
        suites: ["{ubuntuCodename}-security"],
        components: ["main", "restricted", "universe", "multiverse"],
        signedBy: "/usr/share/keyrings/ubuntu-archive-keyring.gpg",
      },
    ],
  },
  {
    id: "elementary-os",
    name: "elementary OS",
    family: "ubuntu",
    description: "Open-source, design-focused desktop OS based on Ubuntu LTS.",
    homepage: "https://elementary.io/",
    releases: [
      { codename: "horus", version: "8",   ubuntuCodename: "noble", label: "elementary OS 8 (Horus, on Ubuntu 24.04)" },
      { codename: "jolnir", version: "7.1", ubuntuCodename: "jammy", label: "elementary OS 7.1 (Jolnir, on Ubuntu 22.04)" },
    ],
    sources: [
      {
        name: "elementary OS stable",
        uri: "http://ppa.launchpadcontent.net/elementary-os/stable/ubuntu",
        suites: ["{ubuntuCodename}"],
        components: ["main"],
        signedBy: "/usr/share/keyrings/elementary-archive-keyring.gpg",
      },
      {
        name: "Ubuntu base",
        uri: "http://archive.ubuntu.com/ubuntu",
        suites: ["{ubuntuCodename}", "{ubuntuCodename}-updates", "{ubuntuCodename}-backports"],
        components: ["main", "restricted", "universe", "multiverse"],
        signedBy: "/usr/share/keyrings/ubuntu-archive-keyring.gpg",
      },
      {
        name: "Ubuntu security",
        uri: "http://security.ubuntu.com/ubuntu",
        suites: ["{ubuntuCodename}-security"],
        components: ["main", "restricted", "universe", "multiverse"],
        signedBy: "/usr/share/keyrings/ubuntu-archive-keyring.gpg",
      },
    ],
  },
];
