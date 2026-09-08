# dsh-capability-inventory

A DSH plugin that lists the **currently available** Skills and MCP servers with their **purpose** and **usage**, in a panel that switches between **Chinese and English**.

Read-only by design: one GET route on the host, plain-DOM panel in the browser, no React, no dependencies. It changes no skill or MCP loading semantics — it only surfaces what is already registered.

> 中文手册：[README.zh.md](README.zh.md)

## What it shows

**Skills** — name, description (purpose), `whenToUse`, source (`user-agents` = `~/.agents/skills`, `user-dsh` = `~/.dsh/skills`, `project-*` …, or bundled/runtime from the registry), invocation policy, and how to use it. The web profile disables `dsh-skill-filesystem`, so skills are collected by scanning those roots directly (read-only, registry wins on name collision) — the same approach as `dsh-client-ui-skill-explorer`.

**MCP servers** — server name, status (`connected` when its tools are registered, otherwise `configured (no tools yet)`), transport / command / URL from the profile config tree, and every bridged tool as `mcp__<server>__<tool>` with its description and parameter names.

Only tools actually registered in the running process are counted — a server that never connected shows a single "configured" row instead of invented tools.

## Install

```bash
dsh plugin --profile web add link:<path-to>/dsh-capability-inventory
```

Then add the plugin row to `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: capability-inventory
      name: dsh-capability-inventory
```

Restart `dsh web`. A **Inventory** entry appears under the "New session" button in the sidebar (labeled **能力总览** in Chinese). If the shell ever stops matching, a floating button appears bottom-left after 8 seconds as a fallback.

## Use

| Action | How |
| --- | --- |
| Open | Click the sidebar entry (data loads on open) |
| Refresh | **Refresh** — re-collect after installing a skill or an MCP server |
| Filter | Type in the search box (name / description / tool name) |
| Language | **English / 中文** — switches **this panel only**, not the global UI |
| Close | **Close**, click the backdrop, or press `Esc` |

The panel opens in the DSH global language; after you toggle manually, the panel keeps your choice.

## Config

```yaml
- insert:
    - id: capability-inventory
      name: dsh-capability-inventory
      config:
        enabled: true      # false: route is not mounted
        cwd: D:/AiAgent    # pin the collection workspace
        dshHome: D:/other-dsh    # override the ~/.dsh skills root (advanced)
        agentsHome: D:/other-agents  # override the ~/.agents skills root (advanced)
```

The route also accepts a one-off override: `GET /api/capability-inventory/overview?cwd=D%3A%2FAiAgent`.

## Route

`GET /api/capability-inventory/overview`

```json
{
  "ok": true,
  "generatedAt": "2026-09-07T06:00:00.000Z",
  "cwd": "D:/AiAgent",
  "skills": { "total": 2, "items": [{ "name": "alpha", "description": "…", "whenToUse": "…", "source": "user-dsh", "provider": "filesystem", "modelInvocable": true, "userInvocable": true }] },
  "mcp": { "total": 2, "toolTotal": 3, "servers": [{ "name": "github", "status": "connected", "transport": "stdio", "command": "npx", "url": "", "tools": [{ "name": "create_issue", "fullName": "mcp__github__create_issue", "description": "Create an issue", "params": ["title", "body"] }] }] }
}
```

Failures return `{ "ok": false, "error": "…" }`.

## Security

- Loopback-only fence: both the socket address and the `Host` header must be local, otherwise `403 forbidden: loopback-only`. `X-Forwarded-For` is never trusted.
- No write routes — the plugin exposes exactly one GET.
- All rendering goes through `textContent`; skill descriptions are treated as plain text.

## Checks

```bash
node test/check.mjs                 # host self-check, zero dependencies
NODE_PATH=<node_modules-with-jsdom> node test/panel.smoke.mjs   # optional panel smoke test
```

## Layout

```
lib/index.js   host: collect skills + MCP, one read-only route
lib/client.js  browser: sidebar entry, modal panel, zh/en dictionaries
test/          self-check + panel smoke test
```

## Uninstall

Remove the row from `cordis.patch.yml`, run `dsh plugin --profile web remove dsh-capability-inventory`, restart `dsh web`.
