/**
 * Página de vendas: carrega preço/vagas, valida o formulário e manda o
 * comprador pro checkout da InfinitePay.
 */

import { buscarInformacoes, chamar, ErroApi } from './api.js';
import {
  mascararCpf,
  mascararTelefone,
  cpfValido,
  telefoneValido,
  emailValido,
  nomeCompletoValido,
  formatarReais,
} from './formatacao.js';

const $ = (id) => document.getElementById(id);

const el = {
  lote: $('lote'),
  loteNome: $('lote-nome'),
  preco: $('preco'),
  vagas: $('vagas'),
  secaoFormulario: $('secao-formulario'),
  formulario: $('formulario'),
  quantidade: $('quantidade'),
  total: $('total'),
  botao: $('botao-comprar'),
  botaoRotulo: document.querySelector('#botao-comprar .botao-rotulo'),
  erroGeral: $('erro-geral'),
  erroCarregar: $('erro-carregar'),
  erroCarregarTexto: $('erro-carregar-texto'),
  tentarNovamente: $('tentar-novamente'),
};

const ROTULO_BOTAO = el.botaoRotulo.textContent;

/** Preço vindo do backend. Nunca é enviado de volta: o backend calcula sozinho. */
let precoCentavos = 0;

/**
 * Regras de cada campo. A mensagem aparece embaixo do campo quando
 * a função `valido` retorna false.
 */
const CAMPOS = {
  nome: { valido: nomeCompletoValido, mensagem: 'Informe nome e sobrenome.' },
  telefone: { valido: telefoneValido, mensagem: 'Telefone com DDD, ex.: (11) 98765-4321.' },
  cpf: { valido: cpfValido, mensagem: 'CPF inválido. Confira os números.' },
  email: { valido: emailValido, mensagem: 'E-mail inválido.' },
};

// ---------------------------------------------------------------------------
// Carregamento
// ---------------------------------------------------------------------------

async function carregar() {
  el.erroCarregar.hidden = true;
  try {
    const info = await buscarInformacoes();
    mostrarInformacoes(info);
  } catch (e) {
    tirarEsqueleto();
    el.loteNome.textContent = 'Indisponível';
    el.preco.textContent = '';
    el.vagas.textContent = '';
    el.erroCarregarTexto.textContent = e instanceof ErroApi ? e.message : 'Erro ao carregar.';
    el.erroCarregar.hidden = false;
  }
}

/** Remove os blocos cinza animados que ficam no lugar do texto enquanto carrega. */
function tirarEsqueleto() {
  el.lote.removeAttribute('aria-busy');
  for (const item of el.lote.querySelectorAll('.esqueleto')) item.classList.remove('esqueleto');
}

/** @param {{lote: string, precoCentavos: number, maxPorPedido: number, vagas: number}} info */
function mostrarInformacoes(info) {
  tirarEsqueleto();
  precoCentavos = info.precoCentavos;
  el.loteNome.textContent = info.lote;
  el.preco.textContent = formatarReais(info.precoCentavos);

  if (info.vagas <= 0) {
    el.vagas.textContent = 'Esgotado';
    el.vagas.className = 'vagas esgotado';
    el.secaoFormulario.hidden = true;
    return;
  }

  el.vagas.textContent = info.vagas === 1
    ? 'Último ingresso!'
    : info.vagas + ' disponíveis';
  el.vagas.className = info.vagas <= 5 ? 'vagas poucas' : 'vagas';

  // Não oferece mais unidades do que ainda existem.
  montarQuantidades(Math.min(info.maxPorPedido, info.vagas));
  atualizarTotal(false);
  el.secaoFormulario.hidden = false;
}

/**
 * Cria as opções do controle segmentado (1 ingresso, 2 ingressos...).
 * O indicador que desliza é o primeiro filho e é mantido.
 * @param {number} maximo
 */
function montarQuantidades(maximo) {
  const indicador = el.quantidade.querySelector('.segmentado-indicador');
  const opcoes = Array.from({ length: maximo }, (_, i) => {
    const n = i + 1;
    const rotulo = document.createElement('label');
    rotulo.className = 'segmento';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'quantidade';
    radio.value = String(n);
    radio.checked = n === 1;

    const texto = document.createElement('span');
    texto.textContent = n + (n === 1 ? ' ingresso' : ' ingressos');

    rotulo.append(radio, texto);
    return rotulo;
  });

  el.quantidade.replaceChildren(indicador, ...opcoes);
  el.quantidade.style.setProperty('--n', String(maximo));
  el.quantidade.style.setProperty('--indice', '0');
}

/** Quantidade escolhida no controle segmentado. */
function quantidadeEscolhida() {
  const marcado = el.quantidade.querySelector('input:checked');
  return marcado ? Number(marcado.value) : 1;
}

/** @param {boolean} [animar] dá um "pulo" no valor pra chamar atenção à mudança */
function atualizarTotal(animar = true) {
  el.total.textContent = formatarReais(precoCentavos * quantidadeEscolhida());
  el.quantidade.style.setProperty('--indice', String(quantidadeEscolhida() - 1));

  if (animar) {
    // Tirar e recolocar a classe reinicia a animação; o reflow no meio é necessário.
    el.total.classList.remove('mudou');
    void el.total.offsetWidth;
    el.total.classList.add('mudou');
  }
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

/**
 * Valida um campo e mostra (ou limpa) a mensagem dele.
 * @return {boolean}
 */
function validarCampo(nome) {
  const input = el.formulario.elements[nome];
  const ok = CAMPOS[nome].valido(input.value);
  input.setAttribute('aria-invalid', String(!ok));
  $('erro-' + nome).textContent = ok ? '' : CAMPOS[nome].mensagem;
  return ok;
}

function validarFormulario() {
  // Valida todos (sem parar no primeiro) pra mostrar todos os erros de uma vez.
  const resultados = Object.keys(CAMPOS).map(validarCampo);
  const primeiroInvalido = Object.keys(CAMPOS)[resultados.indexOf(false)];
  if (primeiroInvalido) {
    el.formulario.elements[primeiroInvalido].focus();
    tremer(el.secaoFormulario);
  }
  return !primeiroInvalido;
}

/** Balança o elemento de um lado pro outro, como o "não" do iOS. */
function tremer(elemento) {
  elemento.classList.remove('tremer', 'surgir');
  void elemento.offsetWidth;
  elemento.classList.add('tremer');
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

async function enviar(evento) {
  evento.preventDefault();
  el.erroGeral.hidden = true;

  if (!validarFormulario()) return;

  const f = el.formulario.elements;
  ocupado(true, 'Gerando pagamento…');

  try {
    const { urlPagamento } = await chamar('criar_pedido', {
      nome: f.nome.value,
      telefone: f.telefone.value,
      cpf: f.cpf.value,
      email: f.email.value,
      quantidade: quantidadeEscolhida(),
    });

    // Só aceita redirecionar pro domínio da InfinitePay. Se algum dia o
    // backend for comprometido, ele não consegue mandar o cliente pra um
    // checkout falso. A documentação mostra links em .com.br e .io.
    const destino = new URL(urlPagamento);
    if (destino.protocol !== 'https:' || !/(^|\.)infinitepay\.(io|com\.br)$/.test(destino.hostname)) {
      throw new ErroApi('Link de pagamento inválido. Fale com a organização.', 'LINK_INVALIDO');
    }

    ocupado(true, 'Abrindo pagamento…');
    window.location.assign(destino.href);
  } catch (e) {
    mostrarErro(e instanceof ErroApi ? e.message : 'Algo deu errado. Tente novamente.');
    ocupado(false);

    // Se esgotou enquanto a pessoa preenchia, atualiza a tela.
    if (e instanceof ErroApi && e.codigo === 'ESGOTADO') carregar();
  }
}

/**
 * Trava o botão e troca a seta por um anel girando.
 * @param {boolean} sim
 * @param {string} [texto]
 */
function ocupado(sim, texto) {
  el.botao.disabled = sim;
  el.botao.setAttribute('aria-busy', String(sim));
  el.botaoRotulo.textContent = sim ? texto : ROTULO_BOTAO;

  const seta = el.botao.querySelector('svg');
  let giratorio = el.botao.querySelector('.giratorio');
  if (sim && !giratorio) {
    giratorio = document.createElement('span');
    giratorio.className = 'giratorio';
    giratorio.setAttribute('aria-hidden', 'true');
    el.botao.prepend(giratorio);
  } else if (!sim && giratorio) {
    giratorio.remove();
  }
  seta.hidden = sim;
}

function mostrarErro(mensagem) {
  el.erroGeral.textContent = mensagem;
  el.erroGeral.hidden = false;
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

const cpf = el.formulario.elements.cpf;
const telefone = el.formulario.elements.telefone;

cpf.addEventListener('input', () => { cpf.value = mascararCpf(cpf.value); });
telefone.addEventListener('input', () => { telefone.value = mascararTelefone(telefone.value); });

// Valida ao sair do campo, e não a cada tecla: ninguém gosta de ver
// "CPF inválido" enquanto ainda está digitando o terceiro número.
for (const nome of Object.keys(CAMPOS)) {
  const input = el.formulario.elements[nome];
  input.addEventListener('blur', () => { if (input.value) validarCampo(nome); });
  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true') validarCampo(nome);
  });
}

el.quantidade.addEventListener('change', () => atualizarTotal());
el.formulario.addEventListener('submit', enviar);
el.tentarNovamente.addEventListener('click', carregar);

// Quando o usuário volta do checkout pelo botão "voltar", o navegador pode
// restaurar a página do cache com o botão travado em "Abrindo pagamento…".
window.addEventListener('pageshow', (e) => { if (e.persisted) ocupado(false); });

carregar();
