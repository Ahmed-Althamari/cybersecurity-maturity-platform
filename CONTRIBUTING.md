# Contributing to CMMP

Thank you for contributing to the Cybersecurity Maturity Management Platform!

## Development Workflow

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   git checkout -b fix/bug-description
   ```

2. **Make Your Changes**
   - Follow the project's code style
   - Write tests for new functionality
   - Update documentation as needed

3. **Run Quality Checks**
   ```bash
   npm run lint
   npm run type-check
   npm run test
   ```

4. **Commit Your Changes**
   - Use clear, descriptive commit messages
   - Reference relevant issues: `Fixes #123`

5. **Push to GitHub & Create Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```
   - Fill out the PR template
   - Link related issues
   - Request reviews from relevant code owners

6. **Address Code Review Comments**
   - Make requested changes
   - Push updates to the same branch
   - GitHub Actions will re-run automatically

## Code Style Guidelines

- **TypeScript**: Use strict mode, avoid `any` types
- **React Components**: Use functional components and hooks
- **File Names**: Use PascalCase for components, camelCase for utilities
- **Imports**: Group imports (external, internal, relative)
- **Comments**: Document complex logic and security-relevant code

## Testing Requirements

- **Unit Tests**: Required for all business logic
- **Integration Tests**: Required for API endpoints
- **E2E Tests**: Recommended for critical user flows
- **Coverage Target**: Maintain >80% code coverage

Example test:
```typescript
describe('scoringEngine', () => {
  it('should calculate correct maturity score', () => {
    const score = calculateMaturity([...]);
    expect(score).toBe(3.5);
  });
});
```

## Security Requirements

- **No Secrets**: Never commit API keys, passwords, or tokens
- **Input Validation**: Validate all user input server-side
- **SQL Injection**: Use parameterized queries (Prisma ORM)
- **XSS Protection**: Encode output in templates
- **Authorization**: Check permissions on every protected endpoint
- **Audit Logging**: Log security-relevant actions

## Documentation Requirements

- **Code Comments**: Explain the "why" not the "what"
- **README**: Update if you change setup or configuration
- **API Changes**: Document in `/docs/api-design.md`
- **Architecture Changes**: Create an ADR in `/docs/adr/`

## Branch Naming Convention

- `feature/short-description` - New features
- `fix/bug-description` - Bug fixes
- `refactor/improvement-area` - Code refactoring
- `docs/documentation-topic` - Documentation
- `security/vulnerability-fix` - Security fixes
- `chore/maintenance-task` - Maintenance & dependencies

## PR Review Checklist

Before requesting review, ensure:

- [ ] Tests pass locally
- [ ] No console errors/warnings
- [ ] Code follows style guidelines
- [ ] TypeScript compiles without errors
- [ ] No secrets committed
- [ ] PR description is clear
- [ ] Related issues are linked

## Reporting Issues

Use GitHub Issues to report bugs or suggest features:

1. **Check existing issues** to avoid duplicates
2. **Use appropriate labels** (bug, feature, documentation)
3. **Provide clear reproduction steps** for bugs
4. **Include environment details** (Node version, OS, browser)

## Questions?

- Check project documentation in `/docs`
- Review Architecture Decision Records in `/docs/adr`
- Ask in GitHub Discussions

Thank you for helping make CMMP better!
