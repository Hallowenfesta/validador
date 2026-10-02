/**
 * Gera os prints das telas usados no relatório (docs/imagens/).
 *
 * Abre o site num Chromium em tamanho de iPhone, com o backend simulado
 * (o mesmo dos testes), e percorre o fluxo: compra, ingressos, portaria.
 * Rode de novo sempre que mudar a interface:  npm run telas
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { iniciarServidor } from '../tests/e2e/servidor.js';
import { criarAmbiente } from '../tests/backend/ambiente-gas.js';

const PASTA = fileURLToPath(new URL('../docs/imagens/', import.meta.url));
const salvar = (nome) => ({ path: path.join(PASTA, nome + '.png') });

const amb = criarAmbiente();
const servidor = await iniciarServidor();
const navegador = await chromium.launch();

// Tamanho lógico de um iPhone 14, com densidade 2x pra imagem ficar nítida no PDF.
const contexto = await navegador.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: 'pt-BR',
});

await contexto.route('https://script.google.com/**', async (rota) => {
  const req = rota.request();
  const corpo = req.method() === 'GET' ? amb.get() : amb.post(req.postData());
  await rota.fulfill({
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(corpo),
  });
});

const pagina = await contexto.newPage();
// Espera as animações de entrada terminarem antes de fotografar.
const aguardarAnimacoes = () => pagina.waitForTimeout(1300);

try {
  // 1. Vendas
  await pagina.goto(servidor.url + 'vendas/');
  await pagina.waitForSelector('#secao-formulario:not([hidden])');
  await aguardarAnimacoes();
  await pagina.screenshot({ ...salvar('01-vendas'), fullPage: true });

  // 2. Vendas com erros de validação
  await pagina.fill('#nome', 'Maria');
  await pagina.locator('#cpf').pressSequentially('12345678900');
  await pagina.click('#quantidade label:has-text("2 ingressos")');
  await pagina.click('#botao-comprar');
  await aguardarAnimacoes();
  await pagina.screenshot({ ...salvar('02-vendas-validacao'), fullPage: true });

  // 3. Ingressos depois do pagamento
  const { dados } = amb.post({
    acao: 'criar_pedido', nome: 'Maria da Silva', telefone: '11987654321',
    cpf: '52998224725', email: 'maria@example.com', quantidade: 2,
  });
  amb.infinitePay.consultar = () => ({
    status: 200, corpo: { success: true, paid: true, amount: 200, paid_amount: 200 },
  });
  await pagina.goto(`${servidor.url}ingresso/?order_nsu=${dados.orderNsu}&transaction_nsu=t&slug=s`);
  await pagina.waitForSelector('#estado-sucesso:not([hidden])');
  await aguardarAnimacoes();
  await pagina.screenshot({ ...salvar('03-ingressos'), fullPage: true });

  // 4. Portaria: login
  await pagina.goto(servidor.url);
  await pagina.waitForSelector('#tela-login:not([hidden])');
  await aguardarAnimacoes();
  await pagina.screenshot(salvar('04-portaria-login'));

  // 5. Portaria: tela de validação
  await pagina.fill('#chave', amb.propriedades.get('CHAVE_PORTARIA'));
  await pagina.click('#botao-entrar');
  await pagina.waitForSelector('#tela-validacao:not([hidden])');
  await pagina.locator('#codigo').blur();
  await aguardarAnimacoes();
  await pagina.screenshot(salvar('05-portaria'));

  // 6–8. Resultados: válido, já utilizado, inválido
  const codigo = amb.abaIngressos().ler(2, 3);
  const resultados = [[codigo, '06-resultado-valido'], [codigo, '07-resultado-utilizado'], ['ZZZZZZZZ', '08-resultado-invalido']];
  for (const [valor, nome] of resultados) {
    await pagina.fill('#codigo', valor);
    await pagina.click('#botao-validar');
    await pagina.waitForSelector('#resultado:not([hidden])');
    await aguardarAnimacoes();
    await pagina.screenshot(salvar(nome));
    await pagina.click('#botao-proximo');
  }

  // 9. E-mail de confirmação (o HTML que o Apps Script envia)
  const email = amb.emails.at(-1).htmlBody;
  const paginaEmail = await contexto.newPage();
  await paginaEmail.setViewportSize({ width: 440, height: 900 });
  await paginaEmail.setContent('<body style="margin:0;background:#0b090e">' + email + '</body>');
  await paginaEmail.waitForTimeout(1500);
  await paginaEmail.screenshot({ ...salvar('09-email'), fullPage: true });

  console.log('Prints salvos em ' + PASTA);
} finally {
  await navegador.close();
  await servidor.fechar();
}
