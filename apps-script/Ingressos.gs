/**
 * Ingressos: emissão (depois do pagamento) e validação (na portaria).
 */

/**
 * Lê a aba de ingressos inteira já como objetos.
 * @return {Array<Object>}
 */
function lerIngressos_() {
  const aba = obterAba_(CONFIG.ABA_INGRESSOS);
  return lerLinhasDeDados_(aba, CABECALHO_INGRESSOS.length).map(function (l, i) {
    return {
      linha: i + 2,
      id: String(l[COL_INGRESSO.ID - 1]),
      nome: String(l[COL_INGRESSO.NOME - 1]),
      codigo: normalizarCodigo_(l[COL_INGRESSO.CODIGO - 1]),
      status: String(l[COL_INGRESSO.STATUS - 1]).trim(),
      pedido: String(l[COL_INGRESSO.PEDIDO - 1]),
      utilizadoEm: l[COL_INGRESSO.UTILIZADO_EM - 1],
    };
  });
}

/**
 * Ingressos que contam pra lotação: tudo que tem código e não foi cancelado.
 * Linhas em branco no meio da planilha são ignoradas.
 * @return {number}
 */
function contarIngressosAtivos_() {
  return lerIngressos_().filter(function (i) {
    return i.codigo && i.status !== STATUS_INGRESSO.CANCELADO;
  }).length;
}

/**
 * @param {string} orderNsu
 * @return {Array<Object>}
 */
function listarIngressosDoPedido_(orderNsu) {
  return lerIngressos_().filter(function (i) { return i.pedido === orderNsu; });
}

/**
 * Cria uma linha na aba de ingressos para cada unidade comprada.
 *
 * IMPORTANTE: precisa ser chamada dentro de comTrava_(), senão dois
 * processos podem sortear o mesmo código ou gravar na mesma linha.
 *
 * @param {Object} pedido
 * @return {Array<{id: string, codigo: string, status: string}>}
 */
function emitirIngressos_(pedido) {
  const aba = obterAba_(CONFIG.ABA_INGRESSOS);

  // Um Set com os códigos existentes deixa a checagem de duplicidade
  // instantânea, em vez de reler a coluna inteira a cada código sorteado.
  const existentes = new Set(lerIngressos_().map(function (i) { return i.codigo; }));

  const agora = new Date();
  const novos = [];
  const linhas = [];

  for (let n = 0; n < pedido.quantidade; n++) {
    let codigo;
    do {
      codigo = textoAleatorio_(CONFIG.TAMANHO_CODIGO, CONFIG.ALFABETO_CODIGO);
    } while (existentes.has(codigo));
    existentes.add(codigo);

    const ingresso = {
      id: Utilities.getUuid(),
      codigo: codigo,
      status: STATUS_INGRESSO.DISPONIVEL,
    };
    novos.push(ingresso);

    const linha = [];
    linha[COL_INGRESSO.ID - 1] = textoSeguro_(ingresso.id);
    linha[COL_INGRESSO.NOME - 1] = textoSeguro_(pedido.nome);
    linha[COL_INGRESSO.CODIGO - 1] = textoSeguro_(codigo);
    // O código só tem letras e números do nosso alfabeto, então pode entrar
    // na fórmula sem escape. É a única célula que vai como fórmula de propósito.
    linha[COL_INGRESSO.QR - 1] = '=IMAGE("' + urlQrCode_(codigo, 200) + '")';
    linha[COL_INGRESSO.STATUS - 1] = textoSeguro_(ingresso.status);
    linha[COL_INGRESSO.TELEFONE - 1] = textoSeguro_(pedido.telefone);
    linha[COL_INGRESSO.CPF - 1] = textoSeguro_(pedido.cpf);
    linha[COL_INGRESSO.EMAIL - 1] = textoSeguro_(pedido.email);
    linha[COL_INGRESSO.PEDIDO - 1] = textoSeguro_(pedido.orderNsu);
    linha[COL_INGRESSO.EMITIDO_EM - 1] = agora;
    linha[COL_INGRESSO.UTILIZADO_EM - 1] = '';
    linhas.push(linha);
  }

  // Grava tudo de uma vez: uma chamada só pra planilha em vez de 8 por ingresso.
  const primeiraLinha = aba.getLastRow() + 1;
  aba.getRange(primeiraLinha, 1, linhas.length, CABECALHO_INGRESSOS.length).setValues(linhas);
  SpreadsheetApp.flush();

  return novos;
}

/**
 * Confere a chave da portaria. Sem ela, qualquer um que achasse a URL do
 * Apps Script poderia "queimar" ingressos alheios ou testar códigos.
 * @param {string} chave
 */
function exigirChavePortaria_(chave) {
  const esperada = PropertiesService.getScriptProperties()
    .getProperty(PROPRIEDADES.CHAVE_PORTARIA);

  if (!esperada) {
    throw new ErroNegocio('NAO_CONFIGURADO',
      'Chave da portaria não configurada. Rode configurarSistema() no Apps Script.');
  }
  if (!chave || !compararSeguro_(esperada, String(chave).trim())) {
    throw new ErroNegocio('NAO_AUTORIZADO', 'Chave da portaria incorreta.');
  }
}

/**
 * Valida um ingresso na entrada e já marca como utilizado.
 *
 * Verificar e marcar acontecem dentro da mesma trava: se duas pessoas da
 * portaria lerem o mesmo QR ao mesmo tempo (print compartilhado, por
 * exemplo), só uma recebe "válido".
 *
 * @param {string} codigoInformado
 * @param {string} chave
 * @return {{resultado: string, nome?: string, utilizadoEm?: string, mensagem?: string}}
 */
function validarIngresso_(codigoInformado, chave) {
  exigirChavePortaria_(chave);

  const codigo = normalizarCodigo_(codigoInformado);
  if (!codigo) {
    throw new ErroNegocio('DADOS_INVALIDOS', 'Informe o código do ingresso.');
  }

  return comTrava_(function () {
    const ingresso = lerIngressos_().filter(function (i) { return i.codigo === codigo; })[0];

    if (!ingresso) {
      return { resultado: 'invalido', mensagem: 'Código não encontrado.' };
    }

    if (ingresso.status === STATUS_INGRESSO.CANCELADO) {
      return { resultado: 'invalido', nome: ingresso.nome, mensagem: 'Ingresso cancelado.' };
    }

    if (ingresso.status === STATUS_INGRESSO.UTILIZADO) {
      return {
        resultado: 'utilizado',
        nome: ingresso.nome,
        utilizadoEm: ingresso.utilizadoEm instanceof Date
          ? ingresso.utilizadoEm.toISOString()
          : '',
      };
    }

    const aba = obterAba_(CONFIG.ABA_INGRESSOS);
    aba.getRange(ingresso.linha, COL_INGRESSO.STATUS).setValue(STATUS_INGRESSO.UTILIZADO);
    aba.getRange(ingresso.linha, COL_INGRESSO.UTILIZADO_EM).setValue(new Date());
    SpreadsheetApp.flush();

    console.log('Entrada liberada', codigo);
    return { resultado: 'valido', nome: ingresso.nome };
  });
}
