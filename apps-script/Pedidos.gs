/**
 * Ciclo de vida de um pedido:
 *
 *   site manda dados ─► criarPedido_ ─► AGUARDANDO_PAGAMENTO ─► checkout InfinitePay
 *                                                                     │
 *          ┌──────────────── webhook da InfinitePay ◄─────────────────┤
 *          │                 cliente volta pra /ingresso ◄────────────┘
 *          ▼
 *   confirmarPagamento_ ─► payment_check ─► PAGO + ingressos + e-mail
 *
 * O webhook e o retorno do cliente chegam quase juntos e fazem a mesma
 * coisa. Quem chegar primeiro emite os ingressos; o segundo só lê o resultado.
 * Assim, se o webhook falhar (acontece), o cliente que voltou pro site ainda
 * recebe o ingresso, e vice-versa.
 */

/**
 * Converte uma linha da aba "pedidos" num objeto.
 * @param {Array<*>} l valores da linha
 * @param {number} numeroLinha posição na planilha (1-based)
 */
function linhaParaPedido_(l, numeroLinha) {
  const c = function (col) { return l[col - 1]; };
  return {
    linha: numeroLinha,
    orderNsu: String(c(COL_PEDIDO.ORDER_NSU)),
    criadoEm: c(COL_PEDIDO.CRIADO_EM),
    status: String(c(COL_PEDIDO.STATUS)),
    nome: String(c(COL_PEDIDO.NOME)),
    telefone: String(c(COL_PEDIDO.TELEFONE)),
    cpf: String(c(COL_PEDIDO.CPF)),
    email: String(c(COL_PEDIDO.EMAIL)),
    quantidade: Number(c(COL_PEDIDO.QUANTIDADE)),
    valorCentavos: Number(c(COL_PEDIDO.VALOR_CENTAVOS)),
    token: String(c(COL_PEDIDO.TOKEN)),
    urlPagamento: String(c(COL_PEDIDO.URL_PAGAMENTO)),
    transactionNsu: String(c(COL_PEDIDO.TRANSACTION_NSU)),
    invoiceSlug: String(c(COL_PEDIDO.INVOICE_SLUG)),
    emailEnviadoEm: c(COL_PEDIDO.EMAIL_ENVIADO_EM),
  };
}

function lerPedidos_() {
  const aba = obterAba_(CONFIG.ABA_PEDIDOS);
  return lerLinhasDeDados_(aba, CABECALHO_PEDIDOS.length)
    .map(function (l, i) { return linhaParaPedido_(l, i + 2); });
}

/**
 * @param {string} orderNsu
 * @return {Object|null}
 */
function buscarPedido_(orderNsu) {
  if (!orderNsu) return null;
  const encontrado = lerPedidos_().filter(function (p) { return p.orderNsu === orderNsu; });
  return encontrado.length ? encontrado[0] : null;
}

/**
 * Grava só as colunas informadas de um pedido, sem tocar nas outras.
 * @param {number} linha
 * @param {Object<number, *>} valoresPorColuna ex.: {[COL_PEDIDO.STATUS]: 'PAGO'}
 */
function atualizarPedido_(linha, valoresPorColuna) {
  const aba = obterAba_(CONFIG.ABA_PEDIDOS);
  Object.keys(valoresPorColuna).forEach(function (col) {
    aba.getRange(linha, Number(col)).setValue(textoSeguro_(valoresPorColuna[col]));
  });
}

/**
 * Quantos ingressos ainda podem ser vendidos.
 *
 * Conta os ingressos já emitidos (a aba "listagem" é a verdade, inclusive
 * cortesias lançadas à mão) e os pedidos recentes que ainda estão no checkout.
 *
 * @return {number}
 */
function calcularVagas_() {
  const limiteReserva = Date.now() - CONFIG.RESERVA_MINUTOS * 60 * 1000;

  const reservados = lerPedidos_()
    .filter(function (p) {
      return p.status === STATUS_PEDIDO.AGUARDANDO &&
        p.criadoEm instanceof Date &&
        p.criadoEm.getTime() >= limiteReserva;
    })
    .reduce(function (soma, p) { return soma + p.quantidade; }, 0);

  return Math.max(0, CONFIG.CAPACIDADE - contarIngressosAtivos_() - reservados);
}

/**
 * Cria o pedido, reserva as vagas e gera o link de pagamento.
 *
 * @param {Object} dados corpo do POST vindo do site
 * @return {{orderNsu: string, urlPagamento: string}}
 */
function criarPedido_(dados) {
  const comprador = validarDadosComprador_(dados);

  // A conferência de vagas e a gravação do pedido precisam acontecer juntas,
  // senão duas pessoas podem ver "1 vaga" ao mesmo tempo e as duas compram.
  const pedido = comTrava_(function () {
    const vagas = calcularVagas_();
    if (vagas < comprador.quantidade) {
      throw new ErroNegocio('ESGOTADO', vagas === 0
        ? 'Ingressos esgotados.'
        : 'Só resta' + (vagas > 1 ? 'm ' : ' ') + vagas + ' ingresso' + (vagas > 1 ? 's.' : '.'));
    }

    const novo = {
      orderNsu: 'NDH-' + textoAleatorio_(12, CONFIG.ALFABETO_CODIGO),
      // O token é o que dá acesso aos ingressos pelo link do e-mail.
      // Precisa ser imprevisível, por isso usa o gerador seguro.
      token: Utilities.getUuid().replace(/-/g, ''),
      nome: comprador.nome,
      telefone: comprador.telefone,
      cpf: comprador.cpf,
      email: comprador.email,
      quantidade: comprador.quantidade,
      valorCentavos: comprador.quantidade * CONFIG.PRECO_CENTAVOS,
    };

    const linha = [];
    linha[COL_PEDIDO.ORDER_NSU - 1] = novo.orderNsu;
    linha[COL_PEDIDO.CRIADO_EM - 1] = new Date();
    linha[COL_PEDIDO.STATUS - 1] = STATUS_PEDIDO.AGUARDANDO;
    linha[COL_PEDIDO.NOME - 1] = novo.nome;
    linha[COL_PEDIDO.TELEFONE - 1] = novo.telefone;
    linha[COL_PEDIDO.CPF - 1] = novo.cpf;
    linha[COL_PEDIDO.EMAIL - 1] = novo.email;
    linha[COL_PEDIDO.QUANTIDADE - 1] = novo.quantidade;
    linha[COL_PEDIDO.VALOR_CENTAVOS - 1] = novo.valorCentavos;
    linha[COL_PEDIDO.TOKEN - 1] = novo.token;
    for (let i = 0; i < CABECALHO_PEDIDOS.length; i++) {
      linha[i] = textoSeguro_(linha[i]);
    }

    const aba = obterAba_(CONFIG.ABA_PEDIDOS);
    aba.appendRow(linha);
    novo.linha = aba.getLastRow();
    return novo;
  });

  // A chamada à InfinitePay fica fora da trava: é rede, pode demorar,
  // e não há motivo pra travar a portaria enquanto isso.
  let url;
  try {
    url = criarLinkPagamento_(pedido);
  } catch (e) {
    // Sem link, o pedido não serve pra nada. Marca como erro pra liberar
    // a reserva na hora, em vez de esperar os 30 minutos.
    atualizarPedido_(pedido.linha, { [COL_PEDIDO.STATUS]: 'ERRO_AO_GERAR_PAGAMENTO' });
    throw e;
  }

  atualizarPedido_(pedido.linha, { [COL_PEDIDO.URL_PAGAMENTO]: url });
  console.log('Pedido criado', pedido.orderNsu, pedido.quantidade);

  return { orderNsu: pedido.orderNsu, urlPagamento: url };
}

/**
 * Confirma o pagamento de um pedido e emite os ingressos. Idempotente:
 * pode ser chamada quantas vezes for, só emite uma vez.
 *
 * @param {string} orderNsu
 * @param {string} transactionNsu
 * @param {string} slug
 * @return {Object} pedido já pago, com a lista de ingressos
 */
function confirmarPagamento_(orderNsu, transactionNsu, slug) {
  orderNsu = String(orderNsu || '').trim();
  transactionNsu = String(transactionNsu || '').trim();
  slug = String(slug || '').trim();

  if (!orderNsu || !transactionNsu || !slug) {
    throw new ErroNegocio('DADOS_INVALIDOS', 'Dados do pagamento incompletos.');
  }

  const pedido = buscarPedido_(orderNsu);
  if (!pedido) {
    throw new ErroNegocio('PEDIDO_NAO_ENCONTRADO', 'Pedido não encontrado.');
  }

  if (pedido.status === STATUS_PEDIDO.PAGO) {
    // Já processado. Só devolve os ingressos se for a mesma transação,
    // senão qualquer um com o order_nsu veria os ingressos dos outros.
    if (!compararSeguro_(pedido.transactionNsu, transactionNsu)) {
      throw new ErroNegocio('PEDIDO_NAO_ENCONTRADO', 'Pedido não encontrado.');
    }
    return Object.assign(pedido, { ingressos: listarIngressosDoPedido_(orderNsu) });
  }

  // Daqui pra frente, nada do que veio na requisição é levado em conta
  // além dos identificadores. Valor e situação vêm da própria InfinitePay.
  const pagamento = consultarPagamento_(orderNsu, transactionNsu, slug);

  if (!pagamento.pago) {
    throw new ErroNegocio('PAGAMENTO_PENDENTE', 'Pagamento ainda não confirmado.');
  }

  // amount = valor do pedido; paid_amount pode ser maior (juros do
  // parcelamento ficam por conta do cliente), mas nunca menor.
  if (pagamento.valorCentavos !== pedido.valorCentavos ||
      pagamento.valorPagoCentavos < pedido.valorCentavos) {
    console.error('Valor divergente', orderNsu, pagamento, pedido.valorCentavos);
    throw new ErroNegocio('VALOR_DIVERGENTE',
      'O valor pago não confere com o pedido. Procure a organização.');
  }

  const pago = comTrava_(function () {
    // Relê dentro da trava: o webhook pode ter terminado enquanto
    // a gente esperava a resposta do payment_check.
    const atual = buscarPedido_(orderNsu);
    if (atual.status === STATUS_PEDIDO.PAGO) {
      return Object.assign(atual, { ingressos: listarIngressosDoPedido_(orderNsu) });
    }

    const ingressos = emitirIngressos_(atual);

    atualizarPedido_(atual.linha, {
      [COL_PEDIDO.STATUS]: STATUS_PEDIDO.PAGO,
      [COL_PEDIDO.TRANSACTION_NSU]: transactionNsu,
      [COL_PEDIDO.INVOICE_SLUG]: slug,
      [COL_PEDIDO.METODO_PAGAMENTO]: pagamento.metodo,
      [COL_PEDIDO.VALOR_PAGO_CENTAVOS]: pagamento.valorPagoCentavos,
      [COL_PEDIDO.PAGO_EM]: new Date(),
    });

    console.log('Pagamento confirmado', orderNsu, ingressos.length + ' ingresso(s)');
    return Object.assign(atual, {
      status: STATUS_PEDIDO.PAGO,
      transactionNsu: transactionNsu,
      ingressos: ingressos,
    });
  });

  enviarEmailSePreciso_(pago);
  return pago;
}

/**
 * Manda o e-mail com os ingressos uma única vez por pedido.
 * Falha no e-mail não desfaz a venda: o ingresso já está na planilha e na
 * tela do cliente. Fica registrado no log pra alguém reenviar à mão.
 */
function enviarEmailSePreciso_(pedido) {
  if (pedido.emailEnviadoEm) return;
  try {
    enviarIngressosPorEmail_(pedido, pedido.ingressos);
    atualizarPedido_(pedido.linha, { [COL_PEDIDO.EMAIL_ENVIADO_EM]: new Date() });
    pedido.emailEnviadoEm = new Date();
  } catch (e) {
    console.error('Falha ao enviar e-mail do pedido ' + pedido.orderNsu, e);
  }
}

/**
 * Consulta usada pelo link do e-mail (pedido + token).
 * @param {string} orderNsu
 * @param {string} token
 */
function consultarPedido_(orderNsu, token) {
  const pedido = buscarPedido_(String(orderNsu || '').trim());

  // Mesma resposta pra "não existe" e "token errado", pra não confirmar
  // pra ninguém que um determinado pedido existe.
  if (!pedido || !token || !compararSeguro_(pedido.token, String(token))) {
    throw new ErroNegocio('PEDIDO_NAO_ENCONTRADO', 'Pedido não encontrado.');
  }

  if (pedido.status === STATUS_PEDIDO.PAGO) {
    pedido.ingressos = listarIngressosDoPedido_(pedido.orderNsu);
  }
  return pedido;
}

/**
 * O que pode ir pro navegador. CPF, telefone e afins ficam de fora.
 * @param {Object} pedido
 */
function pedidoPublico_(pedido) {
  return {
    pedido: pedido.orderNsu,
    token: pedido.token,
    status: pedido.status,
    nome: pedido.nome,
    email: pedido.email,
    quantidade: pedido.quantidade,
    ingressos: (pedido.ingressos || []).map(function (i) {
      return { codigo: i.codigo, status: i.status };
    }),
  };
}
