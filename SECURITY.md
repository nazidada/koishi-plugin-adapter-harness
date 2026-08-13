# Security Policy

## Supported versions

Until the first stable release, only the latest published `0.x` version receives security fixes.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting form:

https://github.com/nazidada/koishi-plugin-adapter-harness/security/advisories/new

Do not open a public issue for a suspected vulnerability. Include the affected version, impact, reproduction details, and a suggested mitigation when available. Remove API keys, private messages, platform identifiers, and other personal data from every report.

## Security boundary

The built-in Runtime intentionally disables Bash, filesystem skills, job-control tools, workspace instructions, persistent goals, and subagent tools. Configuring `runtimeCommand` opts into a custom Runtime and moves its tools, sandbox, approvals, and data handling outside this project's default security boundary.
