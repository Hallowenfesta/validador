import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  mascararCpf,
  mascararTelefone,
  cpfValido,
  telefoneValido,
  emailValido,
  nomeCompletoValido,
  formatarReais,
} from '../../assets/js/formatacao.js';
import { criarAmbiente } from '../backend/ambiente-gas.js';

describe('máscaras (simulando a digitação, tecla por tecla)', () => {
  const digitar = (mascara, texto) =>
    [...texto].reduce((campo, tecla) => mascara(campo + tecla), '');

  test('CPF', () => {
    assert.equal(digitar(mascararCpf, '529'), '529');
    assert.equal(digitar(mascararCpf, '5299'), '529.9');
    assert.equal(digitar(mascararCpf, '5299822'), '529.982.2');
    assert.equal(digitar(mascararCpf, '52998224725'), '529.982.247-25');
    assert.equal(digitar(mascararCpf, '529982247259999'), '529.982.247-25', 'corta excesso');
    assert.equal(mascararCpf('abc529.982.247-25'), '529.982.247-25', 'colar com sujeira');
  });

  test('telefone celular e fixo', () => {
    assert.equal(digitar(mascararTelefone, '1'), '(1');
    assert.equal(digitar(mascararTelefone, '119'), '(11) 9');
    assert.equal(digitar(mascararTelefone, '1133334444'), '(11) 3333-4444');
    assert.equal(digitar(mascararTelefone, '11987654321'), '(11) 98765-4321');
    assert.equal(mascararTelefone(''), '');
  });

  test('apagar não trava a máscara', () => {
    // Usuário apaga o último caractere de "(11) 98765-4321".
    assert.equal(mascararTelefone('(11) 98765-432'), '(11) 9876-5432');
    assert.equal(mascararCpf('529.982.247-2'), '529.982.247-2');
  });
});

describe('validações do front batem com as do backend', () => {
  // Se alguém mudar a regra num lado e esquecer do outro, este teste avisa.
  const { gas } = criarAmbiente({ configurar: false });

  const cpfs = ['529.982.247-25', '111.444.777-35', '529.982.247-24', '111.111.111-11', '123', ''];
  const telefones = ['(11) 98765-4321', '(11) 3333-4444', '(11) 88765-4321', '987654321', ''];
  const emails = ['a@b.com', 'a@b', 'a b@c.com', 'x@y.co', ''];
  const nomes = ['Maria Silva', 'Maria', '  Jo  Sa ', 'A B', ''];

  test('CPF', () => cpfs.forEach((v) => assert.equal(cpfValido(v), gas.cpfValido_(v), v)));
  test('telefone', () => telefones.forEach((v) => assert.equal(telefoneValido(v), gas.telefoneValido_(v), v)));
  test('e-mail', () => emails.forEach((v) => assert.equal(emailValido(v), gas.emailValido_(v), v)));

  test('nome', () => {
    for (const n of nomes) {
      let aceitoNoBackend = true;
      try {
        gas.validarDadosComprador_({
          nome: n, telefone: '11987654321', cpf: '52998224725', email: 'a@b.com', quantidade: 1,
        });
      } catch {
        aceitoNoBackend = false;
      }
      assert.equal(nomeCompletoValido(n), aceitoNoBackend, JSON.stringify(n));
    }
  });

  test('reais', () => {
    for (const c of [0, 5, 100, 5000, 123456]) {
      assert.equal(formatarReais(c), gas.formatarReais_(c));
    }
  });
});
