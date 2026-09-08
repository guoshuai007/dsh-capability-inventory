/**
 * 技能与 MCP 总览（宿主端）。
 *
 * 只做一件事：把「当前可用」的 Skills 与 MCP 服务器汇总成一份只读 JSON，
 * 挂在 /api/capability-inventory/overview 上。渲染与中英切换在浏览器端完成。
 *
 * 技能来自两处，按名称去重、注册表优先：
 *   1. ctx.skills —— 官方注册表（bundled / runtime 条目）；web profile 里
 *      dsh-skill-filesystem 默认是 disabled，所以它常常是空的。
 *   2. 文件系统扫描 —— 按官方根目录约定自己扫 SKILL.md，只读，
 *      与 dsh-client-ui-skill-explorer 的做法一致，不改变任何加载语义。
 * MCP 数据来源全部是官方服务：ctx.tools（工具注册表，MCP 工具以
 * mcp__<server>__<tool> 命名）、ctx.loader（配置树，用于列出已配置但尚未
 * 连上的服务器）。
 *
 * v2 新增（管理 + 翻译）：
 *   - POST /skill        —— 编辑 / 启用 / 停用 / 删除某个文件系统技能（只改 SKILL.md）。
 *   - POST /mcp          —— 切换某个 MCP 服务器的工具可用状态（保留配置与工具本身）。
 *   - POST /translate    —— 用 DSH 的 LLM（ctx.llm）批量把英文文本译为中文并缓存。
 */
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import z from '@deepseek-ai/schemastery'

/** 稳定的 cordis 插件名。 */
export const name = 'capability-inventory'
/** 挂载路由前必须具备的服务（sessions 提供活跃会话的工作区，缺失就退回用户级技能）。 */
export const inject = ['webServer', 'skills', 'tools', 'loader', 'sessions', 'llm']
/** 唯一路由路径（浏览器端镜像此字面量）。 */
export const ROUTE = '/api/capability-inventory/overview'
/** MCP 工具名前缀，由 @deepseek-ai/dsh-mcp-client 约定。 */
const MCP_PREFIX = 'mcp__'
/** MCP 客户端插件包名，用于在配置树中认出 MCP 服务器行。 */
const MCP_PLUGIN = '@deepseek-ai/dsh-mcp-client'
/** 技能文件名。 */
const SKILL_FILE = 'SKILL.md'

/** 写一份 JSON 响应。 */
function writeJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

/**
 * 环回判定：插件路由只对本机浏览器开放（socket 地址 + Host 头）。
 * @param {{socket:{remoteAddress?:string},headers:Record<string,string|undefined}} req
 */
function isLoopbackRequest(req) {
  const remote = req.socket?.remoteAddress ?? ''
  const normalized = remote.startsWith('::ffff:') ? remote.slice(7) : remote
  const loopbackAddress = normalized === '::1' || /^127(\.\d{1,3}){3}$/.test(normalized)
  if (!loopbackAddress) return false
  const host = req.headers?.host
  if (typeof host !== 'string') return false
  try {
    const hostname = new URL('http://' + host).hostname
    return hostname === 'localhost' || hostname === '[::1]' || /^127(\.\d{1,3}){3}$/.test(hostname)
  } catch {
    return false
  }
}

/** 读取请求体并解析为 JSON（空体返回 {}）。 */
function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      if (raw === '') return resolveBody({})
      try {
        resolveBody(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

/**
 * 解析 SKILL.md 的 frontmatter（零依赖，支持 > / | 块标量）。
 * 只取展示需要的字段；嵌套缩进键按官方 frontmatter 约定忽略。
 * @param {string} content 文件全文
 * @returns {Record<string,string>} 扁平键值对
 */
export function parseFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (match === null) return {}
  const lines = match[1].split(/\r?\n/)
  const out = {}
  for (let i = 0; i < lines.length; i += 1) {
    const matched = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(lines[i])
    if (matched === null) continue
    let value = matched[2].trim()
    if (value === '>' || value === '|') {
      const block = []
      while (i + 1 < lines.length && /^[ \t]+\S/.test(lines[i + 1])) {
        block.push(lines[i + 1].trim())
        i += 1
      }
      value = value === '>' ? block.join(' ') : block.join('\n')
    } else {
      value = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
    }
    out[matched[1]] = value
  }
  return out
}

/** 从 cwd 向上找最近的 .git 祖先（找不到就用 cwd 自己）。 */
export function findProjectRoot(cwd, hasDir) {
  let current = cwd
  for (let depth = 0; depth < 32; depth += 1) {
    if (hasDir(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return cwd
}

/**
 * 官方技能根目录（项目级 + 用户级），按优先级从高到低。
 * @param {string|null} cwd 工作区
 * @param {{dshHome:string,agentsHome:string}} homes 用户根目录
 * @param {(path:string)=>boolean} hasDir 目录存在判定（便于测试注入）
 */
export function skillRoots(cwd, homes, hasDir) {
  const roots = []
  if (cwd !== null) {
    const project = findProjectRoot(cwd, hasDir)
    roots.push({ dir: join(project, '.dsh', 'skills'), source: 'project-dsh' })
    roots.push({ dir: join(project, '.agents', 'skills'), source: 'project-agents' })
  }
  roots.push({ dir: join(homes.dshHome, 'skills'), source: 'user-dsh' })
  roots.push({ dir: join(homes.agentsHome, 'skills'), source: 'user-agents' })
  return roots
}

/** 读一个技能目录里的 SKILL.md。 */
async function readSkillDir(dir, source) {
  let content
  try {
    content = await readFile(join(dir, SKILL_FILE), 'utf8')
  } catch {
    return undefined
  }
  const meta = parseFrontmatter(content)
  return {
    name: meta.name ?? basename(dir),
    description: meta.description ?? '',
    whenToUse: meta.whenToUse ?? meta['when-to-use'] ?? '',
    source,
    provider: 'filesystem',
    path: join(dir, SKILL_FILE),
    scope: scopeOf(source),
    modelInvocable: meta['disable-model-invocation'] !== 'true',
    userInvocable: meta['user-invocable'] === 'true',
    body: content,
  }
}

/** 来源 → 作用域语义（客户端依据此展示「范围」文案，键保持稳定）。 */
function scopeOf(source) {
  if (source === 'user-agents') return 'global-agents'
  if (source === 'user-dsh') return 'user-dsh'
  if (source === 'project-agents' || source === 'project-dsh') return 'project'
  if (source === 'bundled') return 'bundled'
  if (source === 'runtime') return 'runtime'
  return 'unknown'
}

/**
 * 扫描官方根目录下的技能（只读）。单个根目录损坏不影响其他根目录。
 * @returns 技能数组（未去重、未排序）
 */
export async function scanSkills(cwd, homes, hasDir = () => true) {
  const out = []
  for (const root of skillRoots(cwd, homes, hasDir)) {
    let entries
    try {
      entries = await readdir(root.dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skill = await readSkillDir(join(root.dir, entry.name), root.source)
      if (skill !== undefined) out.push(skill)
    }
  }
  return out
}

/** 合并注册表与扫描结果：同名以注册表为准。 */
export function mergeSkills(registry, scanned) {
  const byName = new Map()
  for (const skill of scanned) byName.set(skill.name, skill)
  for (const skill of registry) byName.set(skill.name, skill)
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** 归一化技能摘要，补全缺省字段并按名称排序。 */
export function shapeSkills(summaries) {
  return (summaries ?? [])
    .map((skill) => ({
      name: skill.name,
      description: skill.description ?? '',
      whenToUse: skill.whenToUse ?? '',
      source: skill.source ?? '',
      provider: skill.provider ?? '',
      scope: scopeOf(skill.source ?? ''),
      path: typeof skill.path === 'string' ? skill.path : '',
      modelInvocable: skill.invocation?.modelInvocable !== false,
      userInvocable: skill.invocation?.userInvocable === true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * 从 loader 配置树读出所有 MCP 服务器行（未连上也能列出）。
 * @param {{entries?:()=>Iterable<{options?:{id?:string,name?:string,config?:any}}>}|undefined} loader
 */
export function configuredServers(loader) {
  if (!loader || typeof loader.entries !== 'function') return []
  const out = []
  for (const entry of loader.entries()) {
    const options = entry?.options
    if (options?.name !== MCP_PLUGIN) continue
    const config = options.config ?? {}
    out.push({
      id: options.id ?? '',
      name: config.serverName ?? options.id ?? '',
      transport: config.transport ?? '',
      command: config.command ?? '',
      url: config.url ?? '',
      disabled: options.disabled === true,
    })
  }
  return out
}

/**
 * 按服务器切分 mcp__<server>__<tool> 形式的工具名。
 * 已配置的服务器名优先（取最长匹配），否则退回首段启发式切分 —
 * ponytail: 无配置时的兜底，遇到含 __ 的原始工具名可能切错，
 * 配置了 serverName 即精确。
 */
export function groupMcpTools(tools, serverNames = []) {
  const known = [...serverNames].filter((name) => name !== '').sort((a, b) => b.length - a.length)
  const servers = new Map()
  for (const tool of tools ?? []) {
    if (typeof tool?.name !== 'string' || !tool.name.startsWith(MCP_PREFIX)) continue
    const rest = tool.name.slice(MCP_PREFIX.length)
    const server = known.find((candidate) => rest.startsWith(candidate + '__')) ?? rest.split('__')[0]
    const toolName = rest.slice(server.length + 2) || rest
    let record = servers.get(server)
    if (record === undefined) {
      record = { name: server, tools: [] }
      servers.set(server, record)
    }
    record.tools.push({
      name: toolName,
      fullName: tool.name,
      description: tool.description ?? '',
      params: Object.keys(tool.parameters?.properties ?? {}),
    })
  }
  for (const record of servers.values()) record.tools.sort((a, b) => a.name.localeCompare(b.name))
  return [...servers.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** 合并「已连上的（有工具）」与「仅配置（无工具）」的 MCP 服务器。 */
export function buildMcp(tools, configured) {
  const servers = groupMcpTools(tools, configured.map((server) => server.name))
  const pending = new Map(configured.map((server) => [server.name, server]))
  for (const server of servers) {
    const config = pending.get(server.name)
    server.status = 'connected'
    server.transport = config?.transport ?? ''
    server.command = config?.command ?? ''
    server.url = config?.url ?? ''
    server.disabled = config?.disabled === true
    pending.delete(server.name)
  }
  for (const config of pending.values()) {
    servers.push({ name: config.name, status: 'configured', transport: config.transport, command: config.command, url: config.url, tools: [], disabled: config.disabled === true })
  }
  return servers.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * 当前活跃会话的工作区（取不到则 undefined）。
 * 注：不回退 process.cwd() —— web 进程常以系统权限从 C:\Windows\system32 启动，
 * 那个目录永远扫不到项目技能，静默使用它只会让人以为插件坏了。
 */
function activeCwd(ctx) {
  try {
    const sessions = ctx.sessions
    if (!sessions || typeof sessions.list !== 'function') return undefined
    return sessions.list().map((session) => session?.header?.cwd).find((cwd) => typeof cwd === 'string' && cwd !== '')
  } catch {
    return undefined
  }
}

/**
 * 解析采集工作区。优先级：请求参数 > 插件配置 > 活跃会话 > 无。
 * @returns {{cwd: string|null, source: 'query'|'config'|'session'|'none'}}
 */
export function resolveCwd(ctx, config, requested) {
  if (typeof requested === 'string' && requested !== '') return { cwd: requested, source: 'query' }
  if (typeof config?.cwd === 'string' && config.cwd !== '') return { cwd: config.cwd, source: 'config' }
  const session = activeCwd(ctx)
  if (session !== undefined) return { cwd: session, source: 'session' }
  return { cwd: null, source: 'none' }
}

/** 汇总一份总览数据。cwd 为 null 时只采用户级与内置技能。 */
export async function overview(ctx, cwd, source, homes) {
  const registry = shapeSkills(await ctx.skills.list(cwd === null ? {} : { cwd }))
  const skills = mergeSkills(registry, await scanSkills(cwd, homes))
  const servers = buildMcp(ctx.tools.schemas(), configuredServers(ctx.loader))
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    cwd,
    cwdSource: source ?? 'query',
    skills: { total: skills.length, items: skills },
    mcp: {
      total: servers.length,
      toolTotal: servers.reduce((sum, server) => sum + server.tools.length, 0),
      servers,
    },
  }
}

// ---------------------------------------------------------------- 管理：技能

/** 是否处在声明的技能根目录内（防止越权写任意路径）。 */
export function insideSkillRoots(path, cwd, homes, hasDir) {
  const resolved = resolve(path)
  for (const root of skillRoots(cwd, homes, hasDir)) {
    const base = resolve(root.dir)
    const rel = relative(base, resolved)
    if (rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep))) return true
  }
  return false
}

/** 重写 SKILL.md 里的一个布尔 frontmatter 字段（缺则追加），原子写。 */
export function setFrontmatterField(file, field, value) {
  const content = readFileSync(file, 'utf8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (match === null) throw new Error(`setFrontmatterField: ${file} has no frontmatter`)
  const lines = match[1].split(/\r?\n/)
  const out = []
  let replaced = false
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(lines[i])
    if (m !== null && m[1] === field) {
      out.push(`${field}: ${value}`)
      replaced = true
      // 原字段若是块标量，跳过其值行（布尔字段不会触发，防御性处理）。
      if (m[2].trim() === '>' || m[2].trim() === '|') {
        while (i + 1 < lines.length && /^[ \t]+\S/.test(lines[i + 1])) i += 1
      }
      continue
    }
    out.push(lines[i])
  }
  if (!replaced) {
    const first = lines.findIndex((line) => /^[A-Za-z]/.test(line))
    out.splice(first === -1 ? out.length : first, 0, `${field}: ${value}`)
  }
  const rewritten = `---\n${out.join('\n')}\n---${content.slice(match[0].length)}`
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, rewritten, 'utf8')
  renameSync(tmp, file)
  return parseFrontmatter(rewritten)
}

/** 单个 YAML 标量的安全引号（含冒号/引号时用单引号包裹，内部引号翻倍）。 */
function yamlScalar(value) {
  const str = String(value ?? '')
  if (str === '' || /[:#{}[\],&*!|>'"%@`]/.test(str) || /^\s|\s$/.test(str)) {
    return `'${str.replace(/'/g, "''")}'`
  }
  return str
}

/** 整份重写 SKILL.md（frontmatter name/description/whenToUse + body）。 */
export function writeSkillFile(file, { name, description, whenToUse, content }) {
  const lines = ['---']
  lines.push(`name: ${yamlScalar(name)}`)
  if (description) lines.push(`description: ${yamlScalar(description)}`)
  if (whenToUse) lines.push(`whenToUse: ${yamlScalar(whenToUse)}`)
  lines.push('---', '')
  if (content) lines.push(content.replace(/\s+$/, ''))
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8')
  return parseFrontmatter(readFileSync(file, 'utf8'))
}

/** 软删除：把技能目录整体改名到回收站（带时间戳）。 */
export function trashSkill(file) {
  const dir = dirname(file)
  const trash = `${dir}.trash-${Date.now()}`
  renameSync(dir, trash)
  return trash
}

/** 技能管理处理函数。 */
function makeSkillHandler(ctx, config) {
  return async (req, res) => {
    if (!isLoopbackRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' })
    if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: `method not allowed: ${req.method}` })
    try {
      const body = await readBody(req)
      const { action, path, name, description, whenToUse, content } = body
      if (typeof path !== 'string' || path.trim() === '') return writeJson(res, 400, { ok: false, error: 'expected { action, path }' })
      const { cwd } = resolveCwd(ctx, config, new URL(req.url ?? '/', 'http://x').searchParams.get('cwd'))
      const hasDir = (p) => existsSync(p)
      if (!insideSkillRoots(path, cwd, config.homes, hasDir)) return writeJson(res, 400, { ok: false, error: 'path outside declared skill roots' })
      if (!existsSync(path)) return writeJson(res, 404, { ok: false, error: 'skill file not found' })

      if (action === 'enable' || action === 'disable') {
        if (basename(path) !== SKILL_FILE) return writeJson(res, 400, { ok: false, error: 'expected a SKILL.md path' })
        const enabled = action === 'enable'
        const frontmatter = setFrontmatterField(path, 'disable-model-invocation', enabled ? 'false' : 'true')
        return writeJson(res, 200, { ok: true, enabled: frontmatter['disable-model-invocation'] !== 'true', path })
      }

      if (action === 'edit') {
        if (basename(path) !== SKILL_FILE) return writeJson(res, 400, { ok: false, error: 'expected a SKILL.md path' })
        if (typeof name !== 'string' || name.trim() === '') return writeJson(res, 400, { ok: false, error: 'edit requires { name }' })
        const frontmatter = writeSkillFile(path, { name, description, whenToUse, content })
        return writeJson(res, 200, { ok: true, name, path, description: frontmatter.description ?? '' })
      }

      if (action === 'delete') {
        const trash = trashSkill(path)
        return writeJson(res, 200, { ok: true, trash })
      }

      return writeJson(res, 400, { ok: false, error: `unknown skill action: ${action}` })
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

// ---------------------------------------------------------------- 管理：MCP

/**
 * 切换 profile 用户补丁层里某个 MCP 行的 `disabled`，靠 patchReload: live 热生效。
 * 只改「可用状态」，保留命令/传输/工具定义本身。
 */
export function toggleMcpDisabled(patchFile, id, disabled) {
  const raw = readFileSync(patchFile, 'utf8')
  const lines = raw.split(/\r?\n/)
  const target = `- id: ${id}`
  const start = lines.findIndex((line) => line.trim() === target)
  if (start === -1) throw new Error(`mcp entry not found: ${id}`)
  const keyIndent = lines[start].indexOf('id')
  const prop = `${' '.repeat(keyIndent)}disabled: ${disabled ? 'true' : 'false'}`
  // 该条目块内是否已有 disabled 行
  let hasProp = false
  let propIndex = -1
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^\S/.test(line) || line.trim() === '') {
      // 顶层新条目或空行，说明离开了当前条目
      if (line.trim() !== '' && /^\S/.test(line)) break
      if (line.trim() === '' && i > start) break
      continue
    }
    if (line === prop || /^(\s*)disabled:/.test(line)) {
      hasProp = true
      propIndex = i
      break
    }
  }
  const next = lines.slice()
  if (hasProp) {
    next[propIndex] = prop
  } else {
    next.splice(start + 1, 0, prop)
  }
  writeFileSync(patchFile, next.join('\n'), 'utf8')
  return { id, disabled }
}

/** MCP 管理处理函数。 */
function makeMcpHandler(ctx, config) {
  return async (req, res) => {
    if (!isLoopbackRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' })
    if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: `method not allowed: ${req.method}` })
    try {
      const body = await readBody(req)
      const { action, id } = body
      if ((action !== 'enable' && action !== 'disable') || typeof id !== 'string' || id.trim() === '') {
        return writeJson(res, 400, { ok: false, error: 'expected { action: enable|disable, id }' })
      }
      const patchFile = config.patchPath || join(config.homes.dshHome, 'profiles', 'web', 'cordis.patch.yml')
      if (!existsSync(patchFile)) return writeJson(res, 404, { ok: false, error: `patch file not found: ${patchFile}` })
      const disabled = action === 'disable'
      toggleMcpDisabled(patchFile, id, disabled)
      return writeJson(res, 200, { ok: true, id, enabled: !disabled })
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

// ---------------------------------------------------------------- 翻译

function fmtTranslateProvider(config) {
  const t = config?.translate
  if (t && typeof t.provider === 'string' && t.provider) {
    return { provider: t.provider, model: typeof t.model === 'string' && t.model ? t.model : 'deepseek-v4-flash' }
  }
  return { provider: 'sensenova', model: 'deepseek-v4-flash' }
}

/** 从 LLM 回复里抠出 JSON 数组（容忍 ```json 围栏与前后废话）。 */
export function extractJsonArray(text) {
  const s = String(text ?? '').trim().replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```\s*$/, '')
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  return start !== -1 && end > start ? s.slice(start, end + 1) : s
}

/** 翻译缓存文件路径（可用 config.cachePath 覆盖）。 */
function translateCachePath(config) {
  return config?.cachePath || join(config?.homes?.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'capability-inventory-translations.json')
}

/** 从持久化缓存取出概览里所有内容的已有译文，供客户端直接渲染（免二次请求）。 */
export function collectCachedTranslations(config, payload) {
  let cache = {}
  try { cache = JSON.parse(readFileSync(translateCachePath(config), 'utf8')) } catch {}
  const out = {}
  const add = (text) => { if (typeof text === 'string' && typeof cache[text] === 'string') out[text] = cache[text] }
  for (const skill of payload.skills?.items ?? []) { add(skill.description); add(skill.whenToUse) }
  for (const server of payload.mcp?.servers ?? []) for (const tool of server.tools ?? []) add(tool.description)
  return out
}

/**
 * 用 ctx.llm 把一批文本译为中文；命中持久化缓存直接返回，只对未命中的调 LLM，失败回退原文。
 * 缓存是 text→zh 的 JSON，默认写在 $DSH_HOME/capability-inventory-translations.json。
 */
export async function translateTexts(ctx, config, texts, force = false) {
  const list = (texts ?? []).filter((t) => typeof t === 'string' && t.trim() !== '')
  if (list.length === 0) return { ok: true, zh: [], errors: {} }
  const cacheFile = translateCachePath(config)
  let cache = {}
  try { cache = JSON.parse(readFileSync(cacheFile, 'utf8')) } catch {}
  if (cache === null || typeof cache !== 'object' || Array.isArray(cache)) cache = {}
  const errors = {}
  const missing = force ? [...new Set(list)] : [...new Set(list)].filter((t) => typeof cache[t] !== 'string')
  if (missing.length > 0) {
    const { provider, model } = fmtTranslateProvider(config)
    const attempt = async (subset) => {
      const prompt =
        '你是中英翻译。把下面 JSON 数组里的英文文本依次译为简洁中文，只输出与之结构相同的 JSON 字符串数组，不要额外文字。\n输入：' +
        JSON.stringify(subset)
      const messages = [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
      let text = ''
      for await (const chunk of ctx.llm.stream({ provider, model, messages })) {
        if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
      }
      const parsed = JSON.parse(extractJsonArray(text))
      if (!Array.isArray(parsed) || parsed.length !== subset.length) throw new Error('translation shape mismatch')
      return parsed
    }
    let translated
    try {
      translated = await attempt(missing)
    } catch (error) {
      errors[provider] = error instanceof Error ? error.message : String(error)
    }
    // 批量失败（长文本输出被截断等）→ 逐条重试：单条输出短，不易被截断。
    if (translated === undefined && missing.length > 1) {
      translated = []
      for (const text of missing) {
        try {
          const one = await attempt([text])
          translated.push(one[0])
        } catch {
          translated.push(text)
        }
      }
    }
    if (translated !== undefined) {
      missing.forEach((t, i) => { if (typeof translated[i] === 'string') cache[t] = translated[i] })
      try {
        mkdirSync(dirname(cacheFile), { recursive: true })
        writeFileSync(cacheFile, JSON.stringify(cache), 'utf8')
      } catch {}
    }
  }
  return { ok: true, zh: list.map((t) => (typeof cache[t] === 'string' ? cache[t] : t)), errors }
}

/** 翻译处理函数。 */
function makeTranslateHandler(ctx, config) {
  return async (req, res) => {
    if (!isLoopbackRequest(req)) return writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' })
    if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: `method not allowed: ${req.method}` })
    try {
      const body = await readBody(req)
      if (!Array.isArray(body?.texts)) return writeJson(res, 400, { ok: false, error: 'expected { texts: string[] }' })
      const result = await translateTexts(ctx, config, body.texts, body.force === true)
      writeJson(res, 200, result)
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

// ---------------------------------------------------------------- 路由挂载

/** 总览路由处理函数。 */
function makeHandler(ctx, config) {
  return async (req, res) => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' })
      return
    }
    if (req.method !== 'GET') {
      writeJson(res, 405, { ok: false, error: `method not allowed: ${req.method}` })
      return
    }
    try {
      const requested = new URL(req.url ?? '/', 'http://x').searchParams.get('cwd')
      const { cwd, source } = resolveCwd(ctx, config, requested)
      const payload = await overview(ctx, cwd, source, config.homes)
      payload.translations = collectCachedTranslations(config, payload)
      writeJson(res, 200, payload)
    } catch (error) {
      writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

/**
 * 插件配置 schema（schemastery 校验 + 归档缺省）。
 */
export const Config = z.object({
  enabled: z.boolean().default(true),
  cwd: z.string().default(''),
  dshHome: z.string().default(''),
  agentsHome: z.string().default(''),
  patchPath: z.string().default(''),
  cachePath: z.string().default(''),
  translate: z.object({
    provider: z.string().default('sensenova'),
    model: z.string().default('deepseek-v4-flash'),
  }),
})

/**
 * 挂载总览路由与管理 / 翻译路由。
 * @param ctx - 宿主上下文（webServer / skills / tools / loader / sessions / llm）。
 * @param rawConfig - 插件配置，经 Config.parse 校验并归档缺省。
 */
export function apply(ctx, rawConfig) {
  const config = rawConfig ?? {}
  if (config.enabled === false) return
  const homes = {
    dshHome: config.dshHome || process.env.DSH_HOME || join(homedir(), '.dsh'),
    agentsHome: config.agentsHome || process.env.DSH_AGENTS_HOME || join(homedir(), '.agents'),
  }
  const merged = { ...config, homes }
  const routes = [
    { kind: 'exact', path: ROUTE, handler: makeHandler(ctx, merged) },
    { kind: 'exact', path: '/api/capability-inventory/skill', handler: makeSkillHandler(ctx, merged) },
    { kind: 'exact', path: '/api/capability-inventory/mcp', handler: makeMcpHandler(ctx, merged) },
    { kind: 'exact', path: '/api/capability-inventory/translate', handler: makeTranslateHandler(ctx, merged) },
  ]
  ctx.effect(() => {
    for (const route of routes) ctx.webServer.register(route)
  }, 'capability-inventory: routes')
}
