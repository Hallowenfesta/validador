/**
 * Página "Meus ingressos".
 *
 * Chega aqui de dois jeitos:
 *  1. Voltando do checkout. A InfinitePay acrescenta na URL:
 *     ?order_nsu=...&transaction_nsu=...&slug=...&receipt_url=...&capture_method=...
 *     Com isso pedimos ao backend pra confirmar o pagamento (ele consulta a
 *     InfinitePay) e emitir os ingressos, sem depender do webhook.
 *  2. Pelo link do e-mail: ?pedido=...&token=...
 *
 * Depois de confirmar, a URL é trocada pela versão do item 2, que é
 * a que serve pra favoritar/compartilhar com você mesmo.
 */

import { chamar, ErroApi } from './api.js';

const $ = (id) => document.getElementById(id);

/** Pix pode levar alguns segundos pra compensar; tentamos por ~2 minutos. */
const INTERVALO_MS = 5000;
const MAX_TENTATIVAS = 24;

const estados = {
  carregando: $('estado-carregando'),
  erro: $('estado-erro'),
  sucesso: $('estado-sucesso'),
};

function mostrarEstado(nome) {
  for (const [chave, secao] of Object.entries(estados)) secao.hidden = chave !== nome;
}

function mostrarErro(mensagem) {
  $('erro-texto').textContent = mensagem;
  mostrarEstado('erro');
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Decide qual chamada fazer a partir da URL.
 * @return {{acao: string, dados: Object} | null}
 */
function lerParametros() {
  const p = new URLSearchParams(window.location.search);

  if (p.get('order_nsu') && p.get('transaction_nsu') && p.get('slug')) {
    return {
      acao: 'confirmar_pagamento',
      dados: {
        order_nsu: p.get('order_nsu'),
        transaction_nsu: p.get('transaction_nsu'),
        slug: p.get('slug'),
      },
    };
  }
  if (p.get('pedido') && p.get('token')) {
    return { acao: 'consultar_pedido', dados: { pedido: p.get('pedido'), token: p.get('token') } };
  }
  return null;
}

async function carregar() {
  const chamada = lerParametros();
  if (!chamada) {
    mostrarErro('Link incompleto. Abra o link que enviamos no seu e-mail.');
    return;
  }

  mostrarEstado('carregando');

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const pedido = await chamar(chamada.acao, chamada.dados);

      if (pedido.status === 'PAGO') {
        mostrarIngressos(pedido);
        return;
      }
      // consultar_pedido de um pedido que ainda não foi pago: segue esperando.
    } catch (e) {
      // Pagamento ainda não compensou: espera e tenta de novo.
      // Qualquer outro erro é definitivo (pedido não existe, valor errado...).
      const pendente = e instanceof ErroApi && ['PAGAMENTO_PENDENTE', 'TIMEOUT', 'SEM_CONEXAO', 'OCUPADO'].includes(e.codigo);
      if (!pendente) {
        mostrarErro(e instanceof ErroApi ? e.message : 'Não foi possível carregar seus ingressos.');
        return;
      }
    }

    $('carregando-texto').textContent = 'Aguardando a confirmação do pagamento';
    $('carregando-detalhe').textContent =
      'Pagamentos por Pix podem levar alguns segundos. Não feche esta página.';
    await esperar(INTERVALO_MS);
  }

  mostrarErro(
    'O pagamento ainda não foi confirmado. Assim que for, você recebe os ingressos ' +
    'por e-mail. Se já pagou e nada chegar em alguns minutos, fale com a organização.'
  );
}

/**
 * @param {{pedido: string, token: string, nome: string, email: string,
 *          ingressos: Array<{codigo: string, status: string}>}} pedido
 */
function mostrarIngressos(pedido) {
  // Troca a URL (sem recarregar) pelo link permanente. Também tira da barra
  // de endereço os dados da transação, que não precisam ficar à mostra.
  const permanente = new URL(window.location.href);
  permanente.search = new URLSearchParams({ pedido: pedido.pedido, token: pedido.token }).toString();
  window.history.replaceState(null, '', permanente.href);

  const primeiroNome = String(pedido.nome || '').split(' ')[0];
  $('saudacao').textContent = primeiroNome ? `Tudo certo, ${primeiroNome}!` : 'Pagamento confirmado';
  $('aviso-email-texto').textContent = pedido.email ? `Também enviamos para ${pedido.email}` : '';
  $('aviso-email').hidden = !pedido.email;

  const lista = $('lista-ingressos');
  lista.replaceChildren(
    ...pedido.ingressos.map((ingresso, i) => criarPasse(ingresso, i, pedido.ingressos.length, pedido.nome))
  );
  // As instruções entram depois do último passe, seguindo a mesma cascata.
  $('instrucoes').style.setProperty('--i', String(pedido.ingressos.length + 1));

  mostrarEstado('sucesso');
}

/**
 * Monta um ingresso no formato de passe (estilo Apple Wallet).
 * Tudo via textContent: nenhum dado externo passa por innerHTML.
 *
 * @param {{codigo: string, status: string}} ingresso
 * @param {number} indice
 * @param {number} total
 * @param {string} titular
 */
function criarPasse(ingresso, indice, total, titular) {
  const usado = ingresso.status === 'Utilizado';
  const criar = (tag, classe, texto) => {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  };

  const passe = criar('article', 'passe ingresso surgir' + (usado ? ' usado' : ''));
  // Cada passe entra um pouco depois do anterior.
  passe.style.setProperty('--i', String(indice + 1));

  const topo = criar('header', 'passe-topo');
  topo.append(criar('span', 'passe-evento', 'Noite do Horror'), criar('span', 'passe-numero', `${indice + 1} de ${total}`));

  const dono = criar('div', 'passe-titular');
  dono.append(criar('span', 'passe-rotulo', 'Titular'), criar('strong', '', titular || ''));

  const corpo = criar('div', 'passe-corpo');
  const qr = criar('div', 'qr');
  qr.setAttribute('role', 'img');
  qr.setAttribute('aria-label', `QR Code do ingresso ${ingresso.codigo}`);
  desenharQr(qr, ingresso.codigo);

  const selo = criar('span', 'selo ' + (usado ? 'selo-utilizado' : 'selo-valido'), usado ? 'Já utilizado' : 'Válido');
  corpo.append(qr, criar('p', 'codigo', ingresso.codigo), selo);

  passe.append(topo, dono, criar('div', 'passe-picote'), corpo);
  return passe;
}

/**
 * Gera o QR no próprio navegador (o código não sai daqui).
 * Se a biblioteca não carregou, usa o mesmo gerador externo da planilha.
 */
function desenharQr(container, codigo) {
  if (typeof window.QRCode === 'function') {
    new window.QRCode(container, {
      text: codigo,
      width: 432,
      height: 432,
      correctLevel: window.QRCode.CorrectLevel.M,
    });
    return;
  }
  const img = document.createElement('img');
  img.alt = '';
  img.width = 220;
  img.height = 220;
  img.src = 'https://quickchart.io/qr?size=440&margin=1&text=' + encodeURIComponent(codigo);
  container.append(img);
}

$('botao-tentar').addEventListener('click', carregar);

carregar();
