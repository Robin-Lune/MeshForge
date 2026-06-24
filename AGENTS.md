<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project documentation

- Before development tasks, always check for `.claude/claude.md` or `.claude/CLAUDE.md`.
- Use `.claude/architecture.md` and the other files in `.claude/` as the project reference for architecture, domain rules, deployment, database schema, and implementation context.
- Refer to those documents before changing code, unless the task is trivial or unrelated to development.

## Commit messages

- When proposing commits, use explicit commit messages with a concise subject and a useful body.
- The body should summarize the implemented behavior, important technical choices, tests, fixes included, and known follow-up hardening when relevant.
- Prefer messages in the style: `feat(scope): clear behavior`, then a short paragraph explaining what changed and why.