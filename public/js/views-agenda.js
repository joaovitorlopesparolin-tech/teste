/* Agenda financeira: contas a pagar e a receber no calendário do mês.
   A tela não cadastra nada — lê o que já existe nos dois módulos. */
'use strict';

const AGENDA_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const AGENDA_DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/* Datas sempre ao meio-dia: evita que o fuso empurre o dia para trás. */
const agDt = s => new Date(String(s).slice(0, 10) + 'T12:00:00');
const agIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const agMesLabel = ym => `${AGENDA_MESES[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;

function agPrimeiroDia(ym) { return ym + '-01'; }
function agUltimoDia(ym) {
  const d = agDt(ym + '-01');
  d.setMonth(d.getMonth() + 1); d.setDate(0);
  return agIso(d);
}
function agMesesEntre(de, ate) {
  const out = [];
  const d = agDt(de.slice(0, 8) + '01');
  const fim = agDt(ate.slice(0, 8) + '01');
  while (d <= fim) { out.push(agIso(d).slice(0, 7)); d.setMonth(d.getMonth() + 1); }
  return out;
}
/** Semanas completas (domingo a sábado) que cobrem o mês. */
function agGradeDoMes(ym) {
  const primeiro = agDt(agPrimeiroDia(ym));
  const inicio = new Date(primeiro);
  inicio.setDate(1 - primeiro.getDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    cells.push(agIso(d));
  }
  // A sexta linha só fica se algum dia dela pertencer ao mês.
  if (cells.slice(35).every(c => c.slice(0, 7) !== ym)) cells.length = 35;
  return cells;
}

App.registerView('agenda', async (view) => {
  App.setTitle('Agenda financeira', 'Contas a pagar e a receber no calendário — vem tudo dos módulos financeiros');

  const hoje = App.today();
  const estado = {
    modo: 'mes',                 // 'mes' | 'periodo'
    mes: hoje.slice(0, 7),
    de: agPrimeiroDia(hoje.slice(0, 7)),
    ate: agUltimoDia(hoje.slice(0, 7)),
    base: localStorage.getItem('jm_agenda_base') === 'caixa' ? 'caixa' : 'vencimento'
  };
  let dados = null;

  const periodo = () => estado.modo === 'mes'
    ? { de: agPrimeiroDia(estado.mes), ate: agUltimoDia(estado.mes) }
    : { de: estado.de, ate: estado.ate };

  async function carregar() {
    const { de, ate } = periodo();
    dados = await App.get(`/agenda?de=${de}&ate=${ate}&base=${estado.base}`);
    dados.porDia = {};
    for (const d of dados.dias) dados.porDia[d.data] = d;
    render();
  }

  /* ---------------- Célula de um dia ---------------- */
  function celula(data, ymDoBloco) {
    const dia = dados.porDia[data];
    const foraDoMes = data.slice(0, 7) !== ymDoBloco;
    const foraDoPeriodo = data < dados.de || data > dados.ate;
    const classes = ['ag-dia'];
    if (foraDoMes) classes.push('fora');
    if (foraDoPeriodo) classes.push('fora-periodo');
    if (data === dados.hoje) classes.push('hoje');
    if (dia && dia.itens.length) classes.push('tem');

    /* Dia de outro mês só fecha a semana: os valores dele aparecem no bloco do
       próprio mês, e repeti-los aqui pareceria compromisso em dobro. */
    const linhas = [];
    if (foraDoMes) {
      return `<div class="${classes.join(' ')}"><div class="ag-num">${Number(data.slice(8, 10))}</div></div>`;
    }
    if (dia && dia.receber) {
      linhas.push(`<div class="ag-l receber" title="A receber">↧ ${App.money(dia.receber)}${
        dia.receberAberto < dia.receber ? '<span class="ag-ok" title="Já recebido, no todo ou em parte">✓</span>' : ''}</div>`);
    }
    if (dia && dia.pagar) {
      linhas.push(`<div class="ag-l pagar" title="A pagar">↥ ${App.money(dia.pagar)}${
        dia.pagarAberto < dia.pagar ? '<span class="ag-ok" title="Já pago, no todo ou em parte">✓</span>' : ''}</div>`);
    }

    const podeAbrir = dia && dia.itens.length && !foraDoPeriodo && !foraDoMes;
    return `<div class="${classes.join(' ')}" ${podeAbrir ? `onclick="Agenda.abrirDia('${data}')" role="button" tabindex="0"` : ''}>
      <div class="ag-num">${Number(data.slice(8, 10))}${
        dia && dia.vencidos ? `<span class="ag-alerta" title="${dia.vencidos} vencido(s)">!</span>` : ''}</div>
      ${linhas.join('') || '<div class="ag-vazio"></div>'}
    </div>`;
  }

  function blocoMes(ym) {
    const cells = agGradeDoMes(ym);
    return `<div class="card ag-mes">
      <h3>${agMesLabel(ym)}</h3>
      <div class="ag-grade">
        ${AGENDA_DIAS.map(d => `<div class="ag-cab">${d}</div>`).join('')}
        ${cells.map(c => celula(c, ym)).join('')}
      </div>
    </div>`;
  }

  /* ---------------- Tela ---------------- */
  function render() {
    const t = dados.totais;
    const { de, ate } = periodo();
    const meses = agMesesEntre(de, ate);
    const rotuloPeriodo = estado.modo === 'mes'
      ? agMesLabel(estado.mes)
      : `${App.date(de)} a ${App.date(ate)}`;

    view.innerHTML = `
      <div class="toolbar no-print">
        <button class="btn" onclick="Agenda.mover(-1)" title="Mês anterior">‹ Anterior</button>
        <button class="btn" onclick="Agenda.mesAtual()">Mês atual</button>
        <button class="btn" onclick="Agenda.mover(1)" title="Próximo mês">Próximo ›</button>
        <b style="margin-left:8px">${App.esc(rotuloPeriodo)}</b>
        <div class="spacer"></div>
        <select id="ag-base" style="max-width:210px" title="O que a data do calendário representa">
          <option value="vencimento" ${estado.base === 'vencimento' ? 'selected' : ''}>Por vencimento</option>
          <option value="caixa" ${estado.base === 'caixa' ? 'selected' : ''}>Por data de pagamento</option>
        </select>
        <button class="btn" onclick="Agenda.periodoPersonalizado()">📅 Período personalizado</button>
        <button class="btn" onclick="window.print()">🖨 Imprimir</button>
      </div>

      <div class="grid cols-4" style="margin-bottom:14px">
        ${dados.podeVerReceber ? `<div class="card kpi k-ok">
          <div class="label">A receber</div>
          <div class="value money">${App.money(t.receber)}</div>
          <div class="hint">${App.money(t.receberAberto)} em aberto · ${App.money(t.receberLiquidado)} recebido</div>
        </div>` : ''}
        ${dados.podeVerPagar ? `<div class="card kpi k-danger">
          <div class="label">A pagar</div>
          <div class="value money">${App.money(t.pagar)}</div>
          <div class="hint">${App.money(t.pagarAberto)} em aberto · ${App.money(t.pagarLiquidado)} pago</div>
        </div>` : ''}
        ${dados.podeVerPagar && dados.podeVerReceber ? `<div class="card kpi">
          <div class="label">Saldo do período</div>
          <div class="value money ${t.saldo < 0 ? 'neg' : 'pos'}">${App.money(t.saldo)}</div>
          <div class="hint">a receber − a pagar</div>
        </div>` : ''}
        <div class="card kpi ${t.vencidos ? 'k-warn' : ''}">
          <div class="label">Vencidos</div>
          <div class="value">${t.vencidos}</div>
          <div class="hint">${t.vencidos ? 'R$ ' + App.money(t.vencidosValor) + ' em atraso' : 'nada em atraso no período'}</div>
        </div>
      </div>

      <div class="ag-legenda small muted no-print">
        <span><i class="ag-p receber"></i> a receber</span>
        <span><i class="ag-p pagar"></i> a pagar</span>
        <span><span class="ag-ok">✓</span> já baixado</span>
        <span><span class="ag-alerta">!</span> vencido</span>
        <span>${t.qtd} compromisso(s) no período — clique num dia para ver o detalhe</span>
      </div>

      ${meses.map(blocoMes).join('')}`;

    document.getElementById('ag-base').addEventListener('change', e => {
      estado.base = e.target.value;
      localStorage.setItem('jm_agenda_base', estado.base);
      carregar();
    });
  }

  /* ---------------- Detalhe de um dia ---------------- */
  function abrirDia(data) {
    const dia = dados.porDia[data];
    if (!dia) return;
    const d = agDt(data);
    const tabela = App.table(dia.itens, [
      { h: 'Tipo', cell: i => i.tipo === 'receber'
        ? '<span class="badge ok">↧ A receber</span>' : '<span class="badge danger">↥ A pagar</span>' },
      { h: 'Cliente / Fornecedor', cell: i => i.contraparte
        ? App.esc(i.contraparte) + (i.contraparteCodigo ? `<div class="small muted mono">${App.esc(i.contraparteCodigo)}</div>` : '')
        : '<span class="muted">—</span>' },
      { h: 'Descrição', cell: i => App.esc(i.descricao) +
        (i.categoria ? `<div class="small muted">${App.esc(agCategoria(i.categoria))}</div>` : '') +
        (i.forma ? `<div class="small muted">${App.esc(i.forma)}</div>` : '') },
      { h: 'Vencimento', cell: i => App.date(i.vencimento) +
        (i.dataProgramada && i.dataProgramada !== i.vencimento
          ? `<div class="small muted">pgto ${App.date(i.dataProgramada)}</div>` : '') },
      { h: 'Valor', class: 'num', cell: i => `<span class="${i.tipo === 'receber' ? 'pos' : 'neg'}">${App.moneyHtml(i.valor)}</span>` },
      { h: 'Status', cell: i => App.badge(i.status) +
        (i.dataBaixa ? `<div class="small muted">em ${App.date(i.dataBaixa)}</div>` : '') }
    ], { emptyMsg: 'Nada neste dia' });

    App.modal(`
      <h2>${AGENDA_DIAS[d.getDay()]}, ${App.date(data)}</h2>
      <div class="grid cols-3" style="margin:10px 0 14px">
        <div class="card kpi k-ok"><div class="label">A receber</div><div class="value money">${App.money(dia.receber)}</div></div>
        <div class="card kpi k-danger"><div class="label">A pagar</div><div class="value money">${App.money(dia.pagar)}</div></div>
        <div class="card kpi"><div class="label">Saldo do dia</div>
          <div class="value money ${dia.saldo < 0 ? 'neg' : 'pos'}">${App.money(dia.saldo)}</div></div>
      </div>
      ${tabela}
      <div class="actions">
        ${dados.podeVerPagar ? '<button class="btn" onclick="App.closeModal();location.hash=\'#/payables\'">Abrir Contas a pagar</button>' : ''}
        ${dados.podeVerReceber ? '<button class="btn" onclick="App.closeModal();location.hash=\'#/receivables\'">Abrir Contas a receber</button>' : ''}
        <button class="btn primary" onclick="App.closeModal()">Fechar</button>
      </div>`, { wide: true });
  }

  /* Rótulo da categoria da conta a pagar, reaproveitando a lista do financeiro. */
  function agCategoria(cat) {
    const achado = (typeof CATS_PAG !== 'undefined' ? CATS_PAG : []).find(c => c[0] === cat);
    return achado ? achado[1] : cat;
  }

  window.Agenda = {
    abrirDia,
    mover(delta) {
      const base = estado.modo === 'mes' ? estado.mes : periodo().de.slice(0, 7);
      const d = agDt(base + '-01');
      d.setMonth(d.getMonth() + delta);
      estado.modo = 'mes';
      estado.mes = agIso(d).slice(0, 7);
      carregar();
    },
    mesAtual() {
      estado.modo = 'mes';
      estado.mes = App.today().slice(0, 7);
      carregar();
    },
    periodoPersonalizado() {
      const p = periodo();
      App.form('Período personalizado', [
        { name: 'de', label: 'De', type: 'date', value: p.de, required: true },
        { name: 'ate', label: 'Até', type: 'date', value: p.ate, required: true }
      ], async d => {
        if (d.ate < d.de) return App.toast('O fim do período não pode ser antes do início', 'err');
        estado.modo = 'periodo'; estado.de = d.de; estado.ate = d.ate;
        App.closeModal();
        await carregar();
      }, { submitLabel: 'Ver período' });
    }
  };

  await carregar();
});
