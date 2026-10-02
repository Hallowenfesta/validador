/**
 * Testes de ponta a ponta no Chromium.
 *
 * As páginas reais são abertas num navegador de verdade. Toda chamada que
 * iria para o Apps Script é interceptada e respondida pelo código .gs real,
 * rodando no simulador (tests/backend/ambiente-gas.js). Ou seja: o que está
 * sendo testado aqui é o sistema inteiro, menos o Google e a InfinitePay.
 */

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { iniciarServidor } from './servidor.js';
import { criarAmbiente } from '../backend/ambiente-gas.js';

const TX = 'tx-e2e-123';
const SLUG = 'SLUGE2E';

let navegador;
let servidor;
let contexto;
let pagina;
let amb;
let errosDePagina;

before(async () => {
  servidor = await iniciarServidor();
  navegador = await chromium.launch();
});

after(async () => {
  await navegador?.close();
  await servidor?.fechar();
});

beforeEach(async () => {
  amb = criarAmbiente();
  errosDePagina = [];

  // Viewport de celular: é onde o site vai ser usado.
  contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });

  // "Apps Script": responde com o backend simulado.
  await contexto.route('https://script.google.com/**', async (rota) => {
    const req = rota.request();
    const corpo = req.method() === 'GET' ? amb.get() : amb.post(req.postData());
    await rota.fulfill({
      status: 200,
      contentType: 'application/json',
      // O Apps Script real libera CORS pra qualquer origem.
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(corpo),
    });
  });

  // "Checkout da InfinitePay": só uma página qualquer pra confirmar o redirecionamento.
  await contexto.route(/infinitepay\.(io|com\.br)/, (rota) =>
    rota.fulfill({ contentType: 'text/html', body: '<h1>Checkout falso</h1>' })
  );

  pagina = await contexto.newPage();
  pagina.on('pageerror', (e) => errosDePagina.push(e.message));
});

afterEach(async () => {
  await contexto.close();
  assert.deepEqual(errosDePagina, [], 'nenhum erro de JavaScript na página');
});

/** Faz a "InfinitePay" responder que o pedido foi pago. */
function marcarComoPago(orderNsu, valor) {
  amb.infinitePay.consultar = (c) => ({
    status: 200,
    corpo: c.order_nsu === orderNsu && c.transaction_nsu === TX && c.slug === SLUG
      ? { success: true, paid: true, amount: valor, paid_amount: valor, capture_method: 'pix' }
      : { success: true, paid: false },
  });
}

async function preencherFormulario(dados = {}) {
  const d = {
    nome: 'Maria da Silva',
    telefone: '11987654321',
    cpf: '52998224725',
    email: 'maria@example.com',
    ...dados,
  };
  await pagina.fill('#nome', d.nome);
  // pressSequentially dispara "input" a cada tecla, igual a uma pessoa digitando.
  await pagina.locator('#telefone').pressSequentially(d.telefone);
  await pagina.locator('#cpf').pressSequentially(d.cpf);
  await pagina.fill('#email', d.email);
}

describe('vendas', () => {
  test('mostra preço e vagas vindos do backend', async () => {
    await pagina.goto(servidor.url + 'vendas/');
    await pagina.waitForSelector('#secao-formulario:not([hidden])');

    assert.equal(await pagina.textContent('#preco'), 'R$ 1,00');
    assert.equal(await pagina.textContent('#vagas'), '30 disponíveis');
    assert.equal(await pagina.textContent('#lote-nome'), 'Pré-venda');
    assert.equal(await pagina.locator('#quantidade input[type=radio]').count(), 2);

    await pagina.click('#quantidade label:has-text("2 ingressos")');
    assert.equal(await pagina.textContent('#total'), 'R$ 2,00');
  });

  test('máscaras e validação aparecem antes de enviar', async () => {
    await pagina.goto(servidor.url + 'vendas/');
    await pagina.waitForSelector('#secao-formulario:not([hidden])');
    await preencherFormulario({ cpf: '12345678900', nome: 'Maria' });

    assert.equal(await pagina.inputValue('#cpf'), '123.456.789-00');
    assert.equal(await pagina.inputValue('#telefone'), '(11) 98765-4321');

    await pagina.click('#botao-comprar');
    assert.equal(await pagina.textContent('#erro-cpf'), 'CPF inválido. Confira os números.');
    assert.equal(await pagina.textContent('#erro-nome'), 'Informe nome e sobrenome.');
    assert.equal(await pagina.getAttribute('#nome', 'aria-invalid'), 'true');
    assert.equal(amb.requisicoes.length, 0, 'não chamou a InfinitePay');
  });

  test('compra válida leva ao checkout da InfinitePay', async () => {
    await pagina.goto(servidor.url + 'vendas/');
    await pagina.waitForSelector('#secao-formulario:not([hidden])');
    await preencherFormulario();
    await pagina.click('#quantidade label:has-text("2 ingressos")');

    await Promise.all([
      pagina.waitForURL(/infinitepay/),
      pagina.click('#botao-comprar'),
    ]);

    assert.equal(await pagina.textContent('h1'), 'Checkout falso');
    const pedido = amb.abaPedidos().linha(2);
    assert.equal(pedido[2], 'AGUARDANDO_PAGAMENTO');
    assert.equal(pedido[7], 2);
  });

  test('esgotado esconde o formulário', async () => {
    for (let i = 0; i < 30; i++) amb.abaIngressos().appendRow(['', "'X Y", "'COD" + i, '', "'Pendente"]);
    await pagina.goto(servidor.url + 'vendas/');
    await pagina.waitForFunction(() => document.querySelector('#vagas').textContent === 'Esgotado');
    assert.equal(await pagina.isHidden('#secao-formulario'), true);
  });

  test('erro do backend aparece na tela e libera o botão', async () => {
    amb.infinitePay.criarLink = () => ({ status: 500, corpo: 'erro' });
    await pagina.goto(servidor.url + 'vendas/');
    await pagina.waitForSelector('#secao-formulario:not([hidden])');
    await preencherFormulario();
    await pagina.click('#botao-comprar');

    await pagina.waitForSelector('#erro-geral:not([hidden])');
    assert.match(await pagina.textContent('#erro-geral'), /indisponível/);
    assert.equal(await pagina.isEnabled('#botao-comprar'), true);
  });
});

describe('ingresso (retorno do checkout)', () => {
  /** Cria um pedido pago e devolve a URL de retorno que a InfinitePay montaria. */
  function urlDeRetorno(quantidade = 1) {
    const { dados } = amb.post({
      acao: 'criar_pedido', nome: 'Maria da Silva', telefone: '11987654321',
      cpf: '52998224725', email: 'maria@example.com', quantidade,
    });
    marcarComoPago(dados.orderNsu, quantidade * 100);
    const q = new URLSearchParams({
      order_nsu: dados.orderNsu, transaction_nsu: TX, slug: SLUG,
      capture_method: 'pix', receipt_url: 'https://recibo.example/x',
    });
    return { url: servidor.url + 'ingresso/?' + q, orderNsu: dados.orderNsu };
  }

  test('mostra os ingressos e troca a URL pelo link permanente', async () => {
    const { url, orderNsu } = urlDeRetorno(2);
    await pagina.goto(url);
    await pagina.waitForSelector('#estado-sucesso:not([hidden])');

    assert.equal(await pagina.textContent('#saudacao'), 'Tudo certo, Maria!');
    assert.equal(await pagina.locator('.ingresso').count(), 2);

    const codigos = await pagina.locator('.codigo').allTextContents();
    assert.deepEqual(codigos.sort(), [amb.abaIngressos().ler(2, 3), amb.abaIngressos().ler(3, 3)].sort());

    const atual = new URL(pagina.url());
    assert.equal(atual.searchParams.get('pedido'), orderNsu);
    assert.match(atual.searchParams.get('token'), /^[0-9a-f]{32}$/);
    assert.equal(atual.searchParams.get('transaction_nsu'), null);

    // Recarregar com o link permanente continua funcionando.
    await pagina.reload();
    await pagina.waitForSelector('#estado-sucesso:not([hidden])');
    assert.equal(await pagina.locator('.ingresso').count(), 2);
  });

  test('ingresso usado aparece marcado', async () => {
    const { url } = urlDeRetorno(1);
    await pagina.goto(url);
    await pagina.waitForSelector('#estado-sucesso:not([hidden])');

    const chave = amb.propriedades.get('CHAVE_PORTARIA');
    amb.post({ acao: 'validar', codigo: amb.abaIngressos().ler(2, 3), chave });

    await pagina.reload();
    await pagina.waitForSelector('#estado-sucesso:not([hidden])');
    assert.equal(await pagina.textContent('.selo'), 'Já utilizado');
  });

  test('Pix ainda compensando: espera e mostra quando confirmar', async () => {
    const { url, orderNsu } = urlDeRetorno(1);
    const pago = amb.infinitePay.consultar;
    let consultas = 0;
    amb.infinitePay.consultar = (c) => (++consultas === 1 ? { status: 200, corpo: { success: true, paid: false } } : pago(c));

    await pagina.goto(url);
    await pagina.waitForFunction(() =>
      document.querySelector('#carregando-texto').textContent.includes('Aguardando'));
    await pagina.waitForSelector('#estado-sucesso:not([hidden])', { timeout: 15000 });
    assert.equal(consultas, 2);
    assert.ok(orderNsu);
  });

  test('link sem parâmetros', async () => {
    await pagina.goto(servidor.url + 'ingresso/');
    await pagina.waitForSelector('#estado-erro:not([hidden])');
    assert.match(await pagina.textContent('#erro-texto'), /Link incompleto/);
  });

  test('token adulterado não mostra nada', async () => {
    const { url } = urlDeRetorno(1);
    await pagina.goto(url);
    await pagina.waitForSelector('#estado-sucesso:not([hidden])');
    const adulterada = new URL(pagina.url());
    adulterada.searchParams.set('token', '0'.repeat(32));
    await pagina.goto(adulterada.href);
    await pagina.waitForSelector('#estado-erro:not([hidden])');
    assert.equal(await pagina.textContent('#erro-texto'), 'Pedido não encontrado.');
  });
});

describe('validador (portaria)', () => {
  function emitirIngresso() {
    const { dados } = amb.post({
      acao: 'criar_pedido', nome: 'João Pereira', telefone: '11987654321',
      cpf: '52998224725', email: 'joao@example.com', quantidade: 1,
    });
    marcarComoPago(dados.orderNsu, 100);
    amb.post({ order_nsu: dados.orderNsu, transaction_nsu: TX, invoice_slug: SLUG });
    return amb.abaIngressos().ler(2, 3);
  }

  async function entrar(chave = amb.propriedades.get('CHAVE_PORTARIA')) {
    await pagina.goto(servidor.url);
    await pagina.waitForSelector('#tela-login:not([hidden])');
    await pagina.fill('#chave', chave);
    await pagina.click('#botao-entrar');
  }

  async function validar(codigo) {
    await pagina.fill('#codigo', codigo);
    await pagina.click('#botao-validar');
    await pagina.waitForSelector('#resultado:not([hidden])');
    return {
      classe: await pagina.getAttribute('#resultado', 'class'),
      titulo: await pagina.textContent('#resultado-titulo'),
      nome: await pagina.textContent('#resultado-nome'),
      detalhe: await pagina.textContent('#resultado-detalhe'),
    };
  }

  test('chave errada não entra', async () => {
    await entrar('ERRADA');
    await pagina.waitForFunction(() => document.querySelector('#erro-login').textContent !== '');
    assert.equal(await pagina.textContent('#erro-login'), 'Chave da portaria incorreta.');
    assert.equal(await pagina.isHidden('#tela-validacao'), true);
  });

  test('fluxo completo: válido, já utilizado, inválido', async () => {
    const codigo = emitirIngresso();
    await entrar();
    await pagina.waitForSelector('#tela-validacao:not([hidden])');

    const primeira = await validar(codigo.toLowerCase());
    assert.equal(primeira.classe, 'resultado valido');
    assert.equal(primeira.titulo, 'Entrada liberada');
    assert.equal(primeira.nome, 'João Pereira');

    await pagina.click('#botao-proximo');
    assert.equal(await pagina.isHidden('#resultado'), true);
    assert.equal(await pagina.inputValue('#codigo'), '');

    const segunda = await validar(codigo);
    assert.equal(segunda.classe, 'resultado utilizado');
    assert.match(segunda.detalhe, /^Entrou às \d{2}:\d{2}\.$/);

    await pagina.keyboard.press('Escape');
    const terceira = await validar('NAOEXISTE');
    assert.equal(terceira.classe, 'resultado invalido');
    assert.equal(terceira.detalhe, 'Código não encontrado.');
  });

  test('lembra a chave no aparelho e volta pro login se ela for trocada', async () => {
    const codigo = emitirIngresso();
    await entrar();
    await pagina.waitForSelector('#tela-validacao:not([hidden])');

    await pagina.reload();
    await pagina.waitForSelector('#tela-validacao:not([hidden])');

    amb.gas.gerarNovaChavePortaria();
    await pagina.fill('#codigo', codigo);
    await pagina.click('#botao-validar');
    await pagina.waitForSelector('#tela-login:not([hidden])');
    assert.match(await pagina.textContent('#erro-login'), /chave da portaria mudou/);
    assert.equal(amb.abaIngressos().ler(2, 5), 'Pendente', 'ingresso não foi queimado');
  });

  test('sair apaga a chave do aparelho', async () => {
    await entrar();
    await pagina.waitForSelector('#tela-validacao:not([hidden])');
    await pagina.click('#botao-sair');
    await pagina.reload();
    await pagina.waitForSelector('#tela-login:not([hidden])');
  });
});
