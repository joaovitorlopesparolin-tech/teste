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

  /* ---------------- Marca ----------------
     Dois arquivos, sem fundo (PNG transparente), em /img:
       logo-jaques.png         → cores originais, para papel e fundo claro
       logo-jaques-escuro.png  → roxo clareado, para o fundo preto do sistema
       icone-jaques.png        → o "j" em ladrilho quadrado (favicon, selo)  */
  IMG_LOGO: '/img/logo-jaques.png',
  IMG_LOGO_ESCURO: '/img/logo-jaques-escuro.png',
  IMG_ICONE: '/img/icone-jaques.png',

  /* Selo quadrado da marca, para cantos apertados (barra, aba, avatar). */
  logoSeal(size) {
    return `<img class="logo-selo" src="${this.IMG_ICONE}" width="${size}" height="${size}"
      alt="Jaques Motorsport" draggable="false">`;
  },

  /* Marca por extenso. altura em px; claro = versão para papel/fundo claro. */
  logoMarca(altura, claro) {
    return `<img class="logo-marca" src="${claro ? this.IMG_LOGO : this.IMG_LOGO_ESCURO}"
      style="height:${altura}px" alt="Jaques Motorsport" draggable="false">`;
  },

  /* ---------------- Catálogos de compras ----------------
     Compartilhados entre Compras, Contas a pagar e relatórios, para os nomes
     e as explicações serem os mesmos em todo lugar. [chave, nome, explicação] */
  CATCOMPRA: [
    ['componentes', 'Componentes', 'Peças usadas diretamente no produto: válvulas, molas, pratos, travas, tuchos, comandos…'],
    ['materiais', 'Materiais', 'Consumo da produção e dos serviços: insumos, abrasivos, materiais de usinagem'],
    ['mao_obra_direta', 'Mão de obra direta', 'Custos ligados diretamente à execução do produto ou serviço'],
    ['terceirizacao', 'Terceirização', 'Serviços de terceiros para a produção: retífica, usinagem externa, solda…'],
    ['custo_producao', 'Outros custos de produção', 'Ligado à produção, mas que não é componente, material, mão de obra nem terceirização'],
    ['pos_operacao', 'Pós-operação', 'Depois da produção: embalagem, preparação de envio, expedição, brindes'],
    ['manutencao', 'Manutenção', 'Máquinas, equipamentos, ferramentas e estrutura operacional'],
    ['despesa_operacional', 'Despesas operacionais', 'Funcionamento diário da empresa: limpeza, água dos colaboradores, escritório'],
    ['outros', 'Outros', 'Só quando realmente não couber em nenhuma das categorias acima']
  ],
  /* Rótulos de categorias antigas que ainda existem em lançamentos gravados. */
  CATCOMPRA_LEGADO: { custo_direto: 'Custos diretos' },

  VINCCOMPRA: [
    ['producao', 'Produção', 'Usada diretamente na fabricação ou montagem de um produto'],
    ['os', 'Serviço / OS', 'Usada na execução de um serviço específico de cliente'],
    ['pedido', 'Pedido de venda', 'Relacionada a um pedido específico de produto'],
    ['cliente', 'Cliente', 'Feita especificamente para atender determinado cliente'],
    ['manutencao', 'Manutenção', 'Manutenção da estrutura, máquinas ou equipamentos da empresa'],
    ['operacao_interna', 'Operação interna', 'Funcionamento diário da empresa'],
    ['administrativo', 'Administrativo', 'Atividades administrativas da empresa'],
    ['sem_vinculo', 'Sem vínculo específico', 'Compra geral, sem relação direta com produção, serviço ou cliente']
  ],
  VINCCOMPRA_LEGADO: { uso_interno: 'Uso interno', orcamento: 'Orçamento' },

  catCompraNome(chave) {
    const c = this.CATCOMPRA.find(x => x[0] === chave);
    return c ? c[1] : (this.CATCOMPRA_LEGADO[chave] || chave || '—');
  },
  vincCompraNome(chave) {
    const v = this.VINCCOMPRA.find(x => x[0] === chave);
    return v ? v[1] : (this.VINCCOMPRA_LEGADO[chave] || chave || '—');
  },

  /**
   * Explicação viva embaixo de um <select>: mostra a descrição da opção
   * escolhida, discreta, e atualiza quando o usuário troca.
   * catalogo: [[valor, nome, descricao], …]
   */
  explicarSelect(modal, nomeCampo, catalogo, aoTrocar) {
    const sel = modal.querySelector(`[name="${nomeCampo}"]`);
    if (!sel) return;
    const d = document.createElement('div');
    d.className = 'small';
    d.style.cssText = 'color:var(--text-3);margin-top:3px;font-size:11.5px;line-height:1.35';
    sel.insertAdjacentElement('afterend', d);
    const atualiza = () => {
      const op = catalogo.find(x => String(x[0]) === sel.value);
      d.textContent = op && op[2] ? `(${op[2]})` : '';
      if (aoTrocar) aoTrocar(sel.value);
    };
    sel.addEventListener('change', atualiza);
    atualiza();
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

  /* ---------------- Documentos: máscara, validação, formatação ----------------
     Regra: guardamos SEMPRE só os números. A formatação é aplicada na
     exibição e na digitação — assim uma busca por "12345678000199"
     encontra o CNPJ salvo, independentemente de pontos e barras. */
  digits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); },

  fmtCpfCnpj(v) {
    const d = this.digits(v);
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    return String(v || '');
  },
  fmtCep(v) {
    const d = this.digits(v);
    return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : String(v || '');
  },

  /* Máscara progressiva enquanto digita */
  maskCpfCnpj(v) {
    const d = this.digits(v).slice(0, 14);
    if (d.length <= 11) {
      return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
    }
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  },
  maskCep(v) {
    const d = this.digits(v).slice(0, 8);
    return d.length > 5 ? d.replace(/^(\d{5})(\d{1,3})/, '$1-$2') : d;
  },

  /* Validação real (dígitos verificadores), não só contagem de caracteres */
  validCpf(v) {
    const c = this.digits(v);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    const dv = (base, pesoIni) => {
      let s = 0;
      for (let i = 0; i < base.length; i++) s += Number(base[i]) * (pesoIni - i);
      const r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return dv(c.slice(0, 9), 10) === Number(c[9]) && dv(c.slice(0, 10), 11) === Number(c[10]);
  },
  validCnpj(v) {
    const c = this.digits(v);
    if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
    const dv = (base) => {
      let peso = base.length - 7, s = 0;
      for (let i = 0; i < base.length; i++) {
        s += Number(base[i]) * peso--;
        if (peso < 2) peso = 9;
      }
      const r = s % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
  },
  /** '' é aceito (campo opcional); com conteúdo, precisa ser CPF ou CNPJ válido. */
  validCpfCnpj(v) {
    const d = this.digits(v);
    if (!d) return true;
    if (d.length === 11) return this.validCpf(d);
    if (d.length === 14) return this.validCnpj(d);
    return false;
  },
  validCep(v) {
    const d = this.digits(v);
    return !d || d.length === 8;
  },

  /** Consulta o CEP (ViaCEP). Devolve null sem internet — nunca trava o cadastro. */
  async lookupCep(cep) {
    const d = this.digits(cep);
    if (d.length !== 8) return null;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) return null;
      const j = await r.json();
      if (j.erro) return null;
      return { endereco: j.logradouro || '', bairro: j.bairro || '', cidade: j.localidade || '', estado: j.uf || '' };
    } catch (e) { return null; } // offline ou serviço fora do ar
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

  /* html: true só quando a mensagem for montada aqui no código, com App.esc
     em cima de qualquer texto que venha de fora. */
  async confirm(msg, { html } = {}) {
    return new Promise(resolve => {
      const m = this.modal(`
        <h2>Confirmação</h2>
        <p>${html ? msg : this.esc(msg)}</p>
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
            : `<input type="${f.type || 'text'}" name="${f.name}"
                 value="${this.esc(f.mask === 'cpfcnpj' ? this.fmtCpfCnpj(f.value) : f.mask === 'cep' ? this.fmtCep(f.value) : (f.value != null ? f.value : ''))}"
                 ${f.mask ? `data-mask="${f.mask}" inputmode="numeric"` : ''}
                 autocomplete="${f.type === 'password' ? 'new-password' : 'off'}"
                 ${f.step ? `step="${f.step}"` : ''} ${f.required ? 'required' : ''} ${f.placeholder ? `placeholder="${this.esc(f.placeholder)}"` : ''}>`;
        return `<label class="field ${f.full ? 'full' : ''}"><span>${this.esc(f.label)}${f.required ? ' *' : ''}</span>${inner}</label>`;
      }).join('')}
      </div>
      <div class="actions">
        <button type="button" class="btn" onclick="App.closeModal()">Cancelar</button>
        <button type="submit" class="btn primary">${submitLabel || 'Salvar'}</button>
      </div></form>`;
    const m = this.modal(html, { wide });

    /* Máscara automática enquanto digita (CPF/CNPJ e CEP) */
    m.querySelectorAll('[data-mask]').forEach(inp => {
      inp.addEventListener('input', () => {
        const fim = inp.selectionStart === inp.value.length;
        inp.value = inp.dataset.mask === 'cep' ? this.maskCep(inp.value) : this.maskCpfCnpj(inp.value);
        if (fim) inp.setSelectionRange(inp.value.length, inp.value.length);
        inp.setCustomValidity('');
      });
    });

    m.querySelector('#mform').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {};
      for (const f of fields) {
        if (f.type === 'checkbox') data[f.name] = e.target.elements[f.name].checked;
        else {
          let v = fd.get(f.name);
          if (f.type === 'number') v = v === '' ? null : Number(v);
          // Campos com máscara são guardados só com números
          if (f.mask) {
            const ok = f.mask === 'cep' ? this.validCep(v) : this.validCpfCnpj(v);
            if (!ok) {
              this.toast(f.mask === 'cep'
                ? `CEP inválido em "${f.label}" — informe os 8 números`
                : `CPF/CNPJ inválido em "${f.label}" — confira os números digitados`, 'err');
              const el = e.target.elements[f.name];
              if (el && el.focus) el.focus();
              return;
            }
            v = this.digits(v);
          }
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
        .bp-logo { height: 30px; display: block; margin-left: auto; }
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
          <img class="bp-logo" src="${location.origin}${this.IMG_LOGO}" alt="Jaques Motorsport">
          <div class="bp-meta">Gerado em ${new Date().toLocaleString('pt-BR')} por ${this.esc(this.user ? this.user.name : '')}</div>
        </div>
      </div>
      ${bodyHtml}
      <script>window.onload = () => setTimeout(() => window.print(), 150);<\/script>
      </body></html>`);
    w.document.close();
  },

  /**
   * Estado vazio amigável: ícone suave, explicação e o próximo passo
   * como botão — quem bate o olho sabe o que fazer.
   */
  emptyState(ico, titulo, texto, acoesHtml) {
    return `<div class="empty-state">
      <div class="es-ico">${ico}</div>
      <b>${this.esc(titulo)}</b>
      <p>${texto}</p>
      ${acoesHtml ? `<div class="es-actions">${acoesHtml}</div>` : ''}
    </div>`;
  },

  /* ---------------- WhatsApp ---------------- */
  /** Normaliza telefone brasileiro para o formato internacional do wa.me. */
  waPhone(raw) {
    let d = String(raw || '').replace(/\D/g, '').replace(/^0+/, '');
    if (d.length === 10 || d.length === 11) d = '55' + d; // DDD + número → +55
    return d.length >= 12 ? d : '';
  },

  /**
   * Janela de revisão antes de enviar: mensagem e telefone editáveis;
   * "Abrir WhatsApp" abre a conversa do cliente já com o texto pronto.
   * Sem telefone, o WhatsApp abre pedindo para escolher o contato.
   */
  waShare(titulo, phone, text) {
    const m = this.modal(`
      <h2>✆ Enviar no WhatsApp</h2>
      <p class="small muted">${this.esc(titulo)} — revise a mensagem antes de enviar (pode editar à vontade).</p>
      <label class="field"><span>WhatsApp do cliente (com DDD)</span>
        <input id="wa-phone" value="${this.esc(phone || '')}"
          placeholder="ex.: (43) 99999-8888 — em branco: você escolhe o contato no WhatsApp"></label>
      <label class="field"><span>Mensagem</span>
        <textarea id="wa-text" rows="13" style="line-height:1.55">${this.esc(text)}</textarea></label>
      <div class="actions">
        <button class="btn ghost" onclick="App.closeModal()">Cancelar</button>
        <button class="btn" id="wa-copy">⧉ Copiar texto</button>
        <button class="btn primary" id="wa-open">✆ Abrir WhatsApp</button>
      </div>`, { wide: true });
    m.querySelector('#wa-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(m.querySelector('#wa-text').value);
        this.toast('Mensagem copiada — é só colar no WhatsApp', 'ok');
      } catch (e) { this.toast('Selecione o texto e copie com Ctrl+C', 'err'); }
    };
    m.querySelector('#wa-open').onclick = () => {
      const p = this.waPhone(m.querySelector('#wa-phone').value);
      const t = encodeURIComponent(m.querySelector('#wa-text').value);
      window.open('https://wa.me/' + (p ? p + '?text=' + t : '?text=' + t), '_blank');
      this.closeModal();
    };
    return m;
  },

  /** Telefone preferido para WhatsApp de um cliente. */
  waPhoneOf(c) { return (c && (c.whatsapp || c.telefone)) || ''; },

  /* Modelos de mensagem (formatação do WhatsApp: *negrito*) */
  waMsg: {
    head(sufixo) { return `*${(App.meta.settings.companyName || 'Jaques Motorsport').toUpperCase()}* — ${sufixo}`; },
    hi(c) {
      const n = ((c && c.nome) || '').trim().split(/\s+/)[0];
      return n ? `Olá, ${n}!` : 'Olá!';
    },

    quote(q, c) {
      const lim = new Date((q.dataOrcamento || App.today()) + 'T12:00:00');
      lim.setDate(lim.getDate() + (q.validadeDias || 30));
      const L = [this.head(`Orçamento nº ${q.numero}`), ''];
      L.push(`${this.hi(c)} Segue o orçamento do serviço no seu cabeçote${q.modelo ? ' *' + q.modelo + '*' : ''}:`, '');
      for (const i of (q.itens || [])) {
        L.push(`▪ ${i.qtd !== 1 ? i.qtd + '× ' : ''}${i.nome} — R$ ${App.money(i.qtd * i.valorUnit)}`);
      }
      if (q.custosAdicionais) L.push(`▪ Custos adicionais — R$ ${App.money(q.custosAdicionais)}`);
      L.push('', `*TOTAL: R$ ${App.money(q.total)}*`, '');
      L.push(`Validade: até ${lim.toLocaleDateString('pt-BR')}`);
      if (q.previsaoEntrega) L.push(`Previsão de entrega: ${App.date(q.previsaoEntrega)}`);
      L.push('', 'Para aprovar, é só responder esta mensagem. Qualquer dúvida, estamos à disposição! 🤝');
      return L.join('\n');
    },

    os(o, c) {
      const modelo = o.modelo ? ' *' + o.modelo + '*' : '';
      let corpo;
      if (o.envioStatus === 'enviado') {
        corpo = `seu cabeçote${modelo} foi *enviado*! 📦${o.nfRetorno ? `\nNF de retorno: ${o.nfRetorno}` : ''}`;
      } else if (o.status === 'finalizado' || o.envioStatus === 'pronto') {
        corpo = `boa notícia: o serviço no seu cabeçote${modelo} foi *finalizado* e ele está pronto! ✅\n\nPodemos combinar a retirada ou o envio?`;
      } else {
        corpo = `passando uma atualização do serviço no seu cabeçote${modelo}: *${(App.STATUS[o.status] || [o.status])[0]}*.`
          + (o.previsaoEntrega ? `\nPrevisão de entrega: ${App.date(o.previsaoEntrega)}` : '');
      }
      return [this.head(`OS nº ${o.numero}`), '', `${this.hi(c)} ${corpo}`, '', 'Qualquer dúvida, é só chamar!'].join('\n');
    },

    charge(r, c) {
      const atraso = r.status === 'vencida';
      const L = [this.head('Lembrete de pagamento'), ''];
      L.push(`${this.hi(c)} ${atraso
        ? 'Notamos que consta em aberto o pagamento abaixo:'
        : 'Passando para lembrar do pagamento abaixo:'}`, '');
      L.push(r.descricao || 'Pagamento');
      L.push(`Valor: *R$ ${App.money(r.valor)}*`);
      L.push(`Vencimento: *${App.date(r.vencimento)}*${atraso ? ' — em atraso' : ''}`);
      if (r.parcelas > 1) L.push(`Parcela: ${r.parcela}/${r.parcelas}`);
      L.push('', 'Se o pagamento já foi feito, por favor desconsidere esta mensagem. Obrigado! 🙏');
      return L.join('\n');
    },

    sale(s, c) {
      const itens = (s.itens || []).map(i => `${i.qtd}× ${i.produto}`).join(' + ');
      let corpo;
      if (s.status === 'enviado') {
        corpo = `seu pedido (${itens}) foi *enviado*! 📦${s.dataEnvio ? `\nData do envio: ${App.date(s.dataEnvio)}` : ''}`;
      } else if (s.status === 'pronto') {
        corpo = `seu pedido (${itens}) está *pronto*! 🏁\n\nPodemos combinar o envio ou a retirada?`;
      } else {
        corpo = `passando uma atualização do seu pedido (${itens}): *${(App.STATUS[s.status] || [s.status])[0]}*.`
          + (s.previsaoEntrega ? `\nPrevisão de entrega: ${App.date(s.previsaoEntrega)}` : '');
      }
      return [this.head(`Pedido nº ${s.numero}`), '', `${this.hi(c)} ${corpo}`, '', 'Qualquer dúvida, é só chamar!'].join('\n');
    }
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
        this.startLiveRefresh();
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
          ${this.logoMarca(58)}
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
        this.startLiveRefresh();
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
  /* Organizado por frequência de uso: o dia a dia fica no topo, sempre à
     mão; os módulos gerenciais ficam em grupos recolhíveis. */
  NAV: [
    ['Dia a dia', [
      ['dashboard', 'Dashboard', '◧', 'dashboard'],
      ['tasks', 'Minhas pendências', '☑', 'tasks'],
      ['entries', 'Entrada de cabeçotes', '⬇', 'entries'],
      ['os', 'Ordens de serviço', '🔧', 'os'],
      ['sales', 'Vendas / Pedidos', '🛒', 'sales']
    ]],
    ['Comercial', [
      ['clients', 'Clientes', '👤', 'clients'],
      ['quotes', 'Orçamentos', '📄', 'quotes']
    ]],
    ['Oficina e materiais', [
      ['production', 'Produção', '⚙', 'production'],
      ['assets', 'Bens de clientes', '🔒', 'assets'],
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
      ['analytics', 'Análises', '📊', 'dashboard'],
      ['hr', 'RH', '👥', 'hr'],
      ['reports', 'Relatórios', '🖨', 'reports'],
      ['admin', 'Administração', '⚙', 'admin']
    ]]
  ],

  /* Grupos abertos/recolhidos no menu lateral (preferência por navegador) */
  NAV_DEFAULT_OPEN: ['Dia a dia', 'Comercial'],
  navState() {
    try { return JSON.parse(localStorage.getItem('jm_nav_open') || '{}'); } catch (e) { return {}; }
  },
  navIsOpen(group) {
    const s = this.navState();
    return s[group] !== undefined ? s[group] : this.NAV_DEFAULT_OPEN.includes(group);
  },
  toggleNavGroup(group) {
    const s = this.navState();
    s[group] = !this.navIsOpen(group);
    localStorage.setItem('jm_nav_open', JSON.stringify(s));
    const el = document.querySelector(`.nav-items[data-g="${CSS.escape(group)}"]`);
    const head = document.querySelector(`.nav-group[data-g="${CSS.escape(group)}"]`);
    if (el) el.classList.toggle('closed', !s[group]);
    if (head) head.classList.toggle('open', s[group]);
  },

  layoutMode() { return localStorage.getItem('jm_layout') === 'top' ? 'top' : 'side'; },
  toggleLayout() {
    localStorage.setItem('jm_layout', this.layoutMode() === 'top' ? 'side' : 'top');
    this.renderLayout();
    this.route();
  },

  /* Grupos visíveis para o usuário (usados pelo menu lateral e pelo ribbon) */
  visibleNav() {
    return this.NAV.map(([group, items]) => [group, items.filter(([, , , perm]) => this.can(perm))])
      .filter(([, items]) => items.length);
  },

  renderLayout() {
    const groups = this.visibleNav();
    const nav = groups.map(([group, items]) => {
      const open = this.navIsOpen(group);
      return `<div class="nav-group toggle ${open ? 'open' : ''}" data-g="${this.esc(group)}"
          onclick="App.toggleNavGroup('${this.esc(group)}')"><span class="chev">▸</span>${group}</div>
        <div class="nav-items ${open ? '' : 'closed'}" data-g="${this.esc(group)}">` +
        items.map(([route, label, ico]) =>
          `<a href="#/${route}" data-route="${route}"><span class="ico">${ico}</span>${label}</a>`).join('') +
        '</div>';
    }).join('');

    const top = this.layoutMode() === 'top';
    // Ribbon estilo Revit: abas = grupos; faixa = páginas do grupo ativo
    const ribbon = `
      <header class="ribbon" id="ribbon">
        <div class="ribbon-tabs">
          <div class="ribbon-brand">${this.logoMarca(22)}</div>
          ${groups.map(([g], i) => `<button class="rtab" data-g="${i}">${g}</button>`).join('')}
          <div class="spacer"></div>
          <button class="btn ghost sm" onclick="App.toggleLayout()" title="Voltar ao menu lateral">▤ Menu lateral</button>
          <button class="btn ghost sm" onclick="App.changePasswordDialog()" title="Alterar senha">🔑</button>
          <button class="btn ghost sm" onclick="App.logout()" title="Sair">⏻</button>
        </div>
        <div class="ribbon-pages" id="ribbon-pages"></div>
      </header>`;

    document.getElementById('app').innerHTML = `
      <div class="layout ${top ? 'layout-top' : ''}">
        ${top ? ribbon : ''}
        <aside class="sidebar" id="sidebar">
          <div class="brand">
            ${this.logoMarca(30)}
            <small>Gestão · Performance</small>
          </div>
          <nav class="nav">${nav}</nav>
          <hr class="sep">
          <a class="btn ghost sm" style="width:100%" onclick="App.toggleLayout()">▥ Menu superior (estilo Revit)</a>
          <a class="btn ghost sm" style="width:100%" onclick="App.changePasswordDialog()">🔑 Alterar senha</a>
          <a class="btn ghost sm" style="width:100%" onclick="App.logout()">⏻ Sair</a>
        </aside>
        <main class="main">
          <div class="topbar">
            <div style="display:flex;align-items:center;gap:10px">
              <button class="btn menu-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
              ${this.logoSeal(26)}
              <div><h1 id="page-title"></h1><div class="sub" id="page-sub"></div></div>
            </div>
            <div class="userchip"><b>${this.esc(this.user.name)}</b></div>
          </div>
          <div id="view"></div>
        </main>
      </div>`;

    if (top) {
      document.querySelectorAll('.rtab').forEach((b, i) => b.addEventListener('click', () => {
        this._ribbonG = i;
        document.querySelectorAll('.rtab').forEach((x, j) => x.classList.toggle('active', j === i));
        this.renderRibbonPages(i, (location.hash.replace(/^#\//, '') || 'dashboard').split('/')[0]);
      }));
    }

    if (window.Assistant) Assistant.mount();
  },

  renderRibbonPages(gi, activeRoute) {
    const el = document.getElementById('ribbon-pages');
    if (!el) return;
    const groups = this.visibleNav();
    const pages = (groups[gi] || groups[0])[1];
    el.innerHTML = pages.map(([r, label, ico]) =>
      `<a class="rpage ${r === activeRoute ? 'active' : ''}" href="#/${r}">
        <span class="rp-ico">${ico}</span><span class="rp-label">${label}</span></a>`).join('');
  },

  /* Mantém abas e faixa em sincronia com a página atual */
  syncRibbon(route) {
    const groups = this.visibleNav();
    let gi = groups.findIndex(([, items]) => items.some(([r]) => r === route));
    if (gi === -1) gi = this._ribbonG || 0;
    this._ribbonG = gi;
    document.querySelectorAll('.rtab').forEach((b, i) => b.classList.toggle('active', i === gi));
    this.renderRibbonPages(gi, route);
  },

  /* ---------------- Trabalho simultâneo ----------------
     Verifica a cada 8s se alguém alterou algo no servidor e recarrega a
     tela atual sozinha. Nunca interrompe quem está digitando: pula
     enquanto houver janela aberta, campo em foco ou aba em segundo plano. */
  startLiveRefresh() {
    if (this._liveTimer) return;
    this._lastRev = null;     // o que esta tela está mostrando
    this._serverRev = null;   // o que existe no servidor agora
    this._streamOk = false;

    this.get('/rev').then(r => {
      if (this._lastRev === null) { this._lastRev = r.rev; this._serverRev = r.rev; }
    }).catch(() => {});

    /* Aplica a atualização quando for seguro (nunca por cima de alguém
       trabalhando — se estiver ocupado, espera e aplica assim que liberar). */
    const aplicar = async () => {
      if (document.hidden) return;
      const modalAberto = document.getElementById('modal-root').children.length > 0;
      const ativo = document.activeElement;
      const digitando = ativo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ativo.tagName);
      const visualizando3D = !!document.querySelector('.v3d-wrap');
      const rota = (location.hash.replace(/^#\//, '') || 'dashboard').split('/')[0];
      if (modalAberto || digitando || visualizando3D || rota === 'reports') return;
      if (!this._streamOk) {
        // Sem conexão ao vivo: pergunta ao servidor (modo reserva)
        try { this._serverRev = (await this.get('/rev')).rev; } catch (e) { return; }
      }
      if (this._serverRev === null || this._lastRev === null) return;
      if (this._serverRev === this._lastRev) return;
      this._lastRev = this._serverRev;
      const y = window.scrollY;
      await this.route();
      window.scrollTo(0, y); // mantém a posição de leitura
    };
    this._applyLive = aplicar;

    /* Conexão ao vivo: o servidor avisa no instante em que algo muda. */
    const conectar = async () => {
      try {
        const res = await fetch('/api/events', { headers: { Authorization: 'Bearer ' + this.token() } });
        if (!res.ok || !res.body) throw new Error('sem stream');
        this._streamOk = true;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const bloco = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const linha = bloco.split('\n').find(l => l.startsWith('data:'));
            if (!linha) continue; // comentário/keep-alive
            try {
              const d = JSON.parse(linha.slice(5).trim());
              if (typeof d.rev === 'number') {
                this._serverRev = d.rev;
                if (this._lastRev === null) this._lastRev = d.rev;
                aplicar();
              }
            } catch (e) { /* mensagem inesperada — ignora */ }
          }
        }
      } catch (e) { /* cai para o modo reserva */ }
      this._streamOk = false;
      setTimeout(conectar, 5000); // reconecta sozinho
    };
    conectar();

    /* Rede de segurança: confere periodicamente e ao voltar para a janela. */
    this._liveTimer = setInterval(aplicar, 6000);
    window.addEventListener('focus', aplicar);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) aplicar(); });
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
    // o grupo da página atual fica sempre visível; os demais respeitam a preferência
    document.querySelectorAll('.nav-items').forEach(el => {
      const aberto = !!el.querySelector('a.active') || this.navIsOpen(el.dataset.g);
      el.classList.toggle('closed', !aberto);
      const head = document.querySelector(`.nav-group[data-g="${CSS.escape(el.dataset.g || '')}"]`);
      if (head) head.classList.toggle('open', aberto);
    });
    if (this.layoutMode() === 'top') this.syncRibbon(name);
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
