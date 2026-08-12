/**
 * Assistente de IA — comunicação com os provedores (Google Gemini / Claude).
 *
 * A chave da API fica gravada apenas no servidor (data/db.json) e NUNCA é
 * enviada ao navegador: o frontend manda a pergunta para /api/assistant e o
 * servidor faz a chamada externa daqui.
 *
 * Node puro (https), com suporte a proxy corporativo via túnel CONNECT
 * quando a variável de ambiente HTTPS_PROXY estiver definida.
 */
'use strict';

const https = require('https');
const http = require('http');
const tls = require('tls');
const { URL } = require('url');

const TIMEOUT_MS = 60000;

const DEFAULT_MODELS = { gemini: 'gemini-2.5-flash', claude: 'claude-haiku-4-5' };
// Se o modelo configurado não existir mais (Google renomeia com frequência),
// tentamos automaticamente estes, em ordem.
const GEMINI_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];

/* ------------------------------------------------------------------ */
/* Transporte HTTPS (direto ou via proxy CONNECT)                      */
/* ------------------------------------------------------------------ */

function httpsJson(targetUrl, { method = 'POST', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const payload = body === undefined ? null : JSON.stringify(body);
    const h = Object.assign({ 'Content-Type': 'application/json' }, headers);
    if (payload) h['Content-Length'] = Buffer.byteLength(payload);

    const fire = (createConnection) => {
      const opts = {
        host: u.hostname, port: Number(u.port) || 443,
        path: u.pathname + u.search, method, headers: h,
        servername: u.hostname, timeout: TIMEOUT_MS
      };
      if (createConnection) { opts.createConnection = createConnection; opts.agent = false; }
      const req = https.request(opts, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch (e) { /* resposta não-JSON */ }
          resolve({ status: res.statusCode, json, text: data });
        });
      });
      req.on('timeout', () => req.destroy(new Error('Tempo esgotado ao falar com o provedor de IA (60s)')));
      req.on('error', err => reject(new Error('Falha de rede ao falar com o provedor de IA: ' + err.message)));
      if (payload) req.write(payload);
      req.end();
    };

    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    if (!proxy) return fire(null);

    // Rede com proxy: abre o túnel CONNECT e faz o TLS por dentro dele.
    const p = new URL(proxy);
    const connectReq = http.request({
      host: p.hostname, port: Number(p.port) || 80, method: 'CONNECT',
      path: `${u.hostname}:${Number(u.port) || 443}`,
      headers: { Host: `${u.hostname}:${Number(u.port) || 443}` },
      timeout: TIMEOUT_MS
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

/* ------------------------------------------------------------------ */
/* Provedores                                                          */
/* ------------------------------------------------------------------ */

function friendlyError(provider, status, detail) {
  if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(detail)) {
    return 'A chave da API do Gemini não é válida. Confira em Administração → Configurações (obtenha a chave em aistudio.google.com).';
  }
  if (status === 401 || status === 403) {
    return `A chave da API do ${provider === 'gemini' ? 'Gemini' : 'Claude'} foi recusada (${status}). Confira se a chave está correta e ativa.`;
  }
  if (status === 429) {
    return 'O provedor de IA informou limite de uso atingido (429). No plano gratuito do Gemini isso passa em alguns instantes — tente de novo em 1 minuto.';
  }
  if (status >= 500) {
    return `O provedor de IA está instável no momento (${status}). Tente novamente em instantes.`;
  }
  return `O provedor de IA retornou um erro (${status}): ${detail.slice(0, 300)}`;
}

/** messages: [{ role: 'user' | 'assistant', text }] */
async function askGemini(key, model, system, messages) {
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }]
    })),
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
  };
  const tryModels = [model, ...GEMINI_FALLBACKS.filter(m => m !== model)];
  let last = null;
  for (const m of tryModels) {
    const r = await httpsJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`,
      { headers: { 'x-goog-api-key': key }, body }
    );
    last = r;
    if (r.status === 404) continue; // modelo não existe mais → tenta o próximo
    if (r.status !== 200) throw new Error(friendlyError('gemini', r.status, r.text || ''));
    const cand = r.json && r.json.candidates && r.json.candidates[0];
    const text = cand && cand.content && cand.content.parts
      ? cand.content.parts.map(p => p.text || '').join('') : '';
    if (!text) {
      const reason = cand && cand.finishReason;
      throw new Error(reason === 'SAFETY'
        ? 'O Gemini bloqueou a resposta por política de conteúdo. Reformule a pergunta.'
        : 'O Gemini devolveu uma resposta vazia. Tente reformular a pergunta.');
    }
    return { text, model: m };
  }
  throw new Error(friendlyError('gemini', last ? last.status : 0, (last && last.text) || 'modelo não encontrado'));
}

async function askClaude(key, model, system, messages) {
  const r = await httpsJson('https://api.anthropic.com/v1/messages', {
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: {
      model, max_tokens: 2048, system,
      messages: messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }))
    }
  });
  if (r.status !== 200) throw new Error(friendlyError('claude', r.status, r.text || ''));
  const text = (r.json && r.json.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (!text) throw new Error('O Claude devolveu uma resposta vazia. Tente reformular a pergunta.');
  return { text, model };
}

/**
 * cfg: { provider: 'gemini'|'claude', key, model? }
 * Devolve { text, model }.
 */
async function ask(cfg, system, messages) {
  const provider = cfg.provider === 'claude' ? 'claude' : 'gemini';
  const model = (cfg.model || '').trim() || DEFAULT_MODELS[provider];
  if (!cfg.key) throw new Error('O assistente ainda não foi configurado (chave da API ausente).');
  return provider === 'claude'
    ? askClaude(cfg.key, model, system, messages)
    : askGemini(cfg.key, model, system, messages);
}

module.exports = { ask, DEFAULT_MODELS };
