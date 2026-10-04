import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarAmbiente, COMPRADOR_VALIDO } from './ambiente-gas.js';

/** Ambiente com um ingresso pago e a chave da portaria em mãos. */
function comIngresso() {
  const amb = criarAmbiente();
  const { dados } = amb.post(COMPRADOR_VALIDO);
  amb.infinitePay.consultar = () => ({ status: 200, corpo: { success: true, paid: true, amount: 100, paid_amount: 100 } });
  amb.post({ order_nsu: dados.orderNsu, transaction_nsu: 'tx', invoice_slug: 'slug' });
  return {
    amb,
    codigo: amb.abaIngressos().ler(2, 3),
    chave: amb.propriedades.get('CHAVE_PORTARIA'),
  };
}

describe('chave da portaria', () => {
  test('configurarSistema gera uma chave no formato XXXX-XXXX-XXXX', () => {
    const { chave } = comIngresso();
    assert.match(chave, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  test('rodar configurarSistema de novo não troca a chave nem apaga dados', () => {
    const { amb, chave } = comIngresso();
    amb.gas.configurarSistema();
    assert.equal(amb.propriedades.get('CHAVE_PORTARIA'), chave);
    assert.equal(amb.abaIngressos().getLastRow(), 2);
  });

  test('verificar_chave', () => {
    const { amb, chave } = comIngresso();
    assert.equal(amb.post({ acao: 'verificar_chave', chave }).sucesso, true);
    assert.equal(amb.post({ acao: 'verificar_chave', chave: 'errada' }).codigo, 'NAO_AUTORIZADO');
  });

  test('ATAQUE: sem chave não valida nem queima ingresso', () => {
    const { amb, codigo } = comIngresso();
    const r = amb.post({ acao: 'validar', codigo });
    assert.equal(r.codigo, 'NAO_AUTORIZADO');
    assert.equal(amb.abaIngressos().ler(2, 5), 'Pendente');
  });

  test('sem chave configurada avisa claramente', () => {
    const amb = criarAmbiente({ configurar: false });
    amb.gas.garantirAba_('listagem', amb.avaliar('CABECALHO_INGRESSOS'));
    const r = amb.post({ acao: 'validar', codigo: 'X', chave: 'qualquer' });
    assert.equal(r.codigo, 'NAO_CONFIGURADO');
  });

  test('gerarNovaChavePortaria invalida a anterior', () => {
    const { amb, chave } = comIngresso();
    amb.gas.gerarNovaChavePortaria();
    assert.notEqual(amb.propriedades.get('CHAVE_PORTARIA'), chave);
    assert.equal(amb.post({ acao: 'verificar_chave', chave }).codigo, 'NAO_AUTORIZADO');
  });
});

describe('validar', () => {
  test('primeira leitura libera; segunda acusa já utilizado', () => {
    const { amb, codigo, chave } = comIngresso();

    const primeira = amb.post({ acao: 'validar', codigo, chave });
    assert.deepEqual(primeira, { sucesso: true, dados: { resultado: 'valido', nome: 'Maria da Silva' } });
    assert.equal(amb.abaIngressos().ler(2, 5), 'Utilizado');
    assert.ok(amb.abaIngressos().ler(2, 11) instanceof Date);

    const segunda = amb.post({ acao: 'validar', codigo, chave });
    assert.equal(segunda.dados.resultado, 'utilizado');
    assert.equal(segunda.dados.nome, 'Maria da Silva');
    assert.match(segunda.dados.utilizadoEm, /^\d{4}-\d{2}-\d{2}T/);
  });

  test('aceita código digitado em minúsculas, com espaço ou hífen', () => {
    const { amb, codigo, chave } = comIngresso();
    const digitado = ' ' + codigo.slice(0, 4).toLowerCase() + '-' + codigo.slice(4) + ' ';
    assert.equal(amb.post({ acao: 'validar', codigo: digitado, chave }).dados.resultado, 'valido');
  });

  test('código inexistente', () => {
    const { amb, chave } = comIngresso();
    const r = amb.post({ acao: 'validar', codigo: 'ZZZZZZZZ', chave });
    assert.deepEqual(r.dados, { resultado: 'invalido', mensagem: 'Código não encontrado.' });
  });

  test('código vazio', () => {
    const { amb, chave } = comIngresso();
    assert.equal(amb.post({ acao: 'validar', codigo: '  ', chave }).codigo, 'DADOS_INVALIDOS');
  });

  test('ingresso cancelado na planilha é recusado', () => {
    const { amb, codigo, chave } = comIngresso();
    amb.abaIngressos().escrever(2, 5, 'Cancelado');
    const r = amb.post({ acao: 'validar', codigo, chave });
    assert.equal(r.dados.resultado, 'invalido');
    assert.equal(r.dados.mensagem, 'Ingresso cancelado.');
  });

  test('funciona com linhas antigas da planilha (código de 6 letras, sem pedido)', () => {
    // Igual à linha "teste" que já existe na planilha do evento.
    const { amb, chave } = comIngresso();
    amb.abaIngressos().appendRow(['', "'teste", "'8ZLQ3N", '', "'Pendente"]);
    assert.equal(amb.post({ acao: 'validar', codigo: '8zlq3n', chave }).dados.resultado, 'valido');
  });

  test('usa a trava (duas leituras simultâneas do mesmo QR)', () => {
    const { amb, codigo, chave } = comIngresso();
    const antes = amb.trava.vezes;
    amb.post({ acao: 'validar', codigo, chave });
    assert.equal(amb.trava.vezes, antes + 1);
    assert.equal(amb.trava.presa, false);
  });
});
