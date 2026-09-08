# dsh-capability-inventory 使用手册

DSH 插件：把**当前可用**的 Skills 与 MCP 服务器列成一张总览，标明各自的**用途**与**用法**，面板内可一键切换**中文 / English**。

- 宿主端只读汇总 + 管理/翻译路由，零第三方依赖；浏览器端纯 DOM 渲染，不引入 React。
- 只把已有注册信息呈现出来，不改任何技能或 MCP 的**加载语义**；但对文件系统技能与 MCP 行提供了**管理**（编辑 `SKILL.md`、启用/停用、软删除）与**中文态内容翻译**。
- 技能来自两处合并：**官方注册表**（`ctx.skills`，在 web profile 里 `dsh-skill-filesystem` 默认 `disabled`，常为**空**）+ **文件系统扫描**（按官方根目录约定自己扫 `SKILL.md`，与 `dsh-client-ui-skill-explorer` 做法一致；只读，同名以注册表为准）。
- MCP：**本机当前并未配置任何 MCP 服务器**时，MCP 一节本就为空——加一行 `@deepseek-ai/dsh-mcp-client` 后再打开面板即可看到。

---

## 1. 它显示什么

### Skills（技能）

| 字段 | 来源 | 说明 |
| --- | --- | --- |
| 名称 | `ctx.skills` | kebab-case 技能名 |
| 用途 | SKILL.md 的 `description` | 一句话说明这个技能干什么 |
| 何时使用 | SKILL.md 的 `whenToUse` | 有就显示 |
| 来源 | 扫描根目录 / 注册表 `source` | `user-agents`（`~/.agents/skills`）/ `user-dsh`（`~/.dsh/skills`）/ `project-agents` / `project-dsh` / `bundled` / `runtime` … |
| 调用方式 | frontmatter 旗标 | `模型 / 用户`（含 `user-invocable: true`）或 `仅模型`；扫描到的技能读 `disable-model-invocation`、`user-invocable` |
| 用法 | 由调用方式推导 | 模型：通过 `skill` 工具按名称加载；用户：对话里输入 `/技能名` |

### MCP 服务器

| 字段 | 来源 | 说明 |
| --- | --- | --- |
| 名称 | `serverName`（配置树）/ 工具名前缀 | 工具命名空间 |
| 状态 | 是否有已注册工具 | `已连接` 或 `已配置（暂无工具）` |
| 传输 / 命令 / 地址 | 配置树里该 MCP 行的 `transport`、`command`、`url` | 只在配置了时显示 |
| 工具 | `ctx.tools` 中 `mcp__<server>__<tool>` | 工具全名、用途（MCP 的 `description`）、参数名 |
| 用法 | 工具全名 | 模型以 `mcp__github__create_issue` 这样的名字直接调用 |

> 只统计**当前进程里真实注册**的工具：MCP 服务器没连上就只显示「已配置」一条，不编造工具。

---

## 2. 安装

### 2.1 本地目录安装（开发 / 自用，推荐）

```bash
dsh plugin --profile web add link:D:/AiAgent/dsh-capability-inventory
```

`pnpm` 会在 `~/.dsh/profiles/web/node_modules/dsh-capability-inventory` 建软链。若不想动 lockfile，也可以用 junction（管理员权限或开发者模式）：

```cmd
mklink /J "%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-capability-inventory" "D:\AiAgent\dsh-capability-inventory"
```

### 2.2 挂上插件行

把下面这段写进 `~/.dsh/profiles/web/cordis.patch.yml`（文件现在是 `[]`，替换成）：

```yaml
- insert:
    - id: capability-inventory
      name: dsh-capability-inventory
```

宿主端与浏览器端共用这一行：Node 侧加载 `exports["."]`，浏览器侧由 `package.json` 的 `dsh.client` 声明经 `exports["./client"]` 发现。

### 2.3 重启

```bash
dsh web
```

左侧「新会话」按钮下方多出一条 **能力总览**（英文界面下是 *Inventory*），点击打开面板。

> 若外壳改版导致侧边栏入口插不进去，8 秒后会在左下角生成一个悬浮按钮兜底，面板照常可用。

---

## 3. 使用

| 操作 | 说明 |
| --- | --- |
| 打开 | 点侧边栏「能力总览」；打开时自动拉一次数据 |
| 刷新 | 右上「刷新」重新采集（增删 MCP、新装技能后点它） |
| 搜索 | 顶部搜索框按名称 / 描述 / 工具名过滤，边输入边过滤 |
| 切语言 | 右上「English / 中文」按钮；**只切换本面板**，不动全局界面语言 |
| 关闭 | 右上「关闭」、点遮罩、或按 `Esc` |

首次打开时，面板语言跟随 DSH 全局语言；一旦手动切换过，就以面板内的选择为准。

**工作区（cwd）**：面板顶部显示当前采集用的 `cwd`，解析优先级为 `请求参数 ?cwd= ＞ 插件配置 cwd ＞ 第一个活跃会话的工作区 ＞ 无`。

- 有活跃会话时：自动跟随该会话工作区——`project-dsh` / `project-agents` 这类项目技能能扫到。
- **无活跃会话**时：顶部提示「未关联到活动会话，下面只含用户级与内置技能」，并给一个「临时指定工作区」输入框，填了之后以 `?cwd=` 重新请求（只读，不写配置）。**绝不会**回退到 `process.cwd()`（web 进程常以系统权限从 `C:\Windows\system32` 启动，那个目录没有任何技能，静默用它只会让人以为插件坏了）。

---

## 4. 配置

在插件行上写 config（字段均可选，见 `lib/index.js` 导出的 schemastery `Config`）：

```yaml
- insert:
    - id: capability-inventory
      name: dsh-capability-inventory
      config:
        enabled: true      # false 则不挂载路由（插件仍在列表里）
        cwd: D:/AiAgent    # 固定采集工作区，缺省用活跃会话的 cwd
        dshHome: D:/other-dsh    # 覆盖用户技能根 ~/.dsh（高级）
        agentsHome: D:/other-agents  # 覆盖用户技能根 ~/.agents（高级）
        patchPath: D:/dash/.dsh/profiles/web/cordis.patch.yml  # MCP 补丁层路径，缺省 $DSH_HOME/profiles/web/cordis.patch.yml
        cachePath: D:/dash/.dsh/ci-translations.json  # 翻译缓存路径，缺省 $DSH_HOME/capability-inventory-translations.json
        translate:              # 中文态内容翻译所用的 LLM（缺省 sensenova/deepseek-v4-flash）
          provider: sensenova
          model: deepseek-v4-flash
```

接口也支持一次性覆盖：`GET /api/capability-inventory/overview?cwd=D%3A%2FAiAgent`。

---

## 5. 接口与数据

`GET /api/capability-inventory/overview` →

```json
{
  "ok": true,
  "generatedAt": "2026-09-07T06:00:00.000Z",
  "cwd": "D:/AiAgent",
  "skills": {
    "total": 2,
    "items": [
      { "name": "alpha", "description": "…", "whenToUse": "…", "source": "user-dsh",
        "provider": "filesystem", "modelInvocable": true, "userInvocable": true }
    ]
  },
  "mcp": {
    "total": 2,
    "toolTotal": 3,
    "servers": [
      { "name": "github", "status": "connected", "transport": "stdio", "command": "npx", "url": "",
        "tools": [{ "name": "create_issue", "fullName": "mcp__github__create_issue",
                    "description": "Create an issue", "params": ["title", "body"] }] }
    ]
  }
}
```

失败时返回 `{ "ok": false, "error": "…" }`。

---

## 6. 安全

- 路由走插件族通用的环回围栏：**socket 地址 + Host 头**必须同时是本机，否则 `403 forbidden: loopback-only`。不信任 `X-Forwarded-For`。
- 写操作仅限明确的三个管理端点，且都做了白名单校验：`POST /skill`（只允许落在声明技能根内、且为 `SKILL.md` 的路径）、`POST /mcp`（只允许配置树里存在的 `dsh-mcp-client` 行）、`POST /translate`（用宿主 LLM 翻译）。技能编辑为原子写；删除为软删除到 `.trash-*` 回收站。
- 面板所有文本走 `textContent`，不拼 HTML；技能描述是用户自己写的 Markdown，也只当纯文本渲染。
- 扫描严格只读：读 `SKILL.md` 的 frontmatter 生成展示卡片，从不执行，只在显式「编辑/删除」时改写。

---

## 7. 目录与自检

```
dsh-capability-inventory/
├── package.json        宿主入口 exports["."]，浏览器入口 exports["./client"]
├── cordis.patch.yml    插件行（bundle 形态安装时自动插入）
├── lib/
│   ├── index.js        宿主端：采集 skills / MCP + 一个只读路由
│   └── client.js       浏览器端：侧边栏入口 + 弹窗面板 + 中英字典
├── test/
│   ├── check.mjs       宿主端自检（零依赖）
│   └── panel.smoke.mjs 面板冒烟测试（需 jsdom，缺失则跳过）
├── README.md           English
└── README.zh.md        本手册
```

```bash
node test/check.mjs
# 可选：面板渲染冒烟（NODE_PATH 指向装了 jsdom 的 node_modules）
NODE_PATH=<node_modules> node test/panel.smoke.mjs
```

`check.mjs` 覆盖：技能归一化与排序、MCP 分组（含未配置服务器的启发式切分）、配置树读取、已连接/仅配置合并、总览聚合、路由注册、200/403/405、`?cwd=` 覆盖、`enabled: false` 不挂载、中英字典键一致、面板文案键无漏译。

---

## 8. 故障排查

| 现象 | 原因 / 处理 |
| --- | --- |
| 侧边栏没有「能力总览」 | ① 插件行没写进 `cordis.patch.yml`；② 没重启 `dsh web`；③ 软链失效（重新 `dsh plugin add link:`）。8 秒后应有左下角悬浮按钮兜底 |
| 打开后面板空白 / 报错 | 打开 `http://127.0.0.1:<端口>/api/capability-inventory/overview` 看返回；宿主端未挂载时是 404 |
| 技能列表为空 | ① `C:\Windows\system32` 没被当工作区（已修，不会回退到它）；② 若面板提示「未关联到活动会话」且临时工作区也填了仍为空，说明对应根目录下确实没有 `SKILL.md`——检查 `~/.agents/skills`、`~/.dsh/skills` 或项目 `.dsh/skills` |
| 面板顶部显示「未关联到活动会话」 | web 进程没活动会话：用顶部输入框临时指定工作区，或打开一个会话/在 config 里固定 `cwd` |
| MCP 一节为空 | 本 profile 没挂 `@deepseek-ai/dsh-mcp-client`（MCP 行见 `dsh --profile web --dump-config`） |
| MCP 只显示「已配置」 | 服务器没连上：`failOnStartupError` 默认 false，连不上只是没工具。看启动日志 |
| 想让整个界面变英文 | 面板按钮只管面板；全局语言在 设置 → General → Language |

---

## 9. 卸载

1. 从 `~/.dsh/profiles/web/cordis.patch.yml` 删掉 `capability-inventory` 那一行；
2. `dsh plugin --profile web remove dsh-capability-inventory`；
3. 重启 `dsh web`。
