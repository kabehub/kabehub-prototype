const {test}=require('node:test');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {installTsLoader}=require('./testBootstrap.cjs');
installTsLoader();
const {maskAutoSummarySecrets:mask}=require('../lib/project-memory/auto-summary-redact.ts');

test('known email and credential formats are replaced in full, including mixed input',()=>{
  const secrets=['person+tag@example.co.jp', 'sk-ant-'+ 'a'.repeat(20), 'sk-'+ 'b'.repeat(20),
    ...['ghp_','gho_','ghs_','ghu_','ghr_'].map(p=>p+'a'.repeat(36)),
    'github_pat_'+'a_'.repeat(11),'AIza'+'a-_'.repeat(12),
    'AKIA'+'A1'.repeat(8),'ASIA'+'B2'.repeat(8), 'Bearer '+'a._~+/-'.repeat(3)+'==',
    ...'baprs'.split('').map(c=>'xox'+c+'-123-abc'),
    'eyJ'+'a'.repeat(10)+'.'+'b'.repeat(10)+'.'+'c'.repeat(10)];
  for(const secret of secrets)assert.equal(mask(secret),'[redacted]',secret);
  assert.equal(mask(secrets.join('\n')),secrets.map(()=>'[redacted]').join('\n'));
});

test('ordinary text, excluded identifier formats and empty input stay unchanged',()=>{
  for(const value of ['', '日本語の通常文です。task-listを確認する。', '電話03-1234-5678、住所東京都、口座1234567',
    'sk-short ghp_short github_pat_short Bearer short', 'hello@localhost'])assert.equal(mask(value),value);
});

test('private key blocks include newlines; missing END replaces only BEGIN line',()=>{
  for(const kind of ['', 'RSA ', 'EC ', 'ENCRYPTED ']){
    const begin=`-----BEGIN ${kind}PRIVATE KEY-----`;
    const end=`-----END ${kind}PRIVATE KEY-----`;
    assert.equal(mask(`前\n${begin}\nabc\r\ndef\n${end}\n後`),'前\n[redacted]\n後');
    assert.equal(mask(`${begin} trailing\nbody\n後`),'[redacted]\nbody\n後');
    assert.equal(mask(begin),'[redacted]');
  }
  assert.equal(mask('-----BEGIN PRIVATE KEY-----\na\n-----END PRIVATE KEY-----\n-----BEGIN PRIVATE KEY-----\nb'),
    '[redacted]\n[redacted]\nb');
});

test('100000-character inputs and adversarial nonmatches complete quickly',()=>{
  const start=performance.now();
  for(const value of ['日'.repeat(100000),'a'.repeat(100000), 'a'.repeat(50000)+'@'+'a'.repeat(49999),
    '-----BEGIN PRIVATE KEY-----\n'.repeat(3500), 'eyJ'+'a'.repeat(99997), 'eyJ'.repeat(33333)]){
    const result=mask(value);assert.equal(typeof result,'string');
  }
  assert.ok(performance.now()-start<2000);
});
