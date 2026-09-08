# Haunted House Layout

Haunted House Layout is a project for designing and iterating on a haunted-house experience layout. The application itself is not built yet; this repository currently holds scaffolding and local Compound Engineering tooling so planning and implementation can start from Claude Code, including the mobile app.

## Compound Engineering (Claude Code mobile)

Compound Engineering is vendored in-repo as a skills-directory plugin at `.claude/skills/compound-engineering/` (it has a `.claude-plugin/plugin.json` manifest). Claude Code loads it as `compound-engineering@skills-dir` with no marketplace install.

Open the **repository root** in Claude Code mobile and trust the workspace so the project-scoped plugin loads. Marketplace-installed plugins are not required and do not work reliably on mobile.

Upstream: [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) (MIT).
