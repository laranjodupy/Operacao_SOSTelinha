import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeDiagnostic } from '../lib/server/diagnostics.ts';
test('diagnostics never disclose arbitrary errors or credentials', () => {
  for (const error of [
    {code:'42P01',message:'postgresql://SECRET',detail:'SECRET',query:'SECRET'},
    {code:'SECRET',message:'SECRET'},
    {cause:{code:'SELF_SIGNED_CERT_IN_CHAIN',message:'SECRET'}},
    new Error('SECRET'),
  ]) assert.ok(!JSON.stringify(safeDiagnostic(error)).includes('SECRET'));
  assert.equal(safeDiagnostic({cause:{code:'28P01'}}).code,'28P01');
});
