/**
 * Funções de manutenção, pra rodar à mão pelo editor do Apps Script
 * (selecione a função no menu de cima e clique em "Executar").
 * Nenhuma delas é chamada pelo site.
 */

/**
 * Prepara a planilha e a chave da portaria. Pode rodar quantas vezes quiser:
 * só cria o que estiver faltando e nunca apaga dados.
 */
function configurarSistema() {
  garantirAba_(CONFIG.ABA_INGRESSOS, CABECALHO_INGRESSOS);
  garantirAba_(CONFIG.ABA_PEDIDOS, CABECALHO_PEDIDOS);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PROPRIEDADES.CHAVE_PORTARIA)) {
    props.setProperty(PROPRIEDADES.CHAVE_PORTARIA, novaChave_());
  }

  console.log('Planilha pronta.');
  console.log('Chave da portaria: ' + props.getProperty(PROPRIEDADES.CHAVE_PORTARIA));
  console.log('Passe essa chave só pra quem vai validar ingressos na entrada.');
}

/**
 * Confere se está tudo certo e mostra, no Registro de execução, o motivo
 * real de qualquer "Erro interno". Não altera nada além do que a própria
 * página de vendas alteraria (criar aba/colunas que faltem).
 */
function diagnosticar() {
  const ok = function (msg) { console.log('OK    ' + msg); };
  const falha = function (msg) { console.error('FALHA ' + msg); };

  let planilha;
  try {
    planilha = abrirPlanilha_();
    ok('Planilha aberta: "' + planilha.getName() + '"');
  } catch (e) {
    falha('Não consegui abrir a planilha ' + CONFIG.PLANILHA_ID + ': ' + e.message);
    falha('Confira o PLANILHA_ID no Config e se a conta dona deste script tem acesso a ela.');
    return;
  }

  [CONFIG.ABA_INGRESSOS, CONFIG.ABA_PEDIDOS].forEach(function (nome) {
    try {
      const aba = obterAba_(nome);
      ok('Aba "' + nome + '": ' + Math.max(0, aba.getLastRow() - 1) + ' linha(s), ' +
        aba.getMaxColumns() + ' colunas');
    } catch (e) {
      falha('Aba "' + nome + '": ' + e.message);
    }
  });

  if (PropertiesService.getScriptProperties().getProperty(PROPRIEDADES.CHAVE_PORTARIA)) {
    ok('Chave da portaria configurada');
  } else {
    falha('Chave da portaria não configurada: rode configurarSistema()');
  }

  try {
    const info = informacoesEvento_();
    ok('Resposta da página de vendas: ' + JSON.stringify(info));
  } catch (e) {
    falha('A página de vendas daria erro: ' + e.message);
    console.error(e.stack);
  }
}

/**
 * Troca a chave da portaria (por exemplo, se vazou num grupo).
 * Quem estiver logado no validador vai precisar digitar a nova.
 */
function gerarNovaChavePortaria() {
  const chave = novaChave_();
  PropertiesService.getScriptProperties().setProperty(PROPRIEDADES.CHAVE_PORTARIA, chave);
  console.log('Nova chave da portaria: ' + chave);
}

/**
 * Reenvia o e-mail com os ingressos. Troque o valor abaixo pelo order_nsu
 * do pedido (coluna A da aba "pedidos") antes de executar.
 */
function reenviarEmailDoPedido() {
  const ORDER_NSU = 'COLE-O-ORDER-NSU-AQUI';

  const pedido = buscarPedido_(ORDER_NSU);
  if (!pedido || pedido.status !== STATUS_PEDIDO.PAGO) {
    throw new Error('Pedido não encontrado ou ainda não pago: ' + ORDER_NSU);
  }
  enviarIngressosPorEmail_(pedido, listarIngressosDoPedido_(ORDER_NSU));
  atualizarPedido_(pedido.linha, { [COL_PEDIDO.EMAIL_ENVIADO_EM]: new Date() });
  console.log('E-mail reenviado para ' + pedido.email);
}

/**
 * Chave fácil de ditar por telefone: 3 blocos de 4, ex.: "K7PX-M2QA-9HZD".
 * 12 caracteres de um alfabeto de 32 = 60 bits. Inviável de adivinhar.
 */
function novaChave_() {
  const t = textoAleatorio_(12, CONFIG.ALFABETO_CODIGO);
  return t.slice(0, 4) + '-' + t.slice(4, 8) + '-' + t.slice(8);
}
