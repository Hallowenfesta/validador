/**
 * Porta de entrada HTTP do Web App.
 *
 * Todo mundo fala com a mesma URL /exec:
 *   GET               -> informações públicas do evento (preço, vagas)
 *   POST {acao: ...}  -> chamadas do site (vendas, ingresso, portaria)
 *   POST sem acao     -> webhook da InfinitePay
 *
 * Formato das respostas pro site:
 *   sucesso: {"sucesso": true,  "dados": {...}}
 *   erro:    {"sucesso": false, "erro": "mensagem", "codigo": "ESGOTADO"}
 *
 * Observação: o Apps Script sempre responde HTTP 200, não dá pra escolher
 * o status. Por isso o resultado vai dentro do JSON.
 */

/** Ações aceitas no POST e quem trata cada uma. */
const ROTAS_ = Object.freeze({
  criar_pedido: function (corpo) {
    return criarPedido_(corpo);
  },
  confirmar_pagamento: function (corpo) {
    return pedidoPublico_(confirmarPagamento_(corpo.order_nsu, corpo.transaction_nsu, corpo.slug));
  },
  consultar_pedido: function (corpo) {
    return pedidoPublico_(consultarPedido_(corpo.pedido, corpo.token));
  },
  validar: function (corpo) {
    return validarIngresso_(corpo.codigo, corpo.chave);
  },
  verificar_chave: function (corpo) {
    // Usado pela tela de login da portaria, pra avisar na hora se a chave
    // está errada em vez de só descobrir no primeiro QR lido.
    exigirChavePortaria_(corpo.chave);
    return { ok: true };
  },
});

/**
 * @param {GoogleAppsScript.Events.DoGet} e
 */
function doGet(e) {
  return executar_(function () {
    return informacoesEvento_();
  });
}

/**
 * @param {GoogleAppsScript.Events.DoPost} e
 */
function doPost(e) {
  let corpo;
  try {
    corpo = JSON.parse((e && e.postData && e.postData.contents) || '');
  } catch (erro) {
    return respostaJson_({ sucesso: false, erro: 'Requisição inválida.', codigo: 'REQUISICAO_INVALIDA' });
  }
  if (!corpo || typeof corpo !== 'object') {
    return respostaJson_({ sucesso: false, erro: 'Requisição inválida.', codigo: 'REQUISICAO_INVALIDA' });
  }

  if (ehWebhookInfinitePay_(corpo)) {
    return tratarWebhook_(corpo);
  }

  const rota = Object.prototype.hasOwnProperty.call(ROTAS_, corpo.acao) ? ROTAS_[corpo.acao] : null;
  if (!rota) {
    return respostaJson_({ sucesso: false, erro: 'Ação desconhecida.', codigo: 'ACAO_DESCONHECIDA' });
  }

  return executar_(function () {
    return rota(corpo);
  });
}

/** Dados públicos que o site de vendas mostra. */
function informacoesEvento_() {
  return {
    evento: CONFIG.EVENTO.NOME,
    lote: CONFIG.EVENTO.LOTE,
    precoCentavos: CONFIG.PRECO_CENTAVOS,
    maxPorPedido: CONFIG.MAX_POR_PEDIDO,
    vagas: calcularVagas_(),
  };
}

/**
 * O webhook da InfinitePay não tem "acao"; reconhecemos pelo formato.
 * @param {Object} corpo
 */
function ehWebhookInfinitePay_(corpo) {
  return !corpo.acao && Boolean(corpo.order_nsu && corpo.transaction_nsu && corpo.invoice_slug);
}

/**
 * Trata o aviso de pagamento da InfinitePay.
 * O conteúdo do webhook não é confiável (não é assinado), então ele só
 * dispara a confirmação, que consulta a InfinitePay por conta própria.
 *
 * Resposta no formato que a InfinitePay documenta: {success, message}.
 */
function tratarWebhook_(corpo) {
  console.log('Webhook recebido', corpo.order_nsu, corpo.transaction_nsu);
  try {
    confirmarPagamento_(corpo.order_nsu, corpo.transaction_nsu, corpo.invoice_slug);
    return respostaJson_({ success: true, message: null });
  } catch (erro) {
    if (!(erro instanceof ErroNegocio)) {
      console.error('Erro no webhook', corpo.order_nsu, erro && erro.stack);
    } else {
      console.warn('Webhook recusado', corpo.order_nsu, erro.codigo);
    }
    return respostaJson_({ success: false, message: erro instanceof ErroNegocio ? erro.message : 'Erro interno.' });
  }
}

/**
 * Executa um tratador e embrulha o resultado no formato padrão.
 * ErroNegocio vira mensagem pro usuário; o resto vira "erro interno"
 * e só o log fica sabendo o motivo real.
 *
 * @param {function(): Object} tratador
 */
function executar_(tratador) {
  try {
    return respostaJson_({ sucesso: true, dados: tratador() });
  } catch (erro) {
    if (erro instanceof ErroNegocio) {
      return respostaJson_({ sucesso: false, erro: erro.message, codigo: erro.codigo });
    }
    console.error('Erro interno', erro && erro.stack);
    return respostaJson_({
      sucesso: false,
      erro: 'Erro interno. Tente novamente em instantes.',
      codigo: 'ERRO_INTERNO',
    });
  }
}

/** @param {Object} objeto */
function respostaJson_(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
