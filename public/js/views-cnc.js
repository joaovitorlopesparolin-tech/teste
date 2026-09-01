/* Programas CNC — ROMI D600
   Banco de dados dos programas da máquina, no lugar da planilha. */
'use strict';

App.registerView('cnc', async (view) => {
  App.setTitle('Programas CNC', 'ROMI D600 — cadastro, testes e histórico dos programas');
  const [programas, meta] = await Promise.all([App.get('/cnc'), App.get('/cnc/meta')]);
  const podeExcluir = App.can('cnc_delete');

  /* As classificações vêm do catálogo do banco, não de uma lista no código:
     é o que permite cadastrar um cabeçote ou uma área novos sem alteração
     no sistema. Inativos ficam de fora das escolhas, mas continuam
     resolvendo o nome dos programas que já os usam. */
  const cat = meta.catalogo;
  const ativos = (lista) => lista.filter(x => x.ativo !== false);
  const APLIC = ativos(cat.aplicacoes).map(a => [a.sigla, a.nome, a.sigla]);
  const OPER = ativos(cat.areas).map(a => [a.sigla, a.nome, a.sigla]);
  const STATUS = meta.status;         // [['em_teste','Em teste'], …]
  const rotulo = (lista, v) => (lista.find(x => x[0] === v) || [null, v || '—'])[1];

  /* Cascos de uma aplicação e modelos de um casco — a hierarquia
     "FC → México → BA" que evita misturar os códigos de origens diferentes. */
  const cascosDe = (siglaAplic) => {
    const a = cat.aplicacoes.find(x => x.sigla === siglaAplic);
    return a ? ativos(cat.cascos).filter(c => c.paiId === a.id) : [];
  };
  const modelosDe = (siglaCasco, siglaAplic) => {
    const c = cascosDe(siglaAplic).find(x => x.sigla === siglaCasco)
      || cat.cascos.find(x => x.sigla === siglaCasco);
    return c ? ativos(cat.modelos).filter(m => m.paiId === c.id) : [];
  };

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
      <button class="btn" onclick="Cnc.catalogo()" title="Cadastrar aplicações, cascos, códigos e áreas">⚙ Classificações</button>
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
      ['nome', 'nomeOriginal', 'aplicacao', 'operacao', 'casco', 'modelo', 'observacoes',
        'aplicacaoLabel', 'operacaoLabel', 'cascoLabel', 'modeloLabel', 'statusLabel',
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
        cell: p => {
          /* A hierarquia inteira numa linha só: FC · México · BA */
          const trilha = [p.aplicacaoLabel || p.aplicacao, p.cascoLabel || p.casco, p.modeloLabel || p.modelo]
            .filter(Boolean).map(x => App.esc(x)).join(' <span class="muted">·</span> ');
          return (trilha || '—') +
            (p.operacao ? `<div class="small muted">${App.esc(p.operacaoLabel || p.operacao)}</div>` : '');
        } },
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
    { name: 'casco', label: 'Origem / tipo do casco (opcional)', type: 'select', value: p.casco || '',
      options: [{ value: '', label: '— não classificado —' }] },
    { name: 'modelo', label: 'Modelo / código (opcional)', type: 'select', value: p.modelo || '',
      options: [{ value: '', label: '— não classificado —' }] },
    { name: 'operacao', label: 'Área de operação', type: 'select', value: p.operacao || '',
      options: [{ value: '', label: 'Não se aplica' }]
        .concat(OPER.map(([v, l]) => ({ value: v, label: `${v} — ${l}` }))) },
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
  const montarAjudaNome = (m, { sugerir, valores }) => {
    const campo = n => m.querySelector(`[name="${n}"]`);
    const nome = campo('nome'), aplic = campo('aplicacao'), oper = campo('operacao');
    const casco = campo('casco'), modelo = campo('modelo');

    /* Cascata: trocar a aplicação recarrega os cascos dela, e trocar o casco
       recarrega os modelos daquele casco. Sem isso, "BA" do México apareceria
       para quem escolheu Germany. */
    const encher = (sel, itens, escolhido) => {
      sel.innerHTML = ['<option value="">— não classificado —</option>']
        .concat(itens.map(i => `<option value="${App.esc(i.sigla)}"${i.sigla === escolhido ? ' selected' : ''}>${
          App.esc(i.sigla)} — ${App.esc(i.nome)}</option>`)).join('');
      sel.disabled = !itens.length;
      sel.title = itens.length ? '' : 'Nada cadastrado para a escolha anterior — use ⚙ Configurar classificações';
    };
    const recarregarCascos = (manter) => {
      encher(casco, cascosDe(aplic.value), manter || '');
      recarregarModelos(manter ? (valores || {}).modelo : '');
    };
    const recarregarModelos = (manter) => {
      encher(modelo, casco.value ? modelosDe(casco.value, aplic.value) : [], manter || '');
    };
    aplic.addEventListener('change', () => recarregarCascos(''));
    casco.addEventListener('change', () => recarregarModelos(''));
    recarregarCascos((valores || {}).casco);
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
        const r = await App.get('/cnc/proximo-nome?aplicacao=' + encodeURIComponent(aplic.value) +
          '&area=' + encodeURIComponent(oper.value) + '&modelo=' + encodeURIComponent(modelo.value || ''));
        nome.value = r.nome;
        atualizar();
      };
      aviso.after(btn);
    }
    atualizar();
  };

  window.Cnc = {
    /* ---------- Configuração das classificações ----------
       A oficina cadastra aqui um cabeçote ou uma área nova sem depender de
       alteração no sistema. A hierarquia é aplicação → casco → modelo; as
       áreas de operação são soltas e valem para qualquer aplicação. */
    async catalogo() {
      const c = await App.get('/cnc/catalogo');
      const nomeDoPai = (id, lista) => {
        const p = lista.find(x => x.id === id);
        return p ? `${p.sigla} — ${p.nome}` : '—';
      };
      const linhaSigla = (x) => `<span class="cnc-visor">${App.esc(x.sigla)}</span>` +
        (x.ativo === false ? ' <span class="badge cancelada">inativo</span>' : '');
      const acoes = (x) => `
        <button class="btn sm ghost" onclick="Cnc.catEditar(${x.id})" title="Editar">✏️</button>
        <button class="btn sm ghost" onclick="Cnc.catAtivar(${x.id}, ${x.ativo === false})"
          title="${x.ativo === false ? 'Reativar' : 'Inativar — some das escolhas, o histórico fica'}">${x.ativo === false ? '↩️' : '🚫'}</button>
        <button class="btn sm ghost" onclick="Cnc.catExcluir(${x.id})" title="Excluir">🗑️</button>`;
      const emUso = (x) => x.emUso
        ? `<span class="small muted">${x.emUso} programa(s)</span>`
        : '<span class="small muted">—</span>';

      App.modal(`
        <h2>⚙ Classificações dos programas CNC</h2>
        <p class="small muted">Tudo aqui é cadastro: quando aparecer um cabeçote novo ou uma área de
        usinagem nova, some nesta tela e ela passa a valer nos próximos programas.
        <b>Os programas já cadastrados não são alterados.</b></p>

        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>Aplicações / tipos de cabeçote</span>
          <button class="btn sm" onclick="Cnc.catNovo('aplicacao')">+ Nova aplicação</button></div>
        <p class="small muted" style="margin:-4px 0 6px">A sigla entra nos 2 primeiros caracteres do visor.</p>
        ${App.table(c.aplicacoes, [
          { h: 'Sigla', cell: linhaSigla },
          { h: 'Nome', cell: x => App.esc(x.nome) },
          { h: 'Em uso', cell: emUso },
          { h: '', class: 'num', cell: acoes }
        ], { emptyMsg: 'Nenhuma aplicação cadastrada' })}

        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>Origens / tipos de casco</span>
          <button class="btn sm" onclick="Cnc.catNovo('casco')">+ Novo casco</button></div>
        <p class="small muted" style="margin:-4px 0 6px">Pertencem a uma aplicação — ex.: Fluxo cruzado → México.</p>
        ${App.table(c.cascos, [
          { h: 'Sigla', cell: linhaSigla },
          { h: 'Nome', cell: x => App.esc(x.nome) },
          { h: 'Aplicação', cell: x => App.esc(nomeDoPai(x.paiId, c.aplicacoes)) },
          { h: 'Em uso', cell: emUso },
          { h: '', class: 'num', cell: acoes }
        ], { emptyMsg: 'Nenhum casco cadastrado ainda' })}

        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>Modelos / códigos</span>
          <button class="btn sm" onclick="Cnc.catNovo('modelo')">+ Novo código</button></div>
        <p class="small muted" style="margin:-4px 0 6px">Pertencem a um casco — ex.: México → BA, AB, AD.</p>
        ${App.table(c.modelos, [
          { h: 'Sigla', cell: linhaSigla },
          { h: 'Nome', cell: x => App.esc(x.nome) },
          { h: 'Casco', cell: x => App.esc(nomeDoPai(x.paiId, c.cascos)) },
          { h: 'Em uso', cell: emUso },
          { h: '', class: 'num', cell: acoes }
        ], { emptyMsg: 'Nenhum código cadastrado ainda' })}

        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>Áreas de operação</span>
          <button class="btn sm" onclick="Cnc.catNovo('area')">+ Nova área</button></div>
        <p class="small muted" style="margin:-4px 0 6px">A sigla entra logo depois da aplicação — com 3 caracteres,
        aplicação + área preenchem exatamente os 5 do visor.</p>
        ${App.table(c.areas, [
          { h: 'Sigla', cell: linhaSigla },
          { h: 'Nome', cell: x => App.esc(x.nome) },
          { h: 'Em uso', cell: emUso },
          { h: '', class: 'num', cell: acoes }
        ], { emptyMsg: 'Nenhuma área cadastrada' })}

        <div class="actions"><button class="btn primary" onclick="App.closeModal()">Fechar</button></div>`,
        { wide: true });
    },

    async catNovo(tipo) {
      const c = await App.get('/cnc/catalogo');
      const ROTULO = { aplicacao: 'aplicação', casco: 'origem/casco', modelo: 'modelo/código', area: 'área de operação' };
      const pais = tipo === 'casco' ? c.aplicacoes : tipo === 'modelo' ? c.cascos : null;
      if (pais && !pais.length) {
        return App.toast(tipo === 'casco'
          ? 'Cadastre uma aplicação antes de cadastrar um casco.'
          : 'Cadastre um casco antes de cadastrar um código.', 'err');
      }
      const m = App.form(`Nova ${ROTULO[tipo]}`, [
        { name: 'sigla', label: 'Sigla (entra no nome do programa)', required: true },
        { name: 'nome', label: 'Nome por extenso', required: true, full: true },
        ...(pais ? [{ name: 'paiId', label: tipo === 'casco' ? 'Aplicação' : 'Casco', type: 'select',
          required: true, full: true,
          options: pais.map(p => ({ value: p.id, label: `${p.sigla} — ${p.nome}` })) }] : [])
      ], async d => {
        await App.post('/cnc/catalogo', Object.assign({ tipo }, d, { paiId: d.paiId ? Number(d.paiId) : null }));
        App.closeModal(); App.toast('Cadastrado', 'ok'); App.route();
      });
      /* Mostra o efeito da sigla no visor enquanto a pessoa digita — é a
         única forma de perceber, na hora, que uma sigla de 4 letras vai
         empurrar a informação para fora dos 5 caracteres da máquina. */
      if (tipo === 'aplicacao' || tipo === 'area') {
        const sigla = m.querySelector('[name="sigla"]');
        const dica = document.createElement('div');
        dica.className = 'cnc-preview';
        sigla.parentElement.appendChild(dica);
        const ver = () => {
          const v = String(sigla.value || '').toUpperCase();
          const exemplo = tipo === 'aplicacao' ? (v + 'ADM') : ('UN' + v);
          dica.innerHTML = v
            ? `Ficaria assim no visor: <span class="cnc-visor">${App.esc(exemplo.slice(0, 5).padEnd(5, '·'))}</span>` +
              (exemplo.length > 5 ? ' <span class="warn-txt small">⚠ passa dos 5 caracteres — parte não aparece na máquina</span>' : '')
            : '';
        };
        sigla.addEventListener('input', ver);
      }
    },

    async catEditar(id) {
      const c = await App.get('/cnc/catalogo');
      const x = [].concat(c.aplicacoes, c.cascos, c.modelos, c.areas).find(y => y.id === id);
      if (!x) return;
      App.form(`Editar ${App.esc(x.sigla)} — ${App.esc(x.nome)}`, [
        { name: 'sigla', label: 'Sigla', value: x.sigla, required: true },
        { name: 'nome', label: 'Nome por extenso', value: x.nome, required: true, full: true }
      ], async d => {
        const r = await App.put('/cnc/catalogo/' + id, d);
        App.closeModal();
        App.toast(r.migrados
          ? `Atualizado — ${r.migrados} programa(s) acompanharam a sigla (o nome deles não mudou)`
          : 'Atualizado', 'ok');
        App.route();
      });
    },

    async catAtivar(id, reativar) {
      try {
        await App.put('/cnc/catalogo/' + id, { ativo: !!reativar });
        App.toast(reativar ? 'Reativado' : 'Inativado — some das escolhas, o histórico fica', 'ok');
        App.route();
      } catch (e) { App.toast(e.message, 'err'); }
    },

    catExcluir(id) {
      App.closeModal();
      App.excluirLancamento(`/cnc/catalogo/${id}`, 'esta classificação');
    },
    novo() {
      const m = App.form('Novo programa CNC', campos({}), async d => {
        d.cfm = d.cfm === '' ? null : Number(d.cfm);
        await App.post('/cnc', d);
        App.closeModal(); App.toast('Programa cadastrado', 'ok'); App.route();
      }, { wide: true });
      montarAjudaNome(m, { sugerir: true, valores: {} });
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
      montarAjudaNome(m, { sugerir: false, valores: { casco: p.casco, modelo: p.modelo } });
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
        <p class="small muted">${[p.aplicacaoLabel || p.aplicacao, p.cascoLabel || p.casco,
            p.modeloLabel || p.modelo, p.operacao ? (p.operacaoLabel || p.operacao) : '']
          .filter(Boolean).map(x => App.esc(x)).join(' · ')}
          ${p.nomeOriginal ? ' · original: ' + App.esc(p.nomeOriginal) : ''}</p>

        <table style="font-size:13.5px">
          ${linha('Nome padronizado', p.nome ? `<b class="mono">${App.esc(p.nome)}</b>` : '<span class="muted">ainda não definido</span>')}
          ${linha('Nome original', p.nomeOriginal ? `<span class="mono">${App.esc(p.nomeOriginal)}</span>` : '<span class="muted">—</span>')}
          ${linha('No visor da máquina', `<span class="cnc-visor">${App.esc(p.visor.padEnd(5, '·'))}</span>`)}
          ${linha('Aplicação', App.esc(p.aplicacaoLabel || p.aplicacao || '—'))}
          ${linha('Origem / casco', p.casco ? App.esc(p.cascoLabel || p.casco) : '<span class="muted">não classificado</span>')}
          ${linha('Modelo / código', p.modelo ? App.esc(p.modeloLabel || p.modelo) : '<span class="muted">não classificado</span>')}
          ${linha('Área de operação', p.operacao ? App.esc(p.operacaoLabel || p.operacao) : '<span class="muted">não se aplica</span>')}
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
          <td>${[p.aplicacaoLabel || p.aplicacao, p.cascoLabel || p.casco, p.modeloLabel || p.modelo]
            .filter(Boolean).map(x => App.esc(x)).join(' · ') || '—'}${
            p.operacao ? `<div class="sub">${App.esc(p.operacaoLabel || p.operacao)}</div>` : ''}</td>
          <td>${App.esc(p.statusLabel)}</td>
          <td class="num">${p.cfm == null ? '—' : App.esc(String(p.cfm))}</td>
          <td>${App.date(p.dataAlteracao)}</td></tr>`).join('')}</table>`,
        `${list.length} programa(s)` + (filtros ? ` — ${filtros}` : ''));
    }
  };
});
