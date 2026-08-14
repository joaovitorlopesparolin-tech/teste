/**
 * Camada de sincronização com sistemas externos (preparação).
 *
 * Objetivo: permitir integrar o sistema a serviços externos — hoje o alvo
 * previsto é a **Conta Azul** (financeiro/fiscal) — SEM que este sistema
 * deixe de ser a ferramenta principal de gestão operacional.
 *
 * Nada aqui chama a internet. O que existe é o registro de correspondência
 * entre um registro local e o registro equivalente no sistema externo, que
 * é justamente o que evita duplicidade quando a integração for ligada.
 *
 * Coleção `syncRefs`:
 *   { sistema: 'contaazul', entidade: 'clients', idLocal: 12,
 *     idExterno: 'abc-123', hash: '…', sincronizadoEm: ISO, status: 'ok'|'erro',
 *     mensagem: '' }
 *
 * Entidades previstas (mesma lista pedida pela empresa):
 *   clients, suppliers, products, serviceCatalog, sales, serviceOrders,
 *   payables, receivables, cashflow (baixas/pagamentos) e notas fiscais.
 *
 * Antes de implementar de fato: conferir a documentação oficial vigente da
 * API da Conta Azul e usar apenas endpoints e métodos oficialmente
 * disponíveis (autenticação OAuth, limites de uso e campos obrigatórios
 * mudam com o tempo).
 */
'use strict';

const crypto = require('crypto');
const db = require('./db');

const ENTIDADES = [
  'clients', 'suppliers', 'products', 'serviceCatalog',
  'sales', 'serviceOrders', 'payables', 'receivables', 'cashflow'
];

/** Impressão digital do registro: muda quando algum dado relevante muda. */
function hashOf(record) {
  const limpo = Object.assign({}, record);
  delete limpo.updatedAt;
  return crypto.createHash('sha256').update(JSON.stringify(limpo)).digest('hex').slice(0, 16);
}

function find(sistema, entidade, idLocal) {
  return db.all('syncRefs').find(r =>
    r.sistema === sistema && r.entidade === entidade && r.idLocal === Number(idLocal)) || null;
}

/** Registra (ou atualiza) a correspondência local ↔ externo. */
function marcar(sistema, entidade, idLocal, idExterno, record, extra) {
  const dados = Object.assign({
    sistema, entidade, idLocal: Number(idLocal), idExterno: String(idExterno),
    hash: record ? hashOf(record) : null,
    sincronizadoEm: new Date().toISOString(), status: 'ok', mensagem: ''
  }, extra || {});
  const atual = find(sistema, entidade, idLocal);
  return atual ? db.update('syncRefs', atual.id, dados) : db.insert('syncRefs', dados);
}

/** Precisa enviar? (nunca enviado, ou mudou desde o último envio) */
function pendente(sistema, entidade, record) {
  const ref = find(sistema, entidade, record.id);
  return !ref || ref.hash !== hashOf(record);
}

/** O que está pendente de sincronização, por entidade. */
function pendencias(sistema) {
  const out = {};
  for (const ent of ENTIDADES) {
    out[ent] = db.all(ent).filter(r => pendente(sistema, ent, r)).map(r => r.id);
  }
  return out;
}

module.exports = { ENTIDADES, hashOf, find, marcar, pendente, pendencias };
