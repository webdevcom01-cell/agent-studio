# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest `main` | :white_check_mark: |
| older releases | :x: |

## Reporting a Vulnerability

If you discover a security vulnerability in Agent Studio, please report it responsibly.

**Do NOT create a public GitHub issue for security vulnerabilities.**

### How to Report

1. Email: **webdevcom01@gmail.com** with subject line `[SECURITY] Agent Studio — <brief description>`
2. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Any suggested fixes (optional)

### Response Timeline

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 5 business days
- **Fix timeline:** Depends on severity (Critical: 7 days, High: 14 days, Medium: 30 days)

### Coordinated Disclosure

We follow a 90-day coordinated disclosure window. Please allow us time to investigate and release a fix before making any public disclosure.

## Security Measures

Agent Studio implements the following security measures:

- **Authentication:** NextAuth v5 with JWT sessions (24-hour expiry), GitHub + Google OAuth
- **CSRF Protection:** Origin header validation on all state-changing requests
- **Input Validation:** Zod schema validation on all API inputs
- **SQL Injection:** Prisma ORM with parameterized queries (no raw SQL)
- **SSRF Protection:** DNS validation with private IP blocklist (`validateExternalUrlWithDNS`)
- **XSS Prevention:** Content Security Policy headers, React auto-escaping
- **Webhook Security:** HMAC-SHA256 signature verification (Standard Webhooks spec)
- **Secret Scanning:** GitHub secret scanning with push protection enabled
- **Dependency Monitoring:** Dependabot alerts and automated security updates
- **Static Analysis:** CodeQL SAST scanning on every PR
- **Rate Limiting:** Sliding window rate limiter (Redis-backed with in-memory fallback)
- **Sandbox Execution:** vm2 sandbox for code execution nodes, Pyodide WASM for Python
- **Prompt Injection Defense:** JSON Schema validation on skill inputs, output PII filtering

## Scope

The following are in scope for security reports:

- Authentication and authorization bypasses
- Remote code execution
- SQL injection or NoSQL injection
- Server-Side Request Forgery (SSRF)
- Cross-Site Scripting (XSS)
- Cross-Site Request Forgery (CSRF)
- Sensitive data exposure
- Prompt injection attacks on AI agents
- Webhook signature bypass
- MCP server connection security

## Out of Scope

- Social engineering attacks
- Denial of service (DoS/DDoS)
- Issues in third-party dependencies (report upstream)
- Issues requiring physical access to the server
