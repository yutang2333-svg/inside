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
  viewingId: null
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
  state.turns.push({ role: 'inside', text: createFollowUp(text, state.round) });
  render();
}

function createFollowUp(text, round) {
  const clean = text.replace(/[。！？!?]+$/g, '');
  const clauses = clean.split(/[，。；、]/).map(s => s.trim()).filter(Boolean);
  const focus = clauses.sort((a,b) => b.length - a.length)[0] || clean;
  const quoted = focus.length > 28 ? `${focus.slice(0, 27)}…` : focus;
  const emotional = /难受|不舒服|生气|失望|委屈|焦虑|害怕|担心|后悔|遗憾|烦/.test(text);
  const choice = /选择|决定|要不要|应该|还是|犹豫|纠结/.test(text);
  const person = /他|她|对方|同事|朋友|家人|老板|伴侣/.test(text);
  if (round === 1 && emotional) return `当你说“${quoted}”时，最触动你的，是发生的事情本身，还是它让你看见了某种更深的在意？`;
  if (round === 1 && choice) return `在这份犹豫里，你最不愿意失去的是什么？`;
  if (round === 1 && person) return `这件事一直留下来，是因为对方没有理解你，还是因为你当时没有完全表达自己？`;
  if (round === 2) return `如果先不考虑别人会怎么想，你真正希望发生什么？`;
  if (round === 3) return `你觉得是什么，让你到现在还没有完全相信自己的这个感受？`;
  return `回头看刚才说的这些，哪一句最接近你真正想说、却一直没有说清楚的东西？`;
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
  state.summary = buildSummary(userTurns);
  const record = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    opening: state.opening,
    turns: state.turns,
    ...state.summary
  };
  const records = loadRecords();
  records.unshift(record);
  localStorage.setItem('inside_records', JSON.stringify(records));
  state.viewingId = record.id;
  state.screen = 'summary';
  render();
  toast('这次思考已经留在这里');
}

function buildSummary(userTurns) {
  const all = userTurns.join(' ');
  const sentences = all.split(/[。！？!?]/).map(s => s.trim()).filter(Boolean);
  const quote = [...sentences].sort((a,b) => b.length - a.length)[0] || all;
  const topic = inferTopic(all);
  return {
    theme: topic,
    confusion: `我还在试着弄清：${topic}背后，真正让我放不下的是什么。`,
    value: inferValue(all),
    openQuestion: `如果不用急着给出正确答案，我真正希望自己如何面对${topic}？`,
    quote: quote.length > 64 ? `${quote.slice(0, 63)}…` : quote
  };
}

function inferTopic(text) {
  if (/工作|开会|同事|老板|项目|职业/.test(text)) return '工作中的感受与选择';
  if (/朋友|伴侣|家人|父母|孩子|关系|对方/.test(text)) return '这段关系里没有说清的话';
  if (/选择|决定|要不要|应该|犹豫|纠结/.test(text)) return '眼前这个难以决定的选择';
  if (/未来|以后|方向|目标/.test(text)) return '对未来方向的不确定';
  return '这件一直留在心里的事';
}

function inferValue(text) {
  if (/误解|理解|表达|说/.test(text)) return '被真正理解，也能诚实地表达自己。';
  if (/选择|决定|犹豫|纠结/.test(text)) return '做出忠于自己的选择，而不是只满足外界的期待。';
  if (/努力|工作|认可|价值/.test(text)) return '自己的付出被看见，也保有对生活的主动感。';
  if (/家人|朋友|伴侣|关系/.test(text)) return '关系里的真诚、靠近与彼此尊重。';
  return '诚实面对自己的感受，不匆忙把它盖过去。';
}

function renderSummary() {
  const record = state.viewingId ? loadRecords().find(r => r.id === state.viewingId) : null;
  const s = record || state.summary;
  if (!s) { go('home'); return; }
  const date = record ? new Date(record.createdAt) : new Date();
  app.innerHTML = shell(`<section class="screen summary"><p class="eyebrow">Reflection kept</p><h1>今天，想到了这里。</h1><p class="summary-date">${formatDate(date)}</p><div class="summary-section"><h3>今天真正困惑的是</h3><p>${escapeHtml(s.confusion)}</p></div><div class="summary-section"><h3>我可能真正看重的是</h3><p>${escapeHtml(s.value)}</p></div><div class="summary-section"><h3>一个还没有答案的问题</h3><p>${escapeHtml(s.openQuestion)}</p></div><div class="summary-section quote"><h3>今天值得留下的一句话</h3><p>“${escapeHtml(s.quote)}”</p></div><div class="summary-actions"><button class="button" data-go="home">回到首页</button><button class="button secondary" data-go="history">看看过往思考</button></div></section>`);
}

function renderHistory() {
  const records = loadRecords();
  app.innerHTML = shell(`<section class="screen history"><div class="history-head"><div><p class="eyebrow">Your private archive</p><h1>过往思考</h1></div></div>${records.length ? `<div class="history-list">${records.map(r => `<button class="history-item" data-record="${r.id}"><time>${formatDate(new Date(r.createdAt))}</time><strong>${escapeHtml(r.theme)}</strong><span>↗</span></button>`).join('')}</div>` : `<div class="empty">这里还很安静。<br>完成第一次思考后，它会被留在这里。</div>`}</section>`, '回到首页');
  document.querySelectorAll('[data-record]').forEach(btn => btn.addEventListener('click', () => { state.viewingId = btn.dataset.record; state.screen = 'summary'; render(); }));
}

function bindGlobal() {
  document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.go)));
}

function go(screen) {
  stopRecognition();
  if (screen === 'history' && state.screen === 'conversation' && state.turns.some(t => t.role === 'user')) { finishSession(); return; }
  state.screen = screen;
  state.finalTranscript = '';
  render();
}

function loadRecords() {
  try { return JSON.parse(localStorage.getItem('inside_records') || '[]'); }
  catch (_) { return []; }
}

function formatDate(date) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
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
