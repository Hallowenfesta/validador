import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarAmbiente, COMPRADOR_VALIDO } from './ambiente-gas.js';

const { gas } = criarAmbiente({ configurar: false });

describe('cpfValido_', () => {
  test('aceita CPFs válidos com e sem pontuação', () => {
    assert.equal(gas.cpfValido_('529.982.247-25'), true);
    assert.equal(gas.cpfValido_('52998224725'), true);
    assert.equal(gas.cpfValido_('111.444.777-35'), true);
  });

  test('recusa dígito verificador errado', () => {
    assert.equal(gas.cpfValido_('529.982.247-24'), false);
    assert.equal(gas.cpfValido_('111.444.777-53'), false);
  });

  test('recusa sequências repetidas, tamanho errado e vazio', () => {
    assert.equal(gas.cpfValido_('111.111.111-11'), false);
    assert.equal(gas.cpfValido_('000.000.000-00'), false);
    assert.equal(gas.cpfValido_('1234567890'), false);
    assert.equal(gas.cpfValido_(''), false);
    assert.equal(gas.cpfValido_(null), false);
  });
});

describe('telefoneValido_ / emailValido_', () => {
  test('telefone: celular com 9, fixo com 10 dígitos', () => {
    assert.equal(gas.telefoneValido_('(11) 98765-4321'), true);
    assert.equal(gas.telefoneValido_('(11) 3333-4444'), true);
    assert.equal(gas.telefoneValido_('(11) 88765-4321'), false, 'celular sem o 9');
    assert.equal(gas.telefoneValido_('98765-4321'), false, 'sem DDD');
  });

  test('e-mail', () => {
    assert.equal(gas.emailValido_('a@b.com'), true);
    assert.equal(gas.emailValido_('a@b'), false);
    assert.equal(gas.emailValido_('a b@c.com'), false);
    assert.equal(gas.emailValido_(''), false);
  });
});

describe('validarDadosComprador_', () => {
  test('normaliza os campos', () => {
    const r = gas.validarDadosComprador_({
      ...COMPRADOR_VALIDO,
      nome: '  Maria    da Silva ',
      telefone: '11987654321',
      cpf: '52998224725',
    });
    assert.equal(r.nome, 'Maria da Silva');
    assert.equal(r.telefone, '(11) 98765-4321');
    assert.equal(r.cpf, '529.982.247-25');
    assert.equal(r.email, 'maria@example.com');
  });

  const casos = [
    ['nome sem sobrenome', { nome: 'Maria' }],
    ['telefone curto', { telefone: '1234' }],
    ['CPF inválido', { cpf: '123.456.789-00' }],
    ['e-mail inválido', { email: 'maria' }],
    ['quantidade zero', { quantidade: 0 }],
    ['quantidade acima do limite', { quantidade: 3 }],
    ['quantidade fracionada', { quantidade: 1.5 }],
    ['quantidade em texto', { quantidade: 'muitos' }],
  ];
  for (const [nome, alteracao] of casos) {
    test('recusa ' + nome, () => {
      assert.throws(
        () => gas.validarDadosComprador_({ ...COMPRADOR_VALIDO, ...alteracao }),
        (e) => e.codigo === 'DADOS_INVALIDOS'
      );
    });
  }
});

describe('utilitários', () => {
  test('textoAleatorio_ usa só o alfabeto e tem o tamanho pedido', () => {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < 200; i++) {
      const t = gas.textoAleatorio_(8, alfabeto);
      assert.match(t, /^[A-HJ-NP-Z2-9]{8}$/);
    }
  });

  test('textoAleatorio_ não repete em 5000 sorteios', () => {
    const vistos = new Set();
    for (let i = 0; i < 5000; i++) vistos.add(gas.textoAleatorio_(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'));
    assert.equal(vistos.size, 5000);
  });

  test('compararSeguro_', () => {
    assert.equal(gas.compararSeguro_('ABC', 'ABC'), true);
    assert.equal(gas.compararSeguro_('ABC', 'ABD'), false);
    assert.equal(gas.compararSeguro_('ABC', 'ABCD'), false);
    assert.equal(gas.compararSeguro_('', 'A'), false);
  });

  test('formatarReais_', () => {
    assert.equal(gas.formatarReais_(100), 'R$ 1,00');
    assert.equal(gas.formatarReais_(5), 'R$ 0,05');
    assert.equal(gas.formatarReais_(123456), 'R$ 1.234,56');
  });

  test('escaparHtml_', () => {
    assert.equal(gas.escaparHtml_('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
  });

  test('normalizarCodigo_ tolera espaços, hífen e minúsculas', () => {
    assert.equal(gas.normalizarCodigo_(' ab-cd 12 '), 'ABCD12');
  });
});
