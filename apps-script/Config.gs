/**
 * Configuração central do backend da Noite do Horror.
 *
 * Tudo que muda de um evento pro outro (preço, capacidade, links) fica aqui,
 * pra ninguém precisar caçar número mágico no meio do código.
 *
 * O que é segredo NÃO fica neste arquivo: a chave da portaria mora nas
 * Propriedades do Script (Configurações do projeto > Propriedades do script),
 * assim ela não vai parar no GitHub por acidente. Veja Setup.gs.
 */

const CONFIG = Object.freeze({
  /** ID da planilha (o trecho entre /d/ e /edit na URL do Google Sheets). */
  PLANILHA_ID: '1qqvPbhGH1HOhEI8GuSDFx48IDKbmxu610U4R9fZtnH8',

  /** Aba onde cada linha é um ingresso. Mantive o nome que já existia. */
  ABA_INGRESSOS: 'listagem',

  /** Aba nova: cada linha é um pedido (uma compra, que pode ter 1 ou 2 ingressos). */
  ABA_PEDIDOS: 'pedidos',

  EVENTO: Object.freeze({
    NOME: 'Noite do Horror',
    DESCRICAO_ITEM: 'Ingresso - Noite do Horror',
    LOTE: 'Pré-venda',
  }),

  /**
   * Preço em CENTAVOS, que é o formato que a InfinitePay espera.
   * 100 = R$ 1,00 (valor de teste). Para R$ 50,00, use 5000.
   *
   * O site de vendas lê esse valor do backend, então só existe um lugar
   * pra mudar o preço.
   */
  PRECO_CENTAVOS: 100,

  /** Total de ingressos à venda. Pedidos aguardando pagamento também contam (ver RESERVA_MINUTOS). */
  CAPACIDADE: 30,

  /** Limite por compra. */
  MAX_POR_PEDIDO: 2,

  /**
   * Por quanto tempo um pedido não pago segura as vagas.
   * Sem isso, 30 pessoas abrindo o checkout ao mesmo tempo venderiam 60 ingressos.
   */
  RESERVA_MINUTOS: 30,

  /** Tamanho do código do ingresso. 8 caracteres em base 32 = ~1 trilhão de combinações. */
  TAMANHO_CODIGO: 8,

  /**
   * Sem 0/O e 1/I, que confundem quando alguém digita o código na portaria.
   * São exatamente 32 símbolos de propósito: ver textoAleatorio_ em Util.gs.
   */
  ALFABETO_CODIGO: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',

  INFINITEPAY: Object.freeze({
    /** InfiniteTag do recebedor, sem o "$". */
    HANDLE: 'mteusnw',
    URL_CRIAR_LINK: 'https://api.checkout.infinitepay.io/links',
    URL_CONSULTAR_PAGAMENTO: 'https://api.checkout.infinitepay.io/payment_check',
  }),

  /**
   * URL pública desta implantação do Apps Script (termina em /exec).
   * É pra cá que a InfinitePay manda o webhook. Depois de criar uma nova
   * implantação, atualize aqui E no assets/js/config.js do site.
   */
  URL_WEBHOOK:
    'https://script.google.com/macros/s/AKfycbykpwLaURk9hTQWJICUr8mzPoRqqQh-us9pHFfhT60sfO7PjqJzot3FuV8xnN3bED0/exec',

  /** Endereço do site no GitHub Pages (com a barra no final). */
  URL_SITE: 'https://hallowenfesta.github.io/validador/',

  /** Nome que aparece como remetente no e-mail com os ingressos. */
  REMETENTE_EMAIL: 'Noite do Horror',

  /** Usado pra montar a imagem do QR Code na planilha e no e-mail. */
  URL_GERADOR_QR: 'https://quickchart.io/qr',

  /** Quanto tempo (ms) esperar por outra execução que esteja segurando a trava. */
  TIMEOUT_TRAVA_MS: 30000,
});

/** Nomes das propriedades guardadas em PropertiesService. */
const PROPRIEDADES = Object.freeze({
  CHAVE_PORTARIA: 'CHAVE_PORTARIA',
});

/** Situações possíveis de um pedido na aba "pedidos". */
const STATUS_PEDIDO = Object.freeze({
  AGUARDANDO: 'AGUARDANDO_PAGAMENTO',
  PAGO: 'PAGO',
});

/**
 * Situações de um ingresso na aba "listagem".
 * "Pendente" = ainda não entrou na festa. Mantive o texto que já estava na
 * planilha pra não quebrar o costume de quem acompanha por lá.
 */
const STATUS_INGRESSO = Object.freeze({
  DISPONIVEL: 'Pendente',
  UTILIZADO: 'Utilizado',
  CANCELADO: 'Cancelado',
});
