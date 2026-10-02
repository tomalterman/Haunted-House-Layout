# Vendored Compound Engineering plugin

Copied (not a git submodule) from
[EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin)
at commit `fe74844c8edd9f3a09a3ab2243fb32a4d4e39f73` (plugin version 3.24.0, MIT).

The skills are flattened into `.claude/skills/` (one folder per skill, e.g.
`.claude/skills/ce-plan/SKILL.md`) so Claude Code discovers them as ordinary
project skills on every surface, including cloud and mobile sessions. An
earlier layout nested them under `.claude/skills/compound-engineering/` as a
skills-directory plugin, but that did not load reliably.

Included:

- `.claude/skills/ce-*/` and `.claude/skills/lfg/` — the Compound Engineering skills
- `LICENSE` — upstream MIT license (this folder)
- `CHANGELOG.md` — upstream changelog (this folder)

The upstream `plugin.json` and `marketplace.json` are intentionally omitted. Do
not add marketplace `enabledPlugins` keys; this in-repo copy is the source of
truth.

To refresh, recopy upstream `plugins/compound-engineering/skills/*` into
`.claude/skills/` and update the commit SHA above.
