import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarAmbiente } from './ambiente-gas.js';

describe('roteamento HTTP', () => {
  test('GET devolve as informações públicas do evento', () => {
    const amb = criarAmbiente();
    const r = amb.get();
    assert.deepEqual(r, {
      sucesso: true,
      dados: {
        evento: amb.CONFIG.EVENTO.NOME,
        lote: amb.CONFIG.EVENTO.LOTE,
        precoCentavos: amb.CONFIG.PRECO_CENTAVOS,
        maxPorPedido: amb.CONFIG.MAX_POR_PEDIDO,
        vagas: amb.CONFIG.CAPACIDADE,
      },
    });
  });

  test('respostas saem como JSON', () => {
    const amb = criarAmbiente();
    assert.equal(amb.gas.doGet({}).mime, 'application/json');
  });

  test('corpo que não é JSON', () => {
    const amb = criarAmbiente();
    assert.equal(amb.post('isso não é json').codigo, 'REQUISICAO_INVALIDA');
    assert.equal(amb.post('null').codigo, 'REQUISICAO_INVALIDA');
    const semCorpo = JSON.parse(amb.gas.doPost(undefined).getContent());
    assert.equal(semCorpo.codigo, 'REQUISICAO_INVALIDA');
  });

  test('ação desconhecida, inclusive nomes do Object.prototype', () => {
    const amb = criarAmbiente();
    assert.equal(amb.post({ acao: 'apagar_tudo' }).codigo, 'ACAO_DESCONHECIDA');
    assert.equal(amb.post({ acao: 'constructor' }).codigo, 'ACAO_DESCONHECIDA');
    assert.equal(amb.post({ acao: '__proto__' }).codigo, 'ACAO_DESCONHECIDA');
    assert.equal(amb.post({}).codigo, 'ACAO_DESCONHECIDA');
  });

  test('erro inesperado não vaza detalhes internos', () => {
    // Sem rodar o configurarSistema, a aba "pedidos" não existe.
    const amb = criarAmbiente({ configurar: false });
    const r = amb.get();
    assert.equal(r.sucesso, false);
    assert.equal(r.codigo, 'ERRO_INTERNO');
    assert.doesNotMatch(r.erro, /Aba|configurarSistema/);
    assert.ok(amb.logs.some((l) => l[0] === 'error'), 'detalhe vai pro log');
  });
});
