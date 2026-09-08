# dsh-capability-inventory

**DSH Skills & MCP inventory** — one panel that lists the currently available Skills and MCP servers, lets you manage them, and switches between Chinese and English with Chinese content translation.

English | [中文](README.md)

---

## What it is

A plugin for [DSH (DeepSeek Harness)](https://github.com/guoshuai007/dsh-capability-inventory). The host half aggregates skills and MCP data and serves an API; the browser half renders a panel in the Web GUI showing each skill / MCP server's **purpose, usage, scope and path**, with inline management.

## Features

- **Overview**: skills come from the official registry plus a filesystem scan (`~/.agents/skills`, `~/.dsh/skills`, project `.dsh/skills`, …; registry wins on name collision). MCP servers are read from the profile config tree with `connected` / `configured` status and the full tool list (`mcp__<server>__<tool>`).
- **Management**
  - Skills: edit `SKILL.md`, enable / disable, soft delete (moved to a `.trash-*` folder).
  - MCP: enable / disable a server's tool availability (config and tool definitions are kept).
- **Chinese content translation**: in the Chinese UI, English descriptions are translated by the host LLM and **cached persistently** (default `$DSH_HOME/capability-inventory-translations.json`) — instant on reopen, no repeat calls; each item can be re-translated on its own.
- **i18n**: panel copy uses the official DSH `locale` dictionary and follows the global language by default.
- **Config validation** via `@deepseek-ai/schemastery`. That is the only runtime dependency.

## Install (recommended: npm)

```bash
dsh plugin --profile web add dsh-capability-inventory
```

Restart `dsh web`; an **Inventory** entry appears in the left sidebar (中文界面下为「能力总览」).

## Configuration

Add an optional `config` to the plugin row in the profile's `cordis.patch.yml` (validated by schemastery):

```yaml
- insert:
    - id: capability-inventory
      name: dsh-capability-inventory
      config:
        cwd: D:/AiAgent              # pin the workspace; empty follows the active session
        patchPath: ""                # MCP patch layer; defaults to $DSH_HOME/profiles/<profile>/cordis.patch.yml
        cachePath: ""                # translation cache; defaults to $DSH_HOME/capability-inventory-translations.json
        translate:                   # LLM used for content translation
          provider: sensenova
          model: deepseek-v4-flash
        # enabled: false             # disable the plugin (routes are not mounted)
        # dshHome / agentsHome       # override the user skill roots (advanced)
```

See the `Config` export in `lib/index.js` for every field and default.

## Usage

Open the Web GUI and click **Inventory** in the left sidebar.

| Action | Description |
| --- | --- |
| Search | Top search box filters by name / description / tool name |
| Filter | "All sources" dropdown filters skills by source |
| Quick nav | 【Skills】【MCP】buttons jump to the section |
| Manage | Each card: **Edit / Enable·Disable / Delete** |
| Re-translate | Each card's **Re-translate** forces a fresh translation for that item |
| Language | The "English / 中文" button switches the panel only; it follows the global language by default |

API: `GET /api/capability-inventory/overview` (read-only, loopback-only).

## Local install (for development)

```bash
dsh plugin --profile web add link:/path/to/dsh-capability-inventory
```

Or link / junction it into `~/.dsh/profiles/web/node_modules/dsh-capability-inventory` and add the plugin row to `cordis.patch.yml`.

## Development & tests

```bash
node test/check.mjs                          # host self-check (zero dependency)
npm install && node test/panel.smoke.mjs     # panel smoke test (needs jsdom)
```

## License

[MIT](LICENSE)
