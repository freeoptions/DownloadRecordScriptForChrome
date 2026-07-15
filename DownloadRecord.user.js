// ==UserScript==
// @name         DownloadRecord - 小红书下载记录助手
// @namespace    https://downloadrecord.local/
// @version      1.0.1
// @description  记录小红书笔记的已下载状态，并按博主分组展示、对比本次提取链接，筛出未下载笔记。
// @match        https://www.xiaohongshu.com/*
// @match        https://www.xiaohongshu.com.cn/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'download-record:v1';
  const APP_NAME = 'DownloadRecord';
  const EXPORT_FILE_PREFIX = 'xhs_DownloadRecord';
  const APP_VERSION = '1.0.1';
  const CREATOR_GROUP_PAGE_SIZE = 40;
  const CREATOR_GROUP_AUTO_LOAD_THRESHOLD = 60;
  const style = document.createElement('style');
  style.textContent = `
    :root{--dr-accent:#7c3aed;--dr-accent-dark:#6d28d9;--dr-accent-soft:#f3e8ff;--dr-accent-line:#ddd6fe}
    .dr-panel{position:fixed;right:18px;bottom:18px;width:360px;height:560px;min-width:320px;min-height:320px;max-width:92vw;max-height:85vh;z-index:999999;background:#fff;border:1px solid var(--dr-accent-line);border-radius:14px;box-shadow:0 12px 34px rgba(124,58,237,.18);font:14px/1.5 "Microsoft YaHei",sans-serif;color:#222;overflow:hidden;resize:both;display:flex;flex-direction:column}
    .dr-head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:linear-gradient(135deg,var(--dr-accent),var(--dr-accent-dark));color:#fff}
    .dr-title{font-size:15px;font-weight:700}
    .dr-body{flex:1 1 auto;min-height:0;padding:10px;overflow:auto}
    .dr-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
    .dr-btn{border:0;border-radius:10px;padding:8px 10px;background:var(--dr-accent);color:#fff;cursor:pointer;font-size:13px;white-space:nowrap}
    .dr-btn.secondary{background:var(--dr-accent-soft);color:#4c1d95}
    .dr-btn.ghost{background:#fff;color:var(--dr-accent);border:1px solid var(--dr-accent)}
    .dr-btn:active{transform:translateY(1px)}
    .dr-input,.dr-textarea{width:100%;box-sizing:border-box;border:1px solid var(--dr-accent-line);border-radius:10px;padding:9px 10px;font:13px/1.45 "Microsoft YaHei",sans-serif;outline:none}
    .dr-textarea{min-height:76px;resize:vertical}
    .dr-section{margin-bottom:10px;padding:10px;border:1px solid #ede9fe;border-radius:12px;background:#fafafa}
    .dr-section[data-view="records"]{display:flex;flex-direction:column;min-height:0;flex:1 1 auto}
    .dr-section h4{margin:0 0 8px;font-size:13px}
    .dr-meta{font-size:12px;color:#666;word-break:break-all}
    .dr-list{max-height:120px;overflow:auto;margin:8px 0 0;padding:0;list-style:none}
    .dr-item{padding:6px 0;border-top:1px dashed #e6e6e6}
    .dr-item:first-child{border-top:0}
    .dr-item a{color:var(--dr-accent-dark);text-decoration:none;word-break:break-all}
    .dr-kv{font-size:12px;color:#444;margin-top:4px;word-break:break-all}
    .dr-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;background:var(--dr-accent-soft);color:var(--dr-accent-dark);margin-left:6px}
    .dr-group{border:1px solid #ececec;border-radius:12px;background:#fff;padding:8px 10px;margin-top:8px}
    .dr-group-head{display:flex;flex-direction:column;align-items:stretch;gap:10px}
    .dr-group-title{font-size:13px;font-weight:700;word-break:normal;overflow-wrap:anywhere;line-height:1.35}
    .dr-group-meta{font-size:12px;color:#666;margin-top:4px}
    .dr-group-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center;width:100%}
    .dr-group-more{font-size:12px;color:#999;margin-top:6px}
    .dr-summary-bar{font-size:12px;color:#666;margin-bottom:8px}
    .dr-tabs{display:flex;gap:8px;margin-bottom:10px}
    .dr-tab{flex:1;border:1px solid var(--dr-accent-line);background:#fff;color:#4c1d95;border-radius:10px;padding:8px 0;cursor:pointer}
    .dr-tab.active{background:var(--dr-accent);border-color:var(--dr-accent);color:#fff}
    .dr-hide{display:none !important}
    .dr-view-records{display:flex;flex-direction:column;min-height:0;flex:1 1 auto}
    .dr-view-records #dr-record-list{flex:1 1 auto;min-height:0;max-height:none}
    .dr-panel.dr-collapsed{width:180px;height:auto;min-height:0;resize:none}
    .dr-panel.dr-collapsed .dr-body{display:none}
    .dr-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:1000000;background:rgba(124,58,237,.88);color:#fff;padding:10px 14px;border-radius:999px;font-size:13px;pointer-events:none;opacity:0;transition:opacity .2s ease}
    .dr-toast.show{opacity:1}
    .dr-small{font-size:12px;color:#666}
    .dr-compare-results{max-height:none}
  `;
  document.head.appendChild(style);

  const state = loadState();
  let currentTab = 'record';
  let panel;
  let toastTimer;
  let collapsed = loadCollapsed();
  let creatorKeyword = '';
  let visibleCreatorGroupCount = CREATOR_GROUP_PAGE_SIZE;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { notes: [], creatorAliases: {} };
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.notes)) return { notes: [], creatorAliases: {} };
      const creatorAliases = parsed.creatorAliases && typeof parsed.creatorAliases === 'object' ? parsed.creatorAliases : {};
      return {
        notes: parsed.notes
          .filter((item) => item && item.id)
          .map((item) => ({
            id: String(item.id).toLowerCase(),
            title: item.title || '',
            publishTime: item.publishTime || '',
            url: item.url || '',
            creatorId: item.creatorId || 'unknown',
            creatorName: item.creatorName || '未分组',
            downloaded: item.downloaded !== false,
            createdAt: item.createdAt || '',
            updatedAt: item.updatedAt || '',
          })),
        creatorAliases: Object.fromEntries(
          Object.entries(creatorAliases)
            .filter(([key, value]) => key && typeof value === 'string' && value.trim())
            .map(([key, value]) => [String(key), value.trim()])
        ),
      };
    } catch {
      return { notes: [], creatorAliases: {} };
    }
  }

  function loadCollapsed() {
    return true;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function showToast(text) {
    let toast = document.querySelector('.dr-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'dr-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  function cleanCreatorName(text) {
    const value = String(text || '').trim();
    if (!value) return '';
    return value.replace(/\s*-\s*小红书\s*$/i, '').trim();
  }

  function formatCreatorLabel(creatorId, creatorName) {
    const baseName = cleanCreatorName(creatorName) || state.creatorAliases[creatorId] || creatorId || '未分组';
    if (!creatorId || creatorId === 'unknown') return baseName || '未分组';
    if (baseName === creatorId) return baseName;
    if (baseName.endsWith(`-${creatorId}`)) return baseName;
    return `${baseName}-${creatorId}`;
  }

  function getNoteIdFromUrl(input) {
    if (!input) return '';
    const text = String(input).trim();
    try {
      const url = new URL(text, location.href);
      const match = url.pathname.match(/\/discovery\/item\/([0-9a-fA-F]+)/);
      if (match) return match[1].toLowerCase();
    } catch {}
    const match = text.match(/(?:^|[^0-9a-fA-F])([0-9a-fA-F]{24})(?:[^0-9a-fA-F]|$)/);
    return match ? match[1].toLowerCase() : '';
  }

  function normalizeUrl(input) {
    const text = String(input || '').trim();
    if (!text) return '';
    try {
      const url = new URL(text, location.href);
      return url.href;
    } catch {
      return text;
    }
  }

  function formatDateTime(value) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function safeText(el) {
    if (!el) return '';
    if ('content' in el && typeof el.content === 'string') return el.content.trim();
    return (el.textContent || '').trim();
  }

  function getCreatorFromUrl(url) {
    const text = String(url || '').trim();
    if (!text) return { creatorId: '', creatorName: '' };
    try {
      const parsed = new URL(text, location.href);
      const profileMatch = parsed.pathname.match(/\/user\/profile\/([^/?#]+)/i);
      if (profileMatch) {
        const creatorId = profileMatch[1];
        return {
          creatorId,
          creatorName: state.creatorAliases[creatorId] || creatorId,
        };
      }
    } catch {}
    return { creatorId: '', creatorName: '' };
  }

  function scrapeCurrentNoteByUrl(url) {
    const creator = getCreatorFromUrl(url);
    return {
      id: getNoteIdFromUrl(url),
      title: '',
      publishTime: '',
      creatorId: creator.creatorId,
      creatorName: creator.creatorName,
    };
  }

  function getCurrentCreator() {
    const path = location.pathname || '';
    const profileMatch = path.match(/\/user\/profile\/([^/?#]+)/i);
    const creatorId = profileMatch ? profileMatch[1] : '';
    const titleName = cleanCreatorName(document.title || '');
    const name =
      safeText(document.querySelector('main h1')) ||
      safeText(document.querySelector('[class*="user-name"]')) ||
      safeText(document.querySelector('[class*="username"]')) ||
      safeText(document.querySelector('aside a[href*="/user/profile/"]')) ||
      titleName ||
      '';
    if (creatorId || name) {
      return {
        creatorId: creatorId || `name:${name || '未分组'}`,
        creatorName: cleanCreatorName(name || creatorId || '未分组'),
      };
    }
    return {
      creatorId: 'unknown',
      creatorName: '未分组',
    };
  }

  function getCreatorLabel(note) {
    return formatCreatorLabel(note.creatorId, note.creatorName);
  }

  function updateCreatorAlias(creatorId, alias) {
    if (!creatorId) return;
    const text = String(alias || '').trim();
    if (text) state.creatorAliases[creatorId] = text;
    else delete state.creatorAliases[creatorId];
    saveState();
    render();
  }

  function upsertNote(note, options = {}) {
    if (!note.id) return false;
    const { persist = true, rerender = true } = options;
    const now = new Date().toISOString();
    const idx = state.notes.findIndex((item) => item.id === note.id);
      const next = {
        id: note.id,
        title: note.title || '',
        publishTime: note.publishTime || '',
        url: note.url || (idx >= 0 ? state.notes[idx].url : ''),
        creatorId: note.creatorId || (idx >= 0 ? state.notes[idx].creatorId : 'unknown'),
        creatorName: note.creatorName || (idx >= 0 ? state.notes[idx].creatorName : '未分组'),
        downloaded: note.downloaded !== false,
        createdAt: idx >= 0 ? state.notes[idx].createdAt : now,
        updatedAt: now,
    };
    if (idx >= 0) state.notes[idx] = { ...state.notes[idx], ...next };
    else state.notes.unshift(next);
    if (persist) saveState();
    if (rerender) render();
    return true;
  }

  function removeCreatorGroup(creatorId) {
    if (!creatorId) return 0;
    const beforeCount = state.notes.length;
    state.notes = state.notes.filter((item) => (item.creatorId || 'unknown') !== creatorId);
    delete state.creatorAliases[creatorId];
    saveState();
    render();
    return beforeCount - state.notes.length;
  }

  function parseLinks(text) {
    const tokens = String(text || '')
      .split(/[\s,，]+/g)
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set();
    const items = [];
    for (const token of tokens) {
      const id = getNoteIdFromUrl(token);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        url: normalizeUrl(token),
      });
    }
    return items;
  }

  function compareLinks(text) {
    const inputs = parseLinks(text);
    const unknown = [];
    const known = [];
    for (const item of inputs) {
      const record = state.notes.find((n) => n.id === item.id);
      if (record) known.push({ ...item, record });
      else unknown.push(item);
    }
    return { unknown, known };
  }

  async function copyText(text) {
    const value = String(text || '');
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(value);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return true;
  }

  function exportJson() {
    const payload = {
      app: APP_NAME,
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      notes: state.notes,
      creatorAliases: state.creatorAliases,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${EXPORT_FILE_PREFIX}_exportConfig_${formatDateTime(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showToast('配置已导出到浏览器下载目录');
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || ''));
        const list = Array.isArray(data?.notes) ? data.notes : [];
        const aliases = data?.creatorAliases && typeof data.creatorAliases === 'object' ? data.creatorAliases : {};
        for (const [key, value] of Object.entries(aliases)) {
          if (!key || typeof value !== 'string' || !value.trim()) continue;
          state.creatorAliases[String(key)] = value.trim();
        }
        for (const item of list) {
          if (!item?.id) continue;
          upsertNote({
            id: String(item.id).toLowerCase(),
            title: item.title || '',
            publishTime: item.publishTime || '',
            url: item.url || '',
            creatorId: item.creatorId || 'unknown',
            creatorName: item.creatorName || '未分组',
            downloaded: item.downloaded !== false,
          }, { persist: false, rerender: false });
        }
        saveState();
        render();
        showToast('导入完成');
      } catch {
        showToast('导入失败，请检查 JSON 格式');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  async function addDownloadedFromText(text) {
    const items = parseLinks(text);
    if (!items.length) return { total: 0, added: 0, creator: getCurrentCreator() };
    const creator = getCurrentCreator();
    let added = 0;
    for (const item of items) {
      const note = scrapeCurrentNoteByUrl(item.url);
      if (upsertNote({
        id: note.id,
        title: '',
        publishTime: '',
        url: item.url,
        creatorId: creator.creatorId,
        creatorName: creator.creatorName,
        downloaded: true,
      }, { persist: false, rerender: false })) {
        added += 1;
      }
    }
    saveState();
    render();
    return { total: items.length, added, creator };
  }

  function buildCreatorGroups() {
    const keyword = creatorKeyword.trim().toLowerCase();
    const groupsMap = new Map();
    for (const note of state.notes) {
      const creatorId = note.creatorId || 'unknown';
      const creatorName = cleanCreatorName(note.creatorName || '');
      const displayName = formatCreatorLabel(creatorId, creatorName);
      const searchText = `${creatorName} ${displayName} ${creatorId}`.toLowerCase();
      if (keyword && !searchText.includes(keyword)) continue;
      if (!groupsMap.has(creatorId)) {
        groupsMap.set(creatorId, {
          creatorId,
          creatorName,
          displayName,
          downloadedCount: 0,
          totalCount: 0,
          latestAt: '',
        });
      }
      const group = groupsMap.get(creatorId);
      group.displayName = formatCreatorLabel(group.creatorId, group.creatorName);
      group.totalCount += 1;
      if (note.downloaded) group.downloadedCount += 1;
      const noteTime = note.updatedAt || note.createdAt || '';
      if (!group.latestAt || noteTime > group.latestAt) group.latestAt = noteTime;
    }

    return Array.from(groupsMap.values())
      .sort((a, b) => {
        if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
        if (b.downloadedCount !== a.downloadedCount) return b.downloadedCount - a.downloadedCount;
        return (b.latestAt || '').localeCompare(a.latestAt || '');
      });
  }

  function loadMoreCreatorGroups(creatorGroups) {
    if (visibleCreatorGroupCount >= creatorGroups.length) return false;
    visibleCreatorGroupCount = Math.min(creatorGroups.length, visibleCreatorGroupCount + CREATOR_GROUP_PAGE_SIZE);
    return true;
  }

  function handleRecordScroll() {
    const recordList = panel?.querySelector('#dr-record-list');
    if (!recordList) return;
    if (recordList.scrollTop + recordList.clientHeight < recordList.scrollHeight - CREATOR_GROUP_AUTO_LOAD_THRESHOLD) return;
    const creatorGroups = buildCreatorGroups();
    const creatorChanged = loadMoreCreatorGroups(creatorGroups);
    if (creatorChanged) render();
  }

  function getScrollableParent(target) {
    if (!panel || !(target instanceof Element)) return null;
    let node = target;
    while (node && node !== panel) {
      if (node instanceof HTMLElement) {
        const style = window.getComputedStyle(node);
        const overflowY = style.overflowY;
        const canScrollY = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && node.scrollHeight > node.clientHeight;
        if (canScrollY) return node;
      }
      node = node.parentElement;
    }
    const body = panel.querySelector('.dr-body');
    return body instanceof HTMLElement ? body : null;
  }

  function handlePanelWheel(e) {
    if (collapsed || !panel?.contains(e.target)) return;
    const container = getScrollableParent(e.target);
    if (!container) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const deltaY = e.deltaY || 0;
    const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0);
    if (maxScrollTop <= 0) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const nextScrollTop = Math.min(maxScrollTop, Math.max(0, container.scrollTop + deltaY));
    if (nextScrollTop !== container.scrollTop) {
      container.scrollTop = nextScrollTop;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  function render() {
    if (!panel) return;
    const recordList = panel.querySelector('#dr-record-list');
    const recordScrollTop = recordList?.scrollTop || 0;
    const recordScrollLeft = recordList?.scrollLeft || 0;
    panel.querySelectorAll('[data-tab]').forEach((el) => {
      el.classList.toggle('active', el.dataset.tab === currentTab);
    });
    panel.querySelectorAll('[data-view]').forEach((el) => {
      el.classList.toggle('dr-hide', el.dataset.view !== currentTab);
    });
    const compareList = panel.querySelector('#dr-compare-list');
    const creatorSummary = panel.querySelector('#dr-current-creator');
    const currentCreator = getCurrentCreator();
    const isRecordsTab = currentTab === 'records';
    const creatorGroups = isRecordsTab ? buildCreatorGroups() : [];

    if (creatorSummary) {
      creatorSummary.textContent = `当前博主：${currentCreator.creatorName}`;
    }

    if (isRecordsTab && panel.querySelector('#dr-record-summary')) {
      const totalNotes = state.notes.length;
      const totalCreators = creatorGroups.length;
      panel.querySelector('#dr-record-summary').textContent = `共 ${totalCreators} 个博主，已记录 ${totalNotes} 条笔记`;
    }

    if (recordList && isRecordsTab) {
      visibleCreatorGroupCount = Math.max(CREATOR_GROUP_PAGE_SIZE, visibleCreatorGroupCount);
      const visibleCreatorGroups = creatorGroups.slice(0, visibleCreatorGroupCount);
      const hiddenCreatorCount = Math.max(creatorGroups.length - visibleCreatorGroups.length, 0);
      recordList.innerHTML = creatorGroups.length
          ? `${visibleCreatorGroups
            .map((group) => {
              return `
                <div class="dr-group">
                  <div class="dr-group-head">
                    <div style="min-width:0">
                      <div class="dr-group-title">${escapeHtml(group.displayName)}</div>
                      <div class="dr-group-meta">已记录 ${group.totalCount} 条${group.downloadedCount !== group.totalCount ? `，已下载 ${group.downloadedCount} 条` : ''}</div>
                    </div>
                    <div class="dr-group-actions">
                      <button class="dr-btn secondary" data-action="edit-creator" data-creator="${escapeAttr(group.creatorId)}" data-name="${escapeAttr(group.creatorName)}">编辑名称</button>
                      <button class="dr-btn ghost" data-action="delete-creator" data-creator="${escapeAttr(group.creatorId)}" data-name="${escapeAttr(group.displayName)}">删除分组</button>
                    </div>
                  </div>
                </div>`;
            })
            .join('')}
           ${hiddenCreatorCount > 0 ? `<div class="dr-group-more">继续下拉可加载剩余 ${hiddenCreatorCount} 个博主分组</div>` : ''}`
        : '<div class="dr-small">暂无记录</div>';
      requestAnimationFrame(() => {
        if (!recordList) return;
        recordList.scrollTop = recordScrollTop;
        recordList.scrollLeft = recordScrollLeft;
      });
    }

    if (compareList) {
      const textarea = panel.querySelector('#dr-links');
      const result = compareLinks(textarea.value);
      compareList.innerHTML = `
        <div class="dr-small">本次识别到 ${result.known.length + result.unknown.length} 条链接，未下载 ${result.unknown.length} 条</div>
        <div class="dr-row" style="margin-top:8px">
          <button class="dr-btn" data-action="copy-unknown">复制未下载链接</button>
          <button class="dr-btn secondary" data-action="fill-current">填入当前页链接</button>
        </div>
        ${result.unknown.length
          ? `<ul class="dr-list dr-compare-results">
              ${result.unknown
                .map(
                  (item) => `
                    <li class="dr-item">
                      <div><b>未下载</b><span class="dr-badge">${item.id}</span></div>
                      <div class="dr-kv"><a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a></div>
                      <div class="dr-row" style="margin-top:6px">
                        <button class="dr-btn secondary" data-action="mark-downloaded" data-id="${item.id}" data-url="${escapeAttr(item.url)}">标记已下载</button>
                      </div>
                    </li>`
                )
                .join('')}
            </ul>`
          : ''}
      `;
    }
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(text) {
    return escapeHtml(text);
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.className = 'dr-panel';
    panel.innerHTML = `
      <div class="dr-head">
        <div class="dr-title">下载记录助手</div>
        <button class="dr-btn secondary" style="padding:6px 10px" data-action="toggle-collapse">${collapsed ? '展开' : '收起'}</button>
      </div>
      <div class="dr-body">
        <div class="dr-tabs">
          <button class="dr-tab active" data-tab="record">记录</button>
          <button class="dr-tab" data-tab="compare">对比</button>
          <button class="dr-tab" data-tab="records">已记录</button>
        </div>
        <div class="dr-section" data-view="record">
          <h4>录入已下载链接</h4>
          <div id="dr-current-creator" class="dr-summary-bar">当前博主：未分组</div>
          <textarea id="dr-downloaded-links" class="dr-textarea" placeholder="把已下载的小红书链接粘贴到这里，空格或换行分隔"></textarea>
          <div class="dr-row" style="margin-top:8px">
            <button class="dr-btn" data-action="save-downloaded">加入记录</button>
            <button class="dr-btn secondary" data-action="paste-downloaded">粘贴剪贴板</button>
          </div>
          <div class="dr-row">
            <input id="dr-import" type="file" accept=".json" class="dr-input" style="padding:6px">
          </div>
          <div class="dr-row">
            <button class="dr-btn secondary" data-action="export">导出 JSON</button>
          </div>
        </div>
        <div class="dr-section dr-hide" data-view="compare">
          <h4>本次提取的链接</h4>
          <textarea id="dr-links" class="dr-textarea" placeholder="把你提取出来的多个小红书链接粘贴到这里，空格或换行分隔"></textarea>
          <div class="dr-row" style="margin-top:8px">
            <button class="dr-btn" data-action="compare">开始对比</button>
            <button class="dr-btn secondary" data-action="paste">粘贴剪贴板</button>
          </div>
          <div id="dr-compare-list"></div>
        </div>
        <div class="dr-section dr-hide dr-view-records" data-view="records">
          <h4>已记录笔记</h4>
          <div id="dr-record-summary" class="dr-summary-bar">共 0 个博主，已记录 0 条笔记</div>
          <input id="dr-creator-search" class="dr-input" placeholder="搜索博主名称">
          <div id="dr-record-list" class="dr-list"></div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    panel.classList.toggle('dr-collapsed', collapsed);
    render();

    panel.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'toggle-collapse') {
        collapsed = !collapsed;
        panel.classList.toggle('dr-collapsed', collapsed);
        btn.textContent = collapsed ? '展开' : '收起';
        return;
      }
      if (action === 'save-downloaded') {
        const text = panel.querySelector('#dr-downloaded-links').value;
        const result = await addDownloadedFromText(text);
        showToast(`已录入 ${result.added} 条`);
        panel.querySelector('#dr-downloaded-links').value = '';
        return;
      }
      if (action === 'export') {
        exportJson();
        return;
      }
      if (action === 'compare') {
        render();
        const { unknown } = compareLinks(panel.querySelector('#dr-links').value);
        showToast(`未下载 ${unknown.length} 条`);
        return;
      }
      if (action === 'paste-downloaded') {
        try {
          const text = await navigator.clipboard.readText();
          panel.querySelector('#dr-downloaded-links').value = text;
          showToast('已填入剪贴板内容');
        } catch {
          showToast('读取剪贴板失败，请手动粘贴');
        }
        return;
      }
      if (action === 'paste') {
        try {
          const text = await navigator.clipboard.readText();
          panel.querySelector('#dr-links').value = text;
          render();
          showToast('已填入剪贴板内容');
        } catch {
          showToast('读取剪贴板失败，请手动粘贴');
        }
        return;
      }
      if (action === 'edit-creator') {
        const creatorId = btn.dataset.creator || '';
        const currentName = state.creatorAliases[creatorId] || btn.dataset.name || creatorId || '';
        const nextName = window.prompt('请输入分组名称，建议格式：名称-id', currentName);
        if (nextName === null) return;
        updateCreatorAlias(creatorId, nextName);
        showToast(nextName.trim() ? '分组名称已更新' : '已恢复自动命名');
        return;
      }
      if (action === 'delete-creator') {
        const creatorId = btn.dataset.creator || '';
        const creatorName = btn.dataset.name || creatorId || '该分组';
        const ok = window.confirm(`确认删除分组“${creatorName}”吗？\n删除后该分组下的全部记录都会被移除，无法恢复。`);
        if (!ok) return;
        const removedCount = removeCreatorGroup(creatorId);
        showToast(`已删除分组，共移除 ${removedCount} 条记录`);
        return;
      }
      if (action === 'mark-downloaded') {
        const id = btn.dataset.id;
        const item = state.notes.find((n) => n.id === id);
        const inputItem = {
          id,
          url: btn.dataset.url || `https://www.xiaohongshu.com/discovery/item/${id}`,
        };
        const creator = item?.creatorId
          ? { creatorId: item.creatorId, creatorName: item.creatorName || item.creatorId }
          : getCurrentCreator();
        upsertNote({
          id,
          title: '',
          publishTime: '',
          url: inputItem.url,
          creatorId: creator.creatorId,
          creatorName: creator.creatorName,
          downloaded: true,
        });
        showToast('已标记为已下载');
        return;
      }
      if (action === 'copy-unknown') {
        const { unknown } = compareLinks(panel.querySelector('#dr-links').value);
        const text = unknown.map((item) => item.url).join('\n');
        await copyText(text);
        showToast('已复制未下载链接');
        return;
      }
      if (action === 'fill-current') {
        panel.querySelector('#dr-links').value = location.href;
        render();
        return;
      }
    });

    panel.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (!tab) return;
      currentTab = tab.dataset.tab;
      render();
    });

    panel.querySelector('#dr-import').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) importJson(file);
      e.target.value = '';
    });

    panel.querySelector('#dr-links').addEventListener('input', render);
    panel.querySelector('#dr-creator-search').addEventListener('input', (e) => {
      creatorKeyword = e.target.value || '';
      visibleCreatorGroupCount = CREATOR_GROUP_PAGE_SIZE;
      render();
    });
    panel.querySelector('#dr-record-list').addEventListener('scroll', handleRecordScroll);
    panel.addEventListener('wheel', handlePanelWheel, { passive: false });
  }

  function init() {
    if (document.querySelector('.dr-panel')) return;
    buildPanel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
