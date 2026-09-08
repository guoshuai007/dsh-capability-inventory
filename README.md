# dsh-capability-inventory

**DSH 技能与 MCP 总览** —— 一览当前可用的 Skills 与 MCP 服务器，并可直接管理，支持中英文切换与中文内容翻译。

[English](README.en.md) | 中文

---

## 简介

一个 [DSH（DeepSeek Harness）](https://github.com/guoshuai007/dsh-capability-inventory) 插件。宿主端汇总技能与 MCP 数据并提供接口，浏览器端在 Web GUI 里渲染成一张总览面板：每个技能 / MCP 服务器的**用途、用法、范围、路径**一目了然，并可直接管理。

## 特性

- **总览**：技能来自官方注册表 + 文件系统扫描（`~/.agents/skills`、`~/.dsh/skills`、项目 `.dsh/skills` 等，同名以注册表为准）；MCP 服务器从 profile 配置树读出，展示 `已连接` / `已配置` 状态与完整工具清单（`mcp__<server>__<tool>`）。
- **管理**
  - 技能：编辑 `SKILL.md`、启用 / 停用、软删除（移到 `.trash-*` 回收站）。
  - MCP：启用 / 停用某个服务器的工具可用状态（保留配置与工具定义本身）。
- **中文内容翻译**：中文界面下用宿主 LLM 把英文描述译为中文，结果**持久化缓存**（默认 `$DSH_HOME/capability-inventory-translations.json`）——打开即显示、不重复翻译；每条可单独「重译」。
- **国际化**：面板文案走 DSH 官方 `locale` 字典，默认跟随全局语言，也可在面板内单独切换。
- **配置校验**：插件配置用 `@deepseek-ai/schemastery` 校验。运行时仅此一个依赖。

## 安装（推荐：npm）

```bash
dsh plugin --profile web add dsh-capability-inventory
```

重启 `dsh web` 后，左侧边栏会出现 **能力总览**（英文界面下为 *Inventory*）。

## 配置

在 profile 的 `cordis.patch.yml` 插件行上写 `config`（全部可选，经 schemastery 校验）：

```yaml
- insert:
    - id: capability-inventory
      name: dsh-capability-inventory
      config:
        cwd: D:/AiAgent              # 固定采集工作区；留空则跟随活跃会话
        patchPath: ""                # MCP 补丁层路径；默认 $DSH_HOME/profiles/<profile>/cordis.patch.yml
        cachePath: ""                # 翻译缓存路径；默认 $DSH_HOME/capability-inventory-translations.json
        translate:                   # 内容翻译所用 LLM；默认 sensenova/deepseek-v4-flash
          provider: sensenova
          model: deepseek-v4-flash
        # enabled: false             # 关闭插件（不挂载路由）
        # dshHome / agentsHome       # 覆盖用户技能根目录（高级）
```

字段与默认值见 `lib/index.js` 导出的 `Config`。

## 使用

打开 Web GUI，点左侧边栏 **能力总览**。

| 操作 | 说明 |
| --- | --- |
| 搜索 | 顶部搜索框，按名称 / 描述 / 工具名过滤 |
| 筛选 | 「全部来源」下拉，按技能来源过滤 |
| 快捷定位 | 顶部【技能】【MCP】跳转到对应板块 |
| 管理 | 每张卡片的 **编辑 / 启用·停用 / 删除** |
| 重译 | 每张卡片的 **重译** 强制重翻该条内容 |
| 语言 | 右上「English / 中文」只切面板；默认跟随全局语言 |

接口：`GET /api/capability-inventory/overview`（只读汇总，仅限本机 loopback 访问）。

## 本地安装（开发用）

从本地目录链接安装：

```bash
dsh plugin --profile web add link:/path/to/dsh-capability-inventory
```

或手动软链 / junction 到 `~/.dsh/profiles/web/node_modules/dsh-capability-inventory`，然后在 `cordis.patch.yml` 加插件行。

## 开发与测试

```bash
node test/check.mjs                          # 宿主端自检（零依赖）
npm install && node test/panel.smoke.mjs     # 面板冒烟测试（需 jsdom）
```

## 许可证

[MIT](LICENSE)
