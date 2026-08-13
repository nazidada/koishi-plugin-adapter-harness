# Contributing

Thank you for contributing to `koishi-plugin-adapter-harness`.

## Development

Use Node.js `^22.19.0` or `>=24.0.0`, then install and verify the project:

```bash
npm ci
npm run check
```

The automated Runtime and Koishi lifecycle smoke tests do not call the DeepSeek API. A real model test is optional and must use a local environment variable; never commit a key or real private conversation.

## Pull requests

- Keep each pull request focused on one concern.
- Add or update tests for behavior changes.
- Update `README.md` and `PLAN.md` when configuration, architecture, or limitations change.
- Explain compatibility impact when changing Koishi or Harness dependencies.
- Ensure `npm run check` passes before requesting review.

## Reporting bugs

Use the bug-report template and provide a minimal configuration with all secrets and platform identifiers removed. Security vulnerabilities belong in a private security advisory, not a public issue.
