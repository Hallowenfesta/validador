/**
 * Modo demo: o sistema inteiro rodando na sua máquina, sem Google e sem
 * InfinitePay de verdade. Nenhum dinheiro é cobrado.
 *
 *   npm run demo        e abra http://localhost:8080/demo/
 *   npm run demo:rede   idem, mas também acessível pelo celular no mesmo Wi-Fi
 *
 * O que roda de verdade: o site (as mesmas páginas do GitHub Pages) e o
 * código do Apps Script (os arquivos .gs), carregado no simulador que os
 * testes usam. O que é de mentira: a planilha (fica na memória e some ao
 * fechar), o envio de e-mail (aparece no painel) e o checkout da
 * InfinitePay (uma página com um botão "Pagar").
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { servirArquivo } from '../tests/e2e/servidor.js';
import { criarAmbiente } from '../tests/backend/ambiente-gas.js';

const PORTA = Number(process.env.PORTA) || 8080;

// Por padrão só esta máquina acessa. Com --rede, outros aparelhos do mesmo
// Wi-Fi também (útil pra abrir o ingresso no celular).
const LIBERAR_REDE = process.argv.includes('--rede');
const ARQUIVO_CONFIG = fileURLToPath(new URL('../assets/js/config.js', import.meta.url));

const amb = criarAmbiente();
const chavePortaria = amb.propriedades.get('CHAVE_PORTARIA');

// Os console.log do Apps Script aparecem no terminal, como no "Execuções".
for (const nivel of ['log', 'warn', 'error']) {
  amb.gas.console[nivel] = (...args) => console[nivel]('  [apps-script]', ...args);
}

// ---------------------------------------------------------------------------
// InfinitePay de mentira
// ---------------------------------------------------------------------------

/** Cobranças criadas (o que o /links recebeu), por order_nsu. */
const cobrancas = new Map();
/** Pagamentos "aprovados" no checkout simulado, por order_nsu. */
const pagamentos = new Map();
/** Endereço que o navegador está usando (localhost ou IP da rede). */
let origemAtual = `http://localhost:${PORTA}`;

amb.infinitePay.criarLink = (corpo) => {
  const item = corpo.items[0];
  cobrancas.set(corpo.order_nsu, {
    valor: item.quantity * item.price,
    quantidade: item.quantity,
    descricao: item.description,
    nome: corpo.customer?.name || '',
  });
  return {
    status: 200,
    corpo: { url: `${origemAtual}/checkout-simulado/?pedido=${encodeURIComponent(corpo.order_nsu)}` },
  };
};

// Mesmo comportamento do payment_check real: só diz "pago" pra combinação
// exata de pedido + transação + slug.
amb.infinitePay.consultar = (c) => {
  const p = pagamentos.get(c.order_nsu);
  const confere = p && p.transactionNsu === c.transaction_nsu && p.slug === c.slug;
  return {
    status: 200,
    corpo: confere
      ? { success: true, paid: true, amount: p.valor, paid_amount: p.valor, installments: 1, capture_method: p.metodo }
      : { success: true, paid: false },
  };
};

// ---------------------------------------------------------------------------
// Utilitários de HTML
// ---------------------------------------------------------------------------

const esc = (t) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const reais = (centavos) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const paginaHtml = (titulo, corpo, extraHead = '') => `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>${extraHead}
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 16px; background: #0b090e; color: #f5f2ee;
         font: 15px/1.5 -apple-system, 'Segoe UI', Inter, sans-serif; }
  main { max-width: 1100px; margin: 0 auto; }
  h1 { margin: 0 0 4px; font-size: 26px; letter-spacing: -0.02em; }
  h2 { margin: 28px 0 10px; font-size: 18px; }
  a { color: #ff8a4c; }
  .faixa { display: inline-block; margin-bottom: 14px; padding: 4px 10px; border-radius: 999px;
           background: rgba(255,159,10,.15); color: #ff9f0a; font-size: 12px; font-weight: 600;
           letter-spacing: .06em; text-transform: uppercase; }
  .cartao { padding: 18px; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; background: #1c1822; }
  .grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .grade a { display: block; padding: 14px 16px; border-radius: 12px; background: rgba(255,255,255,.06);
             color: #f5f2ee; text-decoration: none; font-weight: 600; }
  .grade a small { display: block; color: rgba(235,230,245,.6); font-weight: 400; }
  .chave { font: 600 22px ui-monospace, Consolas, monospace; letter-spacing: .1em; color: #ff8a4c; }
  .rolagem { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid rgba(255,255,255,.08); white-space: nowrap; }
  th { color: rgba(235,230,245,.6); font-weight: 600; }
  .vazio { color: rgba(235,230,245,.45); }
  .ok { color: #30d158; } .usado { color: #ff453a; } .espera { color: #ff9f0a; }
  button { font: inherit; font-weight: 600; border: none; border-radius: 12px; padding: 14px 18px;
           cursor: pointer; width: 100%; margin-top: 10px; }
  .pix { background: #30d158; color: #062b12; } .cartao-btn { background: #f5f2ee; color: #1d1d1f; }
  .sair { background: transparent; color: rgba(235,230,245,.6); }
</style></head><body><main>${corpo}</main></body></html>`;

// ---------------------------------------------------------------------------
// Páginas do modo demo
// ---------------------------------------------------------------------------

function paginaCheckout(orderNsu) {
  const c = cobrancas.get(orderNsu);
  if (!c) return paginaHtml('Checkout', '<p>Cobrança não encontrada. Volte e compre de novo.</p>');
  return paginaHtml('Checkout simulado', `
    <div style="max-width:420px;margin:40px auto">
      <span class="faixa">Simulação · nenhum valor é cobrado</span>
      <div class="cartao">
        <h1>InfinitePay</h1>
        <p class="vazio" style="margin:0 0 18px">Checkout de mentira do modo demo</p>
        <p style="margin:0">${esc(c.descricao)} × ${c.quantidade}</p>
        <p style="margin:4px 0 0;font-size:34px;font-weight:700">${reais(c.valor)}</p>
        <p class="vazio">${esc(c.nome)}</p>
        <form method="post" action="/checkout-simulado/pagar">
          <input type="hidden" name="pedido" value="${esc(orderNsu)}">
          <button class="pix" name="metodo" value="pix">Pagar com Pix</button>
          <button class="cartao-btn" name="metodo" value="credit_card">Pagar com cartão</button>
        </form>
        <form method="get" action="/vendas/"><button class="sair">Desistir e voltar</button></form>
      </div>
    </div>`);
}

function formatarCelula(aba, linha, coluna) {
  const formula = aba.formula(linha, coluna);
  if (formula) return '<span class="vazio">(QR)</span>';
  const v = aba.ler(linha, coluna);
  if (v instanceof Date) return esc(v.toLocaleString('pt-BR'));
  if (v === 'Utilizado' || v === 'PAGO') return `<span class="${v === 'PAGO' ? 'ok' : 'usado'}">${esc(v)}</span>`;
  if (v === 'Pendente' || v === 'AGUARDANDO_PAGAMENTO') return `<span class="espera">${esc(v)}</span>`;
  const t = String(v);
  return esc(t.length > 40 ? t.slice(0, 37) + '…' : t);
}

function tabelaDaAba(aba) {
  const colunas = aba.getLastColumn();
  const linhas = aba.getLastRow();
  if (linhas < 2) return '<p class="vazio">Nenhuma linha ainda.</p>';
  let html = '<div class="rolagem"><table><tr>';
  for (let c = 1; c <= colunas; c++) html += `<th>${esc(aba.ler(1, c))}</th>`;
  html += '</tr>';
  for (let l = 2; l <= linhas; l++) {
    html += '<tr>';
    for (let c = 1; c <= colunas; c++) html += `<td>${formatarCelula(aba, l, c)}</td>`;
    html += '</tr>';
  }
  return html + '</table></div>';
}

function painel() {
  const vagas = amb.get().dados?.vagas;
  const emails = amb.emails.map((e, i) =>
    `<li><a href="/demo/email/${i}" target="_blank">${esc(e.subject)}</a> → ${esc(e.to)}</li>`).reverse().join('');

  return paginaHtml('Painel do modo demo', `
    <span class="faixa">Modo demo · dados na memória, somem ao fechar</span>
    <h1>Noite do Horror · painel de teste</h1>
    <p class="vazio" style="margin:0">Esta página atualiza sozinha a cada 4 segundos.</p>

    <h2>Abrir</h2>
    <div class="grade">
      <a href="/vendas/" target="_blank">Vendas<small>comprar um ingresso</small></a>
      <a href="/" target="_blank">Portaria<small>validar ingressos</small></a>
    </div>

    <h2>Chave da portaria</h2>
    <div class="cartao"><span class="chave">${esc(chavePortaria)}</span>
      <p class="vazio" style="margin:6px 0 0">Vagas restantes: <strong>${esc(vagas)}</strong></p></div>

    <h2>E-mails enviados</h2>
    <div class="cartao">${emails ? `<ul style="margin:0;padding-left:18px">${emails}</ul>` : '<p class="vazio" style="margin:0">Nenhum ainda. Faça uma compra.</p>'}</div>

    <h2>Planilha · aba "pedidos"</h2>
    <div class="cartao">${tabelaDaAba(amb.abaPedidos())}</div>

    <h2>Planilha · aba "listagem" (ingressos)</h2>
    <div class="cartao">${tabelaDaAba(amb.abaIngressos())}</div>
  `, '<meta http-equiv="refresh" content="4">');
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

const lerCorpo = (req) => new Promise((resolve) => {
  let dados = '';
  req.on('data', (parte) => { dados += parte; });
  req.on('end', () => resolve(dados));
});

const responder = (res, status, tipo, corpo, extra = {}) => {
  res.writeHead(status, { 'Content-Type': tipo, 'Cache-Control': 'no-store', ...extra });
  res.end(corpo);
};

const servidor = http.createServer(async (req, res) => {
  origemAtual = `http://${req.headers.host}`;
  const url = new URL(req.url, origemAtual);

  try {
    // O site aponta pro /api local em vez do Apps Script publicado.
    if (url.pathname === '/assets/js/config.js') {
      const original = fs.readFileSync(ARQUIVO_CONFIG, 'utf8');
      const demo = original.replace(/export const URL_API =[\s\S]*?;/, "export const URL_API = '/api';");
      return responder(res, 200, 'text/javascript; charset=utf-8', demo);
    }

    // "Apps Script": doGet / doPost do código .gs real.
    if (url.pathname === '/api') {
      const resposta = req.method === 'GET' ? amb.get() : amb.post(await lerCorpo(req));
      return responder(res, 200, 'application/json', JSON.stringify(resposta));
    }

    if (url.pathname === '/checkout-simulado/') {
      return responder(res, 200, 'text/html; charset=utf-8', paginaCheckout(url.searchParams.get('pedido')));
    }

    if (url.pathname === '/checkout-simulado/pagar' && req.method === 'POST') {
      const form = new URLSearchParams(await lerCorpo(req));
      const orderNsu = form.get('pedido');
      const cobranca = cobrancas.get(orderNsu);
      if (!cobranca) return responder(res, 404, 'text/plain; charset=utf-8', 'Cobrança não encontrada.');

      const pagamento = {
        transactionNsu: crypto.randomUUID(),
        slug: 'DEMO' + crypto.randomBytes(3).toString('hex').toUpperCase(),
        valor: cobranca.valor,
        metodo: form.get('metodo') === 'credit_card' ? 'credit_card' : 'pix',
      };
      pagamentos.set(orderNsu, pagamento);
      console.log(`\n  Pagamento simulado: ${orderNsu} (${reais(pagamento.valor)}, ${pagamento.metodo})`);

      // Igual à vida real: o cliente volta pro site e, pouco depois, chega o
      // webhook. Quem chegar primeiro emite; o outro só confirma.
      setTimeout(() => {
        const r = amb.post({
          invoice_slug: pagamento.slug, amount: pagamento.valor, paid_amount: pagamento.valor,
          installments: 1, capture_method: pagamento.metodo,
          transaction_nsu: pagamento.transactionNsu, order_nsu: orderNsu,
        });
        console.log('  Webhook simulado entregue:', JSON.stringify(r));
      }, 3000);

      const retorno = new URLSearchParams({
        order_nsu: orderNsu,
        transaction_nsu: pagamento.transactionNsu,
        slug: pagamento.slug,
        capture_method: pagamento.metodo,
        receipt_url: `${origemAtual}/demo/`,
      });
      return responder(res, 303, 'text/plain', '', { Location: `/ingresso/?${retorno}` });
    }

    if (url.pathname === '/demo/' || url.pathname === '/demo') {
      return responder(res, 200, 'text/html; charset=utf-8', painel());
    }

    const email = url.pathname.match(/^\/demo\/email\/(\d+)$/);
    if (email && amb.emails[Number(email[1])]) {
      return responder(res, 200, 'text/html; charset=utf-8', amb.emails[Number(email[1])].htmlBody);
    }

    servirArquivo(req, res);
  } catch (erro) {
    console.error(erro);
    responder(res, 500, 'text/plain; charset=utf-8', 'Erro no modo demo: ' + erro.message);
  }
});

servidor.listen(PORTA, LIBERAR_REDE ? '0.0.0.0' : '127.0.0.1', () => {
  // Só mostra IPs de rede doméstica (192.168.x, 10.x, 172.16–31.x). Um IP
  // público aqui (de VPN, por exemplo) não é endereço pra usar no celular.
  const ehRedeLocal = (ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  const ipsDaRede = !LIBERAR_REDE ? [] : Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal && ehRedeLocal(i.address))
    .map((i) => `http://${i.address}:${PORTA}/`);

  console.log(`
  Modo demo da Noite do Horror rodando. Nada aqui cobra dinheiro.

  Painel (comece por aqui):  http://localhost:${PORTA}/demo/
  Vendas:                    http://localhost:${PORTA}/vendas/
  Portaria:                  http://localhost:${PORTA}/
  Chave da portaria:         ${chavePortaria}
${ipsDaRede.length ? `
  Pelo celular (mesmo Wi-Fi): ${ipsDaRede.join('  ou  ')}
  (no celular a câmera não abre, porque não é https; use pra ver o ingresso)
` : `
  Pra abrir pelo celular no mesmo Wi-Fi, rode:  npm run demo:rede
`}
  Ctrl+C para encerrar. Os dados somem ao fechar.
`);
});
