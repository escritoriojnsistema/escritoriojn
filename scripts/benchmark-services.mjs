// Local disposable fixture runner only; no hosted URL or credential option.
process.env.JN_SERVICES_BENCHMARK='1';
await import('./test-database.mjs');
