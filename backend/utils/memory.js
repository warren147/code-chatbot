function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function parseEmbedding(raw) {
  const parsed = Array.isArray(raw) ? raw : safeJsonParse(raw);
  if (!Array.isArray(parsed)) return null;
  if (!parsed.length) return null;
  return parsed;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  if (a.length !== b.length) return null;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!normA || !normB) return null;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function extractJsonArray(text) {
  if (!text) return [];
  const direct = safeJsonParse(text);
  if (Array.isArray(direct)) return direct;
  if (direct && Array.isArray(direct.memories)) return direct.memories;
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return [];
  const snippet = text.slice(start, end + 1);
  const parsed = safeJsonParse(snippet);
  return Array.isArray(parsed) ? parsed : [];
}

function rankMemories(memories, queryEmbedding, { limit, minSimilarity }) {
  if (!Array.isArray(memories) || !memories.length) return [];
  const scored = [];
  for (const memory of memories) {
    const embedding = parseEmbedding(memory.embedding);
    if (!embedding) continue;
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    if (similarity === null) continue;
    if (typeof minSimilarity === 'number' && similarity < minSimilarity) continue;
    const confidence = typeof memory.confidence === 'number' ? memory.confidence : 1;
    scored.push({
      ...memory,
      similarity,
      score: similarity * confidence,
    });
  }
  scored.sort((a, b) => (b.score || 0) - (a.score || 0));
  const top = typeof limit === 'number' ? scored.slice(0, limit) : scored;
  return top;
}

module.exports = {
  cosineSimilarity,
  extractJsonArray,
  parseEmbedding,
  rankMemories,
};
