# Agent Studio

## Security

### Security Policy

We take security seriously. Please review our [Security Policy](.github/SECURITY.md) for reporting vulnerabilities.

### Security Guidelines

1. **Authentication & Authorization**
   - Always use parameterized queries to prevent SQL injection
   - Implement proper authentication middleware for protected routes
   - Use environment variables for secrets (never hardcode)
   - Hash passwords with bcrypt (minimum 12 rounds)

2. **Input Validation**
   - Sanitize all user inputs
   - Use DOMPurify for HTML content
   - Validate data types and ranges
   - Implement rate limiting

3. **Dependencies**
   - Regularly update dependencies
   - Run `npm audit` and `npm audit fix`
   - Monitor for security advisories

4. **Code Security**
   - Follow principle of least privilege
   - Implement proper error handling (no sensitive data leakage)
   - Use HTTPS in production
   - Enable security headers

### Getting Started

```bash
git clone https://github.com/webdevcom01-cell/agent-studio.git
cd agent-studio
npm install
cp .env.example .env
npm run dev
```

### Security Contact

- **Responsible Disclosure**: Report vulnerabilities via GitHub Security Advisories
- **Response Time**: We aim to respond within 48 hours

### License
MIT License
