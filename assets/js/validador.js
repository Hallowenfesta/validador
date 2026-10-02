/**
 * Validador da portaria.
 *
 * Fluxo: login com a chave -> lê QR (ou digita) -> backend valida e já marca
 * como utilizado -> tela cheia verde/amarela/vermelha -> "Próximo".
 */

import { chamar, ErroApi } from './api.js';
import { ICONES } from './icones.js';

const $ = (id) => document.getElementById(id);

const ARMAZENAMENTO_CHAVE = 'ndh.chavePortaria';

/**
 * Depois de fechar um resultado, a câmera provavelmente ainda está apontada
 * pro mesmo QR. Sem essa janela, ela leria de novo na hora e mostraria
 * "já utilizado" pro mesmo convidado que acabou de entrar.
 */
const IGNORAR_MESMO_CODIGO_MS = 4000;

const el = {
  telaLogin: $('tela-login'),
  telaValidacao: $('tela-validacao'),
  formLogin: $('form-login'),
  inputChave: $('chave'),
  erroLogin: $('erro-login'),
  botaoEntrar: $('botao-entrar'),
  visor: $('visor'),
  botaoCamera: $('botao-camera'),
  formCodigo: $('form-codigo'),
  inputCodigo: $('codigo'),
  botaoValidar: $('botao-validar'),
  status: $('status'),
  contador: $('contador'),
  botaoSair: $('botao-sair'),
  resultado: $('resultado'),
  resultadoIcone: $('resultado-icone'),
  resultadoTitulo: $('resultado-titulo'),
  resultadoNome: $('resultado-nome'),
  resultadoDetalhe: $('resultado-detalhe'),
  botaoProximo: $('botao-proximo'),
};

const estado = {
  /** @type {any} instância do Html5Qrcode */
  leitor: null,
  cameraAtiva: false,
  processando: false,
  ultimoCodigo: '',
  ultimoFechamento: 0,
  /** @type {any} trava de tela (Wake Lock) enquanto a câmera está ligada */
  travaTela: null,
  /** Entradas liberadas por este aparelho desde que a página abriu. */
  liberados: 0,
};

// ---------------------------------------------------------------------------
// Chave da portaria (guardada no aparelho)
// ---------------------------------------------------------------------------

// localStorage pode falhar (aba anônima no Safari, por exemplo). Nesse caso
// a chave vale só enquanto a página estiver aberta.
let chaveEmMemoria = '';

function lerChave() {
  try {
    return localStorage.getItem(ARMAZENAMENTO_CHAVE) || chaveEmMemoria;
  } catch {
    return chaveEmMemoria;
  }
}

function salvarChave(chave) {
  chaveEmMemoria = chave;
  try {
    if (chave) localStorage.setItem(ARMAZENAMENTO_CHAVE, chave);
    else localStorage.removeItem(ARMAZENAMENTO_CHAVE);
  } catch {
    /* segue só com a memória */
  }
}

// ---------------------------------------------------------------------------
// Telas
// ---------------------------------------------------------------------------

function irParaLogin(mensagem = '') {
  pararCamera();
  el.telaValidacao.hidden = true;
  el.telaLogin.hidden = false;
  el.erroLogin.textContent = mensagem;
  el.inputChave.value = '';
  el.inputChave.focus();
}

function irParaValidacao() {
  el.telaLogin.hidden = true;
  el.telaValidacao.hidden = false;
  el.inputCodigo.focus();
}

async function entrar(evento) {
  evento.preventDefault();
  const chave = el.inputChave.value.trim().toUpperCase();
  if (!chave) {
    el.erroLogin.textContent = 'Digite a chave.';
    return;
  }

  el.botaoEntrar.disabled = true;
  el.erroLogin.textContent = '';
  try {
    await chamar('verificar_chave', { chave });
    salvarChave(chave);
    irParaValidacao();
  } catch (e) {
    el.erroLogin.textContent = e instanceof ErroApi ? e.message : 'Erro ao verificar a chave.';
  } finally {
    el.botaoEntrar.disabled = false;
  }
}

function sair() {
  salvarChave('');
  irParaLogin();
}

// ---------------------------------------------------------------------------
// Câmera
// ---------------------------------------------------------------------------

async function alternarCamera() {
  if (estado.cameraAtiva) {
    await pararCamera();
    el.status.textContent = 'Câmera desligada.';
    return;
  }

  if (typeof window.Html5Qrcode !== 'function') {
    el.status.textContent = 'Leitor de QR não carregou. Recarregue a página ou digite o código.';
    return;
  }

  el.botaoCamera.disabled = true;
  el.status.textContent = 'Abrindo câmera…';

  try {
    estado.leitor = new window.Html5Qrcode('leitor', { verbose: false });
    await estado.leitor.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        // Área de leitura proporcional à tela, em vez de 250px fixos.
        qrbox: (largura, altura) => {
          const lado = Math.floor(Math.min(largura, altura) * 0.7);
          return { width: lado, height: lado };
        },
      },
      aoLerQr,
      () => { /* chamado a cada quadro sem QR; ignorar é o normal */ }
    );

    estado.cameraAtiva = true;
    rotuloCamera(true);
    el.status.textContent = 'Aponte para o QR Code do ingresso.';
    manterTelaLigada(true);
  } catch (e) {
    console.error(e);
    estado.leitor = null;
    el.status.textContent =
      'Não foi possível abrir a câmera. Confira se o navegador tem permissão (e se a página está em https).';
  } finally {
    el.botaoCamera.disabled = false;
  }
}

async function pararCamera() {
  const leitor = estado.leitor;
  estado.leitor = null;
  estado.cameraAtiva = false;
  rotuloCamera(false);
  manterTelaLigada(false);

  if (!leitor) return;
  try {
    await leitor.stop();
    leitor.clear();
  } catch {
    /* já estava parado */
  }
}

/**
 * Atualiza o botão (ícone + texto) e o visor conforme a câmera liga/desliga.
 * O ícone vem de icones.js, que só tem SVG fixo, então innerHTML é seguro aqui.
 * @param {boolean} ligada
 */
function rotuloCamera(ligada) {
  el.botaoCamera.innerHTML = ligada
    ? ICONES.parar + '<span>Desligar câmera</span>'
    : ICONES.camera + '<span>Ativar câmera</span>';
  el.botaoCamera.classList.toggle('botao-secundario', ligada);
  el.visor.classList.toggle('ativo', ligada);
}

/** Evita que o celular apague a tela no meio da fila. Nem todo navegador suporta. */
async function manterTelaLigada(ligar) {
  try {
    if (ligar && 'wakeLock' in navigator) {
      estado.travaTela = await navigator.wakeLock.request('screen');
    } else if (!ligar && estado.travaTela) {
      await estado.travaTela.release();
      estado.travaTela = null;
    }
  } catch {
    /* sem suporte ou sem permissão: segue a vida */
  }
}

function aoLerQr(texto) {
  if (estado.processando) return;

  const codigo = String(texto).trim().toUpperCase();
  const recente = Date.now() - estado.ultimoFechamento < IGNORAR_MESMO_CODIGO_MS;
  if (codigo === estado.ultimoCodigo && recente) return;

  // Pausa (sem desligar) pra não ler o mesmo QR várias vezes enquanto valida.
  // Pausar e retomar é instantâneo; desligar e religar levava ~1 s por ingresso.
  try {
    estado.leitor.pause(true);
  } catch {
    /* algumas versões reclamam se já estiver pausado */
  }
  validar(codigo);
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

function validarDigitado(evento) {
  evento.preventDefault();
  const codigo = el.inputCodigo.value.trim().toUpperCase();
  if (!codigo) {
    el.status.textContent = 'Digite o código do ingresso.';
    el.inputCodigo.focus();
    return;
  }
  validar(codigo);
}

/** @param {string} codigo */
async function validar(codigo) {
  if (estado.processando) return;
  estado.processando = true;
  estado.ultimoCodigo = codigo;
  el.botaoValidar.disabled = true;
  el.status.textContent = 'Validando ' + codigo + '…';

  try {
    const r = await chamar('validar', { codigo, chave: lerChave() });
    mostrarResultado(r);
  } catch (e) {
    if (e instanceof ErroApi && e.codigo === 'NAO_AUTORIZADO') {
      // Chave trocada pela organização: volta pro login.
      estado.processando = false;
      el.botaoValidar.disabled = false;
      salvarChave('');
      irParaLogin('A chave da portaria mudou. Digite a nova chave.');
      return;
    }
    mostrarResultado({
      resultado: 'erro',
      mensagem: e instanceof ErroApi ? e.message : 'Erro inesperado.',
    });
  }
}

const APRESENTACAO = {
  valido: { icone: ICONES.sucesso, titulo: 'Entrada liberada', vibrar: [120] },
  utilizado: { icone: ICONES.alerta, titulo: 'Já utilizado', vibrar: [250, 100, 250] },
  invalido: { icone: ICONES.invalido, titulo: 'Ingresso inválido', vibrar: [250, 100, 250, 100, 250] },
  erro: { icone: ICONES.semConexao, titulo: 'Não validado', vibrar: [400] },
};

/**
 * @param {{resultado: string, nome?: string, utilizadoEm?: string, mensagem?: string}} r
 */
function mostrarResultado(r) {
  const tipo = APRESENTACAO[r.resultado] ? r.resultado : 'erro';
  const a = APRESENTACAO[tipo];

  el.resultado.className = 'resultado ' + tipo;
  // Recriar o SVG a cada resultado faz a animação de "desenhar" rodar de novo.
  el.resultadoIcone.innerHTML = a.icone;
  el.resultadoTitulo.textContent = a.titulo;
  el.resultadoNome.textContent = r.nome || '';

  let detalhe = r.mensagem || '';
  if (tipo === 'utilizado' && r.utilizadoEm) {
    detalhe = 'Entrou às ' + new Date(r.utilizadoEm).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }) + '.';
  }
  if (tipo === 'erro') detalhe += ' Tente de novo.';
  el.resultadoDetalhe.textContent = detalhe;

  el.resultado.hidden = false;
  el.botaoProximo.focus();
  el.status.textContent = a.titulo + (r.nome ? ' · ' + r.nome : '');

  if (tipo === 'valido') {
    estado.liberados++;
    el.contador.textContent = estado.liberados === 1
      ? '1 entrada liberada neste aparelho'
      : estado.liberados + ' entradas liberadas neste aparelho';
    el.contador.hidden = false;
  }

  if (navigator.vibrate) navigator.vibrate(a.vibrar);
}

function proximo() {
  el.resultado.hidden = true;
  el.inputCodigo.value = '';
  el.botaoValidar.disabled = false;
  estado.ultimoFechamento = Date.now();
  estado.processando = false;

  if (estado.cameraAtiva && estado.leitor) {
    try {
      estado.leitor.resume();
    } catch {
      /* se não estava pausado, nada a fazer */
    }
    el.status.textContent = 'Aponte para o próximo QR Code.';
  } else {
    el.status.textContent = 'Pronto para o próximo.';
    el.inputCodigo.focus();
  }
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

el.formLogin.addEventListener('submit', entrar);
el.formCodigo.addEventListener('submit', validarDigitado);
el.botaoCamera.addEventListener('click', alternarCamera);
el.botaoSair.addEventListener('click', sair);
el.botaoProximo.addEventListener('click', proximo);

document.addEventListener('keydown', (e) => {
  if (!el.resultado.hidden && (e.key === 'Escape' || e.key === 'Enter')) {
    e.preventDefault();
    proximo();
  }
});

// A trava de tela é perdida quando a aba vai pro fundo; recupera ao voltar.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && estado.cameraAtiva) manterTelaLigada(true);
});

rotuloCamera(false);

if (lerChave()) irParaValidacao();
else irParaLogin();
