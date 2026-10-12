const state = { notes: [], selectedNote: null };
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const text = (value) => escapeHtml(value).replace(/\n/g, '<br>');
const date = (timestamp) => new Date(timestamp * 1000).toLocaleDateString('zh-CN');

async function loadJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '读取失败');
  return data;
}

function showPage(page) {
  document.querySelectorAll('.page').forEach((item) => item.classList.toggle('active', item.id === page));
  document.querySelectorAll('[data-page]').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function inlineMarkdown(raw) {
  let html = escapeHtml(raw);
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    if (/^(https?:\/\/|\.\.?\/)/i.test(href)) return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    return label;
  });
  return html.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function markdown(raw) {
  const lines = raw.split(/\r?\n/);
  const output = [];
  let inCode = false;
  let list = false;
  let paragraph = [];
  const flush = () => { if (paragraph.length) { output.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`); paragraph = []; } };
  const closeList = () => { if (list) { output.push('</ul>'); list = false; } };
  for (const line of lines) {
    if (line.startsWith('```')) { flush(); closeList(); output.push(inCode ? '</code></pre>' : '<pre><code>'); inCode = !inCode; continue; }
    if (inCode) { output.push(`${escapeHtml(line)}\n`); continue; }
    if (!line.trim()) { flush(); closeList(); continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) { flush(); closeList(); const level = Math.min(heading[1].length + 1, 4); output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); continue; }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) { flush(); if (!list) { output.push('<ul>'); list = true; } output.push(`<li>${inlineMarkdown(bullet[1])}</li>`); continue; }
    if (line.startsWith('> ')) { flush(); closeList(); output.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`); continue; }
    if (/^\|.*\|$/.test(line) && !/^[\s|:-]+$/.test(line)) { flush(); closeList(); const cells = line.split('|').slice(1, -1).map((cell) => `<td>${inlineMarkdown(cell.trim())}</td>`).join(''); output.push(`<table><tr>${cells}</tr></table>`); continue; }
    paragraph.push(line.trim());
  }
  flush(); closeList(); if (inCode) output.push('</code></pre>');
  return output.join('');
}

function renderHome() {
  $('#note-count').textContent = String(state.notes.length).padStart(2, '0');
  $('#recent-list').innerHTML = state.notes.slice(0, 3).map((note) => `<button class="recent-item" data-recent="${escapeHtml(note.path)}"><span>${escapeHtml(note.category)} · ${date(note.updated)}</span><strong>${escapeHtml(note.title)}</strong><small>继续阅读 ↗</small></button>`).join('') || '<p class="empty">暂无公开笔记。</p>';
  document.querySelectorAll('[data-recent]').forEach((button) => button.addEventListener('click', () => { state.selectedNote = button.dataset.recent; renderKnowledge(); showPage('knowledge'); }));
}

function fillFilter(select, values, allLabel) {
  const current = select.value;
  select.innerHTML = `<option value="">${allLabel}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
  select.value = values.includes(current) ? current : '';
}

function renderKnowledge() {
  const category = $('#category-filter').value;
  const tag = $('#tag-filter').value;
  const query = $('#knowledge-search').value.trim().toLocaleLowerCase();
  const filtered = state.notes.filter((note) => (!category || note.category === category) && (!tag || note.tags.includes(tag)) && (!query || `${note.title} ${note.body} ${note.tags.join(' ')}`.toLocaleLowerCase().includes(query)));
  $('#knowledge-list').innerHTML = filtered.map((note) => `<button class="list-item ${state.selectedNote === note.path ? 'active' : ''}" data-note="${escapeHtml(note.path)}"><strong>${escapeHtml(note.title)}</strong><span>${escapeHtml(note.category)} · ${date(note.updated)}</span></button>`).join('') || '<p class="empty">没有匹配的笔记</p>';
  document.querySelectorAll('[data-note]').forEach((button) => button.addEventListener('click', () => { state.selectedNote = button.dataset.note; renderKnowledge(); }));
  const selected = state.notes.find((note) => note.path === state.selectedNote);
  $('#knowledge-detail').innerHTML = selected ? `<h1>${escapeHtml(selected.title)}</h1><div class="detail-meta">${escapeHtml(selected.category)} · ${date(selected.updated)} · ${selected.tags.map(escapeHtml).join(' / ')}</div><div class="markdown">${markdown(selected.body)}</div>` : '<div class="empty">选择一篇笔记开始阅读</div>';
  // 面试笔记的二级标题可直接折叠，便于先看问题再看答案。
  if (selected && /面试|interview/i.test(selected.title + selected.category)) {
    const container = $('#knowledge-detail .markdown');
    [...container.querySelectorAll('h2,h3')].forEach((heading) => {
      const detail = document.createElement('details'); detail.className = 'qa'; detail.open = true;
      const summary = document.createElement('summary'); summary.textContent = heading.textContent;
      detail.append(summary); heading.after(detail); heading.remove();
      let next = detail.nextSibling;
      while (next && !/^H[23]$/.test(next.nodeName)) { const current = next; next = next.nextSibling; detail.append(current); }
    });
  }
}

async function initialize() {
  try {
    state.notes = await loadJson('./data/notes.json');
    state.selectedNote = state.notes[0]?.path || null;
    fillFilter($('#category-filter'), [...new Set(state.notes.map(note => note.category))], '全部分类');
    fillFilter($('#tag-filter'), [...new Set(state.notes.flatMap(note => note.tags))].sort(), '全部标签');
    renderHome(); renderKnowledge();
  } catch (error) {
    $('main').insertAdjacentHTML('afterbegin', `<p class="warning" role="alert">加载失败：${escapeHtml(error.message)}。请稍后刷新重试。</p>`);
  }
}
document.querySelectorAll('[data-page],[data-go]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.page || button.dataset.go)));
['knowledge-search', 'category-filter', 'tag-filter'].forEach(id => $(`#${id}`).addEventListener('input', renderKnowledge));
initialize();
