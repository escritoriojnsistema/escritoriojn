import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserCompatibility } from '../src/lib/browserCompatibility.ts';

type Property = readonly [object, PropertyKey];
const modernApis: Property[] = [
  [AbortSignal, 'any'], [AbortSignal, 'timeout'],
  [AbortSignal.prototype, 'throwIfAborted'], [crypto, 'randomUUID'],
];

async function without(properties: Property[], run: () => void | Promise<void>) {
  const descriptors = properties.map(([target, key]) => Object.getOwnPropertyDescriptor(target, key));
  try {
    for (const [target, key] of properties) Object.defineProperty(target, key, { value: undefined, configurable: true, writable: true });
    await run();
  } finally {
    properties.forEach(([target, key], index) => {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else Reflect.deleteProperty(target, key);
    });
  }
}

test('compatibilidade conserva APIs nativas e instalação repetida', () => {
  const native = modernApis.map(([target, key]) => Reflect.get(target, key));
  installBrowserCompatibility();
  installBrowserCompatibility();
  modernApis.forEach(([target, key], index) => assert.equal(Reflect.get(target, key), native[index]));
});

test('any ausente combina cancelamento e mantém o primeiro motivo exato', async () => {
  await without([[AbortSignal, 'any']], () => {
    installBrowserCompatibility();
    const first = new AbortController(), second = new AbortController();
    const combined = AbortSignal.any([first.signal, second.signal]);
    const request = new Request('https://example.test/', { signal: combined });
    const reason = { kind: 'session-changed' };
    let notifications = 0;
    combined.addEventListener('abort', () => notifications++);
    assert.equal(combined.aborted, false);
    second.abort(reason);
    first.abort(new Error('late'));
    assert.equal(combined.aborted, true);
    assert.equal(combined.reason, reason);
    assert.equal(request.signal.aborted, true);
    assert.equal(request.signal.reason, reason);
    assert.equal(notifications, 1);
  });
});

test('any ausente respeita cancelamento prévio na ordem recebida e lista vazia', async () => {
  await without([[AbortSignal, 'any']], () => {
    installBrowserCompatibility();
    const first = new AbortController(), second = new AbortController();
    first.abort(null);
    second.abort(new Error('second'));
    const combined = AbortSignal.any([first.signal, second.signal]);
    assert.equal(combined.aborted, true);
    assert.equal(combined.reason, null);
    assert.equal(AbortSignal.any([]).aborted, false);
  });
});

test('any ausente recusa entrada inválida inclusive após sinal já cancelado', async () => {
  await without([[AbortSignal, 'any']], () => {
    installBrowserCompatibility();
    assert.equal(typeof AbortSignal.any, 'function');
    const controller = new AbortController();
    controller.abort();
    assert.throws(() => AbortSignal.any([controller.signal, {} as AbortSignal]), TypeError);
    assert.throws(() => AbortSignal.any([null as unknown as AbortSignal]), TypeError);
  });
});

test('timeout ausente cancela a requisição composta com TimeoutError', async () => {
  await without([[AbortSignal, 'any'], [AbortSignal, 'timeout']], async () => {
    installBrowserCompatibility();
    const combined = AbortSignal.any([new AbortController().signal, AbortSignal.timeout(5)]);
    const request = new Request('https://example.test/', { signal: combined });
    await new Promise<void>(resolve => combined.addEventListener('abort', () => resolve(), { once: true }));
    assert.equal(request.signal.aborted, true);
    assert.ok(request.signal.reason instanceof DOMException);
    assert.equal(request.signal.reason.name, 'TimeoutError');
  });
});

test('timeout ausente recusa prazos negativos e não finitos', async () => {
  await without([[AbortSignal, 'timeout']], () => {
    installBrowserCompatibility();
    for (const duration of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => AbortSignal.timeout(duration), RangeError);
    }
  });
});

test('throwIfAborted ausente bloqueia execução com motivo original inclusive null', async () => {
  await without([[AbortSignal.prototype, 'throwIfAborted']], () => {
    installBrowserCompatibility();
    const controller = new AbortController();
    assert.doesNotThrow(() => controller.signal.throwIfAborted());
    controller.abort(null);
    assert.throws(() => controller.signal.throwIfAborted(), reason => reason === null);
    const defaultReason = new AbortController();
    defaultReason.abort();
    assert.throws(() => defaultReason.signal.throwIfAborted(), reason => reason === defaultReason.signal.reason);
  });
});

test('UUID ausente usa entropia criptográfica com bits UUID v4', async () => {
  await without([[crypto, 'randomUUID'], [crypto, 'getRandomValues']], () => {
    Object.defineProperty(crypto, 'getRandomValues', { value: (bytes: Uint8Array) => {
      bytes.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
      return bytes;
    }, configurable: true, writable: true });
    installBrowserCompatibility();
    assert.equal(crypto.randomUUID(), '00010203-0405-4607-8809-0a0b0c0d0e0f');
  });
});

test('UUID ausente produz identificadores distintos e propaga falha da fonte segura', async () => {
  await without([[crypto, 'randomUUID']], () => {
    installBrowserCompatibility();
    const ids = new Set(Array.from({ length: 100 }, () => crypto.randomUUID()));
    assert.equal(ids.size, 100);
    for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  await without([[crypto, 'randomUUID'], [crypto, 'getRandomValues']], () => {
    const unavailable = new Error('secure entropy unavailable');
    Object.defineProperty(crypto, 'getRandomValues', { value: () => { throw unavailable; }, configurable: true, writable: true });
    installBrowserCompatibility();
    assert.throws(() => crypto.randomUUID(), reason => reason === unavailable);
  });
});

test('compatibilidade não oferece UUID sem gerador criptográfico', async () => {
  await without([[crypto, 'randomUUID'], [crypto, 'getRandomValues']], () => {
    installBrowserCompatibility();
    assert.equal(crypto.randomUUID, undefined);
  });
});
