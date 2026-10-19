import test from 'node:test';
import assert from 'node:assert/strict';
import { digitsOnly, validCpf, formatCpf, validCnpj, formatCnpj } from '../shared/identifiers.ts';

test('extrai somente dígitos ASCII para normalizar os identificadores', () => {
  assert.equal(digitsOnly(' CPF: 529.982.247-25\n'), '52998224725');
  assert.equal(digitsOnly('CNPJ 04.252.011/0001-10'), '04252011000110');
  assert.equal(digitsOnly('a１２٣🙂'), '');
  assert.equal(digitsOnly(''), '');
});

test('CPF valida dígitos verificadores, tamanho e representação exata', () => {
  for (const value of ['52998224725', '529.982.247-25', '11144477735', '111.444.777-35']) assert.equal(validCpf(value), true, value);
  for (const value of ['', '5299822472', '529982247250', '52998224724', '52998224715', '529 982 247 25', '529.982247-25', '529-982-247.25', '52998224725\n', ' 529.982.247-25', '529.982.247-25x']) assert.equal(validCpf(value), false, JSON.stringify(value));
  for (let digit = 0; digit <= 9; digit++) assert.equal(validCpf(String(digit).repeat(11)), false);
});

test('CNPJ valida dígitos verificadores, zeros iniciais e formato canônico', () => {
  for (const value of ['11222333000181', '11.222.333/0001-81', '04252011000110', '04.252.011/0001-10']) assert.equal(validCnpj(value), true, value);
  for (const value of ['', '0425201100011', '042520110001100', '04252011000111', '04252011000120', '04 252 011 0001 10', '04.252011/0001-10', '04.252.011-0001/10', '04252011000110\n', ' 04.252.011/0001-10', '04.252.011/0001-10x']) assert.equal(validCnpj(value), false, JSON.stringify(value));
  for (let digit = 0; digit <= 9; digit++) assert.equal(validCnpj(String(digit).repeat(14)), false);
});

test('máscara de CPF é incremental para digitação e não deixa pontuação isolada', () => {
  const values = ['', '5', '52', '529', '529.9', '529.98', '529.982', '529.982.2', '529.982.24', '529.982.247', '529.982.247-2', '529.982.247-25'];
  for (let length = 0; length <= 11; length++) assert.equal(formatCpf('52998224725'.slice(0, length)), values[length]);
  for (const value of ['52998224725', '529.982.247-25', 'CPF: 529.982.247-25', '529982247259999']) assert.equal(formatCpf(value), '529.982.247-25');
  assert.equal(formatCpf('...---'), '');
  assert.equal(formatCpf('00100200300'), '001.002.003-00');
  for (const value of values) assert.equal(formatCpf(value), value);
});

test('máscara de CNPJ é incremental e limita valores colados a 14 dígitos', () => {
  const values = ['', '0', '04', '04.2', '04.25', '04.252', '04.252.0', '04.252.01', '04.252.011', '04.252.011/0', '04.252.011/00', '04.252.011/000', '04.252.011/0001', '04.252.011/0001-1', '04.252.011/0001-10'];
  for (let length = 0; length <= 14; length++) assert.equal(formatCnpj('04252011000110'.slice(0, length)), values[length]);
  for (const value of ['04252011000110', '04.252.011/0001-10', 'CNPJ: 04.252.011/0001-10', '042520110001109999']) assert.equal(formatCnpj(value), '04.252.011/0001-10');
  assert.equal(formatCnpj('.../---'), '');
  for (const value of values) assert.equal(formatCnpj(value), value);
});
