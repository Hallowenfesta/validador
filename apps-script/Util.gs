/**
 * Utilitários que não pertencem a nenhum módulo específico.
 */

/**
 * Erro "esperado": dado inválido, ingresso esgotado, chave errada...
 * A mensagem dele pode ir pro usuário. Qualquer outro tipo de erro é
 * tratado como falha interna e a mensagem real fica só no log, porque
 * pode conter detalhes que não interessam (ou não deveriam) a quem está
 * do outro lado.
 */
class ErroNegocio extends Error {
  /**
   * @param {string} codigo identificador estável pro front tratar (ex.: 'ESGOTADO')
   * @param {string} mensagem texto amigável em português
   */
  constructor(codigo, mensagem) {
    super(mensagem);
    this.name = 'ErroNegocio';
    this.codigo = codigo;
  }
}

/**
 * Gera bytes aleatórios a partir de UUIDs.
 *
 * O Apps Script não tem crypto.getRandomValues, e Math.random não serve pra
 * nada que precise ser imprevisível. O Utilities.getUuid() usa o gerador
 * seguro do Java por baixo. Num UUID v4 os bytes 6 e 8 carregam bits fixos
 * (versão e variante), então descartamos esses dois e usamos os outros 14.
 *
 * @param {number} quantidade
 * @return {number[]} inteiros de 0 a 255
 */
function bytesAleatorios_(quantidade) {
  const bytes = [];
  while (bytes.length < quantidade) {
    const hex = Utilities.getUuid().replace(/-/g, '');
    const indicesUteis = [0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15];
    for (const i of indicesUteis) {
      bytes.push(parseInt(hex.substr(i * 2, 2), 16));
      if (bytes.length === quantidade) break;
    }
  }
  return bytes;
}

/**
 * Sorteia um texto usando só os caracteres do alfabeto informado.
 *
 * Com um alfabeto de 32 símbolos, `byte % 32` distribui certinho
 * (256 é múltiplo de 32). Se alguém mudar o alfabeto pra outro tamanho,
 * continua funcionando, só com um viés pequeno em alguns caracteres.
 *
 * @param {number} tamanho
 * @param {string} alfabeto
 * @return {string}
 */
function textoAleatorio_(tamanho, alfabeto) {
  return bytesAleatorios_(tamanho)
    .map(function (b) { return alfabeto.charAt(b % alfabeto.length); })
    .join('');
}

/**
 * Compara dois textos sempre percorrendo o tamanho inteiro.
 * Evita que alguém descubra a chave da portaria medindo o tempo de resposta
 * (o === para no primeiro caractere diferente).
 *
 * @param {string} a
 * @param {string} b
 * @return {boolean}
 */
function compararSeguro_(a, b) {
  a = String(a);
  b = String(b);
  let diferenca = a.length ^ b.length;
  const tamanho = Math.max(a.length, b.length);
  for (let i = 0; i < tamanho; i++) {
    diferenca |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diferenca === 0;
}

/**
 * Executa `fn` segurando a trava global do script.
 *
 * Webhook da InfinitePay, retorno do cliente pelo navegador e validação na
 * portaria podem chegar ao mesmo tempo. Sem a trava, o mesmo pagamento
 * poderia gerar ingressos duas vezes, ou o mesmo ingresso entrar duas vezes.
 *
 * @template T
 * @param {function(): T} fn
 * @return {T}
 */
function comTrava_(fn) {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(CONFIG.TIMEOUT_TRAVA_MS)) {
    throw new ErroNegocio('OCUPADO', 'O sistema está ocupado. Tente novamente em alguns segundos.');
  }
  try {
    return fn();
  } finally {
    trava.releaseLock();
  }
}

/**
 * Escapa texto pra colocar dentro de HTML (usado no e-mail).
 * @param {*} texto
 * @return {string}
 */
function escaparHtml_(texto) {
  return String(texto === null || texto === undefined ? '' : texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formata centavos como dinheiro brasileiro: 12345 -> "R$ 123,45".
 * @param {number} centavos
 * @return {string}
 */
function formatarReais_(centavos) {
  const reais = Math.floor(centavos / 100);
  const resto = String(centavos % 100).padStart(2, '0');
  const milhar = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return 'R$ ' + milhar + ',' + resto;
}

/**
 * Monta a URL da imagem do QR Code de um código.
 * @param {string} codigo
 * @param {number=} tamanho em pixels
 * @return {string}
 */
function urlQrCode_(codigo, tamanho) {
  return CONFIG.URL_GERADOR_QR +
    '?size=' + (tamanho || 300) +
    '&margin=2&text=' + encodeURIComponent(codigo);
}
