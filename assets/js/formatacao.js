/**
 * Máscaras e validações de formulário.
 *
 * São as mesmas regras de apps-script/Validacoes.gs. Aqui é só pra dar
 * retorno imediato ao usuário; quem decide de verdade é o backend.
 * Funções puras, sem DOM, pra poderem ser testadas no Node.
 */

const soDigitos = (texto) => String(texto ?? '').replace(/\D/g, '');

/** Vai formatando enquanto digita: 52998224725 -> 529.982.247-25 */
export function mascararCpf(valor) {
  const d = soDigitos(valor).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

/** (11) 98765-4321 ou (11) 3333-4444, conforme a quantidade de dígitos. */
export function mascararTelefone(valor) {
  const d = soDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d.length ? '(' + d : '';
  const ddd = '(' + d.slice(0, 2) + ') ';
  const resto = d.slice(2);
  // Com 11 dígitos é celular: 5 + 4. Até 10, fixo: 4 + 4.
  const corte = d.length === 11 ? 5 : 4;
  return resto.length > corte
    ? ddd + resto.slice(0, corte) + '-' + resto.slice(corte)
    : ddd + resto;
}

export function cpfValido(cpf) {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (tamanho) => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(d[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

export function telefoneValido(telefone) {
  const d = soDigitos(telefone);
  return d.length === 10 || (d.length === 11 && d[2] === '9');
}

export function emailValido(email) {
  const e = String(email ?? '').trim();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

export function nomeCompletoValido(nome) {
  const n = String(nome ?? '').trim().replace(/\s+/g, ' ');
  return n.length >= 3 && n.length <= 100 && n.includes(' ');
}

/** 12345 -> "R$ 123,45" (com espaço comum, não o espaço especial do Intl). */
export function formatarReais(centavos) {
  return (centavos / 100)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/\s/g, ' ');
}
