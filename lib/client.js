/**
 * 技能与 MCP 总览（浏览器端）。
 *
 * 侧边栏入口 + 弹窗面板：列出宿主端汇总的 Skills 与 MCP 服务器（用途、用法、
 * 参数、范围、路径），顶部可切换中文 / English，并可对技能/MCP 做管理：
 * 编辑 SKILL.md（技能）、启用/停用（技能与 MCP）、删除（技能，软删除到回收站）。
 * 中文态下用宿主端 /translate 把英文内容实时译为中文并缓存。零第三方依赖，
 * 纯 DOM 渲染，所有文本走 textContent，不拼 HTML。
 */
{
  const NS = 'dsh-capability-inventory'
  const ROUTE = '/api/capability-inventory/overview'
  const SKILL_ROUTE = '/api/capability-inventory/skill'
  const MCP_ROUTE = '/api/capability-inventory/mcp'
  const TRANSLATE_ROUTE = '/api/capability-inventory/translate'
  const SIDEBAR_FALLBACK_MS = 8000

  const zh = {
    title: '技能与 MCP 总览',
    sidebar: '能力总览',
    navSkills: '技能',
    navMcp: 'MCP',
    refresh: '刷新',
    close: '关闭',
    search: '搜索名称或描述',
    allScopes: '全部来源',
    langSwitch: 'English',
    skills: '技能',
    mcp: 'MCP 服务器',
    skillTotal: '共 {n} 个',
    serverTotal: '共 {n} 个服务器 / {m} 个工具',
    toolTotal: '{n} 个工具',
    purpose: '用途',
    whenToUse: '何时使用',
    usage: '用法',
    source: '来源',
    params: '参数',
    statusConnected: '已连接',
    statusConfigured: '已配置（暂无工具）',
    transport: '传输',
    command: '命令',
    url: '地址',
    modelOnly: '仅模型',
    modelAndUser: '模型 / 用户',
    skillUsageModel: '模型通过 skill 工具按名称加载',
    skillUsageUser: '对话中输入 /{name} 直接调用',
    mcpUsage: '模型以 {fullName} 调用',
    loading: '加载中…',
    empty: '暂无数据',
    noWorkspace: '未关联到活动会话，下面只含用户级与内置技能。打开一个会话后可自动跟随其工作区；或在插件行配置 cwd 固定。',
    cwdPlaceholder: '临时指定工作区，如 D:\\AiAgent',
    applyCwd: '应用',
    loadFailed: '加载失败：{error}',
    workspace: '工作区：{cwd}',
    noTools: '该服务器当前没有可用工具',
    summary: '技能 {s} · MCP {m} 服务器 / {t} 工具',
    expand: '展开',
    collapse: '收起',
    showTools: '展开 {n} 个工具',
    hideTools: '收起工具',
    translateStatus: '翻译中 {done}/{total}…',
    translated: '已翻译',
    retranslate: '重译',
    // v2 管理 + 翻译
    scope: '范围',
    path: '路径',
    edit: '编辑',
    enable: '启用',
    disable: '停用',
    delete: '删除',
    save: '保存',
    cancel: '取消',
    enabled: '已启用',
    disabledStatus: '已停用（工具不可用，配置保留）',
    confirmDelete: '确认删除该技能？将移到回收站（* .trash-*）。',
    confirmDisableMcp: '停用后该服务器的工具将从可用工具中移除，配置与工具定义保留。确认？',
    editTitle: '编辑技能（SKILL.md）',
    nameLabel: '名称',
    descriptionLabel: '用途',
    whenToUseLabel: '何时使用',
    contentLabel: '正文（SKILL.md 内容）',
    opFailed: '操作失败：{error}',
    editSaved: '已保存',
    editFailed: '保存失败：{error}',
    notEditable: '运行时/内置技能只读，无法编辑',
    scopeGlobalAgents: '全局技能（~/.agents/skills · 本机所有项目共享）',
    scopeUserDsh: '用户级技能（~/.dsh/skills）',
    scopeProject: '项目级技能（当前项目）',
    scopeBundled: '内置技能',
    scopeRuntime: '运行时（当前会话）',
    scopeUnknown: '未知来源',
  }

  const en = {
    title: 'Skills & MCP Inventory',
    sidebar: 'Inventory',
    navSkills: 'Skills',
    navMcp: 'MCP',
    refresh: 'Refresh',
    close: 'Close',
    search: 'Search name or description',
    allScopes: 'All sources',
    langSwitch: '中文',
    skills: 'Skills',
    mcp: 'MCP Servers',
    skillTotal: '{n} total',
    serverTotal: '{n} servers / {m} tools',
    toolTotal: '{n} tools',
    purpose: 'Purpose',
    whenToUse: 'When to use',
    usage: 'Usage',
    source: 'Source',
    params: 'Params',
    statusConnected: 'Connected',
    statusConfigured: 'Configured (no tools yet)',
    transport: 'Transport',
    command: 'Command',
    url: 'URL',
    modelOnly: 'Model only',
    modelAndUser: 'Model / User',
    skillUsageModel: 'Model loads it by name through the skill tool',
    skillUsageUser: 'Type /{name} in the chat to invoke',
    mcpUsage: 'Model calls it as {fullName}',
    loading: 'Loading…',
    empty: 'Nothing here yet',
    noWorkspace: 'No active session is attached, so only user-level and bundled skills appear below. Open a session to follow its workspace, or pin one with the cwd plugin config.',
    cwdPlaceholder: 'Temporary workspace, e.g. D:\\AiAgent',
    applyCwd: 'Apply',
    loadFailed: 'Load failed: {error}',
    workspace: 'Workspace: {cwd}',
    noTools: 'No tools available from this server right now',
    summary: '{s} skills · {m} MCP servers / {t} tools',
    expand: 'Expand',
    collapse: 'Collapse',
    showTools: 'Show {n} tools',
    hideTools: 'Hide tools',
    translateStatus: 'Translating {done}/{total}…',
    translated: 'Translated',
    retranslate: 'Re-translate',
    scope: 'Scope',
    path: 'Path',
    edit: 'Edit',
    enable: 'Enable',
    disable: 'Disable',
    delete: 'Delete',
    save: 'Save',
    cancel: 'Cancel',
    enabled: 'Enabled',
    disabledStatus: 'Disabled (tools unavailable, config kept)',
    confirmDelete: 'Delete this skill? It will move to the trash (* .trash-*).',
    confirmDisableMcp: 'Disabling will remove this server\'s tools from the available set; config and tool definitions are kept. Confirm?',
    editTitle: 'Edit skill (SKILL.md)',
    nameLabel: 'Name',
    descriptionLabel: 'Purpose',
    whenToUseLabel: 'When to use',
    contentLabel: 'Body (SKILL.md content)',
    opFailed: 'Operation failed: {error}',
    editSaved: 'Saved',
    editFailed: 'Save failed: {error}',
    notEditable: 'Runtime / bundled skills are read-only',
    scopeGlobalAgents: 'Global skill (~/.agents/skills · shared by all projects)',
    scopeUserDsh: 'User skill (~/.dsh/skills)',
    scopeProject: 'Project skill (current project)',
    scopeBundled: 'Bundled',
    scopeRuntime: 'Runtime (this session)',
    scopeUnknown: 'Unknown source',
  }

  const DICTS = { zh, en }

  const CSS = `
.dci_entry{box-sizing:border-box;width:100%;height:36px;color:var(--dsw-alias-label-secondary,#5f6672);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 10px;font-size:13px;display:flex}
.dci_entry:hover{background:var(--dsw-alias-interactive-bg-hover,#f2f3f5);color:var(--dsw-alias-label-primary,#1c1e26)}
.dci_entryIcon{flex:none;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center}
.dci_entryIcon svg{width:18px;height:18px;display:block}
.dci_entryLabel{overflow:hidden;text-overflow:ellipsis}
[data-dsh-frame][data-sidebar-collapsed] .dci_entry,[data-sidebar-collapsed] .dci_entry{border-radius:50%;justify-content:center;width:36px;height:36px;margin:0 auto 12px;padding:0}
[data-dsh-frame][data-sidebar-collapsed] .dci_entryLabel,[data-sidebar-collapsed] .dci_entryLabel{display:none}
.dci_fab{position:fixed;left:16px;bottom:16px;z-index:9998;border:1px solid var(--dsw-alias-border-l1,#d7dae0);background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#1c1e26);border-radius:999px;padding:8px 14px;font-size:12px;cursor:pointer;box-shadow:0 6px 20px #00000026}
.dci_overlay{background:var(--dsw-alias-bg-mask-2,#080a1073);z-index:9999;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;display:none;position:fixed;inset:0}
.dci_overlayOpen{display:flex}
.dci_card{background:var(--dsw-alias-bg-overlay,#fdfdfd);width:min(880px,94vw);max-height:86vh;color:var(--dsw-alias-label-primary,#1c1e26);border-radius:12px;flex-direction:column;display:flex;overflow:hidden;box-shadow:0 18px 60px #00000059}
.dci_head{align-items:center;gap:6px;padding:12px 16px;display:flex;flex-wrap:wrap;border-bottom:1px solid var(--dsw-alias-border-l1,#e8eaed)}
.dci_nav{gap:4px;display:flex;flex:none}
.dci_navBtn{color:var(--dsw-alias-label-primary,#3a3f4b);cursor:pointer;background:var(--dsw-alias-interactive-bg-hover,#eceef1);border:1px solid var(--dsw-alias-border-l1,#d7dae0);border-radius:6px;padding:5px 10px;font-size:12px}
.dci_navBtn:hover{background:var(--dsw-alias-interactive-bg-hover,#dde0e4)}
.dci_title{flex:1;margin:0;font-size:15px;font-weight:600}
.dci_input{box-sizing:border-box;background:var(--dsw-alias-bg-layer-1,#f7f8fa);width:220px;color:var(--dsw-alias-label-primary,#1c1e26);border:1px solid #0000;border-radius:6px;padding:6px 8px;font-size:12px}
.dci_select{box-sizing:border-box;background:var(--dsw-alias-bg-layer-1,#f7f8fa);color:var(--dsw-alias-label-primary,#1c1e26);border:1px solid var(--dsw-alias-border-l1,#d9dce2);border-radius:6px;padding:6px 8px;font-size:12px;max-width:160px}
.dci_button{color:var(--dsw-alias-label-primary,#3a3f4b);cursor:pointer;background:var(--dsw-alias-bg-layer-1,#f2f3f5);border:none;border-radius:6px;padding:5px 11px;font-size:12px}
.dci_button:hover{background:var(--dsw-alias-interactive-bg-hover,#e7e8ea)}
.dci_button:disabled{opacity:.5;cursor:default}
.dci_body{padding:12px 16px 16px;overflow:auto}
.dci_note{color:var(--dsw-alias-label-tertiary,#a0a5b1);margin:0 0 12px;font-size:11px}
.dci_warn{color:#b25e09;background:#fff4e5;border-radius:8px;margin:0 0 10px;padding:8px 10px;font-size:11px;line-height:1.7}
.dci_cwdRow{gap:6px;display:flex;margin-bottom:12px}
.dci_cwdRow .dci_input{flex:1;width:auto}
.dci_cwdRow .dci_button{flex:none}
.dci_sectionTitle{color:var(--dsw-alias-label-primary,#2f3542);margin:16px 0 8px;font-size:13px;font-weight:600;scroll-margin-top:8px}
.dci_count{color:var(--dsw-alias-label-secondary,#8a8f9c);margin-left:6px;font-weight:400}
.dci_section{padding:0}
.dci_item{border:1px solid var(--dsw-alias-border-l1,#e5e7eb);background:var(--dsw-alias-bg-base,#fff);border-radius:8px;margin-bottom:8px;padding:10px 12px}
.dci_row{flex-wrap:wrap;align-items:center;gap:6px;display:flex}
.dci_name{color:var(--dsw-alias-label-primary,#111827);font-family:ui-monospace,Consolas,monospace;font-size:13px;font-weight:600}
.dci_badge{background:var(--dsw-alias-state-business-secondary,#eef2ff);color:var(--dsw-alias-state-business-primary,#4353a3);border-radius:99px;padding:1px 7px;font-size:10px}
.dci_badgeOk{background:var(--dsw-alias-state-success-secondary,#e6f4ea);color:var(--dsw-alias-state-success-primary,#0d6832)}
.dci_badgeWarn{background:#fff4e5;color:#b25e09}
.dci_desc{color:var(--dsw-alias-label-primary,#3a3f4b);margin:6px 0 0;font-size:12px;line-height:1.5}
.dci_meta{color:var(--dsw-alias-label-secondary,#8a8f9c);margin:4px 0 0;font-size:11px;line-height:1.6;word-break:break-all}
.dci_actions{gap:6px;display:flex;margin-top:8px;flex-wrap:wrap}
.dci_act{color:#3a3f4b;cursor:pointer;background:var(--dsw-alias-bg-layer-1,#f2f3f5);border:1px solid var(--dsw-alias-border-l1,#e0e2e7);border-radius:6px;padding:3px 9px;font-size:11px}
.dci_act:hover{background:var(--dsw-alias-interactive-bg-hover,#e2e4e8)}
.dci_actDanger{color:#b42318;background:#fff1ef;border-color:#f2c4bd}
.dci_actDanger:hover{background:#ffe3df}
.dci_tool{border-top:1px dashed var(--dsw-alias-border-l1,#e5e7eb);margin-top:8px;padding-top:8px}
.dci_toolName{color:var(--dsw-alias-label-primary,#1c1e26);font-family:ui-monospace,Consolas,monospace;font-size:12px;font-weight:600}
.dci_status{color:var(--dsw-alias-label-secondary,#6b7280);text-align:center;padding:18px;font-size:13px}
.dci_error{color:var(--dsw-alias-state-error-primary,#b42318)}
.dci_summary{color:var(--dsw-alias-label-secondary,#6b7280);margin:0 0 10px;font-size:12px}
.dci_transStatus{color:var(--dsw-alias-state-business-primary,#4353a3)}
.dci_clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dci_clampOpen{display:block;overflow:visible;-webkit-line-clamp:unset}
.dci_more{color:var(--dsw-alias-state-business-primary,#4353a3);cursor:pointer;background:none;border:none;padding:0;font-size:11px;margin-top:2px}
.dci_editor{background:var(--dsw-alias-bg-overlay,#fdfdfd);width:min(680px,92vw);max-height:88vh;color:var(--dsw-alias-label-primary,#1c1e26);border-radius:12px;flex-direction:column;display:flex;overflow:hidden;box-shadow:0 18px 60px #00000059}
.dci_editorHead{align-items:center;gap:8px;padding:12px 16px;display:flex;border-bottom:1px solid var(--dsw-alias-border-l1,#e8eaed)}
.dci_editorBody{padding:12px 16px 16px;overflow:auto;display:flex;flex-direction:column;gap:10px}
.dci_field{display:flex;flex-direction:column;gap:4px}
.dci_field label{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280)}
.dci_field input,.dci_field textarea{box-sizing:border-box;width:100%;background:var(--dsw-alias-bg-layer-1,#f7f8fa);color:var(--dsw-alias-label-primary,#1c1e26);border:1px solid var(--dsw-alias-border-l1,#d9dce2);border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit}
.dci_field textarea{min-height:72px;resize:vertical}
.dci_field textarea.dci_bodyArea{min-height:180px;font-family:ui-monospace,Consolas,monospace}
.dci_editorFoot{gap:8px;display:flex;justify-content:flex-end;padding:0 16px 14px}
body[data-ds-dark-theme]:not([data-dsh-skin]) .dci_card{background:#2c2c2e}
body[data-ds-dark-theme]:not([data-dsh-skin]) .dci_editor{background:#2c2c2e}
body[data-ds-dark-theme]:not([data-dsh-skin]) .dci_item{background:#3a3a3c;border-color:#ffffff14}
body[data-ds-dark-theme]:not([data-dsh-skin]) .dci_head,body[data-ds-dark-theme]:not([data-dsh-skin]) .dci_editorHead{border-color:#ffffff14}
body[data-ds-dark-theme]:not([data-dsh-skin]) .dci_input{background:#1c1c1e;color:#fff}
body[data-ds-dark-theme]:not([data-dsh-skin]) .dci_field input,body[data-ds-dark-theme]:not([data-dsh-skin]) .dci_field textarea{background:#1c1c1e;color:#fff}
body[data-ds-dark-theme]:not([data-dsh-skin]) .dci_button{color:#ffffffd9;background:#ffffff1a}
body[data-ds-dark-theme]:not([data-dsh-skin]) .dci_act{color:#ffffffd9;background:#ffffff1a}
body[data-ds-dark-theme]:not([data-dsh-skin]) .dci_fab{background:#2c2c2e;color:#fff}
`

  const ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10M4 12h16M4 18h7"/><circle cx="19" cy="6" r="2"/><circle cx="15" cy="18" r="2"/></svg>'

  /** 极简 DOM 构造。 */
  function el(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }

  /** 取当前字典并做 {name} 插值。 */
  function makeT(getLang) {
    return (key, vars) => {
      const template = DICTS[getLang()]?.[key] ?? en[key] ?? key
      return template.replace(/\{(\w+)\}/g, (_, name) => (vars?.[name] === undefined ? `{${name}}` : String(vars[name])))
    }
  }

  /**
   * 挂载面板与侧边栏入口。
   * @param {{getLocale?:()=>{active?:string},subscribe?:(fn:()=>void)=>()=>void}} locale
   */
  function mount(locale, boundT) {
    let lang = 'zh'
    let overridden = false
    try {
      const active = locale?.getLocale?.().active
      if (typeof active === 'string') lang = active.startsWith('zh') ? 'zh' : 'en'
      locale?.subscribe?.(() => {
        if (overridden) return
        const next = locale.getLocale?.().active
        lang = typeof next === 'string' && next.startsWith('zh') ? 'zh' : 'en'
        render()
      })
    } catch {}
    const localT = makeT(() => lang)
    const t = (key, vars) => (overridden || boundT === undefined ? localT(key, vars) : boundT(key, vars))
    const SCOPE_KEYS = { 'global-agents': 'scopeGlobalAgents', 'user-dsh': 'scopeUserDsh', project: 'scopeProject', bundled: 'scopeBundled', runtime: 'scopeRuntime', unknown: 'scopeUnknown' }
    const scopeLabel = (scope) => (SCOPE_KEYS[scope] !== undefined ? t(SCOPE_KEYS[scope]) : scope ?? '')

    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)

    const overlay = el('div', 'dci_overlay')
    const card = el('div', 'dci_card')
    const head = el('div', 'dci_head')
    const nav = el('div', 'dci_nav')
    const navSkills = el('button', 'dci_navBtn', t('navSkills'))
    const navMcp = el('button', 'dci_navBtn', t('navMcp'))
    navSkills.type = 'button'
    navMcp.type = 'button'
    nav.append(navSkills, navMcp)
    const title = el('h2', 'dci_title', t('title'))
    const search = el('input', 'dci_input')
    search.type = 'search'
    let filterScope = ''
    const scopeSelect = el('select', 'dci_select')
    scopeSelect.addEventListener('change', () => { filterScope = scopeSelect.value; render() })
    const langButton = el('button', 'dci_button')
    langButton.type = 'button'
    const refreshButton = el('button', 'dci_button', t('refresh'))
    refreshButton.type = 'button'
    const closeButton = el('button', 'dci_button', t('close'))
    closeButton.type = 'button'
    head.append(nav, title, search, scopeSelect, langButton, refreshButton, closeButton)
    const body = el('div', 'dci_body')
    card.append(head, body)
    overlay.append(card)
    document.body.appendChild(overlay)

    // 编辑技能弹窗
    const editor = el('div', 'dci_overlay')
    const editorCard = el('div', 'dci_editor')
    const editorHead = el('div', 'dci_editorHead')
    const editorTitle = el('h2', 'dci_title', t('editTitle'))
    const editorClose = el('button', 'dci_button', t('close'))
    editorClose.type = 'button'
    editorHead.append(editorTitle, editorClose)
    const editorBody = el('div', 'dci_editorBody')
    const editorFoot = el('div', 'dci_editorFoot')
    const editorCancel = el('button', 'dci_button', t('cancel'))
    editorCancel.type = 'button'
    const editorSave = el('button', 'dci_button', t('save'))
    editorSave.type = 'button'
    editorFoot.append(editorCancel, editorSave)
    editorCard.append(editorHead, editorBody, editorFoot)
    editor.append(editorCard)
    document.body.appendChild(editor)

    let data
    let error
    let loading = false
    let editingPath = null
    // 翻译缓存：文本 → 中文
    const transCache = new Map()
    const translatedSet = new Set()
    let translateRunning = false
    let transStatusEl
    let transNeeds = []

    async function post(url, payload) {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      let parsed = {}
      try { parsed = await response.json() } catch {}
      if (!response.ok || parsed?.ok === false) throw new Error(parsed?.error ?? `HTTP ${response.status}`)
      return parsed
    }

    closeButton.addEventListener('click', () => overlay.classList.remove('dci_overlayOpen'))
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.classList.remove('dci_overlayOpen')
    })
    editorClose.addEventListener('click', () => editor.classList.remove('dci_overlayOpen'))
    editor.addEventListener('click', (event) => {
      if (event.target === editor) editor.classList.remove('dci_overlayOpen')
    })
    langButton.addEventListener('click', () => {
      lang = lang === 'zh' ? 'en' : 'zh'
      overridden = true
      render()
    })
    refreshButton.addEventListener('click', () => load())
    search.addEventListener('input', () => render())
    navSkills.addEventListener('click', () => { skillsSection?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }) })
    navMcp.addEventListener('click', () => { mcpSection?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }) })
    editorCancel.addEventListener('click', () => editor.classList.remove('dci_overlayOpen'))
    editorSave.addEventListener('click', () => saveSkill())
    const onKey = (event) => {
      if (event.key === 'Escape') {
        overlay.classList.remove('dci_overlayOpen')
        editor.classList.remove('dci_overlayOpen')
      }
    }
    document.addEventListener('keydown', onKey)

    async function load(cwdOverride) {
      loading = true
      error = undefined
      render()
      try {
        const url = cwdOverride ? `${ROUTE}?cwd=${encodeURIComponent(cwdOverride)}` : ROUTE
        const response = await fetch(url, { headers: { accept: 'application/json' } })
        const payload = await response.json()
        if (!response.ok || payload?.ok === false) throw new Error(payload?.error ?? `HTTP ${response.status}`)
        data = payload
        // 用服务端缓存直接回填译文：打开即显示中文，不再二次请求 / 重新加载。
        for (const [text, zh] of Object.entries(payload.translations ?? {})) {
          transCache.set(text, zh)
          translatedSet.add(text)
        }
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause)
      } finally {
        loading = false
        render()
      }
    }

    /** 命中过滤（名称 / 描述 / 工具名）。 */
    function matches(haystack) {
      const keyword = search.value.trim().toLowerCase()
      return keyword === '' || haystack.toLowerCase().includes(keyword)
    }

    /** 中文态下把英文内容渲染为已缓存的中文，否则原文。 */
    function displayText(text) {
      if (lang !== 'zh' || typeof text !== 'string') return text
      return transCache.get(text) ?? text
    }

    /** 长文本折叠：超过阈值时只显示两行，带展开/收起。 */
    function clamped(text, className) {
      const p = el('p', className + ' dci_clamp', text)
      if (typeof text !== 'string' || text.length <= 90) return p
      const btn = el('button', 'dci_more', t('expand'))
      btn.type = 'button'
      btn.addEventListener('click', () => {
        const open = p.classList.toggle('dci_clampOpen')
        btn.textContent = open ? t('collapse') : t('expand')
      })
      const wrap = el('div')
      wrap.append(p, btn)
      return wrap
    }

    /** 来源/范围下拉选项（随语言重建，保留当前选择）。 */
    function syncScopeSelect() {
      const scopes = ['', ...Object.keys(SCOPE_KEYS)]
      scopeSelect.replaceChildren(...scopes.map((s) => {
        const option = el('option', '', s === '' ? t('allScopes') : scopeLabel(s))
        option.value = s
        return option
      }))
      scopeSelect.value = filterScope
    }

    /** 单条重译：强制绕过服务端缓存重翻并回显。 */
    async function retranslate(texts) {
      const list = [...new Set(texts)].filter((text) => typeof text === 'string' && text !== '')
      if (list.length === 0) return
      for (const text of list) {
        transCache.delete(text)
        translatedSet.delete(text)
      }
      render()
      try {
        const result = await post(TRANSLATE_ROUTE, { texts: list, force: true })
        const zhList = Array.isArray(result?.zh) ? result.zh : []
        list.forEach((text, i) => {
          if (typeof zhList[i] === 'string') {
            transCache.set(text, zhList[i])
            translatedSet.add(text)
          }
        })
      } catch {}
      render()
    }

    /** 刷新翻译进度文案。 */
    function updateTransStatus() {
      if (!transStatusEl || transNeeds.length === 0) return
      const done = transNeeds.filter((text) => translatedSet.has(text)).length
      transStatusEl.textContent = translateRunning
        ? t('translateStatus', { done, total: transNeeds.length })
        : done >= transNeeds.length
          ? t('translated')
          : `${done}/${transNeeds.length}`
    }

    /** 收集还未翻译的文本，分批请求（避免单次过大导致长度错位），成功回填缓存并重绘。 */
    function ensureTranslations(items) {
      if (lang !== 'zh') return
      const uncached = [...new Set(items)].filter((text) => typeof text === 'string' && text.trim() !== '' && !transCache.has(text))
      if (uncached.length === 0 || translateRunning) return
      translateRunning = true
      // 按累计字符数分批：单次输出过大会被 LLM 截断（JSON 不完整→回退英文）。
      const MAX_CHARS = 1200
      const batches = []
      let current = []
      let size = 0
      for (const text of uncached) {
        if (current.length > 0 && (size + text.length > MAX_CHARS || current.length >= 12)) {
          batches.push(current)
          current = []
          size = 0
        }
        current.push(text)
        size += text.length
      }
      if (current.length > 0) batches.push(current)
      Promise.all(
        batches.map((batch) =>
          post(TRANSLATE_ROUTE, { texts: batch })
            .then((result) => {
              const zhList = Array.isArray(result?.zh) ? result.zh : []
              batch.forEach((text, i) => { if (typeof zhList[i] === 'string') { transCache.set(text, zhList[i]); translatedSet.add(text) } })
              updateTransStatus()
            })
            .catch(() => {}),
        ),
      ).finally(() => {
        // 本会话没拿到的先用原文占位，避免反复请求；服务端未缓存，重载后会重试。
        for (const text of uncached) if (!transCache.has(text)) transCache.set(text, text)
        translateRunning = false
        updateTransStatus()
        if (document.body.contains(overlay) && overlay.classList.contains('dci_overlayOpen')) render()
      })
    }

    /** 技能卡片。 */
    function skillCard(skill) {
      const card = el('div', 'dci_item')
      const row = el('div', 'dci_row')
      row.append(el('span', 'dci_name', skill.name))
      const mode = el('span', `dci_badge ${skill.userInvocable ? 'dci_badgeOk' : ''}`, skill.userInvocable ? t('modelAndUser') : t('modelOnly'))
      row.append(mode)
      if (skill.source) row.append(el('span', 'dci_badge', `${t('source')}: ${skill.source}`))
      card.append(row)
      if (skill.description) card.append(clamped(`${t('purpose')}: ${displayText(skill.description)}`, 'dci_desc'))
      if (skill.whenToUse) card.append(el('p', 'dci_meta', `${t('whenToUse')}: ${displayText(skill.whenToUse)}`))
      const usage = [t('usage'), ': ', t('skillUsageModel')]
      if (skill.userInvocable) usage.push(' / ', t('skillUsageUser', { name: skill.name }))
      card.append(el('p', 'dci_meta', usage.join('')))
      if (skill.scope) card.append(el('p', 'dci_meta', `${t('scope')}: ${scopeLabel(skill.scope)}`))
      if (skill.path) card.append(el('p', 'dci_meta', `${t('path')}: ${skill.path}`))

      // 操作区：编辑/停用/删除（仅文件系统技能）+ 单条重译（中文态）
      const actions = el('div', 'dci_actions')
      if (skill.path) {
        if (typeof skill.body === 'string') {
          const editBtn = el('button', 'dci_act', t('edit'))
          editBtn.type = 'button'
          editBtn.addEventListener('click', () => openEditor(skill))
          actions.append(editBtn)
        }
        const toggle = el('button', 'dci_act', skill.modelInvocable ? t('disable') : t('enable'))
        toggle.type = 'button'
        toggle.addEventListener('click', async () => {
          const action = skill.modelInvocable ? 'disable' : 'enable'
          try {
            await post(SKILL_ROUTE, { action, path: skill.path })
            load()
          } catch (cause) {
            window.alert(t('opFailed', { error: cause instanceof Error ? cause.message : String(cause) }))
          }
        })
        actions.append(toggle)
        const del = el('button', 'dci_act dci_actDanger', t('delete'))
        del.type = 'button'
        del.addEventListener('click', async () => {
          if (!window.confirm(t('confirmDelete'))) return
          try {
            await post(SKILL_ROUTE, { action: 'delete', path: skill.path })
            load()
          } catch (cause) {
            window.alert(t('opFailed', { error: cause instanceof Error ? cause.message : String(cause) }))
          }
        })
        actions.append(del)
      }
      if (lang === 'zh' && (skill.description || skill.whenToUse)) {
        const reBtn = el('button', 'dci_act', t('retranslate'))
        reBtn.type = 'button'
        reBtn.addEventListener('click', () => retranslate([skill.description, skill.whenToUse]))
        actions.append(reBtn)
      }
      if (actions.childNodes.length > 0) card.append(actions)
      return card
    }

    /** 一台 MCP 服务器卡片。 */
    function serverCard(server) {
      const card = el('div', 'dci_item')
      const row = el('div', 'dci_row')
      row.append(el('span', 'dci_name', server.name))
      const status = server.disabled ? t('disabledStatus') : server.status === 'connected' ? t('statusConnected') : t('statusConfigured')
      const badge = el('span', `dci_badge ${server.disabled ? 'dci_badgeWarn' : server.status === 'connected' ? 'dci_badgeOk' : 'dci_badgeWarn'}`, status)
      row.append(badge)
      if (server.transport) row.append(el('span', 'dci_badge', `${t('transport')}: ${server.transport}`))
      if (!server.disabled && server.tools.length > 0) row.append(el('span', 'dci_badge', t('toolTotal', { n: server.tools.length })))
      card.append(row)
      const endpoint = server.command !== '' ? `${t('command')}: ${server.command}` : server.url !== '' ? `${t('url')}: ${server.url}` : ''
      if (endpoint !== '') card.append(el('p', 'dci_meta', endpoint))
      if (server.disabled) card.append(el('p', 'dci_meta', t('noTools')))
      else if (server.tools.length === 0) card.append(el('p', 'dci_meta', t('noTools')))
      if (server.tools.length > 0) {
        const toolsBox = el('div', 'dci_tools')
        for (const tool of server.tools) {
          const toolRow = el('div', 'dci_tool')
          const head = el('div', 'dci_row')
          head.append(el('span', 'dci_toolName', tool.fullName))
          toolRow.append(head)
          if (tool.description) toolRow.append(clamped(`${t('purpose')}: ${displayText(tool.description)}`, 'dci_desc'))
          const lines = [t('mcpUsage', { fullName: tool.fullName })]
          if (tool.params.length > 0) lines.push(`${t('params')}: ${tool.params.join(', ')}`)
          toolRow.append(el('p', 'dci_meta', lines.join(' · ')))
          toolsBox.append(toolRow)
        }
        if (server.tools.length > 6) {
          toolsBox.hidden = true
          const more = el('button', 'dci_act', t('showTools', { n: server.tools.length }))
          more.type = 'button'
          more.addEventListener('click', () => {
            toolsBox.hidden = !toolsBox.hidden
            more.textContent = toolsBox.hidden ? t('showTools', { n: server.tools.length }) : t('hideTools')
          })
          card.append(more, toolsBox)
        } else {
          card.append(toolsBox)
        }
      }
      const actions = el('div', 'dci_actions')
      if (server.id) {
        const toggle = el('button', 'dci_act', server.disabled ? t('enable') : t('disable'))
        toggle.type = 'button'
        toggle.addEventListener('click', async () => {
          if (!server.disabled && !window.confirm(t('confirmDisableMcp'))) return
          try {
            await post(MCP_ROUTE, { action: server.disabled ? 'enable' : 'disable', id: server.id })
            load()
          } catch (cause) {
            window.alert(t('opFailed', { error: cause instanceof Error ? cause.message : String(cause) }))
          }
        })
        actions.append(toggle)
      }
      if (lang === 'zh' && server.tools.some((tool) => tool.description)) {
        const reBtn = el('button', 'dci_act', t('retranslate'))
        reBtn.type = 'button'
        reBtn.addEventListener('click', () => retranslate(server.tools.map((tool) => tool.description)))
        actions.append(reBtn)
      }
      if (actions.childNodes.length > 0) card.append(actions)
      return card
    }

    /** 打开技能编辑弹窗。 */
    function openEditor(skill) {
      if (typeof skill.body !== 'string') {
        window.alert(t('notEditable'))
        return
      }
      editingPath = skill.path
      const fields = [
        ['nameLabel', skill.name, 'input', ''],
        ['descriptionLabel', skill.description || '', 'textarea', ''],
        ['whenToUseLabel', skill.whenToUse || '', 'textarea', ''],
        ['contentLabel', skill.body, 'textarea', 'bodyArea'],
      ]
      editorBody.replaceChildren()
      for (const [labelKey, value, kind, extra] of fields) {
        const field = el('div', 'dci_field')
        field.append(el('label', '', t(labelKey)))
        if (kind === 'input') {
          const input = el('input', '')
          input.value = value
          field.append(input)
        } else {
          const area = el('textarea', extra)
          area.value = value
          field.append(area)
        }
        editorBody.append(field)
      }
      editor.classList.add('dci_overlayOpen')
    }

    async function saveSkill() {
      const [nameInput, descArea, whenArea, bodyArea] = editorBody.querySelectorAll('input, textarea')
      try {
        await post(SKILL_ROUTE, {
          action: 'edit',
          path: editingPath,
          name: nameInput.value.trim(),
          description: descArea.value,
          whenToUse: whenArea.value,
          content: bodyArea.value,
        })
        editor.classList.remove('dci_overlayOpen')
        load()
      } catch (cause) {
        window.alert(t('editFailed', { error: cause instanceof Error ? cause.message : String(cause) }))
      }
    }

    let skillsSection
    let mcpSection

    function render() {
      title.textContent = t('title')
      langButton.textContent = t('langSwitch')
      refreshButton.textContent = t('refresh')
      closeButton.textContent = t('close')
      navSkills.textContent = t('navSkills')
      navMcp.textContent = t('navMcp')
      search.placeholder = t('search')
      syncScopeSelect()
      entryApi?.sync()
      body.replaceChildren()

      if (loading && data === undefined) {
        body.append(el('p', 'dci_status', t('loading')))
        return
      }
      if (error !== undefined) {
        body.append(el('p', 'dci_status dci_error', t('loadFailed', { error })))
        return
      }
      if (data === undefined) return

      if (data.cwd === null || data.cwd === undefined) {
        body.append(el('p', 'dci_warn', t('noWorkspace')))
        const cwdRow = el('div', 'dci_cwdRow')
        const cwdInput = el('input', 'dci_input')
        cwdInput.type = 'text'
        cwdInput.placeholder = t('cwdPlaceholder')
        const cwdButton = el('button', 'dci_button', t('applyCwd'))
        cwdButton.type = 'button'
        cwdButton.addEventListener('click', () => {
          if (cwdInput.value.trim() !== '') load(cwdInput.value.trim())
        })
        cwdRow.append(cwdInput, cwdButton)
        body.append(cwdRow)
      } else {
        body.append(el('p', 'dci_note', t('workspace', { cwd: data.cwd })))
      }

      const skills = data.skills.items.filter((skill) => (filterScope === '' || skill.scope === filterScope) && matches(`${skill.name} ${skill.description} ${skill.whenToUse} ${skill.path}`))
      const servers = data.mcp.servers.filter((server) =>
        matches(`${server.name} ${server.tools.map((tool) => `${tool.name} ${tool.description}`).join(' ')}`),
      )
      const needs = []
      if (lang === 'zh') {
        for (const skill of skills) {
          if (skill.description) needs.push(skill.description)
          if (skill.whenToUse) needs.push(skill.whenToUse)
        }
        for (const server of servers) for (const tool of server.tools) if (tool.description) needs.push(tool.description)
      }
      transNeeds = [...new Set(needs)]
      const summary = el('p', 'dci_summary', t('summary', { s: data.skills.total, m: data.mcp.total, t: data.mcp.toolTotal }))
      transStatusEl = undefined
      if (transNeeds.length > 0) {
        transStatusEl = el('span', 'dci_transStatus', '')
        summary.append(document.createTextNode(' · '), transStatusEl)
      }
      body.append(summary)
      updateTransStatus()

      skillsSection = el('div', 'dci_sectionTitle')
      skillsSection.append(document.createTextNode(t('skills')), el('span', 'dci_count', t('skillTotal', { n: skills.length })))
      body.append(skillsSection)
      const skillsBox = el('div', 'dci_section')
      body.append(skillsBox)
      if (skills.length === 0) skillsBox.append(el('p', 'dci_status', t('empty')))
      else for (const skill of skills) skillsBox.append(skillCard(skill))

      mcpSection = el('div', 'dci_sectionTitle')
      mcpSection.append(
        document.createTextNode(t('mcp')),
        el('span', 'dci_count', t('serverTotal', { n: servers.length, m: data.mcp.toolTotal })),
      )
      body.append(mcpSection)
      const mcpBox = el('div', 'dci_section')
      body.append(mcpBox)
      if (servers.length === 0) mcpBox.append(el('p', 'dci_status', t('empty')))
      else for (const server of servers) mcpBox.append(serverCard(server))

      if (lang === 'zh') ensureTranslations(needs)
    }

    let entryApi
    entryApi = mountSidebarEntry(
      () => {
        const opening = !overlay.classList.contains('dci_overlayOpen')
        overlay.classList.toggle('dci_overlayOpen', opening)
        if (opening) load()
      },
      () => t('sidebar'),
    )

    render()
    return () => {
      entryApi?.dispose()
      document.removeEventListener('keydown', onKey)
      overlay.remove()
      editor.remove()
      style.remove()
    }
  }

  /**
   * 侧边栏入口：等待外壳渲染后插到「新会话」按钮之后，并在 React 重绘后自愈。
   * 超过 8 秒仍找不到外壳（外壳改版）时退化为左下角悬浮按钮，保证面板仍可打开。
   * @param {()=>void} onToggle 点击回调
   * @param {()=>string} label 文案（随语言刷新）
   * @returns {{sync:()=>void,dispose:()=>void}} 同步入口与卸载函数
   */
  function mountSidebarEntry(onToggle, label) {
    const entry = el('button', 'dci_entry')
    entry.type = 'button'
    entry.setAttribute('data-dsh-part', 'sidebar-entry')
    entry.setAttribute('data-dsh-plugin', NS)
    const icon = el('span', 'dci_entryIcon')
    icon.innerHTML = ICON
    const text = el('span', 'dci_entryLabel', label())
    entry.append(icon, text)
    entry.addEventListener('click', onToggle)

    let fab
    const place = () => {
      if (entry.isConnected) return true
      const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]')
      const root = column?.querySelector('[class*="logoRow"]')?.parentElement ?? column?.firstElementChild
      const anchor = root?.querySelector('button[class*="newSession"]') ?? Array.from(root?.children ?? []).find((node) => node.tagName === 'BUTTON')
      if (!root || !anchor) return false
      root.insertBefore(entry, anchor.nextElementSibling)
      return true
    }
    /** 刷新文案并补挂入口（语言切换、外壳重绘后调用）。 */
    const sync = () => {
      const next = label()
      if (text.textContent !== next) text.textContent = next
      if (fab !== undefined && fab.textContent !== next) fab.textContent = next
      place()
    }
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true })
    if (!place()) {
      setTimeout(() => {
        if (place()) return
        fab = el('button', 'dci_fab', label())
        fab.type = 'button'
        fab.addEventListener('click', onToggle)
        document.body.appendChild(fab)
      }, SIDEBAR_FALLBACK_MS)
    }
    return {
      sync,
      dispose: () => {
        observer.disconnect()
        entry.remove()
        fab?.remove()
      },
    }
  }

  const inject = ['locale']

  /** 客户端插件主体：注册官方 i18n 字典并接线翻译席位（不可用时退回内置字典）。 */
  function apply(ctx) {
    ctx.effect(() => {
      try { return ctx.locale.register(NS, { zh, en }) } catch { return () => {} }
    }, `${NS}: dictionaries`)
    let bound
    try { bound = ctx.locale.bind(NS) } catch {}
    ctx.effect(() => mount(ctx.locale, bound), `${NS}: panel`)
  }

  if (typeof window !== 'undefined' && window.__ModuleLoader__ !== undefined) {
    window.__ModuleLoader__.load({ id: 'dsh-capability-inventory', factory: () => ({ apply, inject }) })
  }
  // 供 test/check.mjs 做中英文字典一致性自检（浏览器中同样无害）。
  globalThis.__dshCapabilityInventory = { apply, inject, zh, en }
}
