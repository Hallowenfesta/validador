/**
 * Integração com o Checkout da InfinitePay.
 *
 * Documentação: https://ajuda.infinitepay.io/pt-BR/articles/10766888
 *
 * Dois pontos da API que moldam o resto do sistema:
 *  1. Valores são sempre em CENTAVOS (R$ 10,00 = 1000).
 *  2. O webhook NÃO é assinado. Qualquer pessoa que descubra a URL do
 *     Apps Script consegue mandar um JSON dizendo "pedido X foi pago".
 *     Por isso o webhook só serve de aviso: quem decide se está pago é a
 *     consulta ao payment_check, feita daqui pra InfinitePay.
 */

/**
 * Cria o link de pagamento de um pedido.
 *
 * @param {{orderNsu: string, nome: string, email: string, telefone: string, quantidade: number}} pedido
 * @return {string} URL do checkout
 */
function criarLinkPagamento_(pedido) {
  const corpo = {
    handle: CONFIG.INFINITEPAY.HANDLE,
    order_nsu: pedido.orderNsu,
    webhook_url: CONFIG.URL_WEBHOOK,
    // A InfinitePay acrescenta order_nsu, transaction_nsu, slug etc. nessa URL
    // quando devolve o cliente; a página /ingresso usa isso pra confirmar.
    redirect_url: CONFIG.URL_SITE + 'ingresso/',
    items: [{
      quantity: pedido.quantidade,
      price: CONFIG.PRECO_CENTAVOS,
      description: CONFIG.EVENTO.DESCRICAO_ITEM,
    }],
    // Só os campos documentados. Servem pra já preencher o checkout.
    customer: {
      name: pedido.nome,
      email: pedido.email,
      phone_number: '+55' + String(pedido.telefone).replace(/\D/g, ''),
    },
  };

  const resposta = chamarInfinitePay_(CONFIG.INFINITEPAY.URL_CRIAR_LINK, corpo);

  if (!resposta.url) {
    console.error('InfinitePay não devolveu url', resposta);
    throw new ErroNegocio('PAGAMENTO_INDISPONIVEL',
      'Não foi possível gerar o pagamento agora. Tente novamente.');
  }
  return resposta.url;
}

/**
 * Pergunta à InfinitePay se a transação foi realmente paga.
 * É a única fonte confiável de "pago" no sistema.
 *
 * @param {string} orderNsu
 * @param {string} transactionNsu
 * @param {string} slug também chamado de invoice_slug no webhook
 * @return {{pago: boolean, valorCentavos: number, valorPagoCentavos: number, metodo: string}}
 */
function consultarPagamento_(orderNsu, transactionNsu, slug) {
  const resposta = chamarInfinitePay_(CONFIG.INFINITEPAY.URL_CONSULTAR_PAGAMENTO, {
    handle: CONFIG.INFINITEPAY.HANDLE,
    order_nsu: orderNsu,
    transaction_nsu: transactionNsu,
    slug: slug,
  });

  return {
    // Comparação estrita: só `true` de verdade conta. "true" em string,
    // 1 ou qualquer outra coisa estranha é tratada como não pago.
    pago: resposta.success === true && resposta.paid === true,
    valorCentavos: Number(resposta.amount) || 0,
    valorPagoCentavos: Number(resposta.paid_amount) || 0,
    metodo: String(resposta.capture_method || ''),
  };
}

/**
 * POST JSON pra InfinitePay com tratamento de erro padronizado.
 * Erros de rede ou HTTP viram ErroNegocio genérico pro usuário, e o detalhe
 * real vai pro log (Execuções, no editor do Apps Script).
 *
 * @param {string} url
 * @param {Object} corpo
 * @return {Object} JSON da resposta
 */
function chamarInfinitePay_(url, corpo) {
  let resposta;
  try {
    resposta = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(corpo),
      muteHttpExceptions: true,
    });
  } catch (e) {
    console.error('Falha de rede com a InfinitePay', url, e);
    throw new ErroNegocio('PAGAMENTO_INDISPONIVEL',
      'Serviço de pagamento indisponível no momento. Tente novamente.');
  }

  const status = resposta.getResponseCode();
  const texto = resposta.getContentText();

  if (status < 200 || status >= 300) {
    console.error('InfinitePay respondeu HTTP ' + status, url, texto);
    throw new ErroNegocio('PAGAMENTO_INDISPONIVEL',
      'Serviço de pagamento indisponível no momento. Tente novamente.');
  }

  try {
    return JSON.parse(texto);
  } catch (e) {
    console.error('Resposta da InfinitePay não é JSON', url, texto);
    throw new ErroNegocio('PAGAMENTO_INDISPONIVEL',
      'Resposta inesperada do serviço de pagamento.');
  }
}
