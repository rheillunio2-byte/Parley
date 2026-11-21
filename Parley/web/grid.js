/*
 * SignalGrid — a small, dependency-free Canvas 2D engine written for this demo.
 *
 *  • Intersections are drawn as dots that swell near the cursor.
 *  • Cells under the cursor light up as corner brackets with a crosshair, then cool off.
 *  • Clicks send a diamond-shaped (Manhattan-distance) ripple plus a few sparks.
 *  • connect(a, b) draws a faint rail between two DOM elements, routed along grid lines.
 *  • signal(a, b) sends a glowing data packet down that rail and resolves when it arrives.
 */
(function (global) {
  'use strict';

  const reduceMotion = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);

  class SignalGrid {
    constructor(canvas, options) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opt = Object.assign({ cell: 48, radius: 170, hold: 0.3, fade: 0.9, hueA: 192, hueB: 268 }, options);
      this.lit = new Map();
      this.ripples = [];
      this.sparks = [];
      this.packets = [];
      this.links = new Map();
      this.pointer = { x: -9999, y: -9999, inside: false, lastX: null, lastY: null };
      this.focus = { x: -9999, y: -9999 };
      this.presence = 0;
      this.clock = 0;
      this.last = 0;
      this.raf = 0;
      this.intro = reduceMotion ? 1 : 0;
      this.w = 1;
      this.h = 1;
      this.dpr = 1;
      this._bind();
      this.resize();
      if (!reduceMotion) this.ripple(global.scrollX + this.w / 2, global.scrollY + this.h * 0.3, { hue: 205, speed: 15, max: 38, strength: 0.55 });
      this.wake();
    }

    /* ---------- setup ---------- */
    _bind() {
      this._onMove = e => this.onMove(e);
      this._onDown = e => this.onDown(e);
      this._onLeave = () => { this.pointer.inside = false; this.pointer.lastX = null; this.wake(); };
      this._onScroll = () => {
        if (this.pointer.inside && !reduceMotion) this.energize(this.pointer.x + global.scrollX, this.pointer.y + global.scrollY);
        this.wake();
      };
      this._onResize = () => { this.resize(); this.wake(); };
      this._onVis = () => this.wake();
      global.addEventListener('pointermove', this._onMove, { passive: true });
      global.addEventListener('pointerdown', this._onDown, { passive: true });
      global.addEventListener('scroll', this._onScroll, { passive: true });
      global.addEventListener('resize', this._onResize);
      document.documentElement.addEventListener('pointerleave', this._onLeave);
      document.addEventListener('visibilitychange', this._onVis);
    }

    destroy() {
      cancelAnimationFrame(this.raf);
      global.removeEventListener('pointermove', this._onMove);
      global.removeEventListener('pointerdown', this._onDown);
      global.removeEventListener('scroll', this._onScroll);
      global.removeEventListener('resize', this._onResize);
      document.documentElement.removeEventListener('pointerleave', this._onLeave);
      document.removeEventListener('visibilitychange', this._onVis);
    }

    resize() {
      this.w = Math.max(1, global.innerWidth);
      this.h = Math.max(1, global.innerHeight);
      this.dpr = Math.min(global.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
    }

    invalidate() { this.wake(); }

    wake() {
      if (!this.raf && !document.hidden) {
        this.last = 0;
        this.raf = requestAnimationFrame(t => this.frame(t));
      }
    }

    /* ---------- cell state ---------- */
    key(c, r) { return c * 65536 + r; }

    hueAt(c, r) {
      return lerp(this.opt.hueA, this.opt.hueB, (Math.sin(this.clock * 0.35 + (c + r) * 0.12) + 1) / 2);
    }

    light(c, r, v, quick, hue) {
      const k = this.key(c, r);
      let cell = this.lit.get(k);
      if (!cell) {
        cell = { c, r, v: 0, t: 0, hold: this.opt.hold, hue: null };
        this.lit.set(k, cell);
      }
      if (v >= cell.v) {
        cell.v = v;
        cell.t = this.clock;
        cell.hold = quick ? 0.04 : this.opt.hold;
        cell.hue = hue == null ? null : hue;
      }
    }

    /** Light cells around a page-space point (soft falloff). */
    energize(px, py) {
      const s = this.opt.cell, R = this.opt.radius;
      const c0 = Math.floor((px - R) / s), c1 = Math.floor((px + R) / s);
      const r0 = Math.floor((py - R) / s), r1 = Math.floor((py + R) / s);
      for (let r = Math.max(0, r0); r <= r1; r++) {
        for (let c = Math.max(0, c0); c <= c1; c++) {
          const d = Math.hypot(c * s + s / 2 - px, r * s + s / 2 - py);
          if (d > R) continue;
          const v = smooth(1 - d / R);
          if (v > 0.04) this.light(c, r, v * 0.95);
        }
      }
    }

    /* ---------- input ---------- */
    onMove(e) {
      const p = this.pointer;
      if (!p.inside) { this.focus.x = e.clientX; this.focus.y = e.clientY; }
      p.inside = true;
      p.x = e.clientX;
      p.y = e.clientY;
      if (!reduceMotion) {
        const px = e.clientX + global.scrollX, py = e.clientY + global.scrollY;
        // Interpolate fast moves so no cells are skipped.
        if (p.lastX != null) {
          const dx = px - p.lastX, dy = py - p.lastY;
          const steps = Math.min(24, Math.ceil(Math.hypot(dx, dy) / (this.opt.cell * 0.5)));
          for (let i = 1; i < steps; i++) this.energize(p.lastX + dx * (i / steps), p.lastY + dy * (i / steps));
        }
        this.energize(px, py);
        p.lastX = px;
        p.lastY = py;
      }
      this.wake();
    }

    onDown(e) {
      if (reduceMotion) return;
      const px = e.clientX + global.scrollX, py = e.clientY + global.scrollY;
      const hue = lerp(this.opt.hueA, this.opt.hueB, Math.random());
      this.ripple(px, py, { hue });
      this.sparksAt(px, py, hue);
    }

    /* ---------- effects ---------- */
    ripple(px, py, o) {
      o = o || {};
      this.ripples.push({ x: px, y: py, t0: this.clock, speed: o.speed || 13, max: o.max || 22, strength: o.strength || 0.9, hue: o.hue == null ? null : o.hue });
      this.wake();
    }

    sparksAt(px, py, hue) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
        const v = 140 + Math.random() * 160;
        this.sparks.push({ x: px, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45 + Math.random() * 0.35, age: 0, hue: hue + (Math.random() - 0.5) * 40 });
      }
      this.wake();
    }

    /** Ripple + sparks centred on an element. */
    burst(el, o) {
      const r = el.getBoundingClientRect();
      const px = r.left + r.width / 2 + global.scrollX, py = r.top + r.height / 2 + global.scrollY;
      const hue = o && o.hue != null ? o.hue : 160;
      this.ripple(px, py, { hue, speed: 14, max: 16, strength: 0.85 });
      if (!reduceMotion) this.sparksAt(px, py, hue);
    }

    /* ---------- rails & packets ---------- */
    connect(a, b) {
      const reverse = a.id > b.id; // one canonical rail per pair
      const [ca, cb] = reverse ? [b, a] : [a, b];
      const k = ca.id + '>' + cb.id;
      if (!this.links.has(k)) this.links.set(k, { a: ca, b: cb, heat: 0, hue: 190 });
      this.wake();
      return this.links.get(k);
    }

    snapX(v) { const s = this.opt.cell, o = global.scrollX; return Math.round((v + o) / s) * s - o; }
    snapY(v) { const s = this.opt.cell, o = global.scrollY; return Math.round((v + o) / s) * s - o; }

    /** Route between two elements along grid lines; returns viewport-space points. */
    route(a, b) {
      const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
      const acx = A.left + A.width / 2, acy = A.top + A.height / 2;
      const bcx = B.left + B.width / 2, bcy = B.top + B.height / 2;
      const m = 12;
      const inside = (v, lo, hi) => v >= lo + m && v <= hi - m;
      const horizontal = (B.left >= A.right - 2 || B.right <= A.left + 2) && Math.abs(bcy - acy) < (A.height + B.height) / 2;
      if (horizontal) {
        const right = B.left >= A.right - 2;
        const sx = right ? A.right : A.left, ex = right ? B.left : B.right;
        let ys = this.snapY(acy), ye = this.snapY(bcy);
        if (!inside(ys, A.top, A.bottom)) ys = acy;
        if (!inside(ye, B.top, B.bottom)) ye = bcy;
        if (Math.abs(ys - ye) < 1) return [{ x: sx, y: ys }, { x: ex, y: ye }];
        const mx = this.snapX((sx + ex) / 2);
        return [{ x: sx, y: ys }, { x: mx, y: ys }, { x: mx, y: ye }, { x: ex, y: ye }];
      }
      const down = bcy >= acy;
      const sy = down ? A.bottom : A.top, ey = down ? B.top : B.bottom;
      // Prefer one shared x so the rail runs perfectly straight when both ends allow it.
      const narrow = A.width <= B.width ? [acx, A] : [bcx, B];
      let shared = this.snapX(narrow[0]);
      const okA = inside(shared, A.left, A.right), okB = inside(shared, B.left, B.right);
      let xs = okA && okB ? shared : this.snapX(acx), xe = okA && okB ? shared : this.snapX(bcx);
      if (!inside(xs, A.left, A.right)) xs = acx;
      if (!inside(xe, B.left, B.right)) xe = bcx;
      if (Math.abs(xs - xe) < 1) return [{ x: xs, y: sy }, { x: xe, y: ey }];
      const my = this.snapY((sy + ey) / 2);
      return [{ x: xs, y: sy }, { x: xs, y: my }, { x: xe, y: my }, { x: xe, y: ey }];
    }

    measure(pts) {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      return { pts, cum, len: cum[cum.length - 1] };
    }

    pointAt(path, d) {
      d = clamp(d, 0, path.len);
      for (let i = 1; i < path.pts.length; i++) {
        if (d <= path.cum[i]) {
          const seg = path.cum[i] - path.cum[i - 1] || 1;
          const t = (d - path.cum[i - 1]) / seg;
          return { x: lerp(path.pts[i - 1].x, path.pts[i].x, t), y: lerp(path.pts[i - 1].y, path.pts[i].y, t) };
        }
      }
      return path.pts[path.pts.length - 1];
    }

    /** Send a packet from element `from` to element `to`. Resolves on arrival. */
    signal(from, to, o) {
      o = o || {};
      const link = this.connect(from, to);
      const reverse = link.a !== from;
      link.hue = o.hue == null ? 190 : o.hue;
      if (reduceMotion) {
        link.heat = 1;
        this.wake();
        return new Promise(res => setTimeout(res, 160));
      }
      return new Promise(resolve => {
        this.packets.push({ link, reverse, d: 0, speed: o.speed || 430, hue: link.hue, resolve, to });
        this.wake();
      });
    }

    /* ---------- frame loop ---------- */
    frame(now) {
      this.raf = 0;
      if (document.hidden) return;
      const dt = this.last ? clamp((now - this.last) / 1000, 0, 0.05) : 1 / 60;
      this.last = now;
      this.clock += dt;
      if (this.intro < 1) this.intro = Math.min(1, this.intro + dt / 1.7);

      this.focus.x += (this.pointer.x - this.focus.x) * (1 - Math.exp(-dt / 0.08));
      this.focus.y += (this.pointer.y - this.focus.y) * (1 - Math.exp(-dt / 0.08));
      const goal = this.pointer.inside ? 1 : 0;
      this.presence += (goal - this.presence) * (1 - Math.exp(-dt / 0.25));

      this.stepRipples();
      this.stepPackets(dt);
      this.stepSparks(dt);
      this.stepCells(dt);
      for (const link of this.links.values()) link.heat = Math.max(0, link.heat - dt / 3.2);

      this.draw();

      let heat = false;
      for (const link of this.links.values()) if (link.heat > 0) { heat = true; break; }
      const active = this.lit.size || this.ripples.length || this.packets.length || this.sparks.length || heat ||
        this.intro < 1 || Math.abs(this.presence - goal) > 0.01 ||
        Math.hypot(this.focus.x - this.pointer.x, this.focus.y - this.pointer.y) > 0.5;
      if (active) this.wake();
    }

    stepCells(dt) {
      const fade = dt / this.opt.fade;
      for (const [k, cell] of this.lit) {
        if (this.clock - cell.t > cell.hold) {
          cell.v -= fade;
          if (cell.v <= 0) this.lit.delete(k);
        }
      }
    }

    inView(c, r) {
      const s = this.opt.cell, x = c * s - global.scrollX, y = r * s - global.scrollY;
      return x > -s && y > -s && x < this.w + s && y < this.h + s;
    }

    stepRipples() {
      const s = this.opt.cell;
      for (let i = this.ripples.length - 1; i >= 0; i--) {
        const rp = this.ripples[i];
        const R = (this.clock - rp.t0) * rp.speed;
        if (R > rp.max) { this.ripples.splice(i, 1); continue; }
        const cc = Math.floor(rp.x / s), cr = Math.floor(rp.y / s);
        const span = Math.ceil(R) + 2;
        const fall = (1 - R / rp.max) * rp.strength;
        for (let dr = -span; dr <= span; dr++) {
          for (let dc = -span; dc <= span; dc++) {
            const d = Math.abs(Math.abs(dc) + Math.abs(dr) - R);
            if (d >= 1.1) continue;
            const c = cc + dc, r = cr + dr;
            if (c < 0 || r < 0 || !this.inView(c, r)) continue;
            this.light(c, r, (1 - d / 1.1) * fall, true, rp.hue);
          }
        }
      }
    }

    stepPackets(dt) {
      for (let i = this.packets.length - 1; i >= 0; i--) {
        const p = this.packets[i];
        const base = this.measure(this.route(p.link.a, p.link.b));
        const path = p.reverse ? this.measure(base.pts.slice().reverse()) : base;
        p.d += p.speed * dt;
        p.path = path;
        p.link.heat = 1;
        p.link.hue = p.hue;
        const head = this.pointAt(path, p.d);
        const s = this.opt.cell;
        const c = Math.floor((head.x + global.scrollX) / s), r = Math.floor((head.y + global.scrollY) / s);
        for (let dc = -1; dc <= 0; dc++) for (let dr = -1; dr <= 0; dr++) {
          if (c + dc >= 0 && r + dr >= 0) this.light(c + dc, r + dr, 0.9, true, p.hue);
        }
        if (p.d >= path.len) {
          this.packets.splice(i, 1);
          this.ripple(head.x + global.scrollX, head.y + global.scrollY, { hue: p.hue, speed: 12, max: 8, strength: 0.8 });
          p.resolve();
        }
      }
    }

    stepSparks(dt) {
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const sp = this.sparks[i];
        sp.age += dt;
        if (sp.age >= sp.life) { this.sparks.splice(i, 1); continue; }
        const drag = Math.exp(-dt * 4.5);
        sp.vx *= drag; sp.vy *= drag;
        sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      }
    }

    /* ---------- drawing ---------- */
    draw() {
      const ctx = this.ctx, s = this.opt.cell, sx = global.scrollX, sy = global.scrollY;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      this.drawDots(ctx, s, sx, sy);
      this.drawSpotLines(ctx, s, sx, sy);
      this.drawRails(ctx);
      this.drawCells(ctx, s, sx, sy);
      this.drawPackets(ctx);
      this.drawSparks(ctx, sx, sy);
    }

    drawDots(ctx, s, sx, sy) {
      const c0 = Math.floor(sx / s), r0 = Math.floor(sy / s);
      const ox = c0 * s - sx, oy = r0 * s - sy;
      const cols = Math.ceil(this.w / s) + 1, rows = Math.ceil(this.h / s) + 1;
      const R = this.opt.radius, f = this.focus, pres = this.presence;
      const revealing = this.intro < 1;

      if (revealing) {
        // Intro: dots bloom outward from the upper centre of the screen.
        const cx = this.w / 2, cy = this.h * 0.3;
        const reach = (1 - Math.pow(1 - this.intro, 2.4)) * (Math.hypot(this.w, this.h) + 240);
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            const x = ox + i * s, y = oy + j * s;
            const reveal = clamp((reach - Math.hypot(x - cx, y - cy)) / 200, 0, 1);
            if (reveal <= 0) continue;
            ctx.fillStyle = `rgba(150,178,255,${0.17 * reveal})`;
            ctx.fillRect(x - 1, y - 1, 2, 2);
          }
        }
      } else {
        // Resting dots: one batched path.
        ctx.fillStyle = 'rgba(150,178,255,0.17)';
        ctx.beginPath();
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) ctx.rect(ox + i * s - 1, oy + j * s - 1, 2, 2);
        ctx.fill();
      }

      // Dots that swell near the cursor.
      if (pres < 0.01) return;
      const i0 = Math.floor((f.x - R * 1.3 - ox) / s), i1 = Math.ceil((f.x + R * 1.3 - ox) / s);
      const j0 = Math.floor((f.y - R * 1.3 - oy) / s), j1 = Math.ceil((f.y + R * 1.3 - oy) / s);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = ox + i * s, y = oy + j * s;
          if (x < -4 || y < -4 || x > this.w + 4 || y > this.h + 4) continue;
          const dx = x - f.x, dy = y - f.y;
          const spot = Math.exp(-(dx * dx + dy * dy) / (R * R) * 1.6) * pres;
          if (spot < 0.04) continue;
          ctx.fillStyle = `rgba(${150 + spot * 20 | 0},${178 + spot * 50 | 0},255,${0.2 + spot * 0.65})`;
          ctx.beginPath();
          ctx.arc(x, y, 1.1 + spot * 1.7, 0, 6.2832);
          ctx.fill();
        }
      }
    }

    drawSpotLines(ctx, s, sx, sy) {
      if (this.presence < 0.02) return;
      const R = this.opt.radius * 1.15, f = this.focus, pres = this.presence;
      const ox = Math.floor(sx / s) * s - sx, oy = Math.floor(sy / s) * s - sy;
      const i0 = Math.floor((f.x - R - ox) / s), i1 = Math.ceil((f.x + R - ox) / s);
      const j0 = Math.floor((f.y - R - oy) / s), j1 = Math.ceil((f.y + R - oy) / s);
      ctx.lineWidth = 1;
      ctx.lineCap = 'butt';
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = ox + i * s, y = oy + j * s;
          // segment to the right and segment downward from each intersection
          const hx = x + s / 2 - f.x, hy = y - f.y;
          const a1 = Math.exp(-(hx * hx + hy * hy) / (R * R) * 1.7) * pres * 0.3;
          if (a1 > 0.01) { ctx.strokeStyle = `rgba(130,170,255,${a1})`; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y); ctx.stroke(); }
          const vx = x - f.x, vy = y + s / 2 - f.y;
          const a2 = Math.exp(-(vx * vx + vy * vy) / (R * R) * 1.7) * pres * 0.3;
          if (a2 > 0.01) { ctx.strokeStyle = `rgba(130,170,255,${a2})`; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + s); ctx.stroke(); }
        }
      }
    }

    drawRails(ctx) {
      for (const link of this.links.values()) {
        const pts = this.route(link.a, link.b);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.setLineDash([3, 7]);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(150,178,255,0.3)';
        ctx.stroke();
        ctx.setLineDash([]);
        if (link.heat > 0) {
          ctx.lineWidth = 1.8;
          ctx.strokeStyle = `hsla(${link.hue},90%,68%,${link.heat * 0.6})`;
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(160,190,255,0.7)';
        for (const p of [pts[0], pts[pts.length - 1]]) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, 6.2832); ctx.fill(); }
      }
    }

    drawCells(ctx, s, sx, sy) {
      const L = s * 0.26, inset = 2.5;
      ctx.lineCap = 'square';
      ctx.lineWidth = 1.5;
      for (const cell of this.lit.values()) {
        const x = cell.c * s - sx, y = cell.r * s - sy;
        if (x < -s || y < -s || x > this.w || y > this.h) continue;
        const e = smooth(clamp(cell.v, 0, 1));
        if (e < 0.02) continue;
        const hue = cell.hue == null ? this.hueAt(cell.c, cell.r) : cell.hue;
        ctx.fillStyle = `hsla(${hue},95%,65%,${e * 0.07})`;
        ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
        ctx.strokeStyle = `hsla(${hue},95%,72%,${e * 0.95})`;
        const x0 = x + inset, y0 = y + inset, x1 = x + s - inset, y1 = y + s - inset;
        ctx.beginPath();
        ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
        ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
        ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
        ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
        ctx.stroke();
        if (e > 0.45) {
          const mx = x + s / 2, my = y + s / 2, k = 3 + e * 2;
          ctx.strokeStyle = `hsla(${hue},95%,80%,${e * 0.55})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(mx - k, my); ctx.lineTo(mx + k, my);
          ctx.moveTo(mx, my - k); ctx.lineTo(mx, my + k);
          ctx.stroke();
          ctx.lineWidth = 1.5;
        }
      }
    }

    drawPackets(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const p of this.packets) {
        if (!p.path) continue;
        const trail = 150, step = 5;
        const from = Math.max(0, p.d - trail);
        let prev = this.pointAt(p.path, from);
        for (let d = from + step; d <= Math.min(p.d, p.path.len) + step; d += step) {
          const cur = this.pointAt(p.path, Math.min(d, p.path.len));
          const t = clamp((d - from) / trail, 0, 1);
          ctx.strokeStyle = `hsla(${p.hue},95%,70%,${t * t * 0.9})`;
          ctx.lineWidth = 1 + t * 2.6;
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(cur.x, cur.y); ctx.stroke();
          prev = cur;
        }
        const head = this.pointAt(p.path, p.d);
        const g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 22);
        g.addColorStop(0, `hsla(${p.hue},100%,92%,.95)`);
        g.addColorStop(0.25, `hsla(${p.hue},100%,70%,.55)`);
        g.addColorStop(1, `hsla(${p.hue},100%,60%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(head.x, head.y, 22, 0, 6.2832); ctx.fill();
      }
      ctx.restore();
    }

    drawSparks(ctx, sx, sy) {
      if (!this.sparks.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.6;
      for (const sp of this.sparks) {
        const t = 1 - sp.age / sp.life;
        const x = sp.x - sx, y = sp.y - sy, len = 0.05;
        ctx.strokeStyle = `hsla(${sp.hue},95%,75%,${t})`;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - sp.vx * len, y - sp.vy * len); ctx.stroke();
      }
      ctx.restore();
    }
  }

  global.SignalGrid = SignalGrid;
})(window);
