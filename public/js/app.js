/* ============================================================
   Núcleo da aplicação: API, autenticação, roteador, layout,
   helpers de UI (tabelas, modais, toasts, impressão).
   ============================================================ */
'use strict';

const App = {
  user: null,
  permissions: [],
  meta: null,
  views: {},        // registradas por cada arquivo views-*.js
  cache: {},        // cache leve de coleções por página

  /* Selo da marca (monograma JM) para fundos escuros. */
  logoSeal(size) {
    return `<svg viewBox="0 0 80 80" width="${size}" height="${size}" aria-label="Jaques Motorsport">
      <circle cx="40" cy="42" r="29" fill="none" stroke="#EDEDEA" stroke-width="2"/>
      <circle cx="40" cy="42" r="25.4" fill="none" stroke="#EDEDEA" stroke-width="0.7"/>
      <path d="M40 7 l4.5 7 h-9 z" fill="#E43146"/>
      <text x="40" y="51" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
        font-size="23" letter-spacing="1.5" fill="#EDEDEA">JM</text>
    </svg>`;
  },

  /* ---------------- API ---------------- */
  /* O token fica no localStorage quando o usuário marca "manter conectado"
     (login permanece mesmo fechando o navegador) ou no sessionStorage quando
     não marca (sessão termina ao fechar o navegador). */
  token() { return localStorage.getItem('jm_token') || sessionStorage.getItem('jm_token') || ''; },
  setToken(t, remember) {
    localStorage.removeItem('jm_token');
    sessionStorage.removeItem('jm_token');
    (remember ? localStorage : sessionStorage).setItem('jm_token', t);
  },

  async api(method, path, body) {
    const res = await fetch('/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.token()
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (res.status === 401) { this.logout(false); throw new Error('Sessão expirada'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro na requisição');
    return data;
  },
  get(p) { return this.api('GET', p); },
  post(p, b) { return this.api('POST', p, b); },
  put(p, b) { return this.api('PUT', p, b); },
  del(p) { return this.api('DELETE', p); },

  can(perm) { return this.permissions.includes(perm) || this.permissions.includes('admin'); },

  /* ---------------- Formatação ---------------- */
  money(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  moneyHtml(v) { return `<span class="money">${this.money(v)}</span>`; },
  date(s) {
    if (!s) return '—';
    const [y, m, d] = String(s).slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  },
  dateTime(s) {
    if (!s) return '—';
    const dt = new Date(s);
    return dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  },
  today() { return new Date().toISOString().slice(0, 10); },
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  /* Rótulos e cores de status */
  STATUS: {
    // entradas / OS
    recebido: ['Recebido', 'info'], em_analise: ['Em análise', 'info'], aguardando_orcamento: ['Aguardando orçamento', 'warn'],
    orcado: ['Orçado', 'accent'], aprovado: ['Aprovado', 'ok'], em_andamento: ['Em andamento', 'accent'],
    aguardando_peca: ['Aguardando peça', 'warn'], finalizado: ['Finalizado', 'ok'],
    aguardando_pagamento: ['Aguardando pagamento', 'warn'], cancelado: ['Cancelado', 'danger'],
    // orçamentos
    aberto: ['Em aberto', 'warn'], recusado: ['Recusado', 'danger'], expirado: ['Expirado', 'danger'],
    // pedidos / produção
    nao_produzido: ['Não produzido', 'warn'], preparacao: ['Em preparação', 'info'], usinagem: ['Em usinagem', 'accent'],
    montagem: ['Em montagem', 'accent'], pronto: ['Pronto p/ envio', 'ok'], enviado: ['Enviado', 'info'], entregue: ['Entregue', 'ok'],
    // financeiro
    paga: ['Paga', 'ok'], pago: ['Pago', 'ok'], vencida: ['Vencida', 'danger'], cancelada: ['Cancelada', 'danger'],
    pendente: ['Pendente', 'warn'], parcelado: ['Parcelado', 'info'],
    // bens de terceiros
    na_empresa: ['Na empresa', 'accent'], devolvido: ['Devolvido', 'ok'],
    // fatura fornecedor
    conferida: ['Conferida', 'ok'], divergente: ['⚠ Divergente', 'danger'], confirmada: ['Confirmada', 'ok'],
    registrada: ['Registrada', 'info'],
    // tarefas
    aberta: ['Aberta', 'warn'], concluida: ['Concluída', 'ok'],
    // prioridades de pendências
    urgente: ['Urgente', 'danger'], semana: ['Esta semana', 'warn'],
    normal: ['Normal', ''], aguardando: ['Aguardando', 'info']
  },
  badge(status) {
    const [label, cls] = this.STATUS[status] || [status || '—', ''];
    return `<span class="badge ${cls}">${this.esc(label)}</span>`;
  },

  /* ---------------- Toast / Modal ---------------- */
  toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    document.getElementById('toast-root').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  },

  modal(html, { wide } = {}) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `<div class="modal-back"><div class="modal ${wide ? 'wide' : ''}">${html}</div></div>`;
    root.querySelector('.modal-back').addEventListener('mousedown', e => {
      if (e.target === e.currentTarget) this.closeModal();
    });
    return root.querySelector('.modal');
  },
  closeModal() { document.getElementById('modal-root').innerHTML = ''; },

  async confirm(msg) {
    return new Promise(resolve => {
      const m = this.modal(`
        <h2>Confirmação</h2>
        <p>${this.esc(msg)}</p>
        <div class="actions">
          <button class="btn" id="c-no">Cancelar</button>
          <button class="btn primary" id="c-yes">Confirmar</button>
        </div>`);
      m.querySelector('#c-no').onclick = () => { this.closeModal(); resolve(false); };
      m.querySelector('#c-yes').onclick = () => { this.closeModal(); resolve(true); };
    });
  },

  /* Formulário genérico em modal. fields: [{name,label,type,options,value,required,full}] */
  form(title, fields, onSubmit, { wide, submitLabel } = {}) {
    const html = `
      <h2>${this.esc(title)}</h2>
      <form id="mform"><div class="formgrid">
      ${fields.map(f => {
        if (f.type === 'hidden') return `<input type="hidden" name="${f.name}" value="${this.esc(f.value)}">`;
        const inner =
          f.type === 'select'
            ? `<select name="${f.name}" ${f.required ? 'required' : ''}>${(f.options || []).map(o =>
                `<option value="${this.esc(o.value)}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${this.esc(o.label)}</option>`).join('')}</select>`
          : f.type === 'textarea'
            ? `<textarea name="${f.name}" ${f.required ? 'required' : ''}>${this.esc(f.value || '')}</textarea>`
          : f.type === 'checkbox'
            ? `<input type="checkbox" name="${f.name}" ${f.value ? 'checked' : ''}>`
            : `<input type="${f.type || 'text'}" name="${f.name}" value="${this.esc(f.value != null ? f.value : '')}"
                 ${f.step ? `step="${f.step}"` : ''} ${f.required ? 'required' : ''} ${f.placeholder ? `placeholder="${this.esc(f.placeholder)}"` : ''}>`;
        return `<label class="field ${f.full ? 'full' : ''}"><span>${this.esc(f.label)}${f.required ? ' *' : ''}</span>${inner}</label>`;
      }).join('')}
      </div>
      <div class="actions">
        <button type="button" class="btn" onclick="App.closeModal()">Cancelar</button>
        <button type="submit" class="btn primary">${submitLabel || 'Salvar'}</button>
      </div></form>`;
    const m = this.modal(html, { wide });
    m.querySelector('#mform').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {};
      for (const f of fields) {
        if (f.type === 'checkbox') data[f.name] = e.target.elements[f.name].checked;
        else {
          let v = fd.get(f.name);
          if (f.type === 'number') v = v === '' ? null : Number(v);
          data[f.name] = v;
        }
      }
      try { await onSubmit(data); } catch (err) { this.toast(err.message, 'err'); }
    });
    return m;
  },

  /* Tabela genérica. cols: [{h, class, cell:(row)=>html}] */
  table(rows, cols, { onRow, emptyMsg } = {}) {
    if (!rows.length) return `<div class="tablewrap"><div class="empty">${emptyMsg || 'Nenhum registro encontrado'}</div></div>`;
    const id = 'tb' + Math.random().toString(36).slice(2, 8);
    setTimeout(() => {
      if (!onRow) return;
      const el = document.getElementById(id);
      if (el) el.querySelectorAll('tbody tr').forEach((tr, i) => {
        tr.classList.add('clickable');
        tr.addEventListener('click', e => { if (!e.target.closest('button,select,a,input')) onRow(rows[i]); });
      });
    });
    return `<div class="tablewrap"><table id="${id}">
      <thead><tr>${cols.map(c => `<th class="${c.class || ''}">${c.h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${cols.map(c => `<td class="${c.class || ''}">${c.cell(r)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  },

  /* ---------------- Impressão / exportação ---------------- */
  /**
   * Abre uma janela de impressão com cabeçalho da empresa.
   * Usada em todos os relatórios operacionais ("🖨️ Imprimir").
   */
  print(title, bodyHtml, meta) {
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${this.esc(title)}</title>
      <style>
        body { font: 12px/1.5 'Segoe UI', Arial, sans-serif; color: #111; margin: 24px; }
        h1 { font-size: 17px; margin: 0; } .meta { color: #555; font-size: 11px; margin: 3px 0 0; }
        .head { border-bottom: 2.5px solid #0B0B0C; padding-bottom: 10px; margin-bottom: 16px;
                display: flex; justify-content: space-between; align-items: flex-end; }
        .brandp { text-align: right; }
        .bp-nome { font-family: Georgia, 'Times New Roman', serif; font-size: 17px;
                   letter-spacing: 3px; color: #0B0B0C; }
        .bp-fio { height: 2px; background: #C0182B; margin: 2px 0 3px; }
        .bp-sub { font-size: 7.5px; letter-spacing: 4.5px; color: #555; }
        .bp-meta { font-size: 9.5px; color: #888; margin-top: 5px; }
        table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-top: 6px; }
        th { text-align: left; background: #eef1f5; border: 1px solid #c6ccd6; padding: 6px 8px;
             font-size: 10px; text-transform: uppercase; letter-spacing: .8px; }
        td { border: 1px solid #d8dde5; padding: 6px 8px; }
        .num { text-align: right; } .sig { margin-top: 46px; display: flex; gap: 40px; }
        .sig div { flex: 1; border-top: 1px solid #888; padding-top: 5px; font-size: 11px; text-align: center; color: #444; }
        h3 { font-size: 13px; margin: 18px 0 4px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
        .badge { border: 1px solid #999; border-radius: 10px; padding: 1px 8px; font-size: 10px; white-space: nowrap; }
        ul.check { list-style: none; padding: 0; } ul.check li { padding: 4px 0; border-bottom: 1px dotted #ccc; }
        ul.check li::before { content: '☐ '; font-size: 14px; }
        @media print { .noprint { display: none; } }
      </style></head><body>
      <div class="head">
        <div><h1>${this.esc(title)}</h1><p class="meta">${this.esc(meta || '')}</p></div>
        <div class="brandp">
          <div class="bp-nome">JAQUES</div>
          <div class="bp-fio"></div>
          <div class="bp-sub">MOTORSPORT</div>
          <div class="bp-meta">Gerado em ${new Date().toLocaleString('pt-BR')} por ${this.esc(this.user ? this.user.name : '')}</div>
        </div>
      </div>
      ${bodyHtml}
      <script>window.onload = () => setTimeout(() => window.print(), 150);<\/script>
      </body></html>`);
    w.document.close();
  },

  /** Exporta uma lista de objetos para CSV (abre no Excel). */
  exportCsv(filename, rows, headers) {
    const cols = headers || (rows[0] ? Object.keys(rows[0]) : []);
    const lines = [cols.map(c => `"${c}"`).join(';')];
    for (const r of rows) lines.push(cols.map(c => `"${String(r[c] == null ? '' : r[c]).replace(/"/g, '""')}"`).join(';'));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  },

  /* ---------------- Autenticação ---------------- */
  async start() {
    if (this.token()) {
      try {
        const me = await this.get('/me');
        this.user = me.user;
        this.permissions = me.permissions;
        this.meta = await this.get('/meta');
        this.renderLayout();
        this.route();
        window.addEventListener('hashchange', () => this.route());
        return;
      } catch (e) { /* token inválido → login */ }
    }
    this.renderLogin();
  },

  renderLogin() {
    const lastUser = localStorage.getItem('jm_lastuser') || '';
    document.getElementById('app').innerHTML = `
      <div class="login-wrap"><div class="login-card">
        <div class="logotype" style="margin-bottom:22px">
          ${this.logoSeal(84)}
          <span class="lt-nome">JAQUES</span>
          <div class="lt-fio"></div>
          <span class="lt-sub">MOTORSPORT</span>
        </div>
        <p class="sub" style="text-align:center">Entre com o seu usuário e senha individuais.</p>
        <form id="loginform" autocomplete="on">
          <label class="field"><span>Usuário</span>
            <input name="username" required value="${this.esc(lastUser)}" ${lastUser ? '' : 'autofocus'} autocomplete="username"></label>
          <label class="field"><span>Senha</span>
            <input name="password" type="password" required ${lastUser ? 'autofocus' : ''} autocomplete="current-password"></label>
          <label class="field" style="display:flex;gap:8px;align-items:center;cursor:pointer">
            <input type="checkbox" name="remember" checked style="width:auto">
            <span style="margin:0">Manter conectado neste computador</span></label>
          <button class="btn primary" style="width:100%;justify-content:center;margin-top:6px">Entrar</button>
        </form>
      </div></div>`;
    document.getElementById('loginform').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const r = await fetch('/api/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: fd.get('username'), password: fd.get('password') })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Falha no login');
        localStorage.setItem('jm_lastuser', String(fd.get('username') || '').trim());
        this.setToken(data.token, e.target.elements.remember.checked);
        this.user = data.user;
        this.permissions = data.permissions;
        this.meta = await this.get('/meta');
        this.renderLayout();
        location.hash = '#/dashboard';
        this.route();
        window.addEventListener('hashchange', () => this.route());
        if (data.user.mustChangePassword) {
          this.toast('Por segurança, altere a sua senha inicial (menu do usuário).', 'err');
        }
      } catch (err) { this.toast(err.message, 'err'); }
    });
  },

  async logout(callApi = true) {
    if (callApi) { try { await this.post('/logout'); } catch (e) {} }
    localStorage.removeItem('jm_token');
    sessionStorage.removeItem('jm_token');
    location.hash = '';
    location.reload();
  },

  changePasswordDialog() {
    this.form('Alterar minha senha', [
      { name: 'atual', label: 'Senha atual', type: 'password', required: true, full: true },
      { name: 'nova', label: 'Nova senha (mín. 6 caracteres)', type: 'password', required: true, full: true }
    ], async d => {
      await this.post('/me/password', d);
      this.closeModal();
      this.toast('Senha alterada com sucesso', 'ok');
    });
  },

  /* ---------------- Layout / navegação ---------------- */
  NAV: [
    ['Visão geral', [
      ['dashboard', 'Dashboard', '◧', 'dashboard'],
      ['tasks', 'Minhas pendências', '☑', 'tasks']
    ]],
    ['Comercial', [
      ['clients', 'Clientes', '👤', 'clients'],
      ['quotes', 'Orçamentos', '📄', 'quotes'],
      ['sales', 'Vendas / Pedidos', '🛒', 'sales']
    ]],
    ['Oficina', [
      ['entries', 'Entrada de cabeçotes', '⬇', 'entries'],
      ['assets', 'Bens de clientes', '🔒', 'assets'],
      ['os', 'Ordens de serviço', '🔧', 'os'],
      ['production', 'Produção', '⚙', 'production']
    ]],
    ['Materiais', [
      ['stock', 'Estoque próprio', '▦', 'stock'],
      ['products', 'Produtos e custos', '◈', 'products'],
      ['purchases', 'Compras', '📥', 'purchases'],
      ['suppliers', 'Fornecedores', '🏭', 'suppliers']
    ]],
    ['Financeiro', [
      ['payables', 'Contas a pagar', '↥', 'payables'],
      ['receivables', 'Contas a receber', '↧', 'receivables'],
      ['cashflow', 'Fluxo de caixa', '≋', 'cashflow'],
      ['projection', 'Projeção', '📈', 'projection'],
      ['dre', 'DRE / Resultado', 'Σ', 'dre']
    ]],
    ['Gestão', [
      ['hr', 'RH', '👥', 'hr'],
      ['reports', 'Relatórios', '🖨', 'reports'],
      ['admin', 'Administração', '⚙', 'admin']
    ]]
  ],

  renderLayout() {
    const nav = this.NAV.map(([group, items]) => {
      const visible = items.filter(([, , , perm]) => this.can(perm));
      if (!visible.length) return '';
      return `<div class="nav-group">${group}</div>` + visible.map(([route, label, ico]) =>
        `<a href="#/${route}" data-route="${route}"><span class="ico">${ico}</span>${label}</a>`).join('');
    }).join('');

    document.getElementById('app').innerHTML = `
      <div class="layout">
        <aside class="sidebar" id="sidebar">
          <div class="brand"><div class="logo">${this.logoSeal(34)}</div>
            <div><b>Jaques Motorsport</b><small>Gestão · Performance</small></div></div>
          <nav class="nav">${nav}</nav>
          <hr class="sep">
          <a class="btn ghost sm" style="width:100%" onclick="App.changePasswordDialog()">🔑 Alterar senha</a>
          <a class="btn ghost sm" style="width:100%" onclick="App.logout()">⏻ Sair</a>
        </aside>
        <main class="main">
          <div class="topbar">
            <div style="display:flex;align-items:center;gap:10px">
              <button class="btn menu-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
              <div><h1 id="page-title"></h1><div class="sub" id="page-sub"></div></div>
            </div>
            <div class="userchip"><b>${this.esc(this.user.name)}</b> · ${this.esc(this.user.cargo || '')}</div>
          </div>
          <div id="view"></div>
        </main>
      </div>`;
  },

  setTitle(t, sub) {
    document.getElementById('page-title').textContent = t;
    document.getElementById('page-sub').textContent = sub || '';
  },

  registerView(name, fn) { this.views[name] = fn; },

  async route() {
    const hash = location.hash.replace(/^#\//, '') || 'dashboard';
    const [name, ...args] = hash.split('/');
    document.querySelectorAll('.nav a').forEach(a =>
      a.classList.toggle('active', a.dataset.route === name));
    document.getElementById('sidebar').classList.remove('open');
    const fn = this.views[name] || this.views.dashboard;
    const view = document.getElementById('view');
    view.innerHTML = '<div class="empty">Carregando…</div>';
    try { await fn(view, args); }
    catch (e) {
      view.innerHTML = `<div class="card"><b>Erro:</b> ${this.esc(e.message)}</div>`;
    }
  },

  /* Helpers de dados usados pelas views */
  clientName(id, clients) {
    const c = (clients || this.cache.clients || []).find(x => x.id === id);
    return c ? c.nome : '#' + id;
  },
  userName(id) {
    const u = (this.meta.users || []).find(x => x.id === id);
    return u ? u.name : '—';
  },
  clientOptions(clients, selected) {
    return [{ value: '', label: '— selecione —' }].concat(
      clients.map(c => ({ value: c.id, label: c.nome })));
  }
};
