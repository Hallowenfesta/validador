/**
 * A planilha do evento já existia antes do sistema novo: aba "listagem"
 * só com as colunas A–H (sem colunas sobrando à direita), uma linha "teste"
 * e nenhuma aba "pedidos". Estes testes partem exatamente desse estado,
 * que foi o que deu "Erro interno" na primeira publicação.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarAmbiente, COMPRADOR_VALIDO, AbaFalsa } from './ambiente-gas.js';

/** Monta a planilha como ela estava no Google Sheets. */
function planilhaAntiga(planilha) {
  const aba = new AbaFalsa('listagem', 8);
  planilha.abas.set('listagem', aba);
  aba.appendRow(['id', 'nome', 'código', 'qr code', 'status', 'telefone', 'cpf', 'email']);
  aba.appendRow(['', "'teste", "'8ZLQ3N", '', "'Utilizado", '', '', '']);
}

describe('planilha que já existia (só colunas A–H, sem aba "pedidos")', () => {
  test('GET funciona mesmo sem rodar configurarSistema', () => {
    const amb = criarAmbiente({ configurar: false, antesDaPlanilha: planilhaAntiga });
    const r = amb.get();
    assert.equal(r.sucesso, true, JSON.stringify(r) + ' ' + JSON.stringify(amb.logs.filter((l) => l[0] === 'error')));
    // A linha "teste" conta como ingresso emitido.
    assert.equal(r.dados.vagas, amb.CONFIG.CAPACIDADE - 1);
  });

  test('a aba "pedidos" é criada sozinha com o cabeçalho', () => {
    const amb = criarAmbiente({ configurar: false, antesDaPlanilha: planilhaAntiga });
    amb.get();
    const pedidos = amb.abaPedidos();
    assert.ok(pedidos, 'aba criada');
    assert.equal(pedidos.ler(1, 1), 'order_nsu');
    assert.equal(pedidos.ler(1, 17), 'e-mail enviado em');
  });

  test('a "listagem" ganha as colunas I–K sem mexer nos dados', () => {
    const amb = criarAmbiente({ configurar: false, antesDaPlanilha: planilhaAntiga });
    amb.get();
    const aba = amb.abaIngressos();
    assert.ok(aba.getMaxColumns() >= 11);
    assert.equal(aba.ler(1, 9), 'pedido');
    assert.equal(aba.ler(1, 11), 'utilizado em');
    assert.equal(aba.ler(2, 2), 'teste');
    assert.equal(aba.ler(2, 5), 'Utilizado');
  });

  test('configurarSistema também funciona nesse estado', () => {
    const amb = criarAmbiente({ configurar: false, antesDaPlanilha: planilhaAntiga });
    assert.doesNotThrow(() => amb.gas.configurarSistema());
    assert.match(amb.propriedades.get('CHAVE_PORTARIA'), /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  test('fluxo completo: compra, pagamento e portaria', () => {
    const amb = criarAmbiente({ configurar: false, antesDaPlanilha: planilhaAntiga });
    amb.gas.configurarSistema();

    const { dados } = amb.post({ ...COMPRADOR_VALIDO, quantidade: 2 });
    amb.infinitePay.consultar = () => ({
      status: 200, corpo: { success: true, paid: true, amount: 200, paid_amount: 200 },
    });
    const confirmado = amb.post({ acao: 'confirmar_pagamento', order_nsu: dados.orderNsu, transaction_nsu: 't', slug: 's' });
    assert.equal(confirmado.sucesso, true, JSON.stringify(confirmado));
    assert.equal(confirmado.dados.ingressos.length, 2);

    const chave = amb.propriedades.get('CHAVE_PORTARIA');
    const codigo = confirmado.dados.ingressos[0].codigo;
    assert.equal(amb.post({ acao: 'validar', codigo, chave }).dados.resultado, 'valido');
    // A linha antiga continua sendo reconhecida.
    assert.equal(amb.post({ acao: 'validar', codigo: '8ZLQ3N', chave }).dados.resultado, 'utilizado');
  });
});

describe('ordem de carregamento dos arquivos .gs', () => {
  test('funciona com os arquivos carregados em ordem inversa', () => {
    const amb = criarAmbiente({ ordemReversa: true });
    assert.equal(amb.get().sucesso, true);
  });
});
