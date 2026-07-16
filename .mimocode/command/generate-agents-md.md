---
description: "Generate or update CLAUDE.md / AGENTS.md for a codebase. Analyzes project structure, build system, and architecture, then writes a concise guide for future AI coding sessions. Works for both Claude Code (CLAUDE.md) and OpenCode/MiMo (AGENTS.md) conventions."
---

# Generate CLAUDE.md / AGENTS.md

Analyze the codebase at `$ARGUMENTS` (or current working directory if empty) and generate a CLAUDE.md or AGENTS.md file.

## What to investigate

1. **Project identity**: README.md, package.json, or equivalent manifest — what is this project?
2. **Build & run**: package.json scripts, Makefile, Dockerfile, etc. — how to build, lint, test, dev-serve.
3. **Architecture**: high-level structure across directories, key entry points, data flow, notable patterns. Focus on what requires reading multiple files to understand.
4. **Tech stack**: frameworks, databases, CI/CD, deployment targets.
5. **Existing rules**: .cursorrules, .github/copilot-instructions.md, .opencode rules, or similar — include non-trivial parts.

## Output rules

- Prefix the file with the appropriate header:
  - CLAUDE.md: `# CLAUDE.md\n\nThis file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.`
  - AGENTS.md: `# AGENTS.md — {ProjectName}`
- Be concise. No filler like "Provide helpful error messages" or "Write unit tests."
- Do not list every component or file — focus on patterns that require cross-file reading.
- Do not fabricate sections ("Common Development Tasks", "Tips for Development") unless the project actually documents them.
- Include only non-obvious, project-specific information.
- Write in the same language as the project's README (default: English, use Chinese if the README is Chinese).

## Process

1. Glob for README*, package.json, *.config.*, Makefile, Dockerfile, .github/workflows/*, .opencode/**, CLAUDE.md, AGENTS.md
2. Read the key files to understand the project
3. Use subagents for parallel exploration of deep architecture if the codebase is large
4. Write the final file to the project root
5. If CLAUDE.md or AGENTS.md already exists, read it and improve/update rather than overwrite
