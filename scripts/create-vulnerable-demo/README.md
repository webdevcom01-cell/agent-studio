# Vulnerable Demo — DevOps Swarm Test Target

> ⚠️ **INTENTIONALLY VULNERABLE** — Do NOT use in production. This repo contains deliberate security issues for testing the Autonomous DevOps Swarm.

## Known Vulnerabilities

| File | Vulnerability | CWE | Severity |
|------|-------------|-----|---------|
| `src/auth.ts` | SQL Injection (3x) | CWE-89 | CRITICAL |
| `src/api.ts` | SSRF + XSS | CWE-918, CWE-79 | HIGH |
| `src/upload.ts` | Path Traversal + Insecure Random | CWE-22, CWE-338 | HIGH |
| `src/config.ts` | Hardcoded Secrets | CWE-798 | CRITICAL |
| `package.json` | Outdated deps with known CVEs | — | HIGH |

## Usage

This repo is used as the target for the Agent Studio Autonomous DevOps Swarm:
```
Agent Studio → Enter this repo URL → Swarm analyzes, fixes, and opens PR
```
