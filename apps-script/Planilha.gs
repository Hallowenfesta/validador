/**
 * Acesso à planilha.
 *
 * A planilha funciona como banco de dados, então este arquivo concentra o
 * "esquema" (quais colunas existem e em que ordem) e as funções de baixo
 * nível pra ler e gravar. Os outros módulos não deveriam chamar
 * SpreadsheetApp diretamente.
 */

/**
 * Colunas da aba de ingressos. A–H são as que já existiam; I–K foram
 * adicionadas no fim pra não bagunçar quem já usava a planilha.
 * Os números são 1-based, que é como o getRange trabalha.
 */
const COL_INGRESSO = Object.freeze({
  ID: 1,
  NOME: 2,
  CODIGO: 3,
  QR: 4,
  STATUS: 5,
  TELEFONE: 6,
  CPF: 7,
  EMAIL: 8,
  PEDIDO: 9,
  EMITIDO_EM: 10,
  UTILIZADO_EM: 11,
});

const CABECALHO_INGRESSOS = Object.freeze([
  'id', 'nome', 'código', 'qr code', 'status', 'telefone', 'cpf', 'email',
  'pedido', 'emitido em', 'utilizado em',
]);

const COL_PEDIDO = Object.freeze({
  ORDER_NSU: 1,
  CRIADO_EM: 2,
  STATUS: 3,
  NOME: 4,
  TELEFONE: 5,
  CPF: 6,
  EMAIL: 7,
  QUANTIDADE: 8,
  VALOR_CENTAVOS: 9,
  TOKEN: 10,
  URL_PAGAMENTO: 11,
  TRANSACTION_NSU: 12,
  INVOICE_SLUG: 13,
  METODO_PAGAMENTO: 14,
  VALOR_PAGO_CENTAVOS: 15,
  PAGO_EM: 16,
  EMAIL_ENVIADO_EM: 17,
});

const CABECALHO_PEDIDOS = Object.freeze([
  'order_nsu', 'criado em', 'status', 'nome', 'telefone', 'cpf', 'email',
  'quantidade', 'valor (centavos)', 'token', 'url pagamento',
  'transaction_nsu', 'invoice_slug', 'método', 'valor pago (centavos)',
  'pago em', 'e-mail enviado em',
]);

/** Abrir a planilha custa caro; dentro de uma execução reaproveitamos a mesma instância. */
let planilhaEmCache_ = null;

function abrirPlanilha_() {
  if (!planilhaEmCache_) {
    planilhaEmCache_ = SpreadsheetApp.openById(CONFIG.PLANILHA_ID);
  }
  return planilhaEmCache_;
}

/**
 * Retorna a aba pelo nome ou estoura erro. Erro aqui é de configuração,
 * não do usuário, por isso não é ErroNegocio: cai no "erro interno" genérico.
 *
 * @param {string} nome
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function obterAba_(nome) {
  const aba = abrirPlanilha_().getSheetByName(nome);
  if (!aba) {
    throw new Error('Aba "' + nome + '" não encontrada. Rode configurarSistema() uma vez.');
  }
  return aba;
}

/**
 * Lê todas as linhas de dados (sem o cabeçalho) de uma vez.
 * Uma leitura em lote é muito mais rápida que ler célula por célula.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} aba
 * @param {number} totalColunas
 * @return {Array<Array<*>>}
 */
function lerLinhasDeDados_(aba, totalColunas) {
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];
  return aba.getRange(2, 1, ultimaLinha - 1, totalColunas).getValues();
}

/**
 * Prepara um texto pra ser gravado numa célula.
 *
 * O apóstrofo na frente força o Sheets a tratar o conteúdo como texto puro.
 * Isso resolve dois problemas de uma vez:
 *  - injeção de fórmula: um "nome" como =IMPORTXML(...) seria executado;
 *  - conversão automática: um código como "2E512345" virava número
 *    em notação científica, e CPF/telefone perderiam zeros à esquerda.
 * O apóstrofo não aparece na célula nem volta no getValues().
 *
 * @param {*} valor
 * @return {*}
 */
function textoSeguro_(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor !== 'string') return valor;
  if (valor === '') return '';
  return "'" + valor;
}

/**
 * Cria a aba se não existir e garante que o cabeçalho está completo.
 * Colunas que faltarem são acrescentadas no fim; nada que já existe é apagado.
 *
 * @param {string} nome
 * @param {ReadonlyArray<string>} cabecalho
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function garantirAba_(nome, cabecalho) {
  const planilha = abrirPlanilha_();
  let aba = planilha.getSheetByName(nome);
  if (!aba) {
    aba = planilha.insertSheet(nome);
  }

  const atual = aba.getLastColumn() > 0
    ? aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0]
    : [];

  for (let i = 0; i < cabecalho.length; i++) {
    if (!atual[i]) {
      aba.getRange(1, i + 1).setValue(cabecalho[i]);
    }
  }

  aba.setFrozenRows(1);
  return aba;
}
