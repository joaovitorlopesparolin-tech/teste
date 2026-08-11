/* ============================================================
   Mini-biblioteca de gráficos SVG — Jaques Motorsport
   Segue o método de dataviz: paleta validada (CVD-safe contra a
   superfície #121214), marcas finas, gap de 2px entre barras,
   grid recessivo, legendas para ≥2 séries, tooltips que nunca são
   o único caminho até o valor (toda carta tem visão em tabela).
   ============================================================ */
'use strict';

const Charts = {
  /* Paleta validada (scripts/validate_palette.js — modo dark, superfície #121214) */
  C: {
    blue: '#3987e5',    // slot 1 — série principal / entradas / a receber
    orange: '#d95926',  // slot 2 — série secundária (serviços)
    red: '#e66767',     // slot 3 — saídas / a pagar (par azul↔vermelho validado)
    ramp: ['#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'], // ordinal (funil)
    grid: '#232328', axis: '#3a3a40',
    ink: '#ededea', ink2: '#9a9aa1', muted: '#67676e', surface: '#121214'
  },

  money(v) { return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
  short(v) {
    const a = Math.abs(v);
    const f = (x, d) => x.toLocaleString('pt-BR', { maximumFractionDigits: d });
    if (a >= 1e6) return f(v / 1e6, 1) + ' mi';
    if (a >= 1e3) return f(v / 1e3, a >= 1e4 ? 0 : 1) + ' mil';
    return f(v, 0);
  },

  /* Ticks "redondos" do eixo Y: 0 → teto, ~4 divisões */
  ticks(min, max) {
    if (max <= 0 && min >= 0) max = 1;
    const span = Math.max(max, 0) - Math.min(min, 0);
    const raw = span / 4;
    const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * pow).find(s => s >= raw) || pow * 10;
    const lo = Math.min(0, Math.floor(min / step) * step);
    const hi = Math.max(step, Math.ceil(max / step) * step);
    const out = [];
    for (let v = lo; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
    return out;
  },

  /* Barra vertical com topo arredondado 4px (base quadrada) */
  barPath(x, y, w, h, up = true) {
    const r = Math.min(4, w / 2, h);
    if (h <= 0.5) return '';
    return up
      ? `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
      : `M${x},${y} V${y + h - r} Q${x},${y + h} ${x + r},${y + h} H${x + w - r} Q${x + w},${y + h} ${x + w},${y + h - r} V${y} Z`;
  },

  legend(series) {
    return `<div class="chart-legend">${series.map(s =>
      `<span><i style="background:${s.color};${s.line ? 'height:2.5px;width:16px;border-radius:2px' : ''}"></i>${this.escT(s.name)}</span>`).join('')}</div>`;
  },
  escT(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  tipEl(card) {
    let t = card.querySelector('.chart-tip');
    if (!t) { t = document.createElement('div'); t.className = 'chart-tip'; t.hidden = true; card.appendChild(t); }
    return t;
  },
  /* Tooltip com textContent (nomes de séries são dados, não HTML) */
  fillTip(tip, title, rows) {
    tip.textContent = '';
    const h = document.createElement('div'); h.className = 'tip-title'; h.textContent = title;
    tip.appendChild(h);
    for (const r of rows) {
      const row = document.createElement('div'); row.className = 'tip-row';
      const key = document.createElement('i'); key.style.background = r.color;
      const val = document.createElement('b'); val.textContent = r.value;
      const lab = document.createElement('span'); lab.textContent = r.name;
      row.append(key, val, lab);
      tip.appendChild(row);
    }
    tip.hidden = false;
  },
  moveTip(tip, card, ev) {
    const r = card.getBoundingClientRect();
    let x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 10;
    if (x + tip.offsetWidth > r.width - 8) x = ev.clientX - r.left - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > r.height - 8) y = r.height - tip.offsetHeight - 8;
    tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
  },

  /* ============ Colunas agrupadas (1–2 séries) ============ */
  columns(el, { labels, series, money = true, height = 240 }) {
    const C = this.C;
    if (!labels.length || series.every(s => s.values.every(v => !v))) {
      el.innerHTML = '<div class="empty">Sem dados no período</div>'; return;
    }
    const W = 760, padL = 52, padR = 10, padT = 12, padB = 26;
    const plotW = W - padL - padR, plotH = height - padT - padB;
    const max = Math.max(...series.flatMap(s => s.values), 0);
    const tks = this.ticks(0, max);
    const top = tks[tks.length - 1];
    const y = v => padT + plotH - (v / top) * plotH;
    const groupW = plotW / labels.length;
    const k = series.length;
    const barW = Math.min(24, (groupW * 0.62 - (k - 1) * 2) / k);
    const grpInner = k * barW + (k - 1) * 2;

    let svg = '';
    for (const t of tks) {
      svg += `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 0 ? C.axis : C.grid}" stroke-width="1"/>` +
        `<text x="${padL - 6}" y="${y(t) + 3.5}" text-anchor="end" class="tick">${money ? this.short(t) : t}</text>`;
    }
    const every = labels.length > 14 ? 2 : 1;
    labels.forEach((lb, i) => {
      const cx = padL + groupW * i + groupW / 2;
      if (i % every === 0) svg += `<text x="${cx}" y="${height - 8}" text-anchor="middle" class="tick">${this.escT(lb)}</text>`;
      series.forEach((s, si) => {
        const v = s.values[i] || 0;
        const bx = cx - grpInner / 2 + si * (barW + 2);
        svg += `<path d="${this.barPath(bx, y(v), barW, y(0) - y(v))}" fill="${s.color}" data-g="${i}"/>`;
      });
      svg += `<rect x="${padL + groupW * i}" y="${padT}" width="${groupW}" height="${plotH}" fill="transparent" data-hit="${i}" tabindex="0"/>`;
    });

    el.innerHTML = (series.length > 1 ? this.legend(series) : '') +
      `<svg viewBox="0 0 ${W} ${height}" class="chart-svg" role="img">${svg}</svg>`;

    const card = el.closest('.card') || el;
    const tip = this.tipEl(card);
    el.querySelectorAll('[data-hit]').forEach(hit => {
      const i = Number(hit.dataset.hit);
      const show = ev => {
        el.querySelectorAll('path[data-g]').forEach(p => p.style.opacity = Number(p.dataset.g) === i ? 1 : .45);
        this.fillTip(tip, labels[i], series.map(s => ({ color: s.color, name: s.name, value: money ? this.money(s.values[i] || 0) : String(s.values[i] || 0) })));
        if (ev.clientX !== undefined) this.moveTip(tip, card, ev);
      };
      hit.addEventListener('pointermove', show);
      hit.addEventListener('focus', e => { show(e); tip.style.left = '12px'; tip.style.top = '12px'; });
      hit.addEventListener('pointerleave', () => { tip.hidden = true; el.querySelectorAll('path[data-g]').forEach(p => p.style.opacity = 1); });
      hit.addEventListener('blur', () => { tip.hidden = true; el.querySelectorAll('path[data-g]').forEach(p => p.style.opacity = 1); });
    });
  },

  /* ============ Linha (série única, aceita negativos) ============ */
  line(el, { labels, series, money = true, height = 240 }) {
    const C = this.C;
    const s = series[0];
    if (!labels.length || s.values.every(v => !v)) {
      el.innerHTML = '<div class="empty">Sem dados no período</div>'; return;
    }
    const W = 760, padL = 56, padR = 66, padT = 14, padB = 26;
    const plotW = W - padL - padR, plotH = height - padT - padB;
    const min = Math.min(...s.values, 0), max = Math.max(...s.values, 0);
    const tks = this.ticks(min, max);
    const lo = tks[0], hi = tks[tks.length - 1];
    const y = v => padT + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
    const x = i => padL + (labels.length === 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);

    let svg = '';
    for (const t of tks) {
      svg += `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 0 ? C.axis : C.grid}" stroke-width="1"/>` +
        `<text x="${padL - 6}" y="${y(t) + 3.5}" text-anchor="end" class="tick">${money ? this.short(t) : t}</text>`;
    }
    const every = labels.length > 14 ? 2 : 1;
    labels.forEach((lb, i) => {
      if (i % every === 0) svg += `<text x="${x(i)}" y="${height - 8}" text-anchor="middle" class="tick">${this.escT(lb)}</text>`;
    });
    const path = s.values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
    svg += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const li = s.values.length - 1;
    // marcador final ≥8px com anel de 2px na cor da superfície + rótulo direto do último valor
    svg += `<circle cx="${x(li)}" cy="${y(s.values[li])}" r="6" fill="${s.color}" stroke="${C.surface}" stroke-width="2"/>` +
      `<text x="${x(li) + 10}" y="${y(s.values[li]) + 4}" class="endlabel">${money ? this.short(s.values[li]) : s.values[li]}</text>`;
    svg += `<line id="xh" x1="0" x2="0" y1="${padT}" y2="${padT + plotH}" stroke="${C.axis}" stroke-width="1" visibility="hidden"/>`;
    svg += `<rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="transparent" data-xhit tabindex="0"/>`;

    el.innerHTML = `<svg viewBox="0 0 ${W} ${height}" class="chart-svg" role="img">${svg}</svg>`;

    const card = el.closest('.card') || el;
    const tip = this.tipEl(card);
    const svgEl = el.querySelector('svg');
    const hair = svgEl.querySelector('#xh');
    const hit = svgEl.querySelector('[data-xhit]');
    const snap = ev => {
      const r = svgEl.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (W / r.width);
      let best = 0, bd = 1e9;
      labels.forEach((_, i) => { const d = Math.abs(x(i) - px); if (d < bd) { bd = d; best = i; } });
      hair.setAttribute('x1', x(best)); hair.setAttribute('x2', x(best));
      hair.setAttribute('visibility', 'visible');
      this.fillTip(tip, labels[best], [{ color: s.color, name: s.name, value: money ? this.money(s.values[best]) : String(s.values[best]) }]);
      this.moveTip(tip, card, ev);
    };
    hit.addEventListener('pointermove', snap);
    hit.addEventListener('pointerleave', () => { tip.hidden = true; hair.setAttribute('visibility', 'hidden'); });
    hit.addEventListener('focus', () => {
      this.fillTip(tip, labels[li], [{ color: s.color, name: s.name, value: money ? this.money(s.values[li]) : String(s.values[li]) }]);
      tip.style.left = '12px'; tip.style.top = '12px';
    });
    hit.addEventListener('blur', () => { tip.hidden = true; });
  },

  /* ============ Barras horizontais (série única ou ramp ordinal) ============ */
  hbar(el, { items, color, colors, money = true, count = false }) {
    const C = this.C;
    if (!items.length || items.every(i => !i.value)) {
      el.innerHTML = '<div class="empty">Sem dados no período</div>'; return;
    }
    const W = 760, labelW = 210, padR = 84, rowH = 30, barH = 16;
    const H = items.length * rowH + 8;
    const max = Math.max(...items.map(i => i.value));
    const plotW = W - labelW - padR;

    let svg = `<line x1="${labelW}" x2="${labelW}" y1="2" y2="${H - 2}" stroke="${C.axis}" stroke-width="1"/>`;
    items.forEach((it, i) => {
      const yy = 4 + i * rowH + (rowH - barH) / 2;
      const w = Math.max(1.5, (it.value / max) * plotW);
      const fill = colors ? colors[Math.min(i, colors.length - 1)] : (color || C.blue);
      svg += `<text x="${labelW - 8}" y="${yy + barH / 2 + 3.5}" text-anchor="end" class="cat">${this.escT(it.label)}</text>`;
      svg += `<path d="M${labelW},${yy} H${labelW + w - 4} Q${labelW + w},${yy} ${labelW + w},${yy + 4} V${yy + barH - 4} Q${labelW + w},${yy + barH} ${labelW + w - 4},${yy + barH} H${labelW} Z" fill="${fill}" data-i="${i}"/>`;
      svg += `<text x="${labelW + w + 7}" y="${yy + barH / 2 + 3.5}" class="endlabel">${count ? it.value : this.short(it.value)}</text>`;
      svg += `<rect x="0" y="${4 + i * rowH}" width="${W}" height="${rowH}" fill="transparent" data-hit="${i}" tabindex="0"/>`;
    });

    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img">${svg}</svg>`;

    const card = el.closest('.card') || el;
    const tip = this.tipEl(card);
    el.querySelectorAll('[data-hit]').forEach(hit => {
      const i = Number(hit.dataset.hit);
      const it = items[i];
      const fill = colors ? colors[Math.min(i, colors.length - 1)] : (color || C.blue);
      const rows = [{ color: fill, name: it.sub || '', value: count ? String(it.value) : this.money(it.value) }];
      const show = ev => {
        el.querySelectorAll('path[data-i]').forEach(p => p.style.opacity = Number(p.dataset.i) === i ? 1 : .45);
        this.fillTip(tip, it.label, rows);
        if (ev.clientX !== undefined) this.moveTip(tip, card, ev);
      };
      hit.addEventListener('pointermove', show);
      hit.addEventListener('pointerleave', () => { tip.hidden = true; el.querySelectorAll('path[data-i]').forEach(p => p.style.opacity = 1); });
      hit.addEventListener('focus', e => { show(e); tip.style.left = '12px'; tip.style.top = '12px'; });
      hit.addEventListener('blur', () => { tip.hidden = true; el.querySelectorAll('path[data-i]').forEach(p => p.style.opacity = 1); });
    });
  },

  /* ============ Card com título + alternância gráfico ⇄ tabela ============ */
  card(title, subtitle) {
    const id = 'ch' + Math.random().toString(36).slice(2, 8);
    return {
      id,
      html: `<div class="card chart-card" style="position:relative">
        <div class="chart-head">
          <div><h3>${this.escT(title)}</h3>${subtitle ? `<div class="small muted">${this.escT(subtitle)}</div>` : ''}</div>
          <button class="btn sm ghost" data-tbl="${id}" title="Ver dados em tabela">⊞ Tabela</button>
        </div>
        <div class="chart-body" id="${id}"></div>
        <div class="chart-table" id="${id}-t" hidden></div>
      </div>`
    };
  },
  /* Tabela-espelho (o caminho WCAG até cada valor) + botão de alternância */
  attachTable(id, cols, rows) {
    const body = document.getElementById(id);
    const tbl = document.getElementById(id + '-t');
    const btn = document.querySelector(`[data-tbl="${id}"]`);
    if (!body || !tbl || !btn) return;
    const table = document.createElement('table');
    const thead = document.createElement('thead'); const trh = document.createElement('tr');
    for (const c of cols) { const th = document.createElement('th'); th.textContent = c; trh.appendChild(th); }
    thead.appendChild(trh); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const r of rows) {
      const tr = document.createElement('tr');
      r.forEach((v, i) => { const td = document.createElement('td'); if (i > 0) td.className = 'num'; td.textContent = v; tr.appendChild(td); });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tbl.textContent = ''; tbl.appendChild(table);
    btn.onclick = () => {
      const showTbl = tbl.hidden;
      tbl.hidden = !showTbl; body.hidden = showTbl;
      btn.textContent = showTbl ? '📊 Gráfico' : '⊞ Tabela';
    };
  }
};
