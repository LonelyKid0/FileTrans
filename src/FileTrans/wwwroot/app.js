/* 局域网文件快传 · 前端逻辑 */
(() => {
  'use strict';

  /* ---------------- 图标 ---------------- */
  const ICONS = {
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    video: '<rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>',
    audio: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    archive: '<path d="M21 8v13H3V8"/><rect x="1" y="3" width="22" height="5" rx="1"/><path d="M10 12h4"/>',
    code: '<path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/>',
    pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 18v-6h1.5a1.5 1.5 0 0 1 0 3H9"/>',
    office: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
    text: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    zip: '<path d="M21 8v13H3V8"/><rect x="1" y="3" width="22" height="5" rx="1"/><path d="M10 12h4"/>',
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    chevronRight: '<path d="M9 18l6-6-6-6"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 15.57 4H8.43a2 2 0 0 0-1.79 1.11z"/>',
    send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>'
  };

  function icon(name, extraClass) {
    const cls = extraClass ? ` class="${extraClass}"` : '';
    return `<svg${cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.file}</svg>`;
  }

  /* ---------------- DOM ---------------- */
  const $ = (id) => document.getElementById(id);
  const el = {
    serverLine: $('serverLine'),
    lanSelect: $('lanSelect'),
    copyLanBtn: $('copyLanBtn'),
    onlineCount: $('onlineCount'),
    userChip: $('userChip'),
    userAvatar: $('userAvatar'),
    userNameLabel: $('userNameLabel'),
    sendUserBtn: $('sendUserBtn'),
    inboxBtn: $('inboxBtn'),
    inboxBadge: $('inboxBadge'),
    uploadBtn: $('uploadBtn'),
    uploadFolderBtn: $('uploadFolderBtn'),
    refreshBtn: $('refreshBtn'),
    fileInput: $('fileInput'),
    folderInput: $('folderInput'),
    sendFileInput: $('sendFileInput'),
    breadcrumb: $('breadcrumb'),
    filterInput: $('filterInput'),
    newFolderBtn: $('newFolderBtn'),
    zipBtn: $('zipBtn'),
    summary: $('summary'),
    fileCard: $('fileCard'),
    fileList: $('fileList'),
    emptyState: $('emptyState'),
    emptyText: $('emptyText'),
    loadingMask: $('loadingMask'),
    footer: $('footer'),
    dropOverlay: $('dropOverlay'),
    dropPath: $('dropPath'),

    uploadPanel: $('uploadPanel'),
    uploadTitle: $('uploadTitle'),
    uploadSummary: $('uploadSummary'),
    uploadList: $('uploadList'),
    closeUploadBtn: $('closeUploadBtn'),
    toasts: $('toasts'),
    modalOverlay: $('modalOverlay'),
    modalCard: $('modalCard'),
    modalTitle: $('modalTitle'),
    modalBody: $('modalBody'),
    modalOk: $('modalOk'),
    modalCancel: $('modalCancel'),
    previewOverlay: $('previewOverlay'),
    previewTitle: $('previewTitle'),
    previewDownload: $('previewDownload'),
    previewCloseBtn: $('previewCloseBtn'),
    previewBody: $('previewBody')
  };

  /* ---------------- 常量 ---------------- */
  const EXT_KINDS = {
    image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'ico', 'svg', 'tif', 'tiff', 'heic', 'heif'],
    video: ['mp4', 'm4v', 'webm', 'mkv', 'mov', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', '3gp', 'ts'],
    audio: ['mp3', 'wav', 'flac', 'ogg', 'oga', 'm4a', 'aac', 'wma', 'opus', 'mid', 'midi'],
    archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'iso', 'cab'],
    pdf: ['pdf'],
    office: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf'],
    code: ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'vue', 'svelte', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'json', 'jsonc', 'xml', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'cs', 'csproj', 'sln', 'c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hh', 'java', 'kt', 'kts', 'py', 'rb', 'go', 'rs', 'php', 'swift', 'm', 'mm', 'sql', 'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'psd1', 'gradle', 'properties', 'tex', 'lua', 'pl', 'dart', 'fs', 'fsx', 'r'],
    text: ['txt', 'md', 'markdown', 'log', 'csv', 'tsv', 'srt', 'ass', 'vtt', 'env', 'gitignore', 'editorconfig']
  };

  const IMAGE_PREVIEW = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'ico']);
  const VIDEO_PREVIEW = new Set(['mp4', 'm4v', 'webm', 'ogv']);
  const AUDIO_PREVIEW = new Set(['mp3', 'wav', 'flac', 'ogg', 'oga', 'm4a', 'aac', 'opus']);
  const TEXT_PREVIEW = new Set([
    'txt', 'md', 'markdown', 'log', 'csv', 'tsv', 'json', 'jsonc', 'xml', 'yml', 'yaml',
    'toml', 'ini', 'cfg', 'conf', 'env', 'html', 'htm', 'css', 'scss', 'sass', 'less',
    'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'vue', 'svelte', 'cs', 'csproj', 'sln',
    'c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hh', 'java', 'kt', 'kts', 'py', 'rb', 'go',
    'rs', 'php', 'swift', 'm', 'mm', 'sql', 'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1',
    'psd1', 'gradle', 'properties', 'tex', 'lua', 'pl', 'dart', 'fs', 'fsx', 'r',
    'svg', 'srt', 'ass', 'vtt', 'gitignore', 'editorconfig'
  ]);
  const TEXT_NAMES = new Set(['readme', 'license', 'licence', 'makefile', 'dockerfile', 'changelog', 'authors', 'notice', 'todo']);

  /* ---------------- 状态 ---------------- */
  const state = {
    path: '',
    entries: [],
    info: null,
    filter: '',
    loading: false
  };

  const upload = {
    items: [],
    running: false,
    startedAt: 0,
    hideTimer: 0,
    seq: 0,
    activeLabel: '上传队列'
  };

  const identity = {
    clientId: '',
    name: '',
    users: [],
    seen: new Set(),
    inbox: null,
    inboxInitialized: false,
    presenceTimer: 0,
    inboxTimer: 0
  };

  const delivery = {
    recipient: null
  };

  let bodyLocks = 0;
  let dragDepth = 0;

  /* ---------------- 通用工具 ---------------- */
  function normalizePath(value) {
    return String(value || '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
  }

  function joinPath(base, relative) {
    const cleanBase = normalizePath(base);
    const cleanRelative = String(relative || '').replace(/\\/g, '/').replace(/^\/+/, '');
    return cleanBase ? `${cleanBase}/${cleanRelative}` : cleanRelative;
  }

  function parentOf(path) {
    const clean = normalizePath(path);
    const index = clean.lastIndexOf('/');
    return index <= 0 ? '' : clean.slice(0, index);
  }

  function baseName(path) {
    const clean = normalizePath(path);
    const index = clean.lastIndexOf('/');
    return index < 0 ? clean : clean.slice(index + 1);
  }

  function formatSize(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
    let size = value / 1024;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit++;
    }
    return `${size >= 100 ? Math.round(size) : size.toFixed(size >= 10 ? 1 : 2)} ${units[unit]}`;
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function lockBody(lock) {
    bodyLocks = Math.max(0, bodyLocks + (lock ? 1 : -1));
    document.body.style.overflow = bodyLocks > 0 ? 'hidden' : '';
  }

  function toast(message, type = 'info', timeout = 4200) {
    const box = document.createElement('div');
    box.className = `toast ${type}`;
    const iconName = type === 'success' ? 'check' : type === 'error' ? 'alert' : type === 'warn' ? 'alert' : 'info';
    box.innerHTML = icon(iconName);
    const text = document.createElement('span');
    text.textContent = message;
    box.appendChild(text);
    box.title = '点击关闭';
    el.toasts.appendChild(box);

    const remove = () => {
      box.style.opacity = '0';
      box.style.transform = 'translateY(-4px)';
      window.setTimeout(() => box.remove(), 180);
    };
    box.addEventListener('click', remove);
    window.setTimeout(remove, timeout);
  }

  async function copyText(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // 继续尝试兼容方案。
    }
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }

  async function api(url, options = {}) {
    const headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    const response = await fetch(url, Object.assign({}, options, { headers }));
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text.slice(0, 300) };
      }
    }
    if (!response.ok) {
      const message = (data && (data.error || data.message)) || `请求失败（HTTP ${response.status}）`;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function postJson(url, payload) {
    return api(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  function contentUrl(path, inline = false) {
    let url = `/api/files/content?path=${encodeURIComponent(path)}`;
    if (inline) url += '&inline=1';
    return url;
  }

  function archiveUrl(path) {
    return `/api/archive?path=${encodeURIComponent(path)}`;
  }

  function downloadPath(path, name) {
    const anchor = document.createElement('a');
    anchor.href = contentUrl(path);
    if (name) anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  /* ---------------- 类型判断 ---------------- */
  function kindFor(entry) {
    if (!entry) return 'file';
    if (entry.isDirectory) return 'folder';
    const ext = String(entry.extension || '').toLowerCase();
    for (const [kind, list] of Object.entries(EXT_KINDS)) {
      if (list.includes(ext)) return kind;
    }
    return 'file';
  }

  function previewKind(entry) {
    if (!entry || entry.isDirectory) return null;
    const ext = String(entry.extension || '').toLowerCase();
    if (IMAGE_PREVIEW.has(ext)) return 'image';
    if (VIDEO_PREVIEW.has(ext)) return 'video';
    if (AUDIO_PREVIEW.has(ext)) return 'audio';
    if (ext === 'pdf') return 'pdf';
    if (TEXT_PREVIEW.has(ext)) return 'text';

    const name = String(entry.name || '').toLowerCase();
    const bare = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
    if (TEXT_NAMES.has(bare) || TEXT_NAMES.has(name)) return 'text';
    return null;
  }

  /* ---------------- 信息与地址 ---------------- */
  async function loadInfo() {
    const info = await api('/api/info');
    state.info = info;
    el.serverLine.textContent = `${info.machine} · FileTrans v${info.version} · 端口 ${info.port}`;
    renderLanOptions();
    renderFooter();
  }

  async function refreshInfo() {
    try {
      const info = await api('/api/info');
      state.info = info;
      renderFooter();
    } catch {
      // 静默失败，避免打断主流程。
    }
  }

  function renderLanOptions() {
    const info = state.info;
    if (!info) return;

    const options = [];
    const origin = window.location.origin.replace(/\/$/, '');
    const isLoopback = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/i.test(origin);

    if (!isLoopback) options.push({ url: `${origin}/`, label: `当前地址 · ${origin}` });
    for (const url of info.urls.lan || []) {
      if (!options.some((item) => item.url === url)) options.push({ url, label: url });
    }
    if (!options.some((item) => item.url === info.urls.local)) {
      options.push({ url: info.urls.local, label: `本机 · ${info.urls.local}` });
    }

    const previous = el.lanSelect.value;
    el.lanSelect.textContent = '';
    for (const option of options) {
      const node = document.createElement('option');
      node.value = option.url;
      node.textContent = option.label;
      el.lanSelect.appendChild(node);
    }

    const preferred = options.find((item) => item.url === previous) ||
      (!isLoopback ? options.find((item) => item.url === `${origin}/`) : null) ||
      options.find((item) => item.url !== info.urls.local) ||
      options[0];
    if (preferred) el.lanSelect.value = preferred.url;
  }

  async function copyLanAddress() {
    const value = el.lanSelect.value;
    if (!value) return;
    const ok = await copyText(value);
    toast(ok ? `已复制：${value}` : `复制失败，请手动复制：${value}`, ok ? 'success' : 'warn');
  }

  function renderFooter() {
    const info = state.info;
    if (!info) return;
    const parts = [
      `FileTrans v${info.version}`,
      `端口 ${info.port}`,
      `共享目录 ${info.storage.root}`,
      `${info.storage.fileCount} 个文件 · ${formatSize(info.storage.totalBytes)}`,
      `磁盘剩余 ${formatSize(info.storage.freeBytes)}`
    ];

    el.footer.textContent = '';
    parts.forEach((part, index) => {
      if (index > 0) {
        const sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = '·';
        el.footer.appendChild(sep);
      }
      const span = document.createElement('span');
      span.textContent = part;
      el.footer.appendChild(span);
    });
  }

  /* ---------------- 在线用户与点对点投递 ---------------- */
  function randomClientId() {
    const bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }

  function defaultUserName(clientId) {
    const suffix = clientId ? clientId.slice(0, 4).toUpperCase() : '0000';
    return `访客-${suffix}`;
  }

  function loadIdentity() {
    let clientId = '';
    let name = '';
    try {
      clientId = localStorage.getItem('filetrans.clientId') || '';
      name = localStorage.getItem('filetrans.name') || '';
      const seen = JSON.parse(localStorage.getItem('filetrans.seen') || '[]');
      if (Array.isArray(seen)) identity.seen = new Set(seen.filter((item) => typeof item === 'string'));
    } catch {
      // 隐私模式下 localStorage 可能不可用。
    }

    if (!clientId) {
      clientId = randomClientId();
      try { localStorage.setItem('filetrans.clientId', clientId); } catch { /* 忽略 */ }
    }

    identity.clientId = clientId;
    identity.name = name || defaultUserName(clientId);
    renderIdentity();
  }

  function renderIdentity() {
    el.userNameLabel.textContent = identity.name;
    el.userAvatar.textContent = Array.from(identity.name)[0] || '访';
    el.userChip.title = `我的昵称：${identity.name}（点击修改）`;
  }

  async function touchPresence() {
    try {
      const snapshot = await postJson('/api/presence', {
        clientId: identity.clientId,
        name: identity.name
      });
      identity.users = Array.isArray(snapshot.users) ? snapshot.users : [];
      const serverName = snapshot.self && snapshot.self.name;
      if (serverName && serverName !== identity.name) {
        identity.name = serverName;
        try { localStorage.setItem('filetrans.name', serverName); } catch { /* 忽略 */ }
        renderIdentity();
      }
      renderPresence();
      return snapshot;
    } catch {
      return null;
    }
  }

  function renderPresence() {
    const online = identity.users.filter((user) => user.online);
    el.onlineCount.textContent = `在线 ${Math.max(1, online.length)}`;
    el.onlineCount.title = online
      .map((user) => `${user.name}${user.isSelf ? '（我）' : ''} · ${user.ip || '未知地址'}`)
      .join('\n');
  }

  function startPresence() {
    void touchPresence();
    identity.presenceTimer = window.setInterval(() => void touchPresence(), 12000);
    identity.inboxTimer = window.setInterval(() => void refreshInbox({ notify: true }), 9000);
  }

  async function renameIdentity() {
    const value = await openModal({
      title: '修改我的昵称',
      body: '昵称会显示给同一局域网内的其他用户，方便对方把文件发送给你。',
      input: { value: identity.name, placeholder: '例如：小明的电脑' },
      okText: '保存'
    });
    if (value === null || value === undefined) return;

    const name = String(value).trim().slice(0, 24);
    if (!name) {
      toast('昵称不能为空', 'warn');
      return;
    }

    identity.name = name;
    try { localStorage.setItem('filetrans.name', name); } catch { /* 忽略 */ }
    renderIdentity();
    await touchPresence();
    toast('昵称已更新', 'success');
  }

  function setInboxBadge(count) {
    if (count > 0) {
      el.inboxBadge.hidden = false;
      el.inboxBadge.textContent = count > 99 ? '99+' : String(count);
      el.inboxBtn.title = `${count} 批未查看的文件`;
    } else {
      el.inboxBadge.hidden = true;
      el.inboxBtn.title = '收到的文件';
    }
  }

  function saveSeen() {
    try {
      localStorage.setItem('filetrans.seen', JSON.stringify(Array.from(identity.seen).slice(-200)));
    } catch {
      // 忽略存储失败。
    }
  }

  async function refreshInbox({ notify = false } = {}) {
    try {
      const data = await api(`/api/inbox?clientId=${encodeURIComponent(identity.clientId)}`);
      identity.inbox = data;
      const deliveries = data.deliveries || [];
      const unseen = deliveries.filter((item) => !identity.seen.has(item.path));
      setInboxBadge(unseen.length);

      if (notify && identity.inboxInitialized && unseen.length) {
        const latest = unseen[0];
        toast(`收到来自「${latest.sender}」的文件`, 'info', 5500);
      }

      identity.inboxInitialized = true;
      return data;
    } catch {
      return null;
    }
  }

  function buildDeliveryCard(item) {
    const card = document.createElement('div');
    card.className = 'delivery-card';
    card.dataset.path = item.path;

    const head = document.createElement('div');
    head.className = 'delivery-head';
    const info = document.createElement('div');
    info.className = 'delivery-info';
    const title = document.createElement('strong');
    title.textContent = `来自 ${item.sender}`;
    const meta = document.createElement('span');
    meta.textContent = `${formatTime(item.deliveredAt)} · ${(item.files || []).length} 个文件 · ${formatSize(item.totalBytes)}`;
    info.append(title, meta);

    const tools = document.createElement('div');
    tools.className = 'delivery-tools';
    const zip = document.createElement('a');
    zip.className = 'btn small';
    zip.href = archiveUrl(item.path);
    zip.textContent = '打包下载';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button danger';
    remove.title = '删除这批文件';
    remove.dataset.action = 'delete-delivery';
    remove.dataset.path = item.path;
    remove.innerHTML = icon('trash');
    tools.append(zip, remove);
    head.append(info, tools);

    const files = document.createElement('div');
    files.className = 'delivery-files';
    for (const file of item.files || []) {
      const row = document.createElement('div');
      row.className = 'delivery-file';
      const name = document.createElement('span');
      name.className = 'delivery-file-name';
      name.textContent = file.name;
      name.title = file.relativePath;
      const size = document.createElement('span');
      size.className = 'delivery-file-size';
      size.textContent = formatSize(file.size);
      const download = document.createElement('a');
      download.className = 'icon-button';
      download.href = contentUrl(file.relativePath);
      download.download = file.name;
      download.title = '下载';
      download.innerHTML = icon('download');
      row.append(name, size, download);
      files.appendChild(row);
    }

    card.append(head, files);
    return card;
  }

  async function openInbox() {
    const data = await refreshInbox({ notify: false });
    if (!data) {
      toast('读取收件箱失败，请稍后重试', 'error');
      return;
    }

    const deliveries = data.deliveries || [];
    deliveries.forEach((item) => identity.seen.add(item.path));
    saveSeen();
    setInboxBadge(0);

    const body = document.createElement('div');
    if (!deliveries.length) {
      const empty = document.createElement('div');
      empty.className = 'inbox-empty';
      empty.innerHTML = icon('inbox');
      const title = document.createElement('p');
      title.textContent = '还没有收到文件';
      const hint = document.createElement('span');
      hint.textContent = '让对方打开本页面，点击顶部「发送给用户」，选择你的昵称后即可把文件发送给你。';
      empty.append(title, hint);
      body.appendChild(empty);
    } else {
      for (const item of deliveries) body.appendChild(buildDeliveryCard(item));
    }

    await openModal({ title: '收到的文件', body, okText: '关闭', showCancel: false, wide: true });
  }

  async function handleInboxAction(event) {
    const button = event.target.closest('[data-action="delete-delivery"]');
    if (!button) return;

    const path = button.dataset.path;
    if (button.dataset.armed !== '1') {
      button.dataset.armed = '1';
      button.classList.add('armed');
      button.title = '再次点击确认删除';
      window.setTimeout(() => {
        delete button.dataset.armed;
        button.classList.remove('armed');
        button.title = '删除这批文件';
      }, 3000);
      return;
    }

    try {
      await api(`/api/files/content?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
      const card = button.closest('.delivery-card');
      if (card) card.remove();
      identity.seen.delete(path);
      saveSeen();
      toast('已删除这批文件', 'success');
      await refreshInbox({ notify: false });
    } catch (error) {
      toast(`删除失败：${error.message}`, 'error');
    }
  }

  async function openSendDialog() {
    const snapshot = await touchPresence();
    if (!snapshot) {
      toast('无法获取在线用户列表，请稍后重试', 'error');
      return;
    }

    const others = identity.users.filter((user) => user.online && user.clientId !== identity.clientId);

    if (!others.length) {
      const body = document.createElement('div');
      const paragraph = document.createElement('p');
      paragraph.textContent = '当前没有其他在线用户。请让另一位用户在同一局域网中打开下面的地址，并保持页面打开：';
      const code = document.createElement('div');
      code.className = 'recipient-empty';
      code.style.wordBreak = 'break-all';
      code.textContent = el.lanSelect.value || `${window.location.origin}/`;
      body.append(paragraph, code);

      const ok = await openModal({
        title: '发送文件给用户',
        body,
        okText: '复制地址并关闭',
        showCancel: false
      });
      if (ok) await copyLanAddress();
      return;
    }

    let selected = others[0].clientId;
    const body = document.createElement('div');
    const hint = document.createElement('p');
    hint.className = 'recipient-empty';
    hint.textContent = '选择接收方（对方需要保持本页面打开）：';
    body.appendChild(hint);

    const list = document.createElement('div');
    list.className = 'recipient-list';
    for (const user of others) {
      const item = document.createElement('label');
      item.className = 'recipient-item';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'recipient';
      radio.value = user.clientId;
      radio.checked = user.clientId === selected;
      radio.addEventListener('change', () => {
        if (radio.checked) selected = user.clientId;
      });

      const avatar = document.createElement('span');
      avatar.className = 'recipient-avatar';
      avatar.textContent = Array.from(user.name || '用')[0];
      const info = document.createElement('span');
      info.className = 'recipient-info';
      const name = document.createElement('span');
      name.className = 'recipient-name';
      name.textContent = user.name;
      const ip = document.createElement('span');
      ip.className = 'recipient-ip';
      ip.textContent = user.ip === '127.0.0.1' || user.ip === '::1' ? '本机' : (user.ip || '未知地址');
      info.append(name, ip);

      item.append(radio, avatar, info);
      list.appendChild(item);
    }
    body.appendChild(list);

    const ok = await openModal({
      title: '发送文件给用户',
      body,
      okText: '选择文件并发送',
      validate: () => Boolean(selected)
    });
    if (!ok) return;

    const recipient = others.find((user) => user.clientId === selected);
    if (!recipient) return;

    delivery.recipient = recipient;
    el.sendFileInput.value = '';
    el.sendFileInput.click();
  }

  async function handleSendFiles() {
    const files = Array.from(el.sendFileInput.files || []);
    el.sendFileInput.value = '';
    const recipient = delivery.recipient;
    delivery.recipient = null;
    if (!recipient || !files.length) return;

    try {
      const prepared = await postJson('/api/deliver/prepare', {
        senderClientId: identity.clientId,
        recipientClientId: recipient.clientId
      });
      const items = files.map((file) => ({
        file,
        targetPath: `${prepared.deliveryPath}/${file.name}`
      }));
      enqueueFiles(items, {
        label: `发送给 ${recipient.name}`,
        refresh: false,
        successToast: `已发送 ${files.length} 个文件给 ${recipient.name}`
      });
    } catch (error) {
      toast(`发送失败：${error.message}`, 'error', 6000);
    }
  }

  /* ---------------- 目录浏览 ---------------- */
  function hashPath() {
    try {
      return normalizePath(decodeURIComponent(window.location.hash.replace(/^#\/?/, '')));
    } catch {
      return '';
    }
  }

  function setHash(path) {
    const encoded = normalizePath(path)
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
    const target = encoded ? `#/${encoded}` : '#/';
    if (window.location.hash !== target) {
      window.history.pushState({ path: normalizePath(path) }, '', target);
    }
  }

  function showLoading(show) {
    state.loading = show;
    el.loadingMask.hidden = !show;
    if (show) {
      el.emptyState.hidden = true;
    }
  }

  async function loadDirectory({ silent = false } = {}) {
    if (!silent) showLoading(true);
    try {
      const data = await api(`/api/files?path=${encodeURIComponent(state.path)}`);
      state.entries = data.entries || [];
      state.path = normalizePath(data.path);
      el.dropPath.textContent = state.path ? `/${state.path}` : '共享目录（根目录）';
      renderBreadcrumb();
      renderFiles();
    } catch (error) {
      if (error.status === 404) {
        state.path = '';
        toast('目标文件夹不存在，已返回根目录', 'warn');
        setHash('');
        await loadDirectory({ silent });
        return;
      }
      toast(`读取文件夹失败：${error.message}`, 'error');
    } finally {
      if (!silent) showLoading(false);
    }
  }

  async function navigate(path, { pushHistory = true } = {}) {
    state.path = normalizePath(path);
    state.filter = '';
    el.filterInput.value = '';
    if (pushHistory) setHash(state.path);
    await loadDirectory();
  }

  function renderBreadcrumb() {
    el.breadcrumb.textContent = '';
    const rootButton = document.createElement('button');
    rootButton.type = 'button';
    rootButton.className = 'crumb';
    rootButton.dataset.path = '';
    rootButton.innerHTML = icon('home');
    const rootText = document.createElement('span');
    rootText.textContent = '共享目录';
    rootButton.appendChild(rootText);
    if (!state.path) rootButton.classList.add('current');
    el.breadcrumb.appendChild(rootButton);

    const segments = state.path ? state.path.split('/') : [];
    let accumulated = '';
    segments.forEach((segment, index) => {
      accumulated = accumulated ? `${accumulated}/${segment}` : segment;
      const separator = document.createElement('span');
      separator.className = 'crumb-sep';
      separator.innerHTML = icon('chevronRight');
      el.breadcrumb.appendChild(separator);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'crumb';
      button.dataset.path = accumulated;
      button.textContent = segment;
      if (index === segments.length - 1) button.classList.add('current');
      el.breadcrumb.appendChild(button);
    });
  }

  function createActionButton(action, iconName, title, danger = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `icon-button${danger ? ' danger' : ''}`;
    button.dataset.action = action;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = icon(iconName);
    return button;
  }

  function createLinkButton(href, iconName, title, downloadName) {
    const anchor = document.createElement('a');
    anchor.className = 'icon-button';
    anchor.href = href;
    anchor.title = title;
    anchor.setAttribute('aria-label', title);
    anchor.dataset.action = 'download';
    if (downloadName) anchor.download = downloadName;
    anchor.innerHTML = icon(iconName);
    return anchor;
  }

  function createRow(entry) {
    const kind = kindFor(entry);
    const row = document.createElement('div');
    row.className = `file-row${entry.isDirectory ? ' dir' : ''}`;
    row.dataset.path = entry.relativePath;
    row.dataset.name = entry.name;
    row.dataset.kind = entry.isDirectory ? 'dir' : 'file';
    row.setAttribute('role', 'listitem');

    const nameButton = document.createElement('button');
    nameButton.type = 'button';
    nameButton.className = 'file-name';
    nameButton.dataset.action = 'open';
    nameButton.title = entry.isDirectory ? `打开 ${entry.name}` : entry.name;

    const iconBox = document.createElement('span');
    iconBox.className = 'file-icon';
    iconBox.dataset.kind = kind;
    iconBox.innerHTML = icon(kind === 'pdf' ? 'pdf' : kind);
    const nameText = document.createElement('span');
    nameText.className = 'name-text';
    nameText.textContent = entry.name;
    nameButton.append(iconBox, nameText);

    const size = document.createElement('span');
    size.className = 'file-size';
    if (entry.isDirectory) {
      size.textContent = entry.childCount == null ? '—' : `${entry.childCount} 项`;
    } else {
      size.textContent = formatSize(entry.size);
    }

    const time = document.createElement('span');
    time.className = 'file-time';
    time.textContent = formatTime(entry.modified);

    const actions = document.createElement('span');
    actions.className = 'file-actions';
    if (entry.isDirectory) {
      actions.appendChild(createLinkButton(archiveUrl(entry.relativePath), 'zip', '打包下载此文件夹'));
    } else {
      actions.appendChild(createLinkButton(contentUrl(entry.relativePath), 'download', '下载', entry.name));
      if (previewKind(entry)) actions.appendChild(createActionButton('preview', 'eye', '预览'));
    }
    actions.appendChild(createActionButton('rename', 'edit', '重命名'));
    actions.appendChild(createActionButton('delete', 'trash', '删除', true));

    row.append(nameButton, size, time, actions);
    return row;
  }

  function renderFiles() {
    const keyword = state.filter.trim().toLowerCase();
    const visible = keyword
      ? state.entries.filter((entry) => entry.name.toLowerCase().includes(keyword))
      : state.entries;

    el.fileList.textContent = '';
    const fragment = document.createDocumentFragment();
    for (const entry of visible) fragment.appendChild(createRow(entry));
    el.fileList.appendChild(fragment);

    const isEmpty = visible.length === 0;
    el.emptyState.hidden = !isEmpty;
    if (isEmpty) {
      el.emptyText.textContent = keyword
        ? '没有匹配的项目'
        : state.path
          ? '这个文件夹是空的'
          : '共享目录里还没有文件';
    }

    renderSummary(visible);
  }

  function renderSummary(visible) {
    const directories = state.entries.filter((entry) => entry.isDirectory).length;
    const files = state.entries.filter((entry) => !entry.isDirectory);
    const totalBytes = files.reduce((sum, entry) => sum + (entry.size || 0), 0);

    el.summary.textContent = '';
    const add = (text) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = text;
      el.summary.appendChild(chip);
    };

    add(`共 ${state.entries.length} 项`);
    if (directories > 0) add(`文件夹 ${directories}`);
    if (files.length > 0) add(`文件 ${files.length} · ${formatSize(totalBytes)}`);
    if (state.filter.trim()) add(`筛选结果 ${visible.length}`);
    if (!state.entries.length) add('把文件拖进页面即可上传');
  }

  /* ---------------- 文件操作 ---------------- */
  async function deleteEntry(path, name, isDirectory) {
    const ok = await confirmDialog(
      `删除${isDirectory ? '文件夹' : '文件'}`,
      `确定要删除「${name}」${isDirectory ? '及其中的全部内容' : ''}吗？此操作不可撤销。`,
      { okText: '删除', danger: true }
    );
    if (!ok) return;

    try {
      await api(`/api/files/content?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
      toast(`已删除：${name}`, 'success');
      await loadDirectory({ silent: true });
      await refreshInfo();
    } catch (error) {
      toast(`删除失败：${error.message}`, 'error');
    }
  }

  async function renameEntry(path, name) {
    const value = await openModal({
      title: '重命名',
      body: '',
      input: { value: name, placeholder: '输入新的名称' },
      okText: '保存'
    });
    if (value === null || value === undefined) return;

    const newName = String(value).trim();
    if (!newName || newName === name) return;
    if (/[\\/]/.test(newName)) {
      toast('名称中不能包含斜杠', 'warn');
      return;
    }

    const target = joinPath(parentOf(path), newName);
    try {
      await api(`/api/files/rename?from=${encodeURIComponent(path)}&to=${encodeURIComponent(target)}`, { method: 'POST' });
      toast(`已重命名为：${newName}`, 'success');
      await loadDirectory({ silent: true });
      await refreshInfo();
    } catch (error) {
      toast(`重命名失败：${error.message}`, 'error');
    }
  }

  async function createFolder() {
    const value = await openModal({
      title: '新建文件夹',
      body: '',
      input: { value: '', placeholder: '文件夹名称' },
      okText: '创建'
    });
    if (value === null || value === undefined) return;

    const name = String(value).trim();
    if (!name) return;
    if (/[\\/]/.test(name)) {
      toast('名称中不能包含斜杠', 'warn');
      return;
    }

    const target = joinPath(state.path, name);
    try {
      await api(`/api/files/directory?path=${encodeURIComponent(target)}`, { method: 'POST' });
      toast(`已创建文件夹：${name}`, 'success');
      await loadDirectory({ silent: true });
      await refreshInfo();
    } catch (error) {
      toast(`创建失败：${error.message}`, 'error');
    }
  }

  function downloadArchive() {
    const anchor = document.createElement('a');
    anchor.href = archiveUrl(state.path);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    toast('正在打包当前文件夹，请稍候…', 'info', 2600);
  }

  function openEntry(path, name, isDirectory) {
    if (isDirectory) {
      navigate(path);
      return;
    }
    const entry = state.entries.find((item) => item.relativePath === path);
    if (entry && previewKind(entry)) {
      openPreview(entry);
      return;
    }
    downloadPath(path, name);
  }

  /* ---------------- 预览 ---------------- */
  function closePreview() {
    if (el.previewOverlay.hidden) return;
    el.previewOverlay.hidden = true;
    el.previewBody.textContent = '';
    el.previewDownload.removeAttribute('href');
    lockBody(false);
  }

  function instantiatePreview(kind, entry) {
    el.previewBody.textContent = '';
    const inline = contentUrl(entry.relativePath, true);

    if (kind === 'image') {
      const image = document.createElement('img');
      image.alt = entry.name;
      image.src = inline;
      image.addEventListener('error', () => {
        showPreviewFallback('无法在浏览器中显示这张图片，请下载后查看。', entry);
      });
      el.previewBody.appendChild(image);
      return;
    }

    if (kind === 'video') {
      const video = document.createElement('video');
      video.controls = true;
      video.autoplay = true;
      video.src = inline;
      video.addEventListener('error', () => {
        showPreviewFallback('当前浏览器无法播放此视频格式，请下载后播放。', entry);
      });
      el.previewBody.appendChild(video);
      return;
    }

    if (kind === 'audio') {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.autoplay = true;
      audio.src = inline;
      audio.addEventListener('error', () => {
        showPreviewFallback('当前浏览器无法播放此音频格式，请下载后播放。', entry);
      });
      el.previewBody.appendChild(audio);
      return;
    }

    if (kind === 'pdf') {
      const frame = document.createElement('iframe');
      frame.title = entry.name;
      frame.src = inline;
      el.previewBody.appendChild(frame);
      return;
    }

    if (kind === 'text') {
      const pre = document.createElement('pre');
      pre.textContent = '正在加载…';
      el.previewBody.appendChild(pre);
      fetch(`/api/files/text?path=${encodeURIComponent(entry.relativePath)}`)
        .then(async (response) => {
          const text = await response.text();
          if (!response.ok) {
            let message = '无法预览此文件';
            try {
              message = JSON.parse(text).error || message;
            } catch {
              // 保持默认提示。
            }
            throw new Error(message);
          }
          pre.textContent = text || '（空文件）';
        })
        .catch((error) => {
          pre.textContent = `无法预览：${error.message}`;
        });
      return;
    }

    showPreviewFallback('此类型文件暂不支持在线预览，请下载后查看。', entry);
  }

  function showPreviewFallback(message, entry) {
    el.previewBody.textContent = '';
    const box = document.createElement('div');
    box.className = 'preview-empty';
    box.textContent = message;
    el.previewBody.appendChild(box);
    if (entry) el.previewDownload.href = contentUrl(entry.relativePath);
  }

  function openPreview(entry) {
    const kind = previewKind(entry);
    if (!kind) return;
    el.previewTitle.textContent = entry.name;
    el.previewDownload.href = contentUrl(entry.relativePath);
    el.previewDownload.setAttribute('download', entry.name);
    el.previewOverlay.hidden = false;
    lockBody(true);
    instantiatePreview(kind, entry);
  }

  /* ---------------- 对话框 ---------------- */
  const modal = { resolve: null, close: null };

  function openModal(config = {}) {
    const {
      title = '提示',
      body = '',
      okText = '确定',
      cancelText = '取消',
      danger = false,
      showCancel = true,
      input = null,
      wide = false,
      validate = null
    } = config;

    if (modal.close) modal.close(false);

    return new Promise((resolve) => {
      modal.resolve = resolve;
      el.modalTitle.textContent = title;
      el.modalBody.textContent = '';
      el.modalCard.classList.toggle('wide', Boolean(wide));

      if (typeof body === 'string') {
        if (body) {
          const paragraph = document.createElement('p');
          paragraph.textContent = body;
          el.modalBody.appendChild(paragraph);
        }
      } else if (body) {
        el.modalBody.appendChild(body);
      }

      let inputEl = null;
      if (input) {
        inputEl = document.createElement('input');
        inputEl.className = 'modal-input';
        inputEl.type = 'text';
        inputEl.value = input.value ?? '';
        inputEl.placeholder = input.placeholder ?? '';
        inputEl.autocomplete = 'off';
        inputEl.spellcheck = false;
        el.modalBody.appendChild(inputEl);
      }

      el.modalOk.textContent = okText;
      el.modalOk.className = `btn ${danger ? 'danger' : 'primary'}`;
      el.modalCancel.textContent = cancelText;
      el.modalCancel.hidden = !showCancel;
      el.modalOverlay.hidden = false;
      lockBody(true);

      window.setTimeout(() => {
        if (inputEl) {
          inputEl.focus();
          inputEl.select();
        } else {
          el.modalOk.focus();
        }
      }, 30);

      function finish(ok) {
        if (!modal.resolve) return;
        if (ok && typeof validate === 'function') {
          const valid = validate(inputEl ? inputEl.value : null);
          if (valid === false) return;
        }

        const currentResolve = modal.resolve;
        modal.resolve = null;
        modal.close = null;

        el.modalOverlay.hidden = true;
        el.modalOk.onclick = null;
        el.modalCancel.onclick = null;
        el.modalOverlay.onclick = null;
        document.removeEventListener('keydown', onKey);
        lockBody(false);

        if (ok) {
          currentResolve(inputEl ? inputEl.value : true);
        } else {
          currentResolve(null);
        }
      }

      function onKey(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        } else if (event.key === 'Enter') {
          if (document.activeElement === el.modalCancel) return;
          event.preventDefault();
          finish(true);
        }
      }

      modal.close = finish;
      el.modalOk.onclick = () => finish(true);
      el.modalCancel.onclick = () => finish(false);
      el.modalOverlay.onclick = (event) => {
        if (event.target === el.modalOverlay) finish(false);
      };
      document.addEventListener('keydown', onKey);
    });
  }

  function confirmDialog(title, message, { okText = '确定', danger = false } = {}) {
    return openModal({ title, body: message, okText, danger, showCancel: true }).then((result) => result === true);
  }

  /* ---------------- 上传队列 ---------------- */
  function makeUploadItem(file, targetPath, options = {}) {
    return {
      id: ++upload.seq,
      file,
      name: file.name,
      targetPath,
      size: file.size || 0,
      loaded: 0,
      state: 'waiting',
      message: '',
      overwrite: false,
      preflight: false,
      batchToast: options.successToast || '',
      refreshAfter: options.refresh !== false,
      element: null
    };
  }

  function enqueueFiles(fileItems, options = {}) {
    if (!fileItems || !fileItems.length) return;

    if (!upload.running && upload.items.every((item) => item.state !== 'uploading' && item.state !== 'waiting')) {
      upload.startedAt = Date.now();
    }

    const label = options.label || '上传队列';
    upload.activeLabel = label;
    el.uploadTitle.textContent = label;

    for (const item of fileItems) {
      const targetPath = item.targetPath || joinPath(state.path, item.relativePath || item.file.name);
      upload.items.push(makeUploadItem(item.file, targetPath, options));
    }

    el.uploadPanel.hidden = false;
    if (upload.hideTimer) {
      window.clearTimeout(upload.hideTimer);
      upload.hideTimer = 0;
    }
    rebuildUploadList();
    updateUploadSummary();

    const ready = upload.items.filter((item) => item.state === 'waiting' || item.state === 'conflict');
    if (ready.length) void runQueue();
  }

  async function runQueue() {
    if (upload.running) return;
    upload.running = true;

    try {
      for (let round = 0; round < 6; round++) {
        const pending = upload.items.filter((item) => item.state === 'waiting' && !item.preflight);
        if (pending.length) await preflight(pending);

        const waiting = upload.items.filter((item) => item.state === 'waiting');
        if (!waiting.length) break;

        await runWorkers(waiting);

        const lateConflicts = upload.items.filter((item) => item.state === 'conflict');
        if (!lateConflicts.length) break;

        const overwrite = await askOverwrite(lateConflicts);
        for (const item of lateConflicts) {
          if (overwrite) {
            item.overwrite = true;
            item.state = 'waiting';
          } else {
            item.state = 'skipped';
            item.message = '已跳过';
          }
          updateUploadItem(item);
        }
      }
    } finally {
      upload.running = false;
      updateUploadSummary();
      const hasError = upload.items.some((item) => item.state === 'error' || item.state === 'conflict');
      await refreshAfterUpload();
      if (!hasError) {
        upload.hideTimer = window.setTimeout(() => {
          el.uploadPanel.hidden = true;
          upload.hideTimer = 0;
          upload.activeLabel = '上传队列';
          el.uploadTitle.textContent = '上传队列';
        }, 6000);
      }
    }
  }

  async function preflight(items) {
    items.forEach((item) => {
      item.preflight = true;
    });

    let result;
    try {
      result = await postJson('/api/files/conflicts', { paths: items.map((item) => item.targetPath) });
    } catch (error) {
      toast(`检查同名文件失败：${error.message}`, 'warn');
      return;
    }

    const invalid = new Set(result.invalid || []);
    for (const item of items) {
      if (invalid.has(item.targetPath)) {
        item.state = 'error';
        item.message = '路径无效';
        updateUploadItem(item);
      }
    }

    const conflicts = items.filter((item) => (result.conflicts || []).includes(item.targetPath) && item.state === 'waiting');
    if (!conflicts.length) return;

    const overwrite = await askOverwrite(conflicts);
    for (const item of conflicts) {
      if (overwrite) {
        item.overwrite = true;
      } else {
        item.state = 'skipped';
        item.message = '已跳过';
      }
      updateUploadItem(item);
    }
  }

  async function askOverwrite(items) {
    const body = document.createElement('div');
    const paragraph = document.createElement('p');
    paragraph.textContent = `目标位置已存在 ${items.length} 个同名文件：`;
    body.appendChild(paragraph);

    const list = document.createElement('div');
    list.className = 'muted';
    for (const item of items.slice(0, 6)) {
      const line = document.createElement('div');
      line.textContent = `• ${item.targetPath}`;
      list.appendChild(line);
    }
    if (items.length > 6) {
      const more = document.createElement('div');
      more.textContent = `…等共 ${items.length} 个`;
      list.appendChild(more);
    }
    body.appendChild(list);

    const result = await openModal({
      title: '存在同名文件',
      body,
      okText: '覆盖全部',
      cancelText: '跳过这些',
      danger: true
    });
    return result === true;
  }

  async function runWorkers(items) {
    const queue = items.slice();
    const concurrency = Math.min(2, queue.length);
    const workers = [];

    for (let index = 0; index < concurrency; index++) {
      workers.push((async () => {
        while (queue.length) {
          const item = queue.shift();
          if (!item || item.state !== 'waiting') continue;
          await uploadOne(item);
        }
      })());
    }

    await Promise.all(workers);
  }

  function uploadOne(item) {
    return new Promise((resolve) => {
      item.state = 'uploading';
      item.loaded = 0;
      item.message = '';
      updateUploadItem(item);
      updateUploadSummary();

      const xhr = new XMLHttpRequest();
      const url = `/api/files/content?path=${encodeURIComponent(item.targetPath)}${item.overwrite ? '&overwrite=1' : ''}`;
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          item.loaded = event.loaded;
          updateUploadItem(item);
          updateUploadSummary();
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          item.state = 'done';
          item.loaded = item.size;
        } else if (xhr.status === 409) {
          item.state = 'conflict';
          item.message = '同名文件已存在';
        } else {
          item.state = 'error';
          item.message = xhrErrorMessage(xhr) || `上传失败（HTTP ${xhr.status}）`;
        }
        updateUploadItem(item);
        updateUploadSummary();
        resolve();
      });

      xhr.addEventListener('error', () => {
        item.state = 'error';
        item.message = '网络错误，上传中断';
        updateUploadItem(item);
        updateUploadSummary();
        resolve();
      });

      xhr.addEventListener('abort', () => {
        item.state = 'error';
        item.message = '已取消';
        updateUploadItem(item);
        updateUploadSummary();
        resolve();
      });

      xhr.send(item.file);
    });
  }

  function xhrErrorMessage(xhr) {
    try {
      const data = JSON.parse(xhr.responseText);
      return data.error || data.message || '';
    } catch {
      return '';
    }
  }

  function ensureUploadElement(item) {
    if (item.element) return item.element;

    const element = document.createElement('div');
    element.className = 'upload-item';
    element.dataset.id = String(item.id);

    const name = document.createElement('div');
    name.className = 'upload-name';
    name.textContent = item.name;
    name.title = item.targetPath;

    const sub = document.createElement('span');
    sub.className = 'upload-sub';
    sub.textContent = `${formatSize(item.size)} · /${item.targetPath}`;
    name.appendChild(sub);

    const status = document.createElement('div');
    status.className = 'upload-status';
    status.textContent = '等待中';

    const progress = document.createElement('div');
    progress.className = 'progress';
    const bar = document.createElement('div');
    bar.className = 'bar';
    progress.appendChild(bar);

    element.append(name, status, progress);
    item.element = element;
    return element;
  }

  function updateUploadItem(item) {
    const element = ensureUploadElement(item);
    const status = element.querySelector('.upload-status');
    const bar = element.querySelector('.bar');
    const percent = item.size > 0 ? Math.min(100, Math.round((item.loaded / item.size) * 100)) : item.state === 'done' ? 100 : 0;

    element.classList.remove('done', 'error', 'skipped', 'conflict');
    if (item.state === 'done') {
      element.classList.add('done');
      status.textContent = '完成';
      bar.style.width = '100%';
    } else if (item.state === 'uploading') {
      status.textContent = `${percent}%`;
      bar.style.width = `${Math.max(2, percent)}%`;
    } else if (item.state === 'error') {
      element.classList.add('error');
      status.textContent = item.message || '失败';
      bar.style.width = `${percent}%`;
    } else if (item.state === 'skipped') {
      element.classList.add('skipped');
      status.textContent = item.message || '已跳过';
      bar.style.width = '0';
    } else if (item.state === 'conflict') {
      element.classList.add('conflict');
      status.textContent = item.message || '同名冲突';
      bar.style.width = '0';
    } else {
      status.textContent = '等待中';
      bar.style.width = '0';
    }
  }

  function rebuildUploadList() {
    el.uploadList.textContent = '';
    const fragment = document.createDocumentFragment();
    for (const item of upload.items) {
      fragment.appendChild(ensureUploadElement(item));
      updateUploadItem(item);
    }
    el.uploadList.appendChild(fragment);
    el.uploadList.scrollTop = el.uploadList.scrollHeight;
  }

  function updateUploadSummary() {
    const items = upload.items;
    if (!items.length) {
      el.uploadSummary.textContent = '';
      return;
    }

    const total = items.length;
    const done = items.filter((item) => item.state === 'done').length;
    const failed = items.filter((item) => item.state === 'error').length;
    const skipped = items.filter((item) => item.state === 'skipped').length;
    const totalBytes = items.reduce((sum, item) => sum + item.size, 0);
    const loadedBytes = items.reduce((sum, item) => sum + Math.min(item.loaded, item.size), 0);
    const percent = totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : done === total ? 100 : 0;

    if (upload.running) {
      const seconds = Math.max(1, (Date.now() - upload.startedAt) / 1000);
      const speed = loadedBytes / seconds;
      el.uploadSummary.textContent = `${done}/${total} · ${percent}% · ${formatSize(speed)}/s`;
    } else {
      let text = `${done}/${total} 已完成`;
      if (failed) text += ` · ${failed} 失败`;
      if (skipped) text += ` · ${skipped} 跳过`;
      el.uploadSummary.textContent = text;
    }
  }

  async function refreshAfterUpload() {
    const done = upload.items.filter((item) => item.state === 'done');
    if (!done.length) return;

    const messages = new Set(done.filter((item) => item.batchToast).map((item) => item.batchToast));
    for (const message of messages) toast(message, 'success');
    done.forEach((item) => {
      item.batchToast = '';
    });

    if (done.some((item) => item.refreshAfter !== false)) {
      await loadDirectory({ silent: true });
    }
    await refreshInfo();
  }

  /* ---------------- 拖拽 / 选择文件 ---------------- */
  async function collectDroppedItems(dataTransfer) {
    const result = [];
    const transferItems = dataTransfer.items ? Array.from(dataTransfer.items) : [];
    const entries = transferItems
      .filter((item) => item.kind === 'file' && typeof item.webkitGetAsEntry === 'function')
      .map((item) => item.webkitGetAsEntry())
      .filter(Boolean);

    if (entries.length) {
      for (const entry of entries) await walkEntry(entry, '', result);
    } else {
      for (const file of Array.from(dataTransfer.files || [])) {
        result.push({ file, relativePath: file.name });
      }
    }
    return result;
  }

  async function walkEntry(entry, prefix, output) {
    if (!entry) return;
    if (entry.isFile) {
      try {
        const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
        output.push({ file, relativePath: prefix + entry.name });
      } catch {
        // 忽略无法读取的条目。
      }
      return;
    }

    if (entry.isDirectory) {
      const reader = entry.createReader();
      while (true) {
        let batch;
        try {
          batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        } catch {
          break;
        }
        if (!batch.length) break;
        for (const child of batch) await walkEntry(child, `${prefix}${entry.name}/`, output);
      }
    }
  }

  function enqueueFromInput(input, useRelativePath) {
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length) return;
    enqueueFiles(files.map((file) => ({
      file,
      relativePath: useRelativePath && file.webkitRelativePath ? file.webkitRelativePath : file.name
    })));
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    el.uploadBtn.addEventListener('click', () => el.fileInput.click());
    el.uploadFolderBtn.addEventListener('click', () => el.folderInput.click());
    el.fileInput.addEventListener('change', () => enqueueFromInput(el.fileInput, false));
    el.folderInput.addEventListener('change', () => enqueueFromInput(el.folderInput, true));

    el.userChip.addEventListener('click', renameIdentity);
    el.sendUserBtn.addEventListener('click', openSendDialog);
    el.inboxBtn.addEventListener('click', openInbox);
    el.sendFileInput.addEventListener('change', handleSendFiles);
    el.modalBody.addEventListener('click', handleInboxAction);

    el.refreshBtn.addEventListener('click', async () => {
      el.refreshBtn.classList.add('spinning');
      await loadDirectory();
      await refreshInfo();
      window.setTimeout(() => el.refreshBtn.classList.remove('spinning'), 300);
    });

    el.copyLanBtn.addEventListener('click', copyLanAddress);
    el.newFolderBtn.addEventListener('click', createFolder);
    el.zipBtn.addEventListener('click', downloadArchive);
    el.closeUploadBtn.addEventListener('click', () => {
      el.uploadPanel.hidden = true;
    });

    el.filterInput.addEventListener('input', () => {
      state.filter = el.filterInput.value;
      renderFiles();
    });

    el.breadcrumb.addEventListener('click', (event) => {
      const crumb = event.target.closest('.crumb');
      if (!crumb || crumb.classList.contains('current')) return;
      navigate(crumb.dataset.path || '');
    });

    el.fileList.addEventListener('click', (event) => {
      const actionNode = event.target.closest('[data-action]');
      const row = event.target.closest('.file-row');
      if (!actionNode || !row) return;

      const action = actionNode.dataset.action;
      const path = row.dataset.path;
      const name = row.dataset.name;
      const isDirectory = row.dataset.kind === 'dir';

      if (action === 'download') return;
      if (action === 'open') {
        event.preventDefault();
        openEntry(path, name, isDirectory);
      } else if (action === 'preview') {
        const entry = state.entries.find((item) => item.relativePath === path);
        if (entry) openPreview(entry);
      } else if (action === 'rename') {
        renameEntry(path, name);
      } else if (action === 'delete') {
        deleteEntry(path, name, isDirectory);
      }
    });

    el.fileList.addEventListener('dblclick', (event) => {
      if (event.target.closest('[data-action]')) return;
      const row = event.target.closest('.file-row');
      if (!row || row.dataset.kind !== 'dir') return;
      navigate(row.dataset.path);
    });

    el.previewCloseBtn.addEventListener('click', closePreview);
    el.previewOverlay.addEventListener('click', (event) => {
      if (event.target === el.previewOverlay) closePreview();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !el.previewOverlay.hidden) closePreview();
    });

    window.addEventListener('popstate', () => {
      navigate(hashPath(), { pushHistory: false });
    });

    window.addEventListener('dragover', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });

    window.addEventListener('dragenter', (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth++;
      el.dropOverlay.hidden = false;
      el.dropPath.textContent = state.path ? `/${state.path}` : '共享目录（根目录）';
    });

    window.addEventListener('dragleave', (event) => {
      if (!hasFiles(event)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) el.dropOverlay.hidden = true;
    });

    window.addEventListener('drop', async (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth = 0;
      el.dropOverlay.hidden = true;

      const items = await collectDroppedItems(event.dataTransfer);
      if (!items.length) {
        toast('没有读取到可上传的文件', 'warn');
        return;
      }
      enqueueFiles(items);
    });

    document.addEventListener('paste', (event) => {
      const files = Array.from((event.clipboardData && event.clipboardData.files) || []);
      if (!files.length) return;
      event.preventDefault();
      enqueueFiles(files.map((file) => ({ file, relativePath: file.name })));
      toast(`已从剪贴板添加 ${files.length} 个文件`, 'info');
    });

    window.addEventListener('beforeunload', (event) => {
      if (upload.items.some((item) => item.state === 'uploading' || item.state === 'waiting')) {
        event.preventDefault();
        event.returnValue = '';
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (!upload.running) void refreshInfo();
        void touchPresence();
        void refreshInbox({ notify: true });
      }
    });
  }

  function hasFiles(event) {
    const types = event.dataTransfer && event.dataTransfer.types;
    return !!types && Array.from(types).includes('Files');
  }

  /* ---------------- 启动 ---------------- */
  async function init() {
    bindEvents();
    loadIdentity();

    try {
      await loadInfo();
    } catch (error) {
      el.serverLine.textContent = '无法连接服务器';
      toast(`无法连接服务器：${error.message}`, 'error', 8000);
    }

    await touchPresence();
    startPresence();
    await navigate(hashPath(), { pushHistory: false });
    await refreshInbox({ notify: false });
  }

  init();
})();
