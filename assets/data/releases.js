// Data model for supported distros, releases, mirrors and architectures.
// Update this file to add/remove releases or change defaults.

export const mirrors = {
  debian: {
    primary: "http://deb.debian.org/debian",
    security: "http://security.debian.org/debian-security",
    keyring: "/usr/share/keyrings/debian-archive-keyring.gpg",
  },
  ubuntu: {
    // Used for amd64 / i386.
    primary: "http://archive.ubuntu.com/ubuntu",
    // Used for non-primary archs (arm64, armhf, ppc64el, riscv64, s390x).
    ports: "http://ports.ubuntu.com/ubuntu-ports",
    // Ubuntu security lives on the same host, different suite.
    security: "http://security.ubuntu.com/ubuntu",
    keyring: "/usr/share/keyrings/ubuntu-archive-keyring.gpg",
  },
};

// `primaryFor` tells the generator which Ubuntu mirror host to use.
export const architectures = [
  { id: "amd64",    label: "amd64 (x86_64)",            primaryFor: "ubuntu" },
  { id: "i386",     label: "i386 (x86, 32-bit)",        primaryFor: "ubuntu" },
  { id: "arm64",    label: "arm64 (aarch64)",           primaryFor: "ports"  },
  { id: "armhf",    label: "armhf (ARM hard-float)",    primaryFor: "ports"  },
  { id: "ppc64el",  label: "ppc64el (POWER LE)",        primaryFor: "ports"  },
  { id: "riscv64",  label: "riscv64",                   primaryFor: "ports"  },
  { id: "s390x",    label: "s390x (IBM Z)",             primaryFor: "ports"  },
];

export const debian = {
  components: ["main", "contrib", "non-free", "non-free-firmware"],
  defaultComponents: ["main"],
  releases: [
    {
      codename: "trixie",
      version: "13",
      status: "testing",
      // Debian 12+ moved security to <codename>-security on security.debian.org.
      securitySuite: "trixie-security",
      hasBackports: false,
    },
    {
      codename: "bookworm",
      version: "12",
      status: "stable",
      securitySuite: "bookworm-security",
      hasBackports: true,
    },
    {
      codename: "bullseye",
      version: "11",
      status: "oldstable",
      securitySuite: "bullseye-security",
      hasBackports: true,
    },
    {
      codename: "sid",
      version: "",
      status: "unstable",
      // sid has no security or -updates suite.
      securitySuite: null,
      hasBackports: false,
    },
  ],
};

export const ubuntu = {
  components: ["main", "restricted", "universe", "multiverse"],
  defaultComponents: ["main", "restricted", "universe", "multiverse"],
  releases: [
    {
      codename: "plucky",
      version: "25.04",
      status: "interim",
      isLTS: false,
    },
    {
      codename: "noble",
      version: "24.04",
      status: "LTS",
      isLTS: true,
    },
    {
      codename: "jammy",
      version: "22.04",
      status: "LTS",
      isLTS: true,
    },
    {
      codename: "focal",
      version: "20.04",
      status: "LTS",
      isLTS: true,
    },
  ],
};

export const distros = { debian, ubuntu };
