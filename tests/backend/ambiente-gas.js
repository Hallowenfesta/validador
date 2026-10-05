/**
 * Simulador do ambiente do Google Apps Script.
 *
 * Carrega os arquivos .gs de verdade dentro de uma VM do Node e entrega
 * versões falsas dos serviços do Google. A planilha falsa imita os
 * comportamentos que importam pro nosso código:
 *  - texto que começa com "=" vira fórmula;
 *  - texto que parece número vira número (por isso usamos o apóstrofo);
 *  - o apóstrofo inicial força texto e some na leitura.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PASTA_GAS = fileURLToPath(new URL('../../apps-script/', import.meta.url));

/** Imita como o Sheets interpreta o que é gravado numa célula. */
function interpretarEntrada(valor) {
  if (typeof valor !== 'string') return { valor, formula: null };
  if (valor.startsWith("'")) return { valor: valor.slice(1), formula: null };
  if (valor.startsWith('=')) return { valor: '', formula: valor };
  if (/^-?\d+(\.\d+)?(e\d+)?$/i.test(valor)) return { valor: Number(valor), formula: null };
  return { valor, formula: null };
}

export class AbaFalsa {
  /**
   * @param {string} nome
   * @param {number} [maxColunas] uma aba nova do Sheets nasce com 26 (A–Z);
   *   quem apagou as colunas sobrando pode ter bem menos.
   */
  constructor(nome, maxColunas = 26) {
    this.nome = nome;
    this.maxColunas = maxColunas;
    /** @type {Array<Array<{valor: *, formula: string|null}>>} */
    this.celulas = [];
  }

  getMaxColumns() { return this.maxColunas; }

  insertColumnsAfter(depoisDe, quantidade) {
    if (depoisDe > this.maxColunas) throw new Error('Coluna inexistente');
    this.maxColunas += quantidade;
    return this;
  }

  getName() { return this.nome; }

  getLastRow() {
    for (let r = this.celulas.length - 1; r >= 0; r--) {
      if ((this.celulas[r] || []).some((c) => c && (c.valor !== '' || c.formula))) return r + 1;
    }
    return 0;
  }

  getLastColumn() {
    let max = 0;
    this.celulas.forEach((linha) => (linha || []).forEach((c, i) => {
      if (c && (c.valor !== '' || c.formula)) max = Math.max(max, i + 1);
    }));
    return max;
  }

  escrever(linha, coluna, valor) {
    if (linha < 1 || coluna < 1) throw new Error('Linha/coluna começam em 1');
    this.celulas[linha - 1] = this.celulas[linha - 1] || [];
    this.celulas[linha - 1][coluna - 1] = interpretarEntrada(valor);
  }

  ler(linha, coluna) {
    const c = (this.celulas[linha - 1] || [])[coluna - 1];
    return c ? c.valor : '';
  }

  formula(linha, coluna) {
    const c = (this.celulas[linha - 1] || [])[coluna - 1];
    return c ? c.formula : null;
  }

  getRange(linha, coluna, linhas = 1, colunas = 1) {
    if (linhas < 1 || colunas < 1) throw new Error('Intervalo vazio');
    // Igual ao Google: pedir coluna além do limite da aba é erro.
    if (coluna + colunas - 1 > this.maxColunas) {
      throw new Error('As coordenadas do intervalo estão fora das dimensões da página.');
    }
    const aba = this;
    return {
      getValues() {
        const out = [];
        for (let r = 0; r < linhas; r++) {
          const l = [];
          for (let c = 0; c < colunas; c++) l.push(aba.ler(linha + r, coluna + c));
          out.push(l);
        }
        return out;
      },
      getValue() { return aba.ler(linha, coluna); },
      setValues(matriz) {
        if (matriz.length !== linhas || matriz.some((l) => l.length !== colunas)) {
          throw new Error('setValues: dimensões não batem com o intervalo');
        }
        matriz.forEach((l, r) => l.forEach((v, c) => aba.escrever(linha + r, coluna + c, v)));
        return this;
      },
      setValue(v) { aba.escrever(linha, coluna, v); return this; },
      setFormula(f) { aba.escrever(linha, coluna, f); return this; },
    };
  }

  appendRow(valores) {
    const linha = this.getLastRow() + 1;
    valores.forEach((v, i) => this.escrever(linha, i + 1, v === undefined ? '' : v));
    return this;
  }

  setFrozenRows() { return this; }

  /** Ajuda dos testes: linha inteira como array de valores. */
  linha(n) {
    const tamanho = this.getLastColumn();
    return this.getRange(n, 1, 1, tamanho).getValues()[0];
  }
}

class PlanilhaFalsa {
  constructor() { this.abas = new Map(); }
  getName() { return 'Planilha de teste'; }
  getSheetByName(nome) { return this.abas.get(nome) || null; }
  insertSheet(nome) {
    if (this.abas.has(nome)) throw new Error('Já existe uma página chamada "' + nome + '".');
    const aba = new AbaFalsa(nome);
    this.abas.set(nome, aba);
    return aba;
  }
}

/**
 * Monta um ambiente novo e isolado. Cada teste deve criar o seu.
 *
 * @param {{configurar?: boolean}} [opcoes] configurar=true roda
 *   configurarSistema() pra já deixar as abas e a chave prontas.
 */
export function criarAmbiente(opcoes = {}) {
  const planilha = new PlanilhaFalsa();
  const propriedades = new Map();
  const emails = [];
  const requisicoes = [];
  const logs = [];
  const trava = { presa: false, vezes: 0, recusar: false };

  // Respostas da "InfinitePay". Os testes trocam conforme o cenário.
  const infinitePay = {
    criarLink: () => ({ status: 200, corpo: { url: 'https://checkout.infinitepay.io/teste?lenc=abc' } }),
    consultar: () => ({ status: 200, corpo: { success: true, paid: false } }),
  };

  const contexto = {
    console: {
      log: (...a) => logs.push(['log', ...a]),
      warn: (...a) => logs.push(['warn', ...a]),
      error: (...a) => logs.push(['error', ...a]),
    },
    // O Date de fora entra na VM pra `instanceof Date` funcionar dos dois lados.
    Date,

    SpreadsheetApp: {
      openById: () => planilha,
      flush: () => {},
    },

    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (propriedades.has(k) ? propriedades.get(k) : null),
        setProperty: (k, v) => { propriedades.set(k, String(v)); },
      }),
    },

    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          if (trava.recusar) return false;
          // Trava aninhada indica erro de lógica (o Apps Script real travaria).
          if (trava.presa) throw new Error('Trava adquirida duas vezes');
          trava.presa = true;
          trava.vezes++;
          return true;
        },
        releaseLock: () => { trava.presa = false; },
      }),
    },

    Utilities: { getUuid: () => crypto.randomUUID() },

    UrlFetchApp: {
      fetch: (url, opcoes) => {
        const corpo = JSON.parse(opcoes.payload);
        requisicoes.push({ url, corpo, opcoes });
        const tratador = url.endsWith('/links') ? infinitePay.criarLink : infinitePay.consultar;
        const r = tratador(corpo);
        if (r instanceof Error) throw r;
        return {
          getResponseCode: () => r.status,
          getContentText: () => (typeof r.corpo === 'string' ? r.corpo : JSON.stringify(r.corpo)),
        };
      },
    },

    MailApp: {
      sendEmail: (msg) => {
        if (contexto.MailApp.falhar) throw new Error('Cota de e-mail excedida');
        emails.push(msg);
      },
      falhar: false,
    },

    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: (texto) => ({
        texto,
        mime: null,
        setMimeType(m) { this.mime = m; return this; },
        getContent() { return this.texto; },
      }),
    },
  };

  vm.createContext(contexto);

  // Mesma ordem alfabética que o editor do Apps Script costuma usar.
  // A ordem não deveria importar, porque nada roda no carregamento.
  // O editor do Apps Script carrega os arquivos na ordem em que aparecem lá,
  // que não é necessariamente alfabética. ordemReversa existe pra provar que
  // nenhum arquivo depende de outro já ter sido carregado.
  const arquivos = fs.readdirSync(PASTA_GAS).filter((f) => f.endsWith('.gs')).sort();
  if (opcoes.ordemReversa) arquivos.reverse();

  // Planilha que já existia antes do sistema novo (ver tests/backend/planilha-real.test.js).
  if (opcoes.antesDaPlanilha) opcoes.antesDaPlanilha(planilha);

  arquivos
    .forEach((arquivo) => {
      const codigo = fs.readFileSync(path.join(PASTA_GAS, arquivo), 'utf8');
      vm.runInContext(codigo, contexto, { filename: arquivo });
    });

  /** Avalia uma expressão lá dentro (serve pra pegar const/class do código). */
  const avaliar = (expr) => vm.runInContext(expr, contexto);

  const ambiente = {
    gas: contexto,
    avaliar,
    planilha,
    propriedades,
    emails,
    requisicoes,
    logs,
    trava,
    infinitePay,
    CONFIG: avaliar('CONFIG'),

    aba: (nome) => planilha.getSheetByName(nome),
    abaIngressos: () => planilha.getSheetByName(avaliar('CONFIG.ABA_INGRESSOS')),
    abaPedidos: () => planilha.getSheetByName(avaliar('CONFIG.ABA_PEDIDOS')),

    /** Faz um POST como o navegador faria e devolve o JSON da resposta. */
    post(corpo) {
      const texto = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
      const saida = contexto.doPost({ postData: { contents: texto } });
      return JSON.parse(saida.getContent());
    },

    get() {
      return JSON.parse(contexto.doGet({ parameter: {} }).getContent());
    },
  };

  if (opcoes.configurar !== false) {
    contexto.configurarSistema();
  }

  return ambiente;
}

/** Dados válidos de comprador pra reaproveitar nos testes. */
export const COMPRADOR_VALIDO = Object.freeze({
  acao: 'criar_pedido',
  nome: 'Maria da Silva',
  telefone: '(11) 98765-4321',
  cpf: '529.982.247-25',
  email: 'Maria@Example.com',
  quantidade: 1,
});
