# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x.x   | ✅        |
| < 1.0   | ❌        |

## Reporting a Vulnerability

**DO NOT** report security vulnerabilities through public GitHub issues.

Please use [GitHub Security Advisories](https://github.com/webdevcom01-cell/agent-studio/security/advisories/new) — click **"Report a vulnerability"** on the Security tab of this repository.

### Response Timeline

| Stage | Target |
|-------|--------|
| Acknowledgement | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix development | 1–4 weeks depending on severity |
| Public disclosure | After fix is deployed to production |

## Security Practices

- All dependencies scanned automatically by Dependabot
- Authentication via NextAuth v5 (GitHub + Google OAuth, JWT 24h TTL)
- HMAC-SHA256 webhook signature verification (Standard Webhooks spec)
- SSRF protection on all external URL fetches (private IP blocklist)
- CSRF Origin header check on all state-changing API routes
- Input validation via Zod on all API endpoints
- Prompt injection defense on all AI inputs
