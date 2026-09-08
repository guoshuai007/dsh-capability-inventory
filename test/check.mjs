/**
 * 自检：node test/check.mjs
 *
 * 用假的 ctx 跑一遍宿主端（技能汇总 / MCP 分组 / 环回围栏 / 路由注册），
 * 并校验浏览器端中英文字典键一致。不需要启动 DSH。
 */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  apply,
  buildMcp,
  configuredServers,
  findProjectRoot,
  groupMcpTools,
  mergeSkills,
  overview,
  parseFrontmatter,
  resolveCwd,
  scanSkills,
  shapeSkills,
  insideSkillRoots,
  setFrontmatterField,
  writeSkillFile,
  trashSkill,
  toggleMcpDisabled,
  extractJsonArray,
  translateTexts,
  collectCachedTranslations,
  Config,
  ROUTE,
} from '../lib/index.js'

/** 造一份临时技能根目录，避免测试依赖真实机器上的技能。 */
const tmp = await mkdtemp(join(tmpdir(), 'dci-'))
await mkdir(join(tmp, 'user-dsh', 'skills', 'fs-one'), { recursive: true })
await writeFile(
  join(tmp, 'user-dsh', 'skills', 'fs-one', 'SKILL.md'),
  '---\nname: fs-one\ndescription: >\n  多行\n  描述\n---\n\n正文\n',
  'utf8',
)
await mkdir(join(tmp, 'user-agents', 'skills', 'fs-two'), { recursive: true })
await writeFile(
  join(tmp, 'user-agents', 'skills', 'fs-two', 'SKILL.md'),
  '---\nname: fs-two\ndescription: "带引号的描述"\nuser-invocable: true\ndisable-model-invocation: false\n---\n',
  'utf8',
)
const HOMES = { dshHome: join(tmp, 'user-dsh'), agentsHome: join(tmp, 'user-agents') }

/** 假 HTTP 请求。 */
function makeReq(overrides = {}) {
  return {
    method: 'GET',
    url: '/',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: 'localhost:3000' },
    ...overrides,
  }
}

/** 假 HTTP 响应，收集写入结果。 */
function makeRes() {
  const res = { status: 0, body: undefined, headers: undefined }
  res.writeHead = (status, headers) => {
    res.status = status
    res.headers = headers
    return res
  }
  res.end = (text) => {
    res.body = JSON.parse(text)
    return res
  }
  return res
}

/** 一份假宿主上下文。 */
function makeCtx() {
  const routes = []
  return {
    routes,
    webServer: { register: (route) => (routes.push(route), () => {}) },
    skills: {
      list: async () => [
        { name: 'zeta', description: '压轴技能', invocation: { modelInvocable: true, userInvocable: true }, source: 'project-dsh', provider: 'filesystem' },
        { name: 'alpha', description: '首个技能', whenToUse: '需要排序时', invocation: { modelInvocable: true, userInvocable: false }, source: 'user-dsh', provider: 'filesystem' },
      ],
    },
    tools: {
      schemas: () => [
        { name: 'read_file', description: 'native' },
        { name: 'mcp__github__create_issue', description: 'Create an issue', parameters: { properties: { title: {}, body: {} } } },
        { name: 'mcp__github__search', description: 'Search GitHub' },
        { name: 'mcp__web__fetch', description: 'Fetch a URL' },
      ],
    },
    loader: {
      entries: function* () {
        yield { options: { id: 'mcp-github', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'github', transport: 'stdio', command: 'npx' } } }
        yield { options: { id: 'mcp-slack', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'slack', transport: 'streamable-http', url: 'http://localhost:3000/mcp' } } }
        yield { options: { id: 'other', name: '@deepseek-ai/dsh-llm' } }
      },
    },
    sessions: { list: () => [{ header: { cwd: 'D:/work/demo' } }] },
    effect: (callback) => callback(),
  }
}

// 1. 纯函数：技能归一化与排序
const skills = shapeSkills(await makeCtx().skills.list())
assert.deepEqual(skills.map((skill) => skill.name), ['alpha', 'zeta'])
assert.equal(skills[0].userInvocable, false)
assert.equal(skills[1].userInvocable, true)

// 2. 纯函数：MCP 工具分组（已知服务器名优先，非 MCP 工具被忽略）
const grouped = groupMcpTools(makeCtx().tools.schemas(), ['github'])
assert.deepEqual(grouped.map((server) => server.name), ['github', 'web'])
assert.deepEqual(grouped[0].tools.map((tool) => tool.name), ['create_issue', 'search'])
assert.deepEqual(grouped[0].tools[0].params, ['title', 'body'])

// 3. 纯函数：配置树读取
const configured = configuredServers(makeCtx().loader)
assert.deepEqual(configured.map((server) => server.name), ['github', 'slack'])
assert.equal(configuredServers(undefined).length, 0)

// 4. 合并：已连上 + 仅配置
const servers = buildMcp(makeCtx().tools.schemas(), configured)
assert.deepEqual(servers.map((server) => server.name), ['github', 'slack', 'web'])
assert.equal(servers[0].status, 'connected')
assert.equal(servers[0].command, 'npx')
assert.equal(servers[1].status, 'configured')
assert.equal(servers[1].url, 'http://localhost:3000/mcp')

// 5. frontmatter 解析（块标量 / 引号 / 布尔旗标）
const meta = parseFrontmatter('---\nname: x\ndescription: >\n  a\n  b\nwhen-to-use: 需要时\n---\n正文')
assert.equal(meta.name, 'x')
assert.equal(meta.description, 'a b', '> 块标量应折叠成一行')
assert.equal(meta['when-to-use'], '需要时')
assert.deepEqual(parseFrontmatter('# 没有 frontmatter'), {})

// 6. 项目根查找（找不到 .git 就用 cwd 自己）
const normalize = (p) => p.replaceAll('\\', '/')
assert.equal(findProjectRoot('D:/work/demo/sub', (p) => normalize(p) === 'D:/work/demo/.git'), 'D:/work/demo')
assert.equal(findProjectRoot('D:/work/demo/sub', () => false), 'D:/work/demo/sub')

// 7. 文件系统扫描（官方根目录约定，损坏/缺失的目录被跳过）
const scanned = await scanSkills(null, { dshHome: join(tmp, 'user-dsh'), agentsHome: join(tmp, 'user-agents') })
assert.deepEqual(scanned.map((skill) => skill.name), ['fs-one', 'fs-two'])
assert.equal(scanned[0].description, '多行 描述')
assert.equal(scanned[0].source, 'user-dsh')
assert.equal(scanned[1].source, 'user-agents')
assert.equal(scanned[1].userInvocable, true, 'user-invocable: true 应被识别')
assert.equal(scanned[1].modelInvocable, true)
assert.deepEqual(await scanSkills(null, { dshHome: join(tmp, 'nope'), agentsHome: join(tmp, 'nope') }), [])

// 8. 合并：同名以注册表为准
const merged = mergeSkills(
  [{ name: 'fs-two', description: '注册表版本', source: 'bundled' }],
  scanned,
)
assert.deepEqual(merged.map((skill) => skill.name), ['fs-one', 'fs-two'])
assert.equal(merged[1].description, '注册表版本', '注册表名同应覆盖扫描结果')

// 9. 工作区解析优先级：请求参数 > 插件配置 > 活跃会话 > 无（绝不退回 process.cwd）
assert.deepEqual(resolveCwd(makeCtx(), {}, 'D:/from-query'), { cwd: 'D:/from-query', source: 'query' })
assert.deepEqual(resolveCwd(makeCtx(), { cwd: 'D:/pinned' }, 'D:/from-query'), { cwd: 'D:/from-query', source: 'query' })
assert.deepEqual(resolveCwd(makeCtx(), { cwd: 'D:/pinned' }), { cwd: 'D:/pinned', source: 'config' })
assert.deepEqual(resolveCwd(makeCtx(), {}), { cwd: 'D:/work/demo', source: 'session' })
const noSessions = makeCtx()
delete noSessions.sessions
assert.deepEqual(resolveCwd(noSessions, {}), { cwd: null, source: 'none' }, '无会话时应为 none，不得回退 process.cwd()')

// 10. 总览聚合（注册表 + 扫描合并）
const payload = await overview(makeCtx(), 'D:/work/demo', 'session', HOMES)
assert.equal(payload.skills.total, 4, '应为 2 个注册表技能 + 2 个扫描技能')
assert.equal(payload.mcp.total, 3)
assert.equal(payload.mcp.toolTotal, 3)
assert.equal(payload.cwd, 'D:/work/demo')
assert.equal(payload.cwdSource, 'session')

// 11. 路由：注册、正常返回、环回围栏、方法限制
const ctx = makeCtx()
apply(ctx, { ...HOMES })
assert.equal(ctx.routes.length, 4)
assert.deepEqual(ctx.routes.map((route) => route.path), [ROUTE, '/api/capability-inventory/skill', '/api/capability-inventory/mcp', '/api/capability-inventory/translate'])
assert.equal(ctx.routes[0].path, ROUTE)
assert.equal(ctx.routes[0].kind, 'exact')

const ok = makeRes()
await ctx.routes[0].handler(makeReq(), ok)
assert.equal(ok.status, 200)
assert.equal(ok.body.ok, true)
assert.equal(ok.body.cwd, 'D:/work/demo')
assert.equal(ok.body.cwdSource, 'session')
assert.equal(ok.body.skills.items.length, 4)

const denied = makeRes()
await ctx.routes[0].handler(makeReq({ socket: { remoteAddress: '203.0.113.9' } }), denied)
assert.equal(denied.status, 403)

const badMethod = makeRes()
await ctx.routes[0].handler(makeReq({ method: 'POST' }), badMethod)
assert.equal(badMethod.status, 405)

// 12. 请求参数覆盖会话工作区；无会话时返回 cwd: null
const override = makeRes()
await ctx.routes[0].handler(makeReq({ url: `${ROUTE}?cwd=${encodeURIComponent('D:/other')}` }), override)
assert.equal(override.body.cwd, 'D:/other')
assert.equal(override.body.cwdSource, 'query')

const orphan = makeCtx()
delete orphan.sessions
apply(orphan, { ...HOMES })
const orphanRes = makeRes()
await orphan.routes[0].handler(makeReq(), orphanRes)
assert.equal(orphanRes.status, 200)
assert.equal(orphanRes.body.cwd, null)
assert.equal(orphanRes.body.cwdSource, 'none')
assert.equal(orphanRes.body.skills.items.length, 4, '无会话时扫描仍返回用户级技能 + 注册表技能')

// 13. enabled: false 时不挂载
const off = makeCtx()
apply(off, { enabled: false })
assert.equal(off.routes.length, 0)

// 14. 浏览器端中英文字典键一致
await import('../lib/client.js')
const client = globalThis.__dshCapabilityInventory
assert.ok(client, 'client.js 未导出自检句柄')
assert.deepEqual(Object.keys(client.zh).sort(), Object.keys(client.en).sort())
assert.equal(typeof client.apply, 'function')
assert.deepEqual(client.inject, ['locale'])

// 15. 面板里用到的每个文案键都在中英字典里存在（防拼写漏译）
const source = await (await import('node:fs/promises')).readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const usedKeys = new Set([...source.matchAll(/\bt\('([a-zA-Z]+)'/g)].map((match) => match[1]))
assert.ok(usedKeys.size > 15, `文案键过少，正则可能失配：${usedKeys.size}`)
for (const key of usedKeys) {
  assert.ok(key in client.zh, `zh 缺少键 ${key}`)
  assert.ok(key in client.en, `en 缺少键 ${key}`)
}

// 16. 技能路径必须落在声明的技能根内
const rootsCtx = { dshHome: join(tmp, 'user-dsh'), agentsHome: join(tmp, 'user-agents') }
assert.equal(insideSkillRoots(join(tmp, 'user-dsh', 'skills', 'fs-one', 'SKILL.md'), null, rootsCtx, (p) => p.startsWith(join(tmp))), true)
assert.equal(insideSkillRoots(join(tmp, 'elsewhere', 'SKILL.md'), null, rootsCtx, () => true), false, '根外必须拒绝')

// 17. setFrontmatterField / writeSkillFile
const skillFile = join(tmp, 'user-dsh', 'skills', 'fs-one', 'SKILL.md')
const after = setFrontmatterField(skillFile, 'disable-model-invocation', 'true')
assert.equal(after['disable-model-invocation'], 'true', '应写入禁用 flag')
const after2 = setFrontmatterField(skillFile, 'disable-model-invocation', 'false')
assert.equal(after2['disable-model-invocation'], 'false', '应恢复启用')
writeSkillFile(skillFile, { name: 'fs-one', description: 'new desc', whenToUse: 'when sorting', content: '# body\n' })
const rewritten = parseFrontmatter(readFileSync(skillFile, 'utf8'))
assert.equal(rewritten.description, 'new desc')

// 18. trashSkill 软删除（目录改名到回收站）
const trash = trashSkill(skillFile)
assert.ok(!existsSync(join(tmp, 'user-dsh', 'skills', 'fs-one', 'SKILL.md')), '原文件应被移走')
assert.ok(trash.includes('.trash-'), `回收站目录: ${trash}`)

// 19. MCP 可用态切换（编辑临时 patch 文件）
const patchFile = join(tmp, 'cordis.patch.yml')
writeFileSync(patchFile, '# patch layer\n- insert:\n    - id: mcp-chrome\n      name: "@deepseek-ai/dsh-mcp-client"\n      config:\n        serverName: chrome\n        transport: stdio\n        command: chrome-devtools-mcp\n', 'utf8')
toggleMcpDisabled(patchFile, 'mcp-chrome', true)
let patchText = readFileSync(patchFile, 'utf8')
assert.ok(patchText.includes('disabled: true'), '应写入 disabled: true')
toggleMcpDisabled(patchFile, 'mcp-chrome', false)
patchText = readFileSync(patchFile, 'utf8')
assert.ok(patchText.includes('disabled: false'), '应写回 disabled: false')

// 20. 翻译：假 ctx.llm 校验输出、持久化缓存命中与失败回退
const cacheCfg = { homes: { dshHome: join(tmp, 'cachehome') } }
const llmCtx = { llm: { stream: async function* () { yield { type: 'text-delta', text: JSON.stringify(['甲', '乙']) } } } }
const tr = await translateTexts(llmCtx, cacheCfg, ['alpha', 'beta'])
assert.deepEqual(tr.zh, ['甲', '乙'])
const trHit = await translateTexts({ llm: { stream: async function* () { throw new Error('should not be called') } } }, cacheCfg, ['alpha', 'beta'])
assert.deepEqual(trHit.zh, ['甲', '乙'], '应命中持久化缓存，不再调用 LLM')
assert.ok(existsSync(join(tmp, 'cachehome', 'capability-inventory-translations.json')), '应写入缓存文件')
const trFail = await translateTexts({ llm: { stream: async function* () { throw new Error('boom') } } }, cacheCfg, ['x'])
assert.deepEqual(trFail.zh, ['x'], '失败应回退原文')

// 20b. LLM 回复里抠 JSON 数组（容忍 ``` 围栏与前后废话）
assert.equal(extractJsonArray('```json\n["a","b"]\n```'), '["a","b"]')
assert.equal(extractJsonArray('结果如下：[1,2] 完毕'), '[1,2]')

// 20c. 批量被截断（JSON 不完整）→ 逐条重试成功
const truncLlm = {
  llm: {
    stream: async function* (opts) {
      const prompt = opts.messages[0].content[0].text
      const multi = prompt.includes('","')
      yield { type: 'text-delta', text: multi ? '["截断' : JSON.stringify(['单条译']) }
    },
  },
}
const trRetry = await translateTexts(truncLlm, { homes: { dshHome: join(tmp, 'cachehome2') } }, ['aa', 'bb'])
assert.deepEqual(trRetry.zh, ['单条译', '单条译'], '批量截断后应逐条重试成功')

// 20d. collectCachedTranslations：概览直接带出已有译文（打开即中文、免二次请求）
const cacheHome = { homes: { dshHome: join(tmp, 'cachehome') } }
writeFileSync(join(tmp, 'cachehome', 'capability-inventory-translations.json'), JSON.stringify({ Hello: '你好', World: '世界' }), 'utf8')
const fakePayload = { skills: { items: [{ description: 'Hello', whenToUse: '' }] }, mcp: { servers: [{ tools: [{ description: 'World' }] }] } }
assert.deepEqual(collectCachedTranslations(cacheHome, fakePayload), { Hello: '你好', World: '世界' })

// 20e. force=true 绕过缓存重翻
const forceLlm = { llm: { stream: async function* () { yield { type: 'text-delta', text: JSON.stringify(['新译']) } } } }
const trForce = await translateTexts(forceLlm, cacheHome, ['Hello'], true)
assert.deepEqual(trForce.zh, ['新译'], 'force 应绕过缓存重翻')
assert.deepEqual((await translateTexts(forceLlm, cacheHome, ['Hello'], false)).zh, ['新译'], '重翻后缓存已更新')

// 21. 配置：宿主导出 schemastery Config（由 cordis loader 校验插件行配置）
assert.ok(Config, '应导出 Config schema')
assert.equal(typeof Config.default, 'function', 'Config 应是 schemastery schema')
// apply 对未传/部分配置依旧健壮（缺省走宿主导航默认）
const cfgCtx = makeCtx()
apply(cfgCtx, {})
assert.equal(cfgCtx.routes.length, 4, '空配置也应挂载 4 条路由')
const cfgOff = makeCtx()
apply(cfgOff, { enabled: false })
assert.equal(cfgOff.routes.length, 0, 'enabled:false 不挂载')

await rm(tmp, { recursive: true, force: true })
console.log('check.mjs: 15 组断言全部通过')
