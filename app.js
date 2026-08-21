const app = document.querySelector('#app');

const promptPool = [
  '今天有什么还留在你脑子里？',
  '有没有一个瞬间，你后来又想起了？',
  '最近有什么问题一直没有答案？',
  '今天有哪一刻，你没有说出真正想说的话？',
  '最近什么事情让你有一点迟疑？',
  '有没有一种感受，你还没来得及好好看见？',
  '如果此刻不用给任何人解释，你最想说什么？',
  '最近你在反复权衡什么？',
  '有什么看似很小，却一直没有过去？'
];

const state = {
  screen: 'home',
  prompts: dailyPrompts(),
  promptPage: 0,
  opening: '',
  turns: [],
  round: 0,
  listening: false,
  recognition: null,
  voiceFallback: false,
  finalTranscript: '',
  summary: null,
  viewingId: null,
  startedAt: null,
  exportOpen: false
};

function dailyPrompts() {
  const day = Math.floor(new Date().setHours(0,0,0,0) / 86400000);
  const start = (day * 3) % promptPool.length;
  return [0,1,2].map(i => promptPool[(start + i) % promptPool.length]);
}

function changePrompts() {
  const day = Math.floor(new Date().setHours(0,0,0,0) / 86400000);
  state.promptPage = (state.promptPage + 1) % Math.ceil(promptPool.length / 3);
  const start = ((day * 3) + (state.promptPage * 3)) % promptPool.length;
  state.prompts = [0,1,2].map(i => promptPool[(start + i) % promptPool.length]);
  render();
}

function iconMic() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg>`;
}

function shell(content, historyLabel = '过往思考') {
  return `<main class="app-shell"><header class="topbar"><button class="brand" data-go="home">INSIDE</button><button class="nav-link" data-go="history">${historyLabel}</button></header>${content}</main>`;
}

function render() {
  if (state.screen === 'home') renderHome();
  if (state.screen === 'conversation') renderConversation();
  if (state.screen === 'summary') renderSummary();
  if (state.screen === 'history') renderHistory();
  bindGlobal();
}

function renderHome() {
  app.innerHTML = shell(`<section class="screen home"><div class="intro"><p class="eyebrow">A quiet place to think</p><h1>让一个念头，慢慢变得清楚。</h1><p class="subtitle">We don't have to start with the whole story.</p></div><div class="prompts-wrap"><div><div class="prompt-list">${state.prompts.map((p, i) => `<button class="prompt" data-prompt="${i}"><span>${p}</span><span>↗</span></button>`).join('')}</div><button class="change-prompts" id="changePrompts" aria-label="换一组开场问题">换一组问题 <span>↻</span></button></div><div class="mic-area"><button class="mic-button" id="quickMic" aria-label="开始说话">${iconMic()}</button><p class="mic-hint">从任何地方开始说</p></div></div><div><button class="text-entry" id="textStart">也可以从：今天我一直在想…… 开始</button></div></section>`);
  document.querySelectorAll('[data-prompt]').forEach(btn => btn.addEventListener('click', () => begin(state.prompts[Number(btn.dataset.prompt)], false)));
  document.querySelector('#changePrompts').addEventListener('click', changePrompts);
  document.querySelector('#quickMic').addEventListener('click', () => begin('你此刻最想说的，是什么？', true));
  document.querySelector('#textStart').addEventListener('click', () => begin('今天一直留在你心里的，是什么？', false, true));
}

function begin(opening, autoListen = false, textMode = false) {
  stopRecognition();
  state.screen = 'conversation';
  state.opening = opening;
  state.turns = [{ role: 'inside', text: opening }];
  state.round = 0;
  state.summary = null;
  state.startedAt = new Date().toISOString();
  state.exportOpen = false;
  state.listening = autoListen;
  state.voiceFallback = false;
  state.textMode = textMode;
  render();
  if (autoListen) startRecognition();
}

function renderConversation() {
  const turns = state.turns.map(t => `<article class="turn ${t.role}"><div class="turn-label">${t.role === 'inside' ? 'INSIDE' : '你'}</div><p>${escapeHtml(t.text)}</p></article>`).join('');
  const questionAnchor = state.listening ? `<aside class="question-anchor" aria-label="今天的三个开场问题"><span>今天的三个问题</span><div class="question-anchor-list">${state.prompts.map(prompt => `<p class="${prompt === state.opening ? 'selected' : ''}">${escapeHtml(prompt)}</p>`).join('')}</div></aside>` : '';
  app.innerHTML = shell(`<section class="screen conversation">${questionAnchor}<div class="context-line">不用急。停顿也算表达的一部分。</div><div id="turns">${turns}</div><div class="response-area">${responseUI()}</div></section>`, '今天先到这里');
  bindResponse();
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function responseUI() {
  if (state.listening) {
    const fallback = state.voiceFallback || !(window.SpeechRecognition || window.webkitSpeechRecognition);
    return `<div class="listening-panel"><div class="listening-orb">${iconMic()}</div><p class="status">${fallback ? '可以继续表达' : '我在听'}</p><p class="status-note">${fallback ? '当前浏览器无法自动转写，请轻触下方输入框，使用手机键盘的听写麦克风' : '你可以慢慢说，停顿不会结束'}</p><textarea class="transcript" id="transcript" placeholder="${fallback ? '轻触这里，然后使用手机键盘上的麦克风……' : '你的话会安静地出现在这里……'}">${escapeHtml(state.finalTranscript)}</textarea><div class="actions"><button class="button" id="finishSpeaking">结束表达并继续</button></div></div>`;
  }
  return `<div class="text-mode"><textarea class="transcript" id="transcript" autofocus placeholder="写下或说出你此刻想到的……">${escapeHtml(state.finalTranscript)}</textarea><div class="actions"><button class="button secondary" id="listen">${iconMic()}&nbsp;&nbsp;用语音回答</button><button class="button" id="send" ${state.finalTranscript.trim() ? '' : 'disabled'}>继续</button><button class="button textual" id="endSession">今天先到这里</button></div></div>`;
}

function bindResponse() {
  const area = document.querySelector('#transcript');
  if (area) {
    area.addEventListener('input', e => {
      state.finalTranscript = e.target.value;
      const send = document.querySelector('#send');
      if (send) send.disabled = !e.target.value.trim();
    });
  }
  document.querySelector('#listen')?.addEventListener('click', () => { state.listening = true; state.voiceFallback = false; render(); startRecognition(); });
  document.querySelector('#finishSpeaking')?.addEventListener('click', () => {
    stopRecognition();
    state.listening = false;
    if (state.finalTranscript.trim()) submitResponse();
    else {
      render();
      toast('还没有收到内容，可以再试一次或直接输入文字');
    }
  });
  document.querySelector('#send')?.addEventListener('click', submitResponse);
  document.querySelector('#endSession')?.addEventListener('click', finishSession);
}

function startRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    state.voiceFallback = true;
    render();
    document.querySelector('#transcript')?.focus();
    toast('请使用手机键盘上的听写麦克风');
    return;
  }
  try {
    const recognition = new Recognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    state.recognition = recognition;
    let settled = state.finalTranscript;
    recognition.onresult = event => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) settled += text;
        else interim += text;
      }
      state.finalTranscript = settled + interim;
      const box = document.querySelector('#transcript');
      if (box) box.value = state.finalTranscript;
    };
    recognition.onerror = event => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        state.recognition = null;
        state.voiceFallback = true;
        render();
        document.querySelector('#transcript')?.focus();
        toast('无法使用网页麦克风，请使用手机键盘上的听写麦克风');
      } else if (event.error !== 'aborted') {
        toast('没有听清，你可以继续说或直接输入');
      }
    };
    recognition.onend = () => {
      if (state.listening && state.recognition === recognition) {
        try { recognition.start(); } catch (_) {}
      }
    };
    recognition.start();
  } catch (_) {
    state.voiceFallback = true;
    render();
    document.querySelector('#transcript')?.focus();
    toast('麦克风暂时无法启动，请使用手机键盘听写');
  }
}

function stopRecognition() {
  state.listening = false;
  if (state.recognition) {
    const current = state.recognition;
    state.recognition = null;
    try { current.stop(); } catch (_) {}
  }
}

function submitResponse() {
  const text = state.finalTranscript.trim();
  if (!text) return;
  state.turns.push({ role: 'user', text });
  state.round += 1;
  state.finalTranscript = '';
  state.turns.push({ role: 'inside', text: '如果还有什么想留下的，可以继续说。' });
  render();
}

function finishSession() {
  stopRecognition();
  const userTurns = state.turns.filter(t => t.role === 'user').map(t => t.text);
  if (state.finalTranscript.trim()) {
    state.turns.push({ role: 'user', text: state.finalTranscript.trim() });
    userTurns.push(state.finalTranscript.trim());
    state.finalTranscript = '';
  }
  if (!userTurns.length) { toast('先留下一点想法，再结束这次思考'); return; }
  const rawContent = userTurns.join('\n\n');
  const createdAt = new Date().toISOString();
  const record = {
    id: Date.now().toString(),
    schemaVersion: 2,
    title: createTitle(rawContent),
    createdAt,
    startedAt: state.startedAt || createdAt,
    durationSeconds: Math.max(1, Math.round((new Date(createdAt) - new Date(state.startedAt || createdAt)) / 1000)),
    opening: state.opening,
    rawContent,
    turns: state.turns
  };
  const records = loadRecords();
  records.unshift(record);
  localStorage.setItem('inside_records', JSON.stringify(records));
  state.viewingId = record.id;
  state.screen = 'summary';
  state.exportOpen = false;
  render();
  toast('这次记录已经保存在这里');
}

function createTitle(text) {
  const first = text.split(/[。！？!?\n]/).map(part => part.trim()).find(Boolean) || '今天的一次思考';
  return first.length > 24 ? `${first.slice(0, 24)}…` : first;
}

function renderSummary() {
  const record = state.viewingId ? loadRecords().find(r => r.id === state.viewingId) : null;
  if (!record) { go('home'); return; }
  const legacy = hasLegacyAnalysis(record) ? `<details class="legacy-analysis"><summary>查看旧版本生成的分析</summary><div>${record.theme ? `<section><h3>当时生成的主题</h3><p>${escapeHtml(record.theme)}</p></section>` : ''}${record.confusion ? `<section><h3>当时生成的困惑</h3><p>${escapeHtml(record.confusion)}</p></section>` : ''}${record.value ? `<section><h3>当时生成的在意</h3><p>${escapeHtml(record.value)}</p></section>` : ''}${record.openQuestion ? `<section><h3>当时留下的问题</h3><p>${escapeHtml(record.openQuestion)}</p></section>` : ''}${record.quote ? `<section><h3>当时留下的一句话</h3><p>“${escapeHtml(record.quote)}”</p></section>` : ''}</div></details>` : '';
  const exportPanel = state.exportOpen ? renderExportPanel(record) : '';
  app.innerHTML = shell(`<section class="screen record-detail"><p class="eyebrow">Record kept</p><div class="record-heading"><div class="title-editor"><label for="recordTitle">标题</label><input id="recordTitle" value="${escapeHtml(record.title)}" maxlength="60" /></div><button class="save-title" id="saveTitle">保存标题</button></div><div class="record-meta"><span>${formatDate(new Date(record.createdAt))}</span><span>${record.durationSeconds == null ? '旧记录未记录时长' : `记录 ${formatDuration(record.durationSeconds)}`}</span></div><section class="raw-record"><h2>我的原始记录</h2><div>${record.rawContent.split('\n').map(line => line.trim() ? `<p>${escapeHtml(line)}</p>` : '').join('')}</div></section><div class="record-actions"><button class="button" id="showExport">发送给 GPT 分析</button><button class="button secondary" data-go="history">查看历史记录</button><button class="button textual" data-go="home">回到首页</button></div>${exportPanel}${legacy}</section>`, '历史记录');
  document.querySelector('#saveTitle')?.addEventListener('click', () => saveRecordTitle(record.id));
  document.querySelector('#recordTitle')?.addEventListener('keydown', event => { if (event.key === 'Enter') saveRecordTitle(record.id); });
  document.querySelector('#showExport')?.addEventListener('click', () => { state.exportOpen = true; render(); });
  bindExportActions(record);
}

function renderHistory() {
  const records = loadRecords();
  app.innerHTML = shell(`<section class="screen history"><div class="history-head"><div><p class="eyebrow">Your private archive</p><h1>过往思考</h1></div></div>${records.length ? `<div class="history-list">${records.map(r => `<div class="history-item"><button class="history-main" data-record="${r.id}"><time>${formatDate(new Date(r.createdAt))}</time><strong>${escapeHtml(r.title)}</strong><span>↗</span></button><button class="history-export" data-export-record="${r.id}">发送给 GPT</button></div>`).join('')}</div>` : `<div class="empty">这里还很安静。<br>完成第一次记录后，它会被留在这里。</div>`}</section>`, '回到首页');
  document.querySelectorAll('[data-record]').forEach(btn => btn.addEventListener('click', () => { state.viewingId = btn.dataset.record; state.screen = 'summary'; render(); }));
  document.querySelectorAll('[data-export-record]').forEach(btn => btn.addEventListener('click', () => { state.viewingId = btn.dataset.exportRecord; state.exportOpen = true; state.screen = 'summary'; render(); }));
}

function renderExportPanel(record) {
  return `<section class="export-panel" aria-label="发送给 GPT 分析"><div class="export-head"><div><p class="eyebrow">Export to GPT Analysis</p><h2>把这次记录交给 GPT 深入理解</h2></div><button class="close-export" id="closeExport" aria-label="关闭导出区域">×</button></div><textarea id="exportPrompt" readonly>${escapeHtml(buildAnalysisPrompt(record))}</textarea><div class="export-actions"><button class="button" id="copyPrompt">复制 Prompt</button><button class="button secondary" id="sharePrompt">分享</button><button class="button secondary" id="openGPT">复制并打开 ChatGPT</button></div><p class="privacy-note">原始记录仍保存在你的浏览器中。只有当你粘贴或分享时，内容才会离开 Inside。</p></section>`;
}

function buildAnalysisPrompt(record) {
  return `标题：${record.title}\n日期：${formatDate(new Date(record.createdAt))}\n\n我的原始记录：\n${record.rawContent}\n\n请作为我的长期思考伙伴分析：\n\n- 这段表达背后的核心情绪是什么？\n- 我真正关注的问题是什么？\n- 是否存在我没有意识到的矛盾？\n- 是否反映出重复出现的思维模式？\n- 请结合这段记录，提出3个值得继续思考的问题。\n\n不要简单总结，也不要急着给建议或安慰。\n请帮助我理解自己的情绪、需求、矛盾和反复出现的思考方式。\n如果信息不足，请明确说明，不要替我下结论。`;
}

function bindExportActions(record) {
  if (!state.exportOpen) return;
  document.querySelector('#closeExport')?.addEventListener('click', () => { state.exportOpen = false; render(); });
  document.querySelector('#copyPrompt')?.addEventListener('click', async () => {
    const copied = await copyText(buildAnalysisPrompt(record));
    toast(copied ? 'Prompt 已复制，可以粘贴给 GPT' : '复制失败，请长按文字手动复制');
  });
  document.querySelector('#sharePrompt')?.addEventListener('click', async () => {
    const prompt = buildAnalysisPrompt(record);
    if (navigator.share) {
      try { await navigator.share({ title: record.title, text: prompt }); }
      catch (error) { if (error.name !== 'AbortError') toast('暂时无法分享，请使用复制按钮'); }
    } else {
      const copied = await copyText(prompt);
      toast(copied ? '设备不支持分享，Prompt 已为你复制' : '设备不支持直接分享');
    }
  });
  document.querySelector('#openGPT')?.addEventListener('click', async () => {
    const newTab = window.open('https://chatgpt.com/', '_blank', 'noopener');
    const copied = await copyText(buildAnalysisPrompt(record));
    toast(copied ? 'Prompt 已复制，请在 ChatGPT 中粘贴' : 'ChatGPT 已打开，请手动复制 Prompt');
    if (!newTab) window.location.href = 'https://chatgpt.com/';
  });
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (_) {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    const copied = document.execCommand('copy');
    helper.remove();
    return copied;
  }
}

function saveRecordTitle(id) {
  const input = document.querySelector('#recordTitle');
  const title = input?.value.trim();
  if (!title) { toast('标题不能为空'); return; }
  const records = loadRawRecords();
  const index = records.findIndex(record => String(record.id) === String(id));
  if (index < 0) return;
  records[index] = { ...records[index], title };
  localStorage.setItem('inside_records', JSON.stringify(records));
  render();
  toast('标题已保存');
}

function bindGlobal() {
  document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.go)));
}

function go(screen) {
  stopRecognition();
  if (screen === 'history' && state.screen === 'conversation' && state.turns.some(t => t.role === 'user')) { finishSession(); return; }
  state.screen = screen;
  state.exportOpen = false;
  state.finalTranscript = '';
  render();
}

function loadRecords() {
  return loadRawRecords().map(normalizeRecord);
}

function loadRawRecords() {
  try {
    const records = JSON.parse(localStorage.getItem('inside_records') || '[]');
    return Array.isArray(records) ? records : [];
  } catch (_) { return []; }
}

function normalizeRecord(record) {
  const userTurns = Array.isArray(record.turns) ? record.turns.filter(turn => turn.role === 'user').map(turn => turn.text).filter(Boolean) : [];
  const rawContent = record.rawContent || userTurns.join('\n\n') || '这条旧记录没有可读取的原始文字。';
  return {
    ...record,
    id: String(record.id),
    schemaVersion: record.schemaVersion || 1,
    title: record.title || record.theme || createTitle(rawContent),
    rawContent
  };
}

function hasLegacyAnalysis(record) {
  return Boolean(record.theme || record.confusion || record.value || record.openQuestion || record.quote);
}

function formatDate(date) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatDuration(seconds) {
  const total = Math.max(1, Number(seconds) || 1);
  if (total < 60) return `${total} 秒`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

function toast(message) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

render();
