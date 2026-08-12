/* Assistente de IA — botão flutuante + painel de conversa.
   As respostas vêm do servidor (/api/assistant), que consulta o provedor
   configurado em Administração → Configurações. A chave nunca chega aqui. */
'use strict';

const Assistant = {
  history: [],
  busy: false,
  status: null, // { configured, provider, canConfigure }

  SUGGESTIONS: [
    ['O que vence esta semana?', 'payables'],
    ['Resumo do mês em poucas linhas', 'dashboard'],
    ['Como está a produção?', 'production'],
    ['Quais orçamentos estão aguardando resposta?', 'quotes'],
    ['Tem algum item de estoque abaixo do mínimo?', 'stock'],
    ['Quais clientes estão com boleto vencido?', 'receivables']
  ],

  /* Chamado pelo App após montar o layout (usuário autenticado). */
  mount() {
    const root = document.getElementById('assistant-root');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    root.innerHTML = `
      <button id="ai-fab" onclick="Assistant.toggle()" title="Assistente IA — pergunte sobre os dados do sistema"
        aria-label="Abrir assistente de IA">✦</button>
      <section id="ai-panel" class="ai-panel" hidden aria-label="Assistente de IA">
        <div class="ai-head">
          <div class="ai-title">✦ Assistente <span>· Jaques Motorsport</span></div>
          <button class="ai-hbtn" onclick="Assistant.clear()" title="Limpar conversa">🗑</button>
          <button class="ai-hbtn" onclick="Assistant.toggle()" title="Fechar">✕</button>
        </div>
        <div class="ai-msgs" id="ai-msgs"></div>
        <div class="ai-inputrow">
          <textarea id="ai-input" rows="1" placeholder="Pergunte sobre clientes, contas, produção…"
            aria-label="Sua pergunta"></textarea>
          <button id="ai-send" class="ai-sendbtn" onclick="Assistant.send()" title="Enviar (Enter)">➤</button>
        </div>
      </section>`;
    try { this.history = JSON.parse(sessionStorage.getItem('jm_ai_chat') || '[]'); } catch (e) { this.history = []; }
    const input = document.getElementById('ai-input');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 110) + 'px';
    });
  },

  async toggle() {
    const panel = document.getElementById('ai-panel');
    if (!panel) return;
    panel.hidden = !panel.hidden;
    document.getElementById('ai-fab').classList.toggle('open', !panel.hidden);
    if (!panel.hidden) {
      if (!this.status) {
        try { this.status = await App.get('/assistant/status'); } catch (e) { this.status = { configured: false }; }
      }
      this.render();
      document.getElementById('ai-input').focus();
    }
  },

  clear() {
    this.history = [];
    sessionStorage.removeItem('jm_ai_chat');
    this.render();
  },

  save() {
    try { sessionStorage.setItem('jm_ai_chat', JSON.stringify(this.history.slice(-40))); } catch (e) {}
  },

  suggest(q) {
    document.getElementById('ai-input').value = q;
    this.send();
  },

  async send() {
    const input = document.getElementById('ai-input');
    const q = input.value.trim();
    if (!q || this.busy) return;
    if (this.status && !this.status.configured) { this.render(); return; }
    const past = this.history.slice(-8);
    this.history.push({ role: 'user', text: q });
    input.value = ''; input.style.height = 'auto';
    this.busy = true;
    this.render();
    try {
      const r = await App.post('/assistant', { question: q, history: past });
      this.history.push({ role: 'assistant', text: r.answer });
    } catch (e) {
      this.history.push({ role: 'assistant', text: e.message, error: true });
    }
    this.busy = false;
    this.save();
    this.render();
    document.getElementById('ai-input').focus();
  },

  render() {
    const box = document.getElementById('ai-msgs');
    if (!box) return;

    if (this.status && !this.status.configured) {
      box.innerHTML = `
        <div class="ai-setup">
          <div class="ai-setup-ico">✦</div>
          <b>O assistente ainda não foi ativado</b>
          <p>Falta cadastrar a chave da API do provedor de IA (Gemini ou Claude).</p>
          ${this.status.canConfigure
            ? `<button class="btn primary sm" onclick="location.hash='#/admin';Assistant.toggle();App.toast('Abra a aba “Configurações” → Assistente de IA','ok')">Configurar agora</button>`
            : '<p class="ai-dim">Peça a um administrador para configurar em<br>Administração → Configurações.</p>'}
        </div>`;
      return;
    }

    if (!this.history.length) {
      const chips = this.SUGGESTIONS.filter(([, perm]) => App.can(perm))
        .map(([q]) => `<button class="ai-chip" onclick="Assistant.suggest('${q.replace(/'/g, '\\\'')}')">${q}</button>`).join('');
      box.innerHTML = `
        <div class="ai-empty">
          <div class="ai-setup-ico">✦</div>
          <b>Como posso ajudar?</b>
          <p>Pergunto direto aos dados do sistema — contas, clientes, produção, estoque…</p>
          <div class="ai-chips">${chips}</div>
        </div>`;
      return;
    }

    box.innerHTML = this.history.map(m =>
      m.role === 'user'
        ? `<div class="ai-msg user">${App.esc(m.text)}</div>`
        : `<div class="ai-msg assistant ${m.error ? 'error' : ''}">${m.error ? '⚠️ ' + App.esc(m.text) : this.md(m.text)}</div>`
    ).join('') + (this.busy
      ? '<div class="ai-msg assistant ai-typing"><span></span><span></span><span></span></div>' : '');
    box.scrollTop = box.scrollHeight;
  },

  /* ---------- Markdown simples e seguro (escapa HTML primeiro) ---------- */
  inline(s) {
    return App.esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, '$1<i>$2</i>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  },

  md(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    const out = [];
    let i = 0;
    const isTableRow = l => /^\s*\|.*\|\s*$/.test(l);
    const isSep = l => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes('-');
    while (i < lines.length) {
      const line = lines[i];

      if (!line.trim()) { i++; continue; }

      // Tabela markdown: | a | b | + linha separadora
      if (isTableRow(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
        const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => this.inline(c.trim()));
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && isTableRow(lines[i])) { rows.push(cells(lines[i])); i++; }
        out.push(`<div class="ai-tablewrap"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }

      // Lista com marcadores / numerada
      if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
        const ordered = /^\s*\d+[.)]/.test(line);
        const items = [];
        while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
          items.push(this.inline(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, '')));
          i++;
        }
        out.push(`<${ordered ? 'ol' : 'ul'}>${items.map(x => `<li>${x}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
        continue;
      }

      // Título ###
      if (/^\s*#{1,4}\s+/.test(line)) {
        out.push(`<div class="ai-h">${this.inline(line.replace(/^\s*#{1,4}\s+/, ''))}</div>`);
        i++;
        continue;
      }

      // Parágrafo (agrupa linhas consecutivas)
      const para = [];
      while (i < lines.length && lines[i].trim() && !isTableRow(lines[i])
        && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]) && !/^\s*#{1,4}\s+/.test(lines[i])) {
        para.push(this.inline(lines[i]));
        i++;
      }
      out.push(`<p>${para.join('<br>')}</p>`);
    }
    return out.join('');
  }
};
window.Assistant = Assistant;
