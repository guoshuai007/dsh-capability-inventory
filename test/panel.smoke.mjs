/**
 * 面板冒烟测试（可选）：node --experimental-... 无需，直接
 *   NODE_PATH=<装了 jsdom 的 node_modules> node test/panel.smoke.mjs
 *
 * 用 jsdom 跑一遍浏览器端：侧边栏入口是否插上、弹窗是否渲染出技能与 MCP、
 * 中英切换是否生效。没装 jsdom 时自动跳过（插件本身零依赖）。
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

let JSDOM
try {
  // createRequire 走 CJS 解析，因此 NODE_PATH 指向别处的 node_modules 也能找到 jsdom。
  ;({ JSDOM } = createRequire(import.meta.url)('jsdom'))
} catch {
  console.log('panel.smoke.mjs: 未找到 jsdom，跳过（宿主端自检请跑 test/check.mjs）')
  process.exit(0)
}

const PAYLOAD = {
  ok: true,
  generatedAt: '2026-09-07T00:00:00.000Z',
  cwd: 'D:/work/demo',
  skills: {
    total: 2,
    items: [
      { name: 'alpha', description: '首个技能', whenToUse: '需要排序时', source: 'user-dsh', provider: 'filesystem', modelInvocable: true, userInvocable: true },
      { name: 'zeta', description: '压轴技能', whenToUse: '', source: 'project-dsh', provider: 'filesystem', modelInvocable: true, userInvocable: false },
    ],
  },
  mcp: {
    total: 2,
    toolTotal: 2,
    servers: [
      { name: 'github', status: 'connected', transport: 'stdio', command: 'npx', url: '', tools: [{ name: 'create_issue', fullName: 'mcp__github__create_issue', description: 'Create an issue', params: ['title'] }, ...Array.from({ length: 7 }, (_, i) => ({ name: 'tool' + i, fullName: 'mcp__github__tool' + i, description: 'Tool ' + i, params: [] }))] },
      { name: 'slack', status: 'configured', transport: 'streamable-http', command: '', url: 'http://localhost:3000/mcp', tools: [] },
    ],
  },
}

const dom = new JSDOM(
  '<!doctype html><html><body><div data-pane="sidebar"><div class="logoRow"><button class="newSessionBtn">New</button></div></div></body></html>',
  { url: 'http://localhost:3000/' },
)
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.MutationObserver = dom.window.MutationObserver
let fetched = 0
let overviewFetches = 0
let lastUrl = ''
globalThis.fetch = async (url) => {
  fetched += 1
  const u = String(url)
  if (u.includes('/api/capability-inventory/translate')) {
    return { ok: true, json: async () => ({ ok: true, zh: [] }) }
  }
  overviewFetches += 1
  lastUrl = u
  return { ok: true, json: async () => PAYLOAD }
}

let registration
dom.window.__ModuleLoader__ = { load: (value) => (registration = value) }
await import('../lib/client.js')
assert.ok(registration, 'client.js 未注册到 __ModuleLoader__')

const mod = registration.factory(() => {
  throw new Error('面板不应 require 任何模块')
})
assert.equal(typeof mod.apply, 'function')
assert.deepEqual(mod.inject, ['locale'])

const dictionaries = {}
const ctx = {
  locale: {
    getLocale: () => ({ active: 'zh' }),
    subscribe: () => () => {},
    register: (ns, dict) => { dictionaries[ns] = dict; return () => {} },
    bind: (ns) => (key, values) => {
      const dict = dictionaries[ns]?.zh ?? dictionaries[ns]?.en ?? {}
      return String(dict[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => (values?.[name] === undefined ? `{${name}}` : String(values[name])))
    },
  },
  effect: (callback) => callback(),
}
mod.apply(ctx)
assert.ok(dictionaries['dsh-capability-inventory'], '应通过官方 locale.register 注册字典')

// 1. 侧边栏入口已插入，且中文文案正确
const entry = document.querySelector('[data-dsh-plugin="dsh-capability-inventory"]')
assert.ok(entry, '侧边栏入口未挂载')
assert.equal(entry.textContent.trim(), '能力总览')

// 2. 点击后打开面板并加载数据
entry.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
await new Promise((resolve) => setTimeout(resolve, 0))
assert.ok(overviewFetches >= 1, '未发起数据请求')
const overlay = document.querySelector('.dci_overlay')
assert.ok(overlay.classList.contains('dci_overlayOpen'), '面板未打开')
const body = overlay.querySelector('.dci_body')
assert.match(body.textContent, /技能/)
assert.match(body.textContent, /alpha/)
assert.match(body.textContent, /首个技能/)
assert.match(body.textContent, /MCP 服务器/)
assert.match(body.textContent, /mcp__github__create_issue/)
assert.match(body.textContent, /已连接/)
assert.match(body.textContent, /已配置（暂无工具）/)
assert.match(body.textContent, /D:\/work\/demo/)

// 2b. MCP 工具列表折叠（>6 个工具默认收起，可展开）
const toolsBox = overlay.querySelector('.dci_tools')
assert.ok(toolsBox && toolsBox.hidden, '多工具服务器应默认折叠')
const moreBtn = [...overlay.querySelectorAll('.dci_act')].find((b) => b.textContent.includes('展开'))
assert.ok(moreBtn, '应有展开按钮')
moreBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
assert.equal(toolsBox.hidden, false, '点击后应展开')

// 2c. 单条「重译」按钮在每张卡片上（中文态）
assert.ok([...overlay.querySelectorAll('.dci_act')].some((b) => b.textContent === '重译'), '技能卡片应有单条重译按钮')

// 3. 中英切换（面板内局部切换，不动全局语言）
const buttons = [...overlay.querySelectorAll('.dci_head button')]
const langButton = buttons[2]
assert.equal(langButton.textContent, 'English')
langButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
assert.match(overlay.querySelector('.dci_title').textContent, /Skills & MCP Inventory/)
assert.match(overlay.querySelector('.dci_body').textContent, /MCP Servers/)
assert.match(overlay.querySelector('.dci_body').textContent, /Configured \(no tools yet\)/)
assert.equal(entry.textContent.trim(), 'Inventory', '侧边栏文案未跟随切换')

// 4. 搜索过滤
const search = overlay.querySelector('.dci_input')
search.value = 'zeta'
search.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
const filtered = overlay.querySelector('.dci_body').textContent
assert.ok(filtered.includes('zeta'), '搜索未命中目标技能')
assert.ok(!filtered.includes('alpha'), '搜索未过滤掉无关技能')

// 5. 无会话分支：提示 + 临时指定工作区（点应用后带 ?cwd= 重新请求）
PAYLOAD.cwd = null
PAYLOAD.cwdSource = 'none'
const buttons2 = [...overlay.querySelectorAll('.dci_head button')]
buttons2[2].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) // 切回中文
buttons2[3].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) // 刷新
await new Promise((resolve) => setTimeout(resolve, 0))
assert.match(overlay.querySelector('.dci_warn').textContent, /未关联到活动会话/)
const cwdInput = overlay.querySelector('.dci_cwdRow .dci_input')
assert.ok(cwdInput, '未提供临时工作区输入框')
cwdInput.value = 'D:/AiAgent'
overlay.querySelector('.dci_cwdRow .dci_button').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
await new Promise((resolve) => setTimeout(resolve, 0))
assert.equal(lastUrl, `${'/api/capability-inventory/overview'}?cwd=${encodeURIComponent('D:/AiAgent')}`, '应用按钮未带 cwd 重新请求')

// 6. Esc 关闭
document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
assert.equal(overlay.classList.contains('dci_overlayOpen'), false, 'Esc 未关闭面板')

console.log("panel.smoke.mjs: 6 组断言全部通过")
dom.window.close()
process.exit(0)
