import test from 'node:test';
import assert from 'node:assert/strict';
import { getProjectInfo, formatStackList } from './base.ts';

test('getProjectInfo returns expected project metadata', () => {
  const info = getProjectInfo();
  assert.equal(info.name, 'React + Vite Base');
  assert.equal(info.version, '1.0.0');
  assert.ok(info.stack.includes('React 19'));
  assert.ok(info.stack.includes('Vite 8'));
});

test('formatStackList joins stack items cleanly', () => {
  const formatted = formatStackList(['React', 'Vite', 'TypeScript']);
  assert.equal(formatted, 'React • Vite • TypeScript');
});

test('formatStackList handles empty array', () => {
  const formatted = formatStackList([]);
  assert.equal(formatted, 'Nenhuma tecnologia informada');
});
