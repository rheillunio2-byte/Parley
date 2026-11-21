/* Small text / UI effects for the A2A demo — written from scratch, no dependencies. */
(function (global) {
  'use strict';

  const reduce = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const sleep = ms => new Promise(r => setTimeout(r, reduce ? Math.min(ms, 40) : ms));

  /** Wrap every word inside `el` in <span class="bt-w" style="--i:n"> (keeps nested elements and <br>). */
  function splitWords(el, start) {
    let i = start || 0;
    const walk = node => {
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(tok => {
            if (!tok) return;
            if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(' ')); return; }
            const s = document.createElement('span');
            s.className = 'bt-w';
            s.style.setProperty('--i', i++);
            s.textContent = tok;
            frag.appendChild(s);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(el);
    return i;
  }

  /** Scramble characters, resolving left to right. Cancels any earlier run on the same element. */
  function decrypt(el, text, opts) {
    const o = Object.assign({ duration: 650, glyphs: '01▮▯/\\<>+-=*#%' }, opts);
    const token = (el._decrypt = {});
    if (reduce) { el.textContent = text; return Promise.resolve(); }
    const start = performance.now(), n = text.length;
    return new Promise(resolve => {
      const tick = now => {
        if (el._decrypt !== token) return resolve();
        const t = Math.min(1, (now - start) / o.duration);
        const keep = Math.floor(t * n);
        let out = '';
        for (let i = 0; i < n; i++) {
          const ch = text[i];
          out += i < keep || ch === ' ' ? ch : o.glyphs[(Math.random() * o.glyphs.length) | 0];
        }
        el.textContent = out;
        if (t < 1) requestAnimationFrame(tick);
        else { el.textContent = text; resolve(); }
      };
      requestAnimationFrame(tick);
    });
  }

  /** Animate a number from its current value to `to`. */
  function countUp(el, to, opts) {
    const o = Object.assign({ duration: 1100 }, opts);
    const from = el._val || 0;
    el._val = to;
    if (reduce || from === to) { el.textContent = String(to); return; }
    const start = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - start) / o.duration);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(from + (to - from) * e));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Reveal text quickly, a chunk per frame, with a caret (CSS .typing). */
  function typeInto(el, text, opts) {
    const o = Object.assign({ cps: 1800 }, opts);
    const token = (el._type = {});
    if (reduce) { el.textContent = text; el.classList.remove('typing'); return Promise.resolve(); }
    el.classList.add('typing');
    el.textContent = '';
    return new Promise(resolve => {
      let shown = 0, last = performance.now();
      const tick = now => {
        if (el._type !== token) return resolve();
        shown = Math.min(text.length, shown + Math.max(1, Math.round(((now - last) / 1000) * o.cps)));
        last = now;
        el.textContent = text.slice(0, shown);
        if (shown < text.length) requestAnimationFrame(tick);
        else { el.classList.remove('typing'); resolve(); }
      };
      requestAnimationFrame(tick);
    });
  }

  /** Cancel a running typeInto and show the full text immediately. */
  function setText(el, text) {
    el._type = {};
    el.classList.remove('typing');
    el.textContent = text;
  }

  /** Cursor-following edge light: sets --mx/--my on every .spot and flags the nearby ones. */
  function initSpotlight() {
    const spots = () => Array.from(document.querySelectorAll('.spot'));
    let px = null, py = null, queued = false;
    const update = () => {
      queued = false;
      if (px == null) return;
      for (const el of spots()) {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (px - r.left) + 'px');
        el.style.setProperty('--my', (py - r.top) + 'px');
        const dx = Math.max(r.left - px, 0, px - r.right);
        const dy = Math.max(r.top - py, 0, py - r.bottom);
        el.classList.toggle('near', Math.hypot(dx, dy) < 220);
      }
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    global.addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; queue(); }, { passive: true });
    global.addEventListener('scroll', queue, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { px = null; spots().forEach(el => el.classList.remove('near')); });
  }

  /** Start count-ups when their element scrolls into view. */
  function initCountUps() {
    const els = document.querySelectorAll('[data-count]');
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { countUp(en.target, +en.target.dataset.count, { duration: 1200 }); io.unobserve(en.target); }
      });
    }, { threshold: 0.4 });
    els.forEach(el => io.observe(el));
  }

  global.FX = { sleep, splitWords, decrypt, countUp, typeInto, setText, initSpotlight, initCountUps, reduce };
})(window);
