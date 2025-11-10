const assert = require('assert');
const { chunkLines } = require('../utils/chunking');
const { sha256 } = require('../utils/hash');

function testSha256() {
  const hash = sha256('hello world');
  assert.strictEqual(hash, 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
}

function testChunking() {
  const sample = [
    'function add(a, b) {',
    '  return a + b;',
    '}',
    '',
    'console.log(add(1, 2));',
  ].join('\n');

  const chunks = chunkLines(sample, 40, 10);
  assert.ok(chunks.length >= 1, 'Expected at least one chunk');
  assert.strictEqual(chunks[0].startLine, 1);
  assert.ok(chunks[0].endLine >= chunks[0].startLine, 'End line should be >= start line');
  assert.ok(chunks[0].content.includes('function add'));

  if (chunks.length > 1) {
    assert.ok(chunks[1].startLine <= chunks[0].endLine, 'Chunks should overlap when configured');
  }
}

try {
  testSha256();
  testChunking();
  console.log('All tests passed ✔️');
} catch (error) {
  console.error('Tests failed:', error.message);
  process.exitCode = 1;
}
