/**
 * Sincronização com a Conta Azul — primeira fatia: Clientes → Pessoas.
 *
 * Caminhos e campos vêm da documentação oficial (developers.contaazul.com):
 *   GET  /v1/pessoas                 — lista (paginação: page/size)
 *   POST /v1/pessoas                 — cria; campos: nome, tipo_pessoa
 *        (FISICA|JURIDICA), documento, email, telefone…
 *
 * O desenho segue a regra combinada: nada sai sem conferência. O fluxo da
 * tela é (1) sondar o formato real com um GET, (2) ver o JSON exato que
 * iria, (3) enviar UM de teste, (4) só então enviar o restante. Cada envio
 * marca a correspondência em syncRefs — é ela que impede duplicidade.
 */
'use strict';

const db = require('./db');
const sync = require('./sync');
const contaazul = require('./contaazul');

const SISTEMA = 'contaazul';

/* ------------------------------------------------------------------ */
/* Mapa de campos: cliente daqui → pessoa de lá                        */
/* ------------------------------------------------------------------ */

/**
 * Monta o corpo do POST /v1/pessoas a partir de um cliente.
 * Só entra o que existe no cadastro — campo vazio não é enviado.
 */
function clienteParaPessoa(c) {
  const digitos = String(c.cpfCnpj || c.cnpj || '').replace(/\D/g, '');
  const p = { nome: String(c.nome || '').trim() };
  if (digitos) {
    p.documento = digitos;
    // Valores exatos exigidos pela API (resposta dela mesma, em teste real):
    // "Física", "Jurídica" ou "Estrangeira" — com acento e só a inicial maiúscula.
    p.tipo_pessoa = digitos.length === 14 ? 'Jurídica' : 'Física';
  }
  if (c.email) p.email = String(c.email).trim();
  if (c.telefone) p.telefone = String(c.telefone).trim();
  return p;
}

/** Acha o identificador externo na resposta, sem apostar num nome único. */
function idExternoDe(json) {
  if (!json || typeof json !== 'object') return '';
  return json.uuid || json.id || json.uuid_pessoa || json.id_pessoa || '';
}

/* ------------------------------------------------------------------ */
/* Operações                                                           */
/* ------------------------------------------------------------------ */

/** GET de amostra: prova a conexão e mostra o formato real da lista. */
async function sondarPessoas() {
  let r = await contaazul.chamar('/v1/pessoas?page=1&size=3');
  if (r.status === 400) r = await contaazul.chamar('/v1/pessoas');   // sem paginação, se os nomes não valerem
  return {
    status: r.status,
    corpo: r.json !== null ? r.json : String(r.text || '').slice(0, 3000)
  };
}

/** Clientes que ainda precisam ir, com o JSON exato que iria para cada um. */
function ensaioClientes({ amostra = 5 } = {}) {
  const pendentes = db.all('clients').filter(c => sync.pendente(SISTEMA, 'clients', c));
  return {
    pendentes: pendentes.length,
    exemplos: pendentes.slice(0, amostra).map(c => ({
      id: c.id, rotulo: sync.rotulo(c), corpo: clienteParaPessoa(c)
    }))
  };
}

/**
 * Envia clientes pendentes. `ids` restringe a esses; `limite` corta a
 * quantidade (limite=1 é o envio de teste). Continua nos erros: cada
 * resultado carrega o que a Conta Azul respondeu, cru, para diagnóstico.
 */
async function enviarClientes({ ids, limite } = {}) {
  let fila = db.all('clients').filter(c => sync.pendente(SISTEMA, 'clients', c));
  if (Array.isArray(ids) && ids.length) fila = fila.filter(c => ids.includes(c.id));
  if (limite) fila = fila.slice(0, Number(limite));

  const resultados = [];
  for (const c of fila) {
    const corpo = clienteParaPessoa(c);
    try {
      const ref = sync.find(SISTEMA, 'clients', c.id);
      let r;
      if (ref && ref.idExterno) {
        // Já existe lá: atualiza em vez de criar de novo (evita duplicar).
        r = await contaazul.chamar(`/v1/pessoas/${encodeURIComponent(ref.idExterno)}`, { method: 'PUT', json: corpo });
        if (r.status === 404 || r.status === 405) {
          r = await contaazul.chamar('/v1/pessoas', { method: 'POST', json: corpo });
        }
      } else {
        r = await contaazul.chamar('/v1/pessoas', { method: 'POST', json: corpo });
      }

      if (r.status >= 200 && r.status < 300) {
        const idExt = idExternoDe(r.json) || (ref && ref.idExterno) || '';
        if (idExt) {
          sync.marcar(SISTEMA, 'clients', c.id, idExt, c);
          resultados.push({ id: c.id, rotulo: sync.rotulo(c), ok: true, idExterno: idExt });
        } else {
          resultados.push({
            id: c.id, rotulo: sync.rotulo(c), ok: false,
            erro: 'A Conta Azul aceitou, mas não achei o identificador na resposta: ' +
                  JSON.stringify(r.json).slice(0, 400)
          });
        }
      } else {
        const det = (r.json ? JSON.stringify(r.json) : String(r.text || '')).slice(0, 500);
        sync.marcar(SISTEMA, 'clients', c.id, (ref && ref.idExterno) || '', null,
          { status: 'erro', mensagem: det });
        resultados.push({ id: c.id, rotulo: sync.rotulo(c), ok: false, erro: `HTTP ${r.status} — ${det}` });
      }
    } catch (e) {
      resultados.push({ id: c.id, rotulo: sync.rotulo(c), ok: false, erro: e.message });
    }
  }
  return {
    enviados: resultados.filter(x => x.ok).length,
    falhas: resultados.filter(x => !x.ok).length,
    resultados
  };
}

module.exports = { SISTEMA, clienteParaPessoa, idExternoDe, sondarPessoas, ensaioClientes, enviarClientes };
