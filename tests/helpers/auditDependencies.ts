import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

/** A new frontend dependency must not rewrite historical evidence or freeze the entire app. */
export function assertPreservedAuditDependencies(){
 const baseline=JSON.parse(readFileSync('tests/fixtures/audit-pdf-dependencies.json','utf8'));
 const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
 const manifest=JSON.parse(readFileSync('package.json','utf8'));
 assert.equal(manifest.dependencies.pdfkit,baseline.packages['node_modules/pdfkit'].version);
 for(const [path,pkg]of Object.entries(baseline.packages))assert.deepEqual(lock.packages[path],pkg,`Historical PDF dependency ${path}`);
}
