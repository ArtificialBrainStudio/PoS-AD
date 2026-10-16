(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.append(e);
    return e;
  };
  const txt = (parent, x, y, s, attrs = {}) => { const t = el('text', {x, y, ...attrs}, parent); t.textContent = s; return t; };

  const MODELS = [
    {key: 'ae', name: 'AE', color: '--s-ae'},
    {key: 'vae', name: 'SD-VAE', color: '--s-vae'},
    {key: 'pp', name: 'AE-PP', color: '--s-pp'},
    {key: 'pos', name: 'AE-PoS', color: '--s-pos'},
  ];

  // ---------- math ----------
  function renderMath() {
    if (!window.renderMathInElement) return;
    renderMathInElement(document.body, {
      delimiters: [{left: '\\[', right: '\\]', display: true}, {left: '\\(', right: '\\)', display: false}],
      throwOnError: false,
    });
  }

  // ---------- tooltip ----------
  const tip = $('.tooltip');
  function showTip(html, evt) {
    tip.innerHTML = html;
    tip.hidden = false;
    const pad = 14, r = tip.getBoundingClientRect();
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - pad;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  }
  const hideTip = () => { tip.hidden = true; };
  const key = (c) => `<span class="k" style="background:${c}"></span>`;

  // draw a chart into `host` at its current width and redraw on resize
  function responsive(host, draw) {
    let last = 0;
    const run = () => {
      const w = Math.round(host.clientWidth);
      if (!w || w === last) return;
      last = w;
      host.replaceChildren();
      draw(w);
    };
    new ResizeObserver(run).observe(host);
    run();
    return () => { last = 0; run(); };
  }

  // grow marks once when first scrolled into view
  function onFirstView(node, fn) {
    if (reduceMotion || !('IntersectionObserver' in window)) return fn(true);
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(false); }
    }, {threshold: 0.3});
    io.observe(node);
  }

  const niceTicks = (lo, hi, n = 4) => {
    const span = hi - lo, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  };

  // ---------- baseline comparison (horizontal bars) ----------
  const BENCH = {
    cifar10: {
      max: 80, unit: 'AUC-ROC (%)', digits: 1,
      note: 'Average over the ten CIFAR-10 nominal classes. Baseline numbers are as published. Ours are means over 10 seeds.',
      rows: [['OCGAN', 65.6], ['VAE', 58.3], ['DSVDD', 64.8], ['DSEBM', 60.4], ['DAGMM', 54.4], ['IF', 55.5],
        ['AnoGAN', 61.8], ['ALAD', 59.3], ['MEMAE', 58.5], ['MEMGAN', 65.3], ['TOLL', 69.6],
        ['AE-PP (ours)', 71.30, true], ['AE-PoS (ours)', 71.73, true]],
    },
    arrhythmia: {
      max: 80, unit: 'F1 (%)', digits: 2,
      note: 'Arrhythmia (ODDS). Baseline numbers are as published. Ours are mean ± std over 10 seeds: AE-PP 67.69 ± 5.75, AE-PoS 70.77 ± 5.75.',
      rows: [['IF', 53.03], ['OC-SVM', 45.18], ['DSEBM-e', 46.01], ['AnoGAN', 42.42], ['DAGMM', 49.83], ['ALAD', 51.52],
        ['RCGAN', 54.14], ['DSVDD', 34.79], ['GOAD', 52.00], ['MEMAE', 51.13], ['MEMGAN', 55.72], ['TOLL', 60.00],
        ['AE-PP (ours)', 67.69, true], ['AE-PoS (ours)', 70.77, true]],
    },
  };

  function baselineChart() {
    const card = $('#baseline-chart');
    if (!card) return;
    const host = $('[data-chart]', card), note = $('[data-note]', card);
    let bench = 'cifar10', animate = true, first = true;
    const redraw = responsive(host, (W) => {
      const b = BENCH[bench];
      const rows = [...b.rows].sort((a, c) => c[1] - a[1]);
      const rowH = 28, bar = 18, top = 6, bottom = 30;
      const L = W < 480 ? 104 : 124, R = 52;
      const H = top + rows.length * rowH + bottom;
      const x = (v) => L + (W - L - R) * (v / b.max);
      const svg = el('svg', {viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img',
        'aria-label': `${b.unit}: ` + rows.map((r) => `${r[0]} ${r[1]}`).join(', ')}, host);
      const g = el('g', {class: 'grid'}, svg);
      for (const t of niceTicks(0, b.max, W < 480 ? 4 : 8)) {
        el('line', {x1: x(t), x2: x(t), y1: top, y2: H - bottom + 4}, g);
        txt(svg, x(t), H - bottom + 20, t, {'text-anchor': 'middle', class: 'tick-label'});
      }
      el('line', {x1: L, x2: L, y1: top, y2: H - bottom + 4, class: 'baseline'}, svg);
      const ours = css('--ours'), ctx = css('--context');
      const bars = [];
      rows.forEach(([name, v, mine], i) => {
        const cy = top + i * rowH + rowH / 2;
        txt(svg, L - 10, cy + 4, name, {'text-anchor': 'end', class: 'cat-label', 'font-weight': mine ? 650 : 400});
        const w = x(v) - L;
        const p = el('path', {d: hbar(L, cy - bar / 2, animate ? 0.01 : w, bar), fill: mine ? ours : ctx, class: 'bar'}, svg);
        bars.push([p, cy - bar / 2, w]);
        const lab = txt(svg, x(v) + 6, cy + 4, v.toFixed(b.digits), {class: 'value-label'});
        if (!mine) lab.setAttribute('font-weight', 450);
        const hit = el('rect', {x: 0, y: cy - rowH / 2, width: W, height: rowH, class: 'hit'}, svg);
        hit.addEventListener('pointermove', (e) => showTip(`${key(mine ? ours : ctx)}<b>${name}</b><br>${b.unit}: ${v.toFixed(b.digits)}`, e));
        hit.addEventListener('pointerleave', hideTip);
      });
      if (animate) {
        animate = false;
        const go = (instant) => tween(instant ? 0 : 900, (u) => {
          for (const [p, y, w] of bars) p.setAttribute('d', hbar(L, y, Math.max(0.01, w * u), bar));
        });
        if (first) { first = false; onFirstView(svg, go); } else go(reduceMotion);
      }
      note.textContent = b.note;
    });
    $$('[data-bench]', card).forEach((btn) => btn.addEventListener('click', () => {
      bench = btn.dataset.bench;
      $$('[data-bench]', card).forEach((b) => b.setAttribute('aria-selected', b === btn));
      animate = !reduceMotion;
      redraw();
    }));
  }
  // horizontal bar: square at baseline, 4px rounded data end
  function hbar(x, y, w, h) {
    const r = Math.min(4, w, h / 2);
    return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  }
  // vertical bar: square at baseline, 4px rounded top
  function vbar(x, y0, w, h) {
    const r = Math.min(4, h, w / 2), y = y0 - h;
    return `M${x},${y0}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y0}Z`;
  }
  function tween(ms, step) {
    if (!ms) return step(1);
    const t0 = performance.now(), ease = (u) => 1 - Math.pow(1 - u, 3);
    const f = (t) => { const u = Math.min(1, (t - t0) / ms); step(ease(u)); if (u < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }

  // ---------- alpha sensitivity (small multiples) ----------
  const ALPHA = [
    {name: 'Arrhythmia', metric: 'F1', ae: 60.77, sel: 3,
      m: [63.08, 63.08, 65.38, 67.69, 67.69, 67.69, 67.69], s: [3.24, 3.24, 4.05, 6.07, 6.07, 6.07, 6.07]},
    {name: 'MNIST', metric: 'AUC-ROC', ae: 94.74, sel: 3,
      m: [98.54, 99.04, 99.37, 99.38, 99.32, 99.28, 99.26], s: [1.38, 0.77, 0.44, 0.42, 0.45, 0.48, 0.50]},
    {name: 'Fashion-MNIST', metric: 'AUC-ROC', ae: 91.60, sel: 3,
      m: [93.75, 94.12, 94.74, 94.83, 94.74, 94.67, 94.69], s: [4.60, 4.43, 4.02, 3.97, 3.99, 3.94, 3.95]},
    {name: 'CIFAR-10', metric: 'AUC-ROC', ae: 68.96, sel: 2,
      m: [69.32, 69.48, 71.30, 71.16, 71.05, 71.23, 71.29], s: [7.36, 7.13, 6.73, 6.81, 6.78, 6.97, 7.06]},
    {name: 'CIFAR-100', metric: 'AUC-ROC', ae: 65.42, sel: 2,
      m: [66.78, 67.18, 68.56, 68.45, 68.59, 68.69, 68.57], s: [9.26, 9.17, 8.91, 8.98, 8.69, 8.53, 8.72]},
  ];

  function alphaChart() {
    const wrap = $('#alpha-chart [data-chart]');
    if (!wrap) return;
    const ours = css('--ours');
    for (const d of ALPHA) {
      const box = document.createElement('div');
      box.className = 'multiple';
      box.innerHTML = `<h4>${d.name}</h4><p>${d.metric} (%) vs α</p>`;
      const host = document.createElement('div');
      box.append(host);
      wrap.append(box);
      responsive(host, (W) => {
        const H = 150, L = 34, R = 10, T = 12, B = 26;
        const lo0 = Math.min(d.ae, ...d.m), hi0 = Math.max(...d.m);
        const pad = (hi0 - lo0) * 0.12;
        const ticks = niceTicks(lo0 - pad, hi0 + pad, 3);
        const lo = Math.min(ticks[0], lo0 - pad), hi = Math.max(ticks[ticks.length - 1], hi0 + pad);
        const x = (i) => L + (W - L - R) * (i / 6);
        const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
        const svg = el('svg', {viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img',
          'aria-label': `${d.name}: ` + d.m.map((v, i) => `alpha ${i} ${v}`).join(', ') + `; AE ${d.ae}`}, host);
        const g = el('g', {class: 'grid'}, svg);
        for (const t of ticks) {
          el('line', {x1: L, x2: W - R, y1: y(t), y2: y(t)}, g);
          txt(svg, L - 6, y(t) + 4, t, {'text-anchor': 'end', class: 'tick-label', 'font-size': 11});
        }
        for (let i = 0; i <= 6; i += 1) txt(svg, x(i), H - 8, i, {'text-anchor': 'middle', class: 'tick-label', 'font-size': 11});
        el('line', {x1: L, x2: W - R, y1: y(d.ae), y2: y(d.ae), stroke: css('--faint'), 'stroke-width': 1.5}, svg);
        txt(svg, W - R, y(d.ae) - 5, 'AE', {'text-anchor': 'end', 'font-size': 11});
        const pts = d.m.map((v, i) => `${x(i)},${y(v)}`).join(' ');
        el('polyline', {points: pts, fill: 'none', stroke: ours, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'}, svg);
        const cross = el('line', {y1: T, y2: H - B, stroke: css('--axis'), 'stroke-width': 1, visibility: 'hidden'}, svg);
        d.m.forEach((v, i) => {
          const sel = i === d.sel;
          el('circle', {cx: x(i), cy: y(v), r: sel ? 6 : 4, fill: sel ? '#fff' : ours, stroke: sel ? ours : '#fff', 'stroke-width': sel ? 2.5 : 2}, svg);
        });
        const step = (W - L - R) / 6;
        d.m.forEach((v, i) => {
          const hit = el('rect', {x: x(i) - step / 2, y: 0, width: step, height: H, class: 'hit'}, svg);
          hit.addEventListener('pointermove', (e) => {
            cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
            showTip(`<b>${d.name}</b> · α = ${i}${i === d.sel ? ' (selected)' : ''}<br>${key(ours)}AE-PP ${v.toFixed(2)} ± ${d.s[i].toFixed(2)}<br>AE baseline ${d.ae.toFixed(2)}`, e);
          });
          hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); hideTip(); });
        });
      });
    }
    const table = $('[data-alpha-table]');
    if (table) {
      table.innerHTML = `<thead><tr><th>Dataset</th><th>AE</th>${[0, 1, 2, 3, 4, 5, 6].map((a) => `<th>α=${a}</th>`).join('')}</tr></thead><tbody>` +
        ALPHA.map((d) => `<tr><td>${d.name} (${d.metric})</td><td>${d.ae.toFixed(2)}</td>${d.m.map((v, i) =>
          `<td>${i === d.sel ? '<strong>' : ''}${v.toFixed(2)} ± ${d.s[i].toFixed(2)}${i === d.sel ? '</strong>' : ''}</td>`).join('')}</tr>`).join('') + '</tbody>';
    }
  }

  // ---------- degradation families (grouped columns) ----------
  const FAMILIES = [
    {name: 'Additive noise', n: 1, roc: [1.000, 0.998, 1.000, 1.000], pr: [1.000, 0.998, 1.000, 1.000]},
    {name: 'Blur', n: 7, roc: [0.568, 0.133, 0.889, 0.903], pr: [0.536, 0.334, 0.881, 0.896]},
    {name: 'Rain', n: 5, roc: [0.440, 0.791, 0.946, 0.958], pr: [0.462, 0.687, 0.931, 0.938]},
    {name: 'Underwater', n: 3, roc: [0.295, 0.449, 0.967, 0.985], pr: [0.378, 0.439, 0.962, 0.981]},
    {name: 'Overall', n: 16, roc: [0.504, 0.452, 0.929, 0.941], pr: [0.512, 0.506, 0.919, 0.932]},
  ];

  function familyChart() {
    const card = $('#family-chart');
    if (!card) return;
    const host = $('[data-chart]', card);
    const colors = MODELS.map((m) => css(m.color));
    $('[data-legend]', card).innerHTML = MODELS.map((m, i) => `<li><span class="sw" style="--c:${colors[i]}"></span>${m.name}</li>`).join('');
    let metric = 'roc', animate = true, first = true;
    const redraw = responsive(host, (W) => {
      const H = W < 520 ? 270 : 320, L = 38, R = 8, T = 22, B = 46;
      const y = (v) => T + (H - T - B) * (1 - v);
      const svg = el('svg', {viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img',
        'aria-label': FAMILIES.map((f) => `${f.name}: ` + MODELS.map((m, i) => `${m.name} ${f[metric][i]}`).join(', ')).join('; ')}, host);
      const g = el('g', {class: 'grid'}, svg);
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        if (t !== 0.5) el('line', {x1: L, x2: W - R, y1: y(t), y2: y(t)}, g);
        txt(svg, L - 7, y(t) + 4, t.toFixed(2), {'text-anchor': 'end', class: 'tick-label'});
      }
      el('line', {x1: L, x2: W - R, y1: y(0.5), y2: y(0.5), class: 'chance'}, svg);
      if (W >= 640) txt(svg, W - R, y(0.5) - 5, 'chance', {'text-anchor': 'end', 'font-size': 11});
      el('line', {x1: L, x2: W - R, y1: y(0), y2: y(0), class: 'baseline'}, svg);
      const band = (W - L - R) / FAMILIES.length;
      const gap = 2, bw = Math.min(24, (band * 0.72 - gap * 3) / 4);
      const groupW = bw * 4 + gap * 3;
      const bars = [];
      FAMILIES.forEach((f, gi) => {
        const gx = L + band * gi + (band - groupW) / 2;
        const grp = el('g', {}, svg);
        const label = W < 520 ? f.name.replace('Additive noise', 'Noise').replace('Underwater', 'Underw.') : f.name;
        txt(svg, L + band * gi + band / 2, H - B + 18, label, {'text-anchor': 'middle', class: 'cat-label', 'font-size': W < 520 ? 11.5 : 13});
        txt(svg, L + band * gi + band / 2, H - B + 34, `(${f.n})`, {'text-anchor': 'middle', 'font-size': 11});
        f[metric].forEach((v, mi) => {
          const bx = gx + mi * (bw + gap), h = y(0) - y(v);
          const p = el('path', {d: vbar(bx, y(0), bw, animate ? 0.01 : h), fill: colors[mi], class: 'bar'}, grp);
          bars.push([p, bx, h]);
          if (mi === 3 && bw >= 14) txt(grp, bx + bw / 2, y(v) - 6, v.toFixed(3), {'text-anchor': 'middle', class: 'value-label', 'font-size': 11.5});
        });
        const hit = el('rect', {x: L + band * gi, y: T - 10, width: band, height: H - T - B + 10, class: 'hit'}, svg);
        hit.addEventListener('pointermove', (e) => {
          svg.classList.add('dim');
          $$('.bar', grp).forEach((b) => b.classList.add('hot'));
          showTip(`<b>${f.name}</b> · ${f.n} setting${f.n > 1 ? 's' : ''} · ${metric === 'roc' ? 'ROC-AUC' : 'PR-AUC'}<br>` +
            MODELS.map((m, i) => `${key(colors[i])}${m.name} ${f[metric][i].toFixed(3)}`).join('<br>'), e);
        });
        hit.addEventListener('pointerleave', () => {
          svg.classList.remove('dim');
          $$('.bar', grp).forEach((b) => b.classList.remove('hot'));
          hideTip();
        });
      });
      if (animate) {
        animate = false;
        const go = (instant) => tween(instant ? 0 : 900, (u) => {
          for (const [p, bx, h] of bars) p.setAttribute('d', vbar(bx, y(0), bw, Math.max(0.01, h * u)));
        });
        if (first) { first = false; onFirstView(svg, go); } else go(reduceMotion);
      }
    });
    $$('[data-metric]', card).forEach((btn) => btn.addEventListener('click', () => {
      metric = btn.dataset.metric;
      $$('[data-metric]', card).forEach((b) => b.setAttribute('aria-selected', b === btn));
      animate = !reduceMotion;
      redraw();
    }));
    const table = $('[data-family-table]');
    if (table) {
      table.innerHTML = `<thead><tr><th>Family</th>${MODELS.map((m) => `<th>${m.name} ROC</th><th>${m.name} PR</th>`).join('')}</tr></thead><tbody>` +
        FAMILIES.map((f) => `<tr><td>${f.name} (${f.n})</td>${MODELS.map((m, i) => {
          const bR = f.roc[i] === Math.max(...f.roc), bP = f.pr[i] === Math.max(...f.pr);
          return `<td>${bR ? '<strong>' : ''}${f.roc[i].toFixed(3)}${bR ? '</strong>' : ''}</td><td>${bP ? '<strong>' : ''}${f.pr[i].toFixed(3)}${bP ? '</strong>' : ''}</td>`;
        }).join('')}</tr>`).join('') + '</tbody>';
    }
  }

  // ---------- blur ramp ----------
  const BLUR = {
    levels: ['0.2', '0.4', '0.6', '0.8', '1.0'], files: ['b02', 'b04', 'b06', 'b08', 'b10'],
    psnr: {ae: [61.8, 62.3, 62.4, 62.0, 62.8], vae: [29.2, 31.1, 33.2, 35.7, 37.3], aepos: [43.5, 41.7, 37.8, 33.1, 31.1]},
    clean: {ae: 62.4, vae: 27.6, aepos: 43.9},
  };
  const IMG_MODELS = [
    {key: 'ae', name: 'AE', color: '--s-ae'},
    {key: 'vae', name: 'SD-VAE', color: '--s-vae'},
    {key: 'aepos', name: 'AE-PoS', color: '--s-pos'},
  ];

  function blurDemo() {
    const root = $('#blur-demo');
    if (!root) return;
    const range = $('#blur-range', root), out = $('#blur-out', root);
    let idx = 0, view = 'res';
    const img = (role) => $(`img[data-role="${role}"]`, root);
    for (const f of BLUR.files) {
      for (const p of [`blur_in_${f}`, ...IMG_MODELS.flatMap((m) => [`blur_out_${f}_${m.key}`, `blur_res_${f}_${m.key}`])]) {
        const i = new Image(); i.src = `assets/img/${p}.webp`;
      }
    }
    let setChartSel = () => {};
    const update = () => {
      const f = BLUR.files[idx], lv = BLUR.levels[idx];
      out.textContent = lv;
      range.value = idx;
      range.setAttribute('aria-valuetext', lv);
      img('in').src = `assets/img/blur_in_${f}.webp`;
      img('in').alt = `REDS input at blur strength ${lv}`;
      for (const m of IMG_MODELS) {
        const im = img(m.key);
        im.src = `assets/img/blur_${view}_${f}_${m.key}.webp`;
        im.alt = `${m.name} ${view === 'out' ? 'reconstruction' : 'absolute residual'} at blur ${lv}`;
        $(`[data-psnr="${m.key}"]`, root).textContent = `${BLUR.psnr[m.key][idx].toFixed(1)} dB`;
      }
      setChartSel(idx + 1);
    };
    range.addEventListener('input', () => { idx = +range.value; update(); });
    $$('[data-view]', root).forEach((b) => b.addEventListener('click', () => {
      view = b.dataset.view;
      $$('[data-view]', root).forEach((x) => x.setAttribute('aria-pressed', x === b));
      update();
    }));

    const host = $('.psnr-chart', root);
    const xs = ['clean', ...BLUR.levels];
    let sel = 1;
    responsive(host, (W) => {
      const H = 210, L = 40, R = W < 480 ? 62 : 74, T = 24, B = 30;
      const lo = 20, hi = 70;
      const x = (i) => L + (W - L - R) * (i / (xs.length - 1));
      const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
      const series = IMG_MODELS.map((m) => ({...m, c: css(m.color), v: [BLUR.clean[m.key], ...BLUR.psnr[m.key]]}));
      const svg = el('svg', {viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img',
        'aria-label': series.map((s) => `${s.name}: ` + s.v.map((v, i) => `${xs[i]} ${v} dB`).join(', ')).join('; ')}, host);
      const selBand = el('rect', {y: T, height: H - T - B, width: 0, fill: css('--blue-soft')}, svg);
      const g = el('g', {class: 'grid'}, svg);
      for (const t of [20, 30, 40, 50, 60, 70]) {
        el('line', {x1: L, x2: W - R, y1: y(t), y2: y(t)}, g);
        txt(svg, L - 7, y(t) + 4, t, {'text-anchor': 'end', class: 'tick-label'});
      }
      txt(svg, L - 7, 11, 'dB', {'text-anchor': 'end', 'font-size': 11});
      xs.forEach((s, i) => txt(svg, x(i), H - 9, s, {'text-anchor': 'middle', class: 'tick-label', 'font-size': 11.5}));
      for (const s of series) {
        el('polyline', {points: s.v.map((v, i) => `${x(i)},${y(v)}`).join(' '), fill: 'none', stroke: s.c, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'}, svg);
        s.v.forEach((v, i) => el('circle', {cx: x(i), cy: y(v), r: 4, fill: s.c, stroke: '#fff', 'stroke-width': 2}, svg));
        const lastY = y(s.v[s.v.length - 1]);
        el('circle', {cx: W - R + 10, cy: lastY, r: 3.5, fill: s.c}, svg);
        txt(svg, W - R + 17, lastY + 4, s.name, {class: 'cat-label', 'font-size': 12});
      }
      const step = (W - L - R) / (xs.length - 1);
      setChartSel = (i) => {
        sel = i;
        selBand.setAttribute('x', x(i) - step / 2 + 4);
        selBand.setAttribute('width', step - 8);
      };
      setChartSel(sel);
      xs.forEach((s, i) => {
        const hit = el('rect', {x: x(i) - step / 2, y: 0, width: step, height: H, class: 'hit', style: i ? 'cursor:pointer' : ''}, svg);
        hit.addEventListener('pointermove', (e) => showTip(`<b>${i ? `Blur ${s}` : 'Clean image'}</b><br>` +
          series.map((q) => `${key(q.c)}${q.name} ${q.v[i].toFixed(1)} dB`).join('<br>') + (i ? '' : '<br><small>no image panel for clean</small>'), e));
        hit.addEventListener('pointerleave', hideTip);
        if (i) hit.addEventListener('click', () => { idx = i - 1; update(); });
      });
    });
    update();
  }

  // ---------- example viewer ----------
  const EXAMPLES = [
    {label: 'Kodak24 · clean', kind: 'nominal', input: 'row1_s', out: (m) => `row1_out_${m}`, res: (m) => `row1_res_${m}`,
      psnr: {ae: 58.3, vae: 23.6, aepos: 46.0},
      caption: 'Nominal Kodak24 image. AE copies it almost exactly. SD-VAE loses substantial detail. AE-PoS keeps the content at high fidelity.'},
    {label: 'GoPro · clean', kind: 'nominal', input: 'row2_s', out: (m) => `row2_out_${m}`, res: (m) => `row2_res_${m}`,
      psnr: {ae: 63.3, vae: 31.1, aepos: 37.8},
      caption: 'Nominal GoPro frame, the clean counterpart of the next example.'},
    {label: 'GoPro · motion blur', kind: 'degraded', input: 'row3_s', out: (m) => `row3_out_${m}`, res: (m) => `row3_res_${m}`,
      psnr: {ae: 63.7, vae: 40.1, aepos: 27.5},
      caption: 'The same frame with real motion blur. SD-VAE represents it better than the clean frame (40.1 vs 31.1 dB). AE-PoS rejects the blur and exposes it in the residual.'},
    {label: 'Test2800 · rain', kind: 'degraded', input: 'row4_s', out: (m) => `row4_out_${m}`, res: (m) => `row4_res_${m}`,
      psnr: {ae: 61.7, vae: 29.0, aepos: 25.1},
      caption: 'Rain streaks, never seen in training. AE-PoS excludes them from its target set, so the streaks stand out in the residual.'},
    {label: 'Underwater · low', kind: 'degraded', input: 'uw_low_input', out: (m) => `uw_low_out_${m}`, res: (m) => `uw_low_res_${m}_shared`,
      psnr: {ae: 61.8, vae: 31.4, aepos: 29.7},
      caption: 'LSUI underwater image, low-degradation group. Underwater degradation is absent from training.'},
    {label: 'Underwater · medium', kind: 'degraded', input: 'uw_med_input', out: (m) => `uw_med_out_${m}`, res: (m) => `uw_med_res_${m}_shared`,
      psnr: {ae: 59.8, vae: 24.7, aepos: 26.8},
      caption: 'LSUI underwater image, medium-degradation group.'},
    {label: 'Underwater · high', kind: 'degraded', input: 'uw_high_input', out: (m) => `uw_high_out_${m}`, res: (m) => `uw_high_res_${m}_shared`,
      psnr: {ae: 60.6, vae: 33.3, aepos: 24.1},
      caption: 'LSUI underwater image, high-degradation group. AE-PoS gives the lowest PSNR, which is the strongest anomaly signal.'},
  ];

  function exampleViewer() {
    const root = $('#example-viewer');
    if (!root) return;
    let idx = 0;
    EXAMPLES.forEach((ex, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'thumb';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', i === 0);
      b.innerHTML = `<img src="assets/img/${ex.input}.webp" alt="" loading="lazy"><span>${ex.label.replace(' · ', '<br>')}</span>`;
      b.addEventListener('click', () => { idx = i; update(); });
      $(`[data-group="${ex.kind}"] .picker-items`, root).append(b);
    });
    const thumbs = $$('.thumb', root);
    const update = () => {
      const ex = EXAMPLES[idx];
      thumbs.forEach((b, i) => b.setAttribute('aria-selected', i === idx));
      const inp = $('img[data-role="in"]', root);
      inp.src = `assets/img/${ex.input}.webp`;
      inp.alt = `${ex.label} input`;
      $('[data-title]', root).textContent = `Input · ${ex.label}`;
      $('[data-kind]', root).textContent = ex.kind;
      // nominal: the most faithful model wins; degraded: the model that rejects the degradation most
      const vals = IMG_MODELS.map((m) => ex.psnr[m.key]);
      const best = ex.kind === 'nominal' ? Math.max(...vals) : Math.min(...vals);
      for (const m of IMG_MODELS) {
        const out = $(`img[data-role="out-${m.key}"]`, root), res = $(`img[data-role="res-${m.key}"]`, root);
        out.src = `assets/img/${ex.out(m.key)}.webp`;
        out.alt = `${m.name} reconstruction of ${ex.label}`;
        res.src = `assets/img/${ex.res(m.key)}.webp`;
        res.alt = `${m.name} absolute residual for ${ex.label}`;
        const tag = $(`[data-psnr="${m.key}"]`, root);
        tag.textContent = `${ex.psnr[m.key].toFixed(1)} dB`;
        tag.classList.toggle('best', ex.psnr[m.key] === best);
      }
      const goal = $('[data-goal]', root);
      goal.classList.toggle('reject', ex.kind !== 'nominal');
      goal.textContent = ex.kind === 'nominal'
        ? 'Clean input: a good model keeps the detail (high PSNR, dark residual).'
        : 'Degraded input: a good detector refuses to reproduce it (low PSNR, bright residual).';
      $('[data-caption]', root).textContent = `${ex.caption} All residuals share one intensity gain.`;
    };
    update();
  }

  // ---------- stepper ----------
  function stepper() {
    for (const root of $$('[data-stepper]')) {
      const beats = $$('.beat', root), img = $('.stepper-img', root);
      for (const b of beats) { const i = new Image(); i.src = b.dataset.img; }
      const go = (i) => {
        beats.forEach((b, j) => b.setAttribute('aria-pressed', i === j));
        const b = beats[i];
        if (img.getAttribute('src') === b.dataset.img) return;
        img.classList.add('fade');
        setTimeout(() => { img.src = b.dataset.img; img.alt = b.dataset.alt; img.classList.remove('fade'); }, reduceMotion ? 0 : 160);
      };
      img.alt = beats[0].dataset.alt;
      beats.forEach((b, i) => {
        b.addEventListener('click', () => go(i));
        b.addEventListener('keydown', (e) => {
          const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          const n = (i + d + beats.length) % beats.length;
          beats[n].focus(); go(n);
        });
      });
    }
  }

  // ---------- lightbox ----------
  function lightbox() {
    const dlg = $('#figure-viewer');
    if (!dlg || !dlg.showModal) return;
    const im = $('img', dlg);
    const open = (src, alt) => { im.src = src; im.alt = alt || ''; dlg.showModal(); };
    $$('[data-lightbox]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      open(a.getAttribute('href'), $('img', a)?.alt);
    }));
    document.addEventListener('click', (e) => {
      const t = e.target.closest('.tile img');
      if (t) open(t.currentSrc || t.src, t.alt);
    });
    $('.close-viewer', dlg).addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }

  // ---------- copy ----------
  function copyButtons() {
    $$('.copy').forEach((b) => b.addEventListener('click', async () => {
      const text = $(b.dataset.copy).innerText;
      try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; }
      catch { b.textContent = 'Select & copy'; }
      setTimeout(() => { b.textContent = 'Copy'; }, 1600);
    }));
  }

  // ---------- nav highlight ----------
  function navSpy() {
    const links = $$('.nav-links a');
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting && map.has(e.target.id)) {
        links.forEach((a) => a.classList.remove('active'));
        map.get(e.target.id).classList.add('active');
      }
    }, {rootMargin: '-40% 0px -55% 0px'});
    for (const id of map.keys()) { const s = document.getElementById(id); if (s) io.observe(s); }
  }

  function init() {
    renderMath();
    lightbox();
    stepper();
    baselineChart();
    alphaChart();
    familyChart();
    blurDemo();
    exampleViewer();
    copyButtons();
    navSpy();
    addEventListener('scroll', hideTip, {passive: true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
