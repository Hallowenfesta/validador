/**
 * Cliente do backend (Apps Script).
 *
 * Por que POST com Content-Type text/plain e não application/json?
 * O navegador manda um "preflight" (OPTIONS) antes de qualquer POST com JSON,
 * e o Apps Script não responde OPTIONS. Com text/plain a requisição é
 * "simples", vai direto, e o Apps Script lê o corpo do mesmo jeito.
 * Isso substitui o JSONP que o validador usava antes.
 */

import { URL_API, TIMEOUT_MS } from './config.js';

/** Erro vindo do backend, com o código pra tela decidir o que fazer. */
export class ErroApi extends Error {
  /**
   * @param {string} mensagem texto pronto pra mostrar ao usuário
   * @param {string} codigo ex.: 'ESGOTADO', 'NAO_AUTORIZADO', 'SEM_CONEXAO'
   */
  constructor(mensagem, codigo) {
    super(mensagem);
    this.name = 'ErroApi';
    this.codigo = codigo;
  }
}

/**
 * Faz a requisição e desembrulha o formato {sucesso, dados | erro, codigo}.
 * @param {RequestInit} opcoes
 * @param {string} [url]
 * @return {Promise<any>} o campo `dados` da resposta
 */
async function requisitar(opcoes, url = URL_API) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);

  let resposta;
  try {
    resposta = await fetch(url, { ...opcoes, signal: controle.signal, redirect: 'follow' });
  } catch (e) {
    throw e.name === 'AbortError'
      ? new ErroApi('O servidor demorou para responder. Tente novamente.', 'TIMEOUT')
      : new ErroApi('Sem conexão com o servidor. Verifique sua internet.', 'SEM_CONEXAO');
  } finally {
    clearTimeout(timer);
  }

  let json;
  try {
    json = await resposta.json();
  } catch {
    throw new ErroApi('Resposta inesperada do servidor.', 'RESPOSTA_INVALIDA');
  }

  if (!json || json.sucesso !== true) {
    throw new ErroApi(
      (json && json.erro) || 'Não foi possível concluir a operação.',
      (json && json.codigo) || 'ERRO_DESCONHECIDO'
    );
  }
  return json.dados;
}

/**
 * Informações públicas do evento: preço, lote, vagas.
 * @return {Promise<{evento: string, lote: string, precoCentavos: number, maxPorPedido: number, vagas: number}>}
 */
export function buscarInformacoes() {
  // O parâmetro t evita que algum cache intermediário devolva vagas antigas.
  return requisitar({ method: 'GET' }, URL_API + '?t=' + Date.now());
}

/**
 * Chama uma ação do backend.
 * @param {string} acao
 * @param {Object} [dados]
 */
export function chamar(acao, dados = {}) {
  return requisitar({
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...dados, acao }),
  });
}
