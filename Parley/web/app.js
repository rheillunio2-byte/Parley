/* Dashboard logic for the A2A demo. */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const KEYS = ['research', 'analysis', 'writer'];
  const HUES = { research: 192, analysis: 262, writer: 160, back: 158 };
  const LABELS = { idle: 'Standing by', queued: 'Queued', working: 'Working…', done: 'Completed', error: 'Failed' };
  const nodes = {
    coordinator: $('node-coordinator'),
    research: $('node-research'),
    analysis: $('node-analysis'),
    writer: $('node-writer'),
  };

  const grid = new SignalGrid($('grid'));
  window.grid = grid;
  FX.initSpotlight();
  FX.initCountUps();

  // Hero: blur-in words, in reading order.
  let idx = FX.splitWords($('headline'), 0);
  FX.splitWords($('sub'), 0);

  // Rails: coordinator ↔ each agent.
  KEYS.forEach(k => grid.connect(nodes.coordinator, nodes[k]));
  if (window.ResizeObserver) new ResizeObserver(() => grid.invalidate()).observe($('net'));

  /* ---------- helpers ---------- */
  let session = { tasks: 0, data: null, tab: 'report' };

  function setState(key, state) {
    const n = nodes[key];
    n.dataset.state = state;
    const label = key === 'coordinator' && state === 'working' ? 'Orchestrating…' : (key !== 'coordinator' && state === 'idle' ? 'Waiting' : LABELS[state]);
    const el = n.querySelector('.status');
    el.dataset.label = label;
    FX.decrypt(el, label, { duration: 420 });
  }

  function announce(text) { $('live').textContent = text; }

  function trace(tag, msg, cls) {
    const list = $('trace');
    const empty = list.querySelector('.empty');
    if (empty) empty.remove();
    const li = document.createElement('li');
    const t = document.createElement('time');
    t.textContent = new Date().toLocaleTimeString([], { hour12: false });
    const tg = document.createElement('span');
    tg.className = 'tag ' + (cls || '');
    const m = document.createElement('span');
    m.className = 'msg';
    m.textContent = msg;
    li.append(t, tg, m);
    list.appendChild(li);
    list.scrollTop = list.scrollHeight;
    FX.decrypt(tg, tag, { duration: 380 });
  }

  function showError(msg) {
    const e = $('error');
    e.textContent = msg;
    e.classList.remove('hidden');
    e.style.animation = 'none';
    void e.offsetWidth;
    e.style.animation = '';
  }

  function fillChips(cards) {
    KEYS.forEach(k => {
      const card = cards[k];
      if (!card) return;
      const port = (card.url.match(/:(\d+)/) || [])[1];
      const skill = card.skills && card.skills[0] ? card.skills[0].id : 'skill';
      const box = $('chips-' + k);
      box.innerHTML = '';
      [skill, 'v' + card.version, port ? ':' + port : ''].filter(Boolean).forEach((txt, i) => {
        const c = document.createElement('span');
        c.className = 'chip mono';
        c.style.animationDelay = i * 90 + 'ms';
        c.textContent = txt;
        box.appendChild(c);
      });
    });
    grid.invalidate();
  }

  function resetUI() {
    $('error').classList.add('hidden');
    $('output').classList.add('hidden');
    ['coordinator', ...KEYS].forEach(k => setState(k, 'idle'));
    $('trace').innerHTML = '';
    session.data = null;
  }

  /* ---------- artifact tabs ---------- */
  function tabText(tab) {
    const d = session.data;
    if (!d) return '';
    if (tab === 'report') return d.report;
    if (tab === 'tasks') return JSON.stringify(KEYS.reduce((o, k) => { o[k] = d.agents[k].task; return o; }, {}), null, 2);
    return d.agents[tab].text;
  }

  function selectTab(tab, animate) {
    session.tab = tab;
    document.querySelectorAll('.tabs [role="tab"]').forEach(b => {
      const on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    $('report').setAttribute('aria-labelledby', 'tab-' + tab);
    const text = tabText(tab);
    if (animate) return FX.typeInto($('report'), text);
    FX.setText($('report'), text);
    return Promise.resolve();
  }

  document.querySelectorAll('.tabs [role="tab"]').forEach(b => {
    b.addEventListener('click', () => selectTab(b.dataset.tab, false));
    b.addEventListener('keydown', e => {
      const tabs = Array.from(document.querySelectorAll('.tabs [role="tab"]'));
      const i = tabs.indexOf(b);
      let n = null;
      if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
      if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
      if (n) { e.preventDefault(); n.focus(); selectTab(n.dataset.tab, false); }
    });
  });

  /* ---------- event choreography ---------- */
  const startedAt = {};
  let cardsSeen = null;

  async function handle(ev) {
    if (ev.type === 'error') throw new Error(ev.message);

    if (ev.type === 'progress' && ev.state === 'discovered') {
      setState('coordinator', 'working');
      trace('DISCOVER', 'Fetched ' + Object.keys(ev.cards).length + ' Agent Cards from /.well-known/agent-card.json');
      cardsSeen = ev.cards;
      fillChips(ev.cards);
      KEYS.forEach(k => setState(k, 'queued'));
      await FX.sleep(650);
      return;
    }

    if (ev.type === 'progress' && ev.state === 'running') {
      const k = ev.key;
      trace('SEND', '→ tasks/send to ' + ev.agent, 'send');
      await grid.signal(nodes.coordinator, nodes[k], { hue: HUES[k] });
      setState(k, 'working');
      startedAt[k] = performance.now();
      announce(ev.agent + ' is working');
      return;
    }

    if (ev.type === 'progress' && ev.state === 'completed') {
      const k = ev.key;
      const dwell = 800 - (performance.now() - (startedAt[k] || 0));
      if (dwell > 0) await FX.sleep(dwell);
      setState(k, 'done');
      await grid.signal(nodes[k], nodes.coordinator, { hue: HUES.back });
      grid.burst(nodes[k], { hue: HUES[k] });
      trace('DONE', '✓ ' + ev.agent + ' returned artifact ' + ev.artifact, 'done');
      session.tasks += 1;
      FX.countUp($('stat-tasks'), session.tasks, { duration: 600 });
      announce(ev.agent + ' completed');
      await FX.sleep(220);
      return;
    }

    if (ev.type === 'result') {
      session.data = ev.data;
      setState('coordinator', 'done');
      trace('FINAL', 'Report assembled (' + ev.data.report.length + ' characters)', 'done');
      $('output').classList.remove('hidden');
      grid.invalidate();
      grid.burst($('output'), { hue: 190 });
      $('output').scrollIntoView({ behavior: FX.reduce ? 'auto' : 'smooth', block: 'nearest' });
      announce('Workflow complete. Final report is ready.');
      await selectTab('report', true);
    }
  }

  /* ---------- run ---------- */
  let running = false;

  async function run() {
    if (running) return;
    const topic = $('topic').value.trim();
    if (!topic) {
      showError('Please enter a task first.');
      $('topic').focus();
      return;
    }
    running = true;
    const btn = $('run');
    btn.disabled = true;
    $('runLabel').textContent = 'Agents working…';
    resetUI();
    $('net').scrollIntoView({ behavior: FX.reduce ? 'auto' : 'smooth', block: 'center' });

    try {
      const res = await fetch('/api/run-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Workflow failed');
      }

      const events = [];
      let finished = false, wake = null;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      const producer = (async () => {
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (line) { events.push(JSON.parse(line)); if (wake) wake(); }
          }
        }
        finished = true;
        if (wake) wake();
      })();

      let gotResult = false;
      for (;;) {
        if (!events.length) {
          if (finished) break;
          await new Promise(r => { wake = r; });
          wake = null;
          continue;
        }
        const ev = events.shift();
        await handle(ev);
        if (ev.type === 'result') gotResult = true;
      }
      await producer;
      if (!gotResult) throw new Error('The workflow ended before a report was returned.');
    } catch (e) {
      KEYS.forEach(k => { const s = nodes[k].dataset.state; if (s === 'working' || s === 'queued') setState(k, 'error'); });
      setState('coordinator', 'error');
      trace('ERROR', e.message, 'err');
      showError(e.message);
    } finally {
      running = false;
      btn.disabled = false;
      $('runLabel').textContent = 'Run multi-agent workflow';
    }
  }

  /* ---------- wiring ---------- */
  $('run').addEventListener('click', run);
  $('topic').addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); } });
  $('topic').addEventListener('input', () => { $('count').textContent = $('topic').value.length.toLocaleString() + ' chars'; });

  document.querySelectorAll('.chip-btn').forEach(b => b.addEventListener('click', () => {
    const t = $('topic');
    t.value = b.dataset.text;
    t.dispatchEvent(new Event('input'));
    t.focus();
    grid.burst(t, { hue: 200 });
  }));

  $('copy').addEventListener('click', async () => {
    const btn = $('copy');
    try {
      await navigator.clipboard.writeText(session.data ? session.data.report : $('report').textContent);
      btn.textContent = 'Copied!';
    } catch (e) {
      btn.textContent = 'Copy failed';
    }
    setTimeout(() => { btn.textContent = 'Copy report'; }, 1400);
  });

  $('download').addEventListener('click', () => {
    if (!session.data) return;
    const blob = new Blob([session.data.report], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'a2a-report.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
})();
