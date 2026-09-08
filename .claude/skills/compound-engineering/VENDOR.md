# Vendored Compound Engineering plugin

Copied (not a git submodule) from
[EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin)
at commit `fe74844c8edd9f3a09a3ab2243fb32a4d4e39f73` (plugin version 3.24.0, MIT).

This folder is a Claude Code **skills-directory plugin**. Because it lives at
`.claude/skills/compound-engineering/` and contains `.claude-plugin/plugin.json`,
Claude Code loads it as `compound-engineering@skills-dir` with no marketplace
and no install step. That is the mobile-friendly equivalent of a marketplace
install.

Included:

- `.claude-plugin/plugin.json` — plugin manifest
- `skills/` — all Compound Engineering skills (`ce-plan`, `ce-work`, etc.)
- `LICENSE` — upstream MIT license

`marketplace.json` is intentionally omitted. Do not add marketplace
`enabledPlugins` keys; this in-repo copy is the source of truth.

To refresh, recopy those paths from upstream `main` and update the commit SHA
above.
