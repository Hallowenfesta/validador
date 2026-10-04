/**
 * Validação e normalização dos dados que chegam do site.
 *
 * O site também valida, mas isso é só conforto pro usuário: qualquer um pode
 * mandar um POST direto pro Apps Script, então a regra que vale é a daqui.
 */

/**
 * Confere CPF pelos dígitos verificadores.
 * Aceita com ou sem pontuação. Rejeita sequências repetidas (111.111.111-11),
 * que passam no cálculo mas não existem.
 *
 * @param {string} cpf
 * @return {boolean}
 */
function cpfValido_(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;

  // Cada dígito verificador é a soma ponderada dos anteriores, módulo 11.
  const calcularDigito = function (tamanho) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) {
      soma += Number(d.charAt(i)) * (tamanho + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcularDigito(9) === Number(d.charAt(9)) &&
    calcularDigito(10) === Number(d.charAt(10));
}

/**
 * Validação de e-mail propositalmente simples. Regex "perfeita" de e-mail
 * não existe; o que importa é pegar erro de digitação óbvio.
 * @param {string} email
 * @return {boolean}
 */
function emailValido_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '')) &&
    String(email).length <= 254;
}

/**
 * Telefone brasileiro com DDD: 10 dígitos (fixo) ou 11 (celular, começando com 9).
 * @param {string} telefone
 * @return {boolean}
 */
function telefoneValido_(telefone) {
  const d = String(telefone || '').replace(/\D/g, '');
  if (d.length === 11) return d.charAt(2) === '9';
  return d.length === 10;
}

/** "12345678909" -> "123.456.789-09" */
function formatarCpf_(cpf) {
  const d = String(cpf).replace(/\D/g, '');
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

/** "11987654321" -> "(11) 98765-4321" */
function formatarTelefone_(telefone) {
  const d = String(telefone).replace(/\D/g, '');
  return d.length === 11
    ? d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')
    : d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
}

/**
 * Valida o corpo do pedido vindo do site e devolve os dados já limpos
 * e padronizados. Lança ErroNegocio com a primeira coisa errada que achar.
 *
 * @param {Object} dados corpo do POST
 * @return {{nome: string, telefone: string, cpf: string, email: string, quantidade: number}}
 */
function validarDadosComprador_(dados) {
  // Junta espaços repetidos: "  Maria   Silva " vira "Maria Silva".
  const nome = String(dados.nome || '').trim().replace(/\s+/g, ' ');
  const email = String(dados.email || '').trim().toLowerCase();
  const telefone = String(dados.telefone || '');
  const cpf = String(dados.cpf || '');
  const quantidade = Number(dados.quantidade);

  if (nome.length < 3 || nome.length > 100 || nome.indexOf(' ') === -1) {
    throw new ErroNegocio('DADOS_INVALIDOS', 'Informe o nome completo.');
  }
  if (!telefoneValido_(telefone)) {
    throw new ErroNegocio('DADOS_INVALIDOS', 'Telefone inválido. Use DDD + número.');
  }
  if (!cpfValido_(cpf)) {
    throw new ErroNegocio('DADOS_INVALIDOS', 'CPF inválido.');
  }
  if (!emailValido_(email)) {
    throw new ErroNegocio('DADOS_INVALIDOS', 'E-mail inválido.');
  }
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > CONFIG.MAX_POR_PEDIDO) {
    throw new ErroNegocio(
      'DADOS_INVALIDOS',
      'Quantidade inválida. O máximo por compra é ' + CONFIG.MAX_POR_PEDIDO + '.'
    );
  }

  return {
    nome: nome,
    telefone: formatarTelefone_(telefone),
    cpf: formatarCpf_(cpf),
    email: email,
    quantidade: quantidade,
  };
}

/**
 * Normaliza o código lido do QR ou digitado na portaria.
 * Tira espaços e hífens que alguém possa ter colocado ao digitar.
 * @param {*} codigo
 * @return {string}
 */
function normalizarCodigo_(codigo) {
  return String(codigo || '').toUpperCase().replace(/[\s-]/g, '');
}
