const assert = require('assert');
const { chunkLines } = require('../utils/chunking');
const { sha256 } = require('../utils/hash');
const { cloneDefaultMemory, updateMemoryFromUserMessage } = require('../utils/conversationMemory');

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

  const chunks = chunkLines(sample, 40, 10, { language: 'javascript' });
  assert.ok(chunks.length >= 1, 'Expected at least one chunk');
  assert.strictEqual(chunks[0].startLine, 1);
  assert.ok(chunks[0].endLine >= chunks[0].startLine, 'End line should be >= start line');
  assert.ok(chunks[0].content.includes('function add'));

  if (chunks.length > 1) {
    assert.ok(chunks[1].startLine <= chunks[0].endLine, 'Chunks should overlap when configured');
  }
}

function testConversationMemoryUpdates() {
  const base = cloneDefaultMemory();
  const shortResult = updateMemoryFromUserMessage(base, 'short answer only');
  assert.strictEqual(shortResult.memory.preferences.verbosity, 'short');
  assert.strictEqual(shortResult.updated, true);

  const longResult = updateMemoryFromUserMessage(shortResult.memory, 'please go deeper');
  assert.strictEqual(longResult.memory.preferences.verbosity, 'long');

  const resetResult = updateMemoryFromUserMessage(longResult.memory, 'go back to normal');
  assert.strictEqual(resetResult.memory.preferences.verbosity, 'default');
}

try {
  testSha256();
  testChunking();
  testConversationMemoryUpdates();
  console.log('All tests passed ✔️');
} catch (error) {
  console.error('Tests failed:', error.message);
  process.exitCode = 1;
}
