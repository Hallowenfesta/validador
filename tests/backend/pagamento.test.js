import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarAmbiente, COMPRADOR_VALIDO } from './ambiente-gas.js';

const TX = 'fd2e703f-0d2d-497e-a082-712e081040f6';
const SLUG = 'R87176';

/**
 * Cria um pedido e configura a "InfinitePay" pra dizer que ele foi pago
 * (só para essa combinação exata de order_nsu/transaction/slug).
 */
function pedidoPago(quantidade = 1, ajustes = {}) {
  const amb = criarAmbiente();
  const { dados } = amb.post({ ...COMPRADOR_VALIDO, quantidade });
  const valor = quantidade * amb.CONFIG.PRECO_CENTAVOS;

  amb.infinitePay.consultar = (c) => {
    const confere = c.order_nsu === dados.orderNsu && c.transaction_nsu === TX && c.slug === SLUG;
    return {
      status: 200,
      corpo: confere
        ? { success: true, paid: true, amount: valor, paid_amount: valor, capture_method: 'pix', ...ajustes }
        : { success: true, paid: false },
    };
  };

  const webhook = (extra = {}) => amb.post({
    invoice_slug: SLUG,
    amount: valor,
    paid_amount: valor,
    installments: 1,
    capture_method: 'pix',
    transaction_nsu: TX,
    order_nsu: dados.orderNsu,
    ...extra,
  });

  return { amb, orderNsu: dados.orderNsu, valor, webhook };
}

describe('webhook da InfinitePay', () => {
  test('pagamento confirmado gera os ingressos na planilha', () => {
    const { amb, orderNsu, webhook } = pedidoPago(2);

    const r = webhook();
    assert.deepEqual(r, { success: true, message: null });

    const aba = amb.abaIngressos();
    assert.equal(aba.getLastRow(), 3, 'cabeçalho + 2 ingressos');

    for (const n of [2, 3]) {
      const l = aba.linha(n);
      assert.match(String(l[0]), /^[0-9a-f-]{36}$/, 'id preenchido');
      assert.equal(l[1], 'Maria da Silva');
      assert.match(String(l[2]), /^[A-HJ-NP-Z2-9]{8}$/);
      assert.equal(l[4], 'Pendente');
      assert.equal(l[5], '(11) 98765-4321');
      assert.equal(l[6], '529.982.247-25');
      assert.equal(l[7], 'maria@example.com');
      assert.equal(l[8], orderNsu);
      assert.ok(l[9] instanceof Date);
      assert.match(aba.formula(n, 4), /^=IMAGE\("https:\/\/quickchart\.io\/qr\?.*text=[A-Z0-9]{8}"\)$/);
    }
    assert.notEqual(aba.ler(2, 3), aba.ler(3, 3), 'códigos diferentes');

    const pedido = amb.abaPedidos().linha(2);
    assert.equal(pedido[2], 'PAGO');
    assert.equal(pedido[11], TX);
    assert.equal(pedido[12], SLUG);
    assert.equal(pedido[13], 'pix');
    assert.ok(pedido[15] instanceof Date, 'pago em');
  });

  test('confere o pagamento direto na InfinitePay (payment_check)', () => {
    const { amb, orderNsu, webhook } = pedidoPago();
    webhook();
    const consulta = amb.requisicoes.find((r) => r.url.endsWith('/payment_check'));
    assert.deepEqual(consulta.corpo, {
      handle: amb.CONFIG.INFINITEPAY.HANDLE,
      order_nsu: orderNsu,
      transaction_nsu: TX,
      slug: SLUG,
    });
  });

  test('ATAQUE: webhook forjado não gera ingresso', () => {
    // Cenário real com o código antigo: alguém descobre a URL do Apps Script
    // e manda um JSON dizendo que pagou. Como o webhook não é assinado,
    // o código antigo acreditava e emitia o ingresso.
    const { amb, webhook } = pedidoPago();
    const r = webhook({ transaction_nsu: 'inventado-pelo-atacante', invoice_slug: 'FAKE' });

    assert.equal(r.success, false);
    assert.equal(amb.abaIngressos().getLastRow(), 1, 'nenhum ingresso criado');
    assert.equal(amb.abaPedidos().ler(2, 3), 'AGUARDANDO_PAGAMENTO');
    assert.equal(amb.emails.length, 0);
  });

  test('ATAQUE: valor no webhook é ignorado, vale o da InfinitePay', () => {
    const { amb, webhook } = pedidoPago(2, { amount: 100, paid_amount: 100 });
    const r = webhook({ amount: 200, paid_amount: 200 });
    assert.equal(r.success, false);
    assert.match(r.message, /valor/i);
    assert.equal(amb.abaIngressos().getLastRow(), 1);
  });

  test('aceita paid_amount maior (juros de parcelamento)', () => {
    const { amb, valor, webhook } = pedidoPago(1, { paid_amount: 115 });
    assert.equal(valor, 100);
    assert.equal(webhook().success, true);
    assert.equal(amb.abaIngressos().getLastRow(), 2);
  });

  test('recusa paid_amount menor que o pedido', () => {
    const { amb, webhook } = pedidoPago(1, { paid_amount: 50 });
    assert.equal(webhook().success, false);
    assert.equal(amb.abaIngressos().getLastRow(), 1);
  });

  test('"paid" precisa ser true de verdade', () => {
    const { amb, webhook } = pedidoPago(1, { paid: 'true' });
    assert.equal(webhook().success, false);
    assert.equal(amb.abaIngressos().getLastRow(), 1);
  });

  test('webhook repetido não duplica ingressos nem e-mail', () => {
    const { amb, webhook } = pedidoPago(2);
    webhook();
    webhook();
    webhook();
    assert.equal(amb.abaIngressos().getLastRow(), 3);
    assert.equal(amb.emails.length, 1);
  });

  test('pedido inexistente', () => {
    const { webhook } = pedidoPago();
    const r = webhook({ order_nsu: 'NDH-NAOEXISTE' });
    assert.equal(r.success, false);
  });

  test('InfinitePay fora do ar durante a confirmação: nada é emitido', () => {
    const { amb, webhook } = pedidoPago();
    amb.infinitePay.consultar = () => ({ status: 503, corpo: 'unavailable' });
    assert.equal(webhook().success, false);
    assert.equal(amb.abaIngressos().getLastRow(), 1);
    assert.equal(amb.trava.presa, false);
  });
});

describe('e-mail', () => {
  test('é enviado com os códigos e o link do pedido', () => {
    const { amb, orderNsu, webhook } = pedidoPago(2);
    webhook();

    assert.equal(amb.emails.length, 1);
    const email = amb.emails[0];
    assert.equal(email.to, 'maria@example.com');
    for (const codigo of [amb.abaIngressos().ler(2, 3), amb.abaIngressos().ler(3, 3)]) {
      assert.ok(email.htmlBody.includes(codigo));
      assert.ok(email.body.includes(codigo));
    }
    const token = amb.abaPedidos().ler(2, 10);
    assert.ok(email.body.includes('ingresso/?pedido=' + orderNsu + '&token=' + token));
    assert.ok(amb.abaPedidos().ler(2, 17) instanceof Date, 'registra quando enviou');
  });

  test('nome do comprador é escapado no HTML', () => {
    const amb = criarAmbiente();
    const { dados } = amb.post({ ...COMPRADOR_VALIDO, nome: '<script>alert(1)</script> Silva' });
    amb.infinitePay.consultar = () => ({ status: 200, corpo: { success: true, paid: true, amount: 100, paid_amount: 100 } });
    amb.post({ order_nsu: dados.orderNsu, transaction_nsu: TX, invoice_slug: SLUG });
    assert.ok(!amb.emails[0].htmlBody.includes('<script>'));
  });

  test('falha no e-mail não impede a venda', () => {
    const { amb, webhook } = pedidoPago();
    amb.gas.MailApp.falhar = true;
    assert.equal(webhook().success, true);
    assert.equal(amb.abaIngressos().getLastRow(), 2);
    assert.equal(amb.abaPedidos().ler(2, 17), '', 'não marca como enviado');
    assert.ok(amb.logs.some((l) => l[0] === 'error'));
  });
});

describe('confirmar_pagamento (cliente voltando do checkout)', () => {
  test('confirma, emite e devolve os ingressos', () => {
    const { amb, orderNsu } = pedidoPago(2);
    const r = amb.post({ acao: 'confirmar_pagamento', order_nsu: orderNsu, transaction_nsu: TX, slug: SLUG });

    assert.equal(r.sucesso, true, JSON.stringify(r));
    assert.equal(r.dados.status, 'PAGO');
    assert.equal(r.dados.ingressos.length, 2);
    assert.match(r.dados.token, /^[0-9a-f]{32}$/);
    assert.equal(r.dados.cpf, undefined, 'CPF não vai pro navegador');
    assert.equal(r.dados.telefone, undefined);
  });

  test('webhook e retorno do cliente juntos emitem uma vez só', () => {
    const { amb, orderNsu, webhook } = pedidoPago(2);
    webhook();
    const r = amb.post({ acao: 'confirmar_pagamento', order_nsu: orderNsu, transaction_nsu: TX, slug: SLUG });
    assert.equal(r.dados.ingressos.length, 2);
    assert.equal(amb.abaIngressos().getLastRow(), 3);
  });

  test('pagamento ainda pendente (ex.: Pix não compensado)', () => {
    const { amb, orderNsu } = pedidoPago();
    amb.infinitePay.consultar = () => ({ status: 200, corpo: { success: true, paid: false } });
    const r = amb.post({ acao: 'confirmar_pagamento', order_nsu: orderNsu, transaction_nsu: TX, slug: SLUG });
    assert.equal(r.codigo, 'PAGAMENTO_PENDENTE');
  });

  test('ATAQUE: com o order_nsu certo e transação errada não vê ingressos de outra pessoa', () => {
    const { amb, orderNsu, webhook } = pedidoPago();
    webhook();
    const r = amb.post({ acao: 'confirmar_pagamento', order_nsu: orderNsu, transaction_nsu: 'outra', slug: SLUG });
    assert.equal(r.sucesso, false);
    assert.equal(r.codigo, 'PEDIDO_NAO_ENCONTRADO');
  });

  test('dados incompletos', () => {
    const { amb, orderNsu } = pedidoPago();
    const r = amb.post({ acao: 'confirmar_pagamento', order_nsu: orderNsu });
    assert.equal(r.codigo, 'DADOS_INVALIDOS');
  });
});

describe('consultar_pedido (link do e-mail)', () => {
  test('com token certo devolve os ingressos', () => {
    const { amb, orderNsu, webhook } = pedidoPago(2);
    webhook();
    const token = amb.abaPedidos().ler(2, 10);
    const r = amb.post({ acao: 'consultar_pedido', pedido: orderNsu, token });
    assert.equal(r.sucesso, true);
    assert.equal(r.dados.ingressos.length, 2);
    assert.equal(r.dados.ingressos[0].status, 'Pendente');
  });

  test('pedido ainda não pago devolve status sem ingressos', () => {
    const { amb, orderNsu } = pedidoPago();
    const token = amb.abaPedidos().ler(2, 10);
    const r = amb.post({ acao: 'consultar_pedido', pedido: orderNsu, token });
    assert.equal(r.dados.status, 'AGUARDANDO_PAGAMENTO');
    assert.deepEqual(r.dados.ingressos, []);
  });

  test('token errado ou ausente responde igual a pedido inexistente', () => {
    const { amb, orderNsu, webhook } = pedidoPago();
    webhook();
    const errado = amb.post({ acao: 'consultar_pedido', pedido: orderNsu, token: 'x' });
    const vazio = amb.post({ acao: 'consultar_pedido', pedido: orderNsu });
    const inexistente = amb.post({ acao: 'consultar_pedido', pedido: 'NDH-X', token: 'x' });
    assert.deepEqual(errado, inexistente);
    assert.deepEqual(vazio, inexistente);
  });
});
