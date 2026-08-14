# Changelog

All notable changes to this project are documented in this file.

## 0.1.1

- Add a repository permission check that rejects unexpected Git executable bits, non-writable project directories, foreign ownership, and unsafe group/other writes on POSIX systems.
- Verify the generated npm package file modes before release. The Runtime command must be executable and every other package file must be regular read-only package content.
- Document safe macOS recovery steps for npm or Git files accidentally created with `sudo`.

## 0.1.0

- Publish the first runnable Koishi adapter for the DeepSeek Harness Agent Runtime.
