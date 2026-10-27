/** Fill missing browser primitives before the SDK and application modules run. */
export function installBrowserCompatibility(): void {
  if (typeof AbortSignal.any !== 'function') {
    Object.defineProperty(AbortSignal, 'any', { configurable: true, writable: true, value(signals: AbortSignal[]) {
      const sources = Array.from(signals);
      // Use the native getter's brand check, which also accepts signals from
      // another window. Validate all sources before adopting an aborted one.
      const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
      for (const source of sources) aborted.call(source);
      const controller = new AbortController();
      const listeners = new Map<AbortSignal, () => void>();
      const abortFrom = (source: AbortSignal) => {
        for (const [signal, listener] of listeners) signal.removeEventListener('abort', listener);
        listeners.clear();
        controller.abort(source.reason);
      };
      const alreadyAborted = sources.find(source => source.aborted);
      if (alreadyAborted) abortFrom(alreadyAborted);
      else for (const source of sources) {
        if (listeners.has(source)) continue;
        const listener = () => abortFrom(source);
        listeners.set(source, listener);
        source.addEventListener('abort', listener, { once: true });
      }
      return controller.signal;
    } });
  }

  if (typeof AbortSignal.timeout !== 'function') {
    Object.defineProperty(AbortSignal, 'timeout', { configurable: true, writable: true, value(milliseconds: number) {
      if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new RangeError('Invalid timeout duration.');
      const controller = new AbortController();
      // Browsers clamp larger delays to a signed 32-bit integer. Splitting them
      // prevents a large valid duration from becoming an immediate timeout.
      const schedule = (remaining: number) => {
        const delay = Math.min(remaining, 2_147_483_647);
        setTimeout(() => {
          if (remaining > delay) schedule(remaining - delay);
          else controller.abort(new DOMException('The operation timed out.', 'TimeoutError'));
        }, delay);
      };
      schedule(milliseconds);
      return controller.signal;
    } });
  }

  if (typeof AbortSignal.prototype.throwIfAborted !== 'function') {
    Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', { configurable: true, writable: true, value(this: AbortSignal) {
      if (this.aborted) throw this.reason === undefined ? new DOMException('The operation was aborted.', 'AbortError') : this.reason;
    } });
  }

  const secureCrypto = globalThis.crypto;
  if (secureCrypto && typeof secureCrypto.randomUUID !== 'function' && typeof secureCrypto.getRandomValues === 'function') {
    Object.defineProperty(secureCrypto, 'randomUUID', { configurable: true, writable: true, value() {
      const bytes = secureCrypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } });
  }
}

installBrowserCompatibility();
