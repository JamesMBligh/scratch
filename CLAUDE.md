# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

This is **not** a monorepo. It is a container for a collection of independent prototype and proof-of-concept projects, kept under version control so that independent AI agents can create and update them over time.

Implications for how to work here:

- Each subdirectory is its own self-contained project with its own stack, dependencies, and conventions. Do not assume shared tooling, shared dependencies, or cross-project imports.
- When starting work, scope your attention to the specific subproject you are asked about. Do not refactor or "harmonize" across projects — they are deliberately independent.
- When creating a new prototype, create a new top-level subdirectory for it rather than adding to an existing project.
- There is no repo-wide build, lint, or test command. Look inside the relevant subproject for its own tooling (e.g. `package.json`, `pyproject.toml`, `Cargo.toml`, `Makefile`, `README.md`).
- Prototypes are expected to be rough and experimental. Favor getting something working over production-grade polish unless the user asks otherwise.
