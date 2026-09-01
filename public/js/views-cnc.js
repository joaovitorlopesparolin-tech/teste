/* Programas CNC — ROMI D600
   Banco de dados dos programas da máquina, no lugar da planilha. */
'use strict';

App.registerView('cnc', async (view) => {
  App.setTitle('Programas CNC', 'ROMI D600 — cadastro, testes e histórico dos programas');
  const [programas, meta] = await Promise.all([App.get('/cnc'), App.get('/cnc/meta')]);
  const podeExcluir = App.can('cnc_delete');

  const APLIC = meta.aplicacoes;      // [['UN','Unilateral'], …]
  const OPER = meta.operacoes;        // [['ADM','Admissão'], …]
  const STATUS = meta.status;         // [['em_teste','Em teste'], …]
  const rotulo = (lista, v) => (lista.find(x => x[0] === v) || [null, v || '—'])[1];

  /* O status vira badge com a cor que o sistema já usa para significado
     parecido: aprovado é verde, reprovado é vermelho, em teste é aviso. */
  const BADGE = { aprovado: 'ok', reprovado: 'danger', em_teste: 'warn', nao_utiliza: 'cancelada' };
  const selo = (p) => `<span class="badge ${BADGE[p.status] || ''}">${App.esc(p.statusLabel)}</span>`;

  /* Os 5 caracteres que a máquina mostra — o motivo de toda a nomenclatura.
     Aparecem em monoespaçada, destacados do resto do nome. */
  const visorHtml = (p, { soVisor } = {}) => {
    const nome = String(p.nome || p.nomeOriginal || '');
    if (!nome) return '<span class="muted">—</span>';
    const chip = `<span class="cnc-visor" title="O que aparece no visor da ROMI D600">${
      App.esc(nome.slice(0, 5).toUpperCase())}</span>`;
    /* Sem nome padronizado, o resto do nome é o nome original — que já está
       na coluna ao lado. Repeti-lo aqui, cortado no quinto caractere, dava
       a impressão de texto quebrado. */
    if (soVisor || nome.length <= 5) return chip;
    return chip + `<span class="cnc-resto">${App.esc(nome.slice(5))}</span>`;
  };

  let filtroAplic = '', filtroOper = '', filtroStatus = '';
  let ordem = { chave: 'Programa', desc: false };

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" onclick="Cnc.novo()">+ Novo programa</button>
      <input class="search" id="cnc-busca" style="max-width:330px"
        placeholder="🔎 Buscar por nome, nome original, aplicação, CFM, observações…">
      <div class="spacer"></div>
      <span class="muted small" id="cnc-contagem"></span>
      <button class="btn" onclick="Cnc.print()">🖨️ Imprimir</button>
    </div>

    <div class="toolbar" style="margin-top:-4px">
      <span class="small muted">Filtrar:</span>
      <div id="cnc-chips-aplic" class="cnc-chips"></div>
      <span class="cnc-sep"></span>
      <div id="cnc-chips-oper" class="cnc-chips"></div>
      <span class="cnc-sep"></span>
      <div id="cnc-chips-status" class="cnc-chips"></div>
    </div>

    <div class="card cnc-legenda">
      <b>📟 O visor da ROMI D600 mostra só os 5 primeiros caracteres.</b>
      <span class="muted small">Por isso o nome padronizado começa pela aplicação e pela operação —
      <span class="cnc-visor">UNADM</span> já diz "Unilateral, admissão" na própria máquina.
      Os nomes antigos ficam como estão; o nome original nunca é alterado.</span>
    </div>

    <div id="cnc-lista"></div>`;

  /* Filtros como chips: o dedo acha mais rápido que um seletor, e dá para
     ver de relance o que está ligado. */
  const chips = (el, lista, atual, aoEscolher) => {
    document.getElementById(el).innerHTML =
      [['', 'Todos', 'Todos']].concat(lista).map(([v, l, curto]) =>
        `<button class="cnc-chip${v === atual ? ' on' : ''}" data-v="${App.esc(v)}"
          title="${App.esc(l)}">${App.esc(curto || l)}</button>`).join('');
    document.getElementById(el).querySelectorAll('.cnc-chip').forEach(b => {
      b.onclick = () => { aoEscolher(b.dataset.v); render(); };
    });
  };

  const render = () => {
    chips('cnc-chips-aplic', APLIC, filtroAplic, v => { filtroAplic = v; });
    chips('cnc-chips-oper', OPER.filter(o => o[0]), filtroOper, v => { filtroOper = v; });
    chips('cnc-chips-status', STATUS, filtroStatus, v => { filtroStatus = v; });

    const base = programas.filter(p =>
      (!filtroAplic || p.aplicacao === filtroAplic) &&
      (!filtroOper || p.operacao === filtroOper) &&
      (!filtroStatus || p.status === filtroStatus));

    const list = App.filtraPor(base, document.getElementById('cnc-busca').value,
      ['nome', 'nomeOriginal', 'aplicacao', 'operacao', 'observacoes',
        'aplicacaoLabel', 'operacaoLabel', 'statusLabel',
        p => p.cfm == null ? '' : String(p.cfm)]);

    document.getElementById('cnc-contagem').textContent =
      `${list.length} programa(s)${list.length !== programas.length ? ` de ${programas.length}` : ''}`;

    document.getElementById('cnc-lista').innerHTML = App.table(list, [
      { h: 'Programa', key: 'Programa', sort: p => (p.nome || p.nomeOriginal || '').toUpperCase(), sortDesc: false,
        cell: p => visorHtml(p, { soVisor: !p.nome }) +
          (p.nome ? '' : '<div class="small muted">antigo — sem nome padronizado</div>') },
      { h: 'Nome original', key: 'Original', sort: p => (p.nomeOriginal || '').toUpperCase(), sortDesc: false,
        cell: p => p.nomeOriginal ? `<span class="mono small">${App.esc(p.nomeOriginal)}</span>` : '<span class="muted">—</span>' },
      { h: 'Aplicação', key: 'Aplicação', sort: p => (p.aplicacaoLabel || '') + (p.operacaoLabel || ''), sortDesc: false,
        cell: p => `${App.esc(p.aplicacaoLabel || p.aplicacao || '—')}${
          p.operacao ? `<div class="small muted">${App.esc(p.operacaoLabel || p.operacao)}</div>` : ''}` },
      { h: 'Status', key: 'Status', sort: p => p.statusLabel || '', sortDesc: false, cell: p => selo(p) },
      { h: 'Última alteração', key: 'Alteração', sort: p => p.dataAlteracao || '', cell: p => App.date(p.dataAlteracao) },
      { h: 'CFM', class: 'num', key: 'CFM', sort: p => p.cfm == null ? -1 : Number(p.cfm),
        cell: p => p.cfm == null ? '<span class="muted">—</span>' : `<b>${App.esc(String(p.cfm))}</b>` },
      { h: '', class: 'num', cell: p => `
        ${p.arquivo ? `<a class="btn sm ghost" href="/api/cnc/${p.id}/arquivo" title="Baixar ${App.esc(p.arquivoNome)}">⤓</a>` : ''}
        <button class="btn sm" onclick="Cnc.abrir(${p.id})">Abrir</button>` }
    ], {
      emptyMsg: programas.length
        ? 'Nenhum programa nesta seleção — limpe os filtros ou a busca.'
        : 'Nenhum programa cadastrado ainda. Comece pelo botão “Novo programa”.',
      sortState: ordem,
      onSort: (o) => { ordem = o; render(); },
      onRow: p => Cnc.abrir(p.id)
    });
  };
  render();
  document.getElementById('cnc-busca').addEventListener('input', render);

  /* Campos do formulário, compartilhados entre criar e editar. */
  const campos = (p) => [
    { name: 'aplicacao', label: 'Aplicação / tipo de cabeçote', type: 'select', value: p.aplicacao || 'UN',
      options: APLIC.map(([v, l]) => ({ value: v, label: `${v} — ${l}` })) },
    { name: 'operacao', label: 'Operação / região', type: 'select', value: p.operacao || '',
      options: OPER.map(([v, l]) => ({ value: v, label: v ? `${v} — ${l}` : l })) },
    { name: 'nome', label: 'Novo nome (padronizado) — os 5 primeiros aparecem no visor', value: p.nome || '', full: true },
    { name: 'nomeOriginal', label: 'Nome original do programa (como o Robson salvou)', value: p.nomeOriginal || '', full: true },
    { name: 'status', label: 'Status', type: 'select', value: p.status || 'em_teste',
      options: STATUS.map(([v, l]) => ({ value: v, label: l })) },
    { name: 'cfm', label: 'CFM (resultado do teste de bancada)', type: 'number', step: '0.1',
      value: p.cfm == null ? '' : p.cfm },
    { name: 'dataCriacao', label: 'Data de criação', type: 'date', value: p.dataCriacao || App.today() },
    { name: 'dataAlteracao', label: 'Último salvamento/alteração', type: 'date', value: p.dataAlteracao || App.today() },
    { name: 'observacoes', label: 'Observações', type: 'textarea', value: p.observacoes || '', full: true }
  ];

  /**
   * Prévia viva do nome: mostra os 5 caracteres do visor enquanto a pessoa
   * escolhe aplicação e operação, e oferece o próximo número da sequência.
   * É o que transforma a regra da máquina em algo visível na hora.
   */
  const montarAjudaNome = (m, { sugerir }) => {
    const campo = n => m.querySelector(`[name="${n}"]`);
    const nome = campo('nome'), aplic = campo('aplicacao'), oper = campo('operacao');
    const aviso = document.createElement('div');
    aviso.className = 'cnc-preview';
    nome.parentElement.appendChild(aviso);

    const atualizar = () => {
      const v = String(nome.value || '').toUpperCase().slice(0, 5);
      aviso.innerHTML = v
        ? `No visor da máquina: <span class="cnc-visor">${App.esc(v.padEnd(5, '·'))}</span>
           ${v.startsWith((aplic.value || '') + (oper.value || '')) ? '<span class="pos small">✓ identifica a aplicação</span>'
             : '<span class="warn-txt small">⚠ os 5 primeiros não batem com a aplicação escolhida</span>'}`
        : '<span class="muted small">Digite o nome ou use “Sugerir nome” para seguir o padrão.</span>';
    };
    nome.addEventListener('input', atualizar);
    aplic.addEventListener('change', atualizar);
    oper.addEventListener('change', atualizar);

    if (sugerir) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn sm';
      btn.style.marginTop = '6px';
      btn.textContent = '✨ Sugerir nome no padrão';
      btn.onclick = async () => {
        const r = await App.get(`/cnc/proximo-nome?aplicacao=${encodeURIComponent(aplic.value)}&operacao=${encodeURIComponent(oper.value)}`);
        nome.value = r.nome;
        atualizar();
      };
      aviso.after(btn);
    }
    atualizar();
  };

  window.Cnc = {
    novo() {
      const m = App.form('Novo programa CNC', campos({}), async d => {
        d.cfm = d.cfm === '' ? null : Number(d.cfm);
        await App.post('/cnc', d);
        App.closeModal(); App.toast('Programa cadastrado', 'ok'); App.route();
      }, { wide: true });
      montarAjudaNome(m, { sugerir: true });
    },

    editar(id) {
      const p = programas.find(x => x.id === id);
      if (!p) return;
      const m = App.form(`Editar ${p.nome || p.nomeOriginal}`,
        campos(p).concat([{ name: 'motivo', label: 'Motivo da alteração (entra no histórico)', full: true }]),
        async d => {
          d.cfm = d.cfm === '' ? null : Number(d.cfm);
          const r = await App.put('/cnc/' + id, d);
          App.closeModal();
          App.toast(r.mudancas && r.mudancas.length ? 'Programa atualizado — registrado no histórico' : 'Nada mudou', 'ok');
          App.route();
        }, { wide: true });
      montarAjudaNome(m, { sugerir: false });
    },

    /* Ficha do programa: tudo que não cabe na listagem. */
    async abrir(id) {
      let p;
      try { p = await App.get('/cnc/' + id); } catch (e) { return App.toast(e.message, 'err'); }
      const hist = (p.historico || []).slice().reverse();
      const linha = (r, v) => v === '' || v === null || v === undefined
        ? '' : `<tr><td class="muted">${r}</td><td>${v}</td></tr>`;

      App.modal(`
        <h2>${visorHtml(p)} ${selo(p)}</h2>
        <p class="small muted">${App.esc(p.aplicacaoLabel || p.aplicacao || '')}${
          p.operacaoLabel && p.operacao ? ' · ' + App.esc(p.operacaoLabel) : ''}
          ${p.nomeOriginal ? ' · original: ' + App.esc(p.nomeOriginal) : ''}</p>

        <table style="font-size:13.5px">
          ${linha('Nome padronizado', p.nome ? `<b class="mono">${App.esc(p.nome)}</b>` : '<span class="muted">ainda não definido</span>')}
          ${linha('Nome original', p.nomeOriginal ? `<span class="mono">${App.esc(p.nomeOriginal)}</span>` : '<span class="muted">—</span>')}
          ${linha('No visor da máquina', `<span class="cnc-visor">${App.esc(p.visor.padEnd(5, '·'))}</span>`)}
          ${linha('Aplicação', App.esc(p.aplicacaoLabel || p.aplicacao || '—'))}
          ${linha('Operação', p.operacao ? App.esc(p.operacaoLabel || p.operacao) : '<span class="muted">não se aplica</span>')}
          ${linha('Status', selo(p))}
          ${linha('CFM (teste de bancada)', p.cfm == null ? '<span class="muted">sem resultado</span>' : `<b>${App.esc(String(p.cfm))}</b>`)}
          ${linha('Criado em', App.date(p.dataCriacao))}
          ${linha('Último salvamento', App.date(p.dataAlteracao))}
          ${linha('Arquivo do programa', p.arquivo
            ? `<a class="btn sm ghost" href="/api/cnc/${p.id}/arquivo">⤓ ${App.esc(p.arquivoNome)}</a>
               <span class="small muted">${(p.arquivoTamanho / 1024).toFixed(1)} KB</span>`
            : '<span class="muted">nenhum anexado</span>')}
        </table>

        ${p.observacoes ? `<h3 class="section-title">Observações</h3><p>${App.esc(p.observacoes)}</p>` : ''}

        <h3 class="section-title">Histórico de alterações</h3>
        ${hist.length ? `<ul class="timeline">${hist.map(h => `
          <li><div class="when">${App.dateTime(h.at)} · ${App.esc(h.por || '—')}</div>
          <div class="what">${App.esc(h.evento)}</div></li>`).join('')}</ul>`
          : '<div class="empty">Sem alterações registradas</div>'}

        <div class="actions">
          <button class="btn" onclick="App.closeModal()">Fechar</button>
          <label class="btn" style="cursor:pointer">📎 ${p.arquivo ? 'Trocar' : 'Anexar'} arquivo
            <input type="file" id="cnc-file" hidden></label>
          ${podeExcluir ? `<button class="btn ghost" onclick="Cnc.excluir(${p.id})" title="Excluir cadastro">🗑️ Excluir</button>` : ''}
          <button class="btn primary" onclick="App.closeModal();Cnc.editar(${p.id})">✏️ Editar</button>
        </div>`, { wide: true });

      document.getElementById('cnc-file').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        App.toast('Enviando arquivo…', 'ok');
        try {
          const r = await fetch(`/api/cnc/${id}/arquivo?nome=${encodeURIComponent(f.name)}`, {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + App.token() },
            body: f
          });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data.error || 'Falha no envio');
          App.closeModal(); App.toast('Arquivo anexado ao programa', 'ok'); App.route();
        } catch (err) { App.toast(err.message, 'err'); }
      });
    },

    excluir(id) {
      const p = programas.find(x => x.id === id) || {};
      App.closeModal();
      App.excluirLancamento(`/cnc/${id}`, 'este programa',
        { nome: p.nome || p.nomeOriginal || `programa #${id}` });
    },

    print() {
      const list = App.filtraPor(programas.filter(p =>
        (!filtroAplic || p.aplicacao === filtroAplic) &&
        (!filtroOper || p.operacao === filtroOper) &&
        (!filtroStatus || p.status === filtroStatus)),
      document.getElementById('cnc-busca').value,
      ['nome', 'nomeOriginal', 'aplicacaoLabel', 'operacaoLabel', 'statusLabel', 'observacoes']);
      const filtros = [
        filtroAplic ? rotulo(APLIC, filtroAplic) : '',
        filtroOper ? rotulo(OPER, filtroOper) : '',
        filtroStatus ? rotulo(STATUS, filtroStatus) : ''
      ].filter(Boolean).join(' · ');
      App.print('Programas CNC — ROMI D600' + (filtros ? ' — ' + filtros : ''),
        `<table><tr><th>Visor</th><th>Nome padronizado</th><th>Nome original</th><th>Aplicação</th>
          <th>Status</th><th class="num">CFM</th><th>Última alteração</th></tr>
        ${list.map(p => `<tr>
          <td><b>${App.esc(p.visor)}</b></td>
          <td>${App.esc(p.nome || '—')}</td>
          <td>${App.esc(p.nomeOriginal || '—')}</td>
          <td>${App.esc(p.aplicacaoLabel || p.aplicacao || '—')}${p.operacao ? `<div class="sub">${App.esc(p.operacaoLabel)}</div>` : ''}</td>
          <td>${App.esc(p.statusLabel)}</td>
          <td class="num">${p.cfm == null ? '—' : App.esc(String(p.cfm))}</td>
          <td>${App.date(p.dataAlteracao)}</td></tr>`).join('')}</table>`,
        `${list.length} programa(s)` + (filtros ? ` — ${filtros}` : ''));
    }
  };
});
