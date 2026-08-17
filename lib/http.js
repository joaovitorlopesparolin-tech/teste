/**
 * Transporte HTTPS em Node puro, compartilhado pelas integrações externas
 * (assistente de IA, Conta Azul).
 *
 * Sem dependências. Atravessa proxy corporativo por túnel CONNECT quando a
 * variável HTTPS_PROXY estiver definida — é o que faz o sistema funcionar em
 * rede de empresa que bloqueia saída direta para a internet.
 */
'use strict';

const https = require('https');
const http = require('http');
const tls = require('tls');
const { URL } = require('url');

const TIMEOUT_PADRAO = 60000;

/**
 * Uma requisição HTTPS.
 *
 * @param {string} destino URL completa
 * @param {object} opts
 *   method    verbo HTTP (padrão: POST quando há corpo, GET quando não há)
 *   headers   cabeçalhos extras
 *   json      corpo enviado como application/json
 *   form      corpo enviado como application/x-www-form-urlencoded (objeto simples)
 *   timeout   milissegundos (padrão 60s)
 *   contexto  nome do serviço, usado só para deixar o erro legível
 * @returns {Promise<{status:number, json:any, text:string}>}
 */
function request(destino, opts = {}) {
  const { headers = {}, json, form, timeout = TIMEOUT_PADRAO, contexto = 'serviço externo' } = opts;

  let payload = null;
  const h = Object.assign({}, headers);
  if (form !== undefined) {
    payload = new URLSearchParams(form).toString();
    h['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (json !== undefined) {
    payload = JSON.stringify(json);
    if (!h['Content-Type']) h['Content-Type'] = 'application/json';
  }
  if (payload) h['Content-Length'] = Buffer.byteLength(payload);
  const method = opts.method || (payload ? 'POST' : 'GET');

  return new Promise((resolve, reject) => {
    const u = new URL(destino);

    const fire = (createConnection) => {
      const o = {
        host: u.hostname, port: Number(u.port) || 443,
        path: u.pathname + u.search, method, headers: h,
        servername: u.hostname, timeout
      };
      if (createConnection) { o.createConnection = createConnection; o.agent = false; }
      const req = https.request(o, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(data); } catch (e) { /* resposta não-JSON */ }
          resolve({ status: res.statusCode, json: parsed, text: data });
        });
      });
      req.on('timeout', () => req.destroy(new Error(`Tempo esgotado ao falar com ${contexto} (${Math.round(timeout / 1000)}s)`)));
      req.on('error', err => reject(new Error(`Falha de rede ao falar com ${contexto}: ${err.message}`)));
      if (payload) req.write(payload);
      req.end();
    };

    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    if (!proxy) return fire(null);

    // Rede com proxy: abre o túnel CONNECT e faz o TLS por dentro dele.
    const p = new URL(proxy);
    const alvo = `${u.hostname}:${Number(u.port) || 443}`;
    const connectReq = http.request({
      host: p.hostname, port: Number(p.port) || 80, method: 'CONNECT',
      path: alvo, headers: { Host: alvo }, timeout
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        return reject(new Error('O proxy da rede recusou a conexão (' + res.statusCode + ')'));
      }
      const tlsSocket = tls.connect({ socket, servername: u.hostname });
      tlsSocket.on('error', err => reject(new Error('Falha de TLS via proxy: ' + err.message)));
      fire(() => tlsSocket);
    });
    connectReq.on('timeout', () => connectReq.destroy(new Error('Tempo esgotado ao falar com o proxy da rede')));
    connectReq.on('error', err => reject(new Error('Falha ao falar com o proxy da rede: ' + err.message)));
    connectReq.end();
  });
}

module.exports = { request, TIMEOUT_PADRAO };
