// Reuse the disposable runner, migrations, authorization fixtures and full correctness suite.
// No connection URL, credentials or hosted database option exists in this benchmark.
process.env.JN_RELATIONS_BENCHMARK = '1';
await import('./test-database.mjs');
