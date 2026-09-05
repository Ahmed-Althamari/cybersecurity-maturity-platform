# Security Policy

## Reporting Security Vulnerabilities

**Do not publicly disclose security vulnerabilities in GitHub Issues.**

If you discover a security vulnerability, please email security@example.com with:

1. **Description**: Clear description of the vulnerability
2. **Location**: Affected component/file
3. **Reproduction Steps**: How to reproduce the issue
4. **Impact**: Potential security impact
5. **Proposed Fix**: If you have a fix (optional)

We will:
- Acknowledge receipt within 48 hours
- Provide a timeline for fixes
- Keep you informed of progress
- Credit you in security advisory (if desired)

## Security Requirements for Contributors

All contributions must adhere to:

### OWASP ASVS (Application Security Verification Standard)
- Input validation (v5)
- Output encoding (v5)
- Authentication (v2, v3)
- Authorization (v4)
- Session management (v3)

### OWASP Top 10 Mitigation
1. **Broken Access Control** - Server-side authorization checks
2. **Cryptographic Failures** - Use secure algorithms
3. **Injection** - Parameterized queries, input validation
4. **Insecure Design** - Follow secure design principles
5. **Security Misconfiguration** - No hardcoded secrets
6. **Vulnerable & Outdated Components** - Keep dependencies updated
7. **Authentication Failures** - Proper session handling
8. **Data Integrity Failures** - Validate all data modifications
9. **Logging & Monitoring Failures** - Audit all security events
10. **SSRF** - Validate URLs and internal service calls

### Code Review Checklist

Security reviewers check:

- [ ] No hardcoded secrets/credentials
- [ ] All input validated server-side
- [ ] All output encoded for context
- [ ] Authorization enforced server-side
- [ ] Parameterized queries used
- [ ] CSRF tokens on state-changing operations
- [ ] Security headers configured
- [ ] Rate limiting enforced
- [ ] Error messages don't leak sensitive info
- [ ] Audit logging for sensitive operations
- [ ] No XXE or injection vulnerabilities
- [ ] Dependencies up-to-date

## Vulnerability Scanning

We use automated tools:

- **SAST** (CodeQL): Static code analysis
- **Dependency Scanning**: npm audit, Dependabot
- **Secret Scanning**: Gitleaks
- **Container Scanning**: Trivy
- **DAST** (OWASP ZAP): Dynamic testing

All findings are reviewed and remediated.

## Security Updates

- Security patches released as soon as possible
- Non-critical updates released regularly
- Dependencies updated via Dependabot PRs
- Changelog documents all security fixes

## Security Baseline

The full picture, including a STRIDE threat model and an honest gap
list, lives in `docs/security-architecture.md`. Summary of what's
actually implemented today:

- **Authentication**: JWT (`@nestjs/jwt`) issued by the API, bcrypt
  password hashing; `apps/web` uses NextAuth.js's Credentials provider
  against that API — no OIDC/SSO provider is wired up
- **Authorization**: Role-based access control (RBAC), enforced
  server-side on every write endpoint and on the audit log's read
- **Encryption**: TLS in transit is a deployment-time concern (nothing
  in this repo terminates TLS); no encryption at rest beyond whatever
  the Postgres host provides
- **Secrets**: Environment variables — **with one known gap**:
  `JWT_SECRET` falls back to a hard-coded value in
  `apps/api/src/auth/auth.module.ts` if the env var isn't set. Always
  set it explicitly.
- **Audit Logging**: Sensitive actions logged to an append-only
  `AuditEvent` table; credentials are redacted before being persisted
- **Rate Limiting**: `@nestjs/throttler`, app-wide default plus a
  tighter 5-attempts/minute/IP limit on `POST /auth/login` specifically.
  IP-based, so it doesn't stop a distributed/multi-IP attacker — see
  `docs/security-architecture.md`.
- **Input Validation**: Server-side validation via `class-validator` DTOs
- **Output Encoding**: Next.js/React's default JSX escaping; no custom
  output-encoding layer beyond that
- **Tenant Isolation**: Enforced server-side on every query, verified by
  a dedicated end-to-end test suite

## Infrastructure Security

There is no cloud deployment yet, so most of this section describes
intent rather than a running configuration:

- **Database**: PostgreSQL with parameterized queries (Prisma) — real
- **Container**: Non-root user, multi-stage builds — real in the
  Dockerfiles (`infrastructure/Dockerfile.{api,web}`), but those images
  have never actually been built or run (no Docker daemon was available
  in the session that wrote them — see `docs/DEPLOYMENT.md`)
- **Network**: no VPN/firewall configuration exists — there's nothing
  deployed to put one in front of yet
- **Secrets**: environment variables only; no AWS Secrets Manager/Vault
  integration exists
- **Monitoring**: no CloudWatch/ELK or equivalent exists
- **Backup**: no automated backup configuration exists

## Incident Response

If a security incident occurs:

1. Identify the root cause
2. Contain the issue
3. Assess impact
4. Notify affected users
5. Implement fix
6. Monitor for recurrence
7. Document lessons learned

## Compliance

CMMP supports compliance with:

- **ISO 27001**: Information security management
- **SOC 2 Type II**: Security controls
- **NIST SP 800-53**: Security controls framework
- **GDPR**: Data privacy & protection
- **HIPAA**: Healthcare data protection (future)

## Third-Party Security

Before adding dependencies:

1. Check vulnerability history on CVE/NVD
2. Review package maintenance status
3. Verify no suspicious/abandoned packages
4. Check for known security issues
5. Use npm audit to verify

## Questions?

For security questions not requiring disclosure of vulnerabilities:
- Create a Security Advisory in GitHub
- Email security team
- Check `/docs/security-architecture.md`
