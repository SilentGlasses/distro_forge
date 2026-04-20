# Security Policy

## Reporting a Vulnerability

**Do NOT open a public issue for security vulnerabilities.**

If you discover a security vulnerability in DistroForge, please report it responsibly to:

**GitHub Security Advisory**: Use [GitHub's Private Vulnerability Reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) feature to report issues directly to the repository maintainers.

**Steps:**
1. Go to the repository's **Security** tab
2. Click **Report a vulnerability**
3. Fill in the vulnerability details with:
   - Description of the vulnerability
   - Steps to reproduce (if applicable)
   - Potential impact
   - Any suggested remediation

## Security Considerations

This is a static web application that generates APT sources for Debian and Ubuntu. Security concerns include:

### Data Integrity
- **Mirror lists**: Validated weekly via HTTP health checks
- **GPG fingerprints**: Verified against upstream keys for third-party repositories
- **Release data**: Sourced from canonical Debian distro-info-data CSVs

### Client-Side Security
- No backend server (runs entirely in the browser)
- All processing happens locally; no data is transmitted to external servers
- ES modules are loaded over HTTPS on production

### Third-Party Repository Validation
- **Schema validation**: Required fields checked programmatically
- **URL reachability**: All repository URLs tested (HEAD/GET)
- **GPG verification**: Fingerprints verified against downloaded keys using `gpg`
- **Automated testing**: Validation runs on every push/PR and weekly

### Secrets and Access
- No secrets are stored in the repository
- Workflows use GitHub Actions' built-in OIDC token for authentication
- All sensitive operations (GPG verification) run on isolated GitHub Actions runners

## Vulnerability Response SLA

We aim to:
- **Acknowledge** reports within 24 hours
- **Investigate** within 3 business days
- **Release fixes** promptly (severity dependent)
- **Disclose** responsibly after patches are available

## Supported Versions

Only the latest version available on the default branch (`main`) is supported with security updates.

## Dependencies

This project has minimal runtime dependencies:
- **Production**: None (static HTML/CSS/JavaScript)
- **Development**: Node.js (for scripts), `gpg` (for fingerprint verification)

Refer to [package.json](package.json) for exact Node.js version requirements.

## Security Best Practices for Users

When using the generated APT sources:
1. Always verify GPG fingerprints match official vendor documentation
2. Review generated sources before deploying to production
3. Keep APT keyrings updated regularly
4. Monitor for EOL announcements from official distributions

## Acknowledgments

We appreciate security researchers who responsibly disclose vulnerabilities. Reporters may request acknowledgment in our **SECURITY_ACKNOWLEDGMENTS.md** file (if opened).

---

For general questions about repository security, open a discussion in **GitHub Discussions**.
