const db = require('./db');
const config = require('./config/env');
const { getPineconeIndex } = require('./services/pineconeClient');
const { createEmbedding, createChatCompletion } = require('./services/openai');

const getChunkByVectorIdStmt = db.prepare(`
  SELECT
    c.content,
    c.start_line AS startLine,
    c.end_line AS endLine,
    f.file_name AS fileName
  FROM chunks c
  JOIN files f ON f.id = c.file_id
  WHERE c.vector_id = ?
`);

const getSessionStmt = db.prepare(`
  SELECT id, title FROM sessions WHERE id = ?
`);

const selectRecentChunksStmt = db.prepare(`
  SELECT
    c.content,
    c.start_line AS startLine,
    c.end_line AS endLine,
    f.file_name AS fileName
  FROM chunks c
  JOIN files f ON f.id = c.file_id
  ORDER BY datetime(f.upload_date) DESC, c.position ASC
  LIMIT 5
`);

const insertSessionStmt = db.prepare(`
  INSERT INTO sessions (id, title, created_at) VALUES (?, ?, ?)
`);

const insertMessageStmt = db.prepare(`
  INSERT INTO messages (id, session_id, role, content, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

const updateSessionTitleStmt = db.prepare(`
  UPDATE sessions SET title = ? WHERE id = ? AND (title IS NULL OR title = '')
`);

const getMessagesForSessionStmt = db.prepare(`
  SELECT role, content
  FROM messages
  WHERE session_id = ?
  ORDER BY datetime(created_at) ASC
`);

async function ensureSession(sessionId, previewText) {
  const { v4: uuidv4 } = await import('uuid');
  const id = sessionId || uuidv4();

  const existing = getSessionStmt.get(id);
  if (!existing) {
    insertSessionStmt.run(id, null, new Date().toISOString());
  }

  if (previewText) {
    const title = previewText.slice(0, 60);
    updateSessionTitleStmt.run(title, id);
  }

  return id;
}

function buildMessages(sessionId, snippets, question) {
  const history = sessionId ? getMessagesForSessionStmt.all(sessionId) : [];
  const trimmedHistory =
    config.maxHistoryMessages > 0
      ? history.slice(-config.maxHistoryMessages)
      : history;
  const formattedSnippets = snippets.length
    ? snippets
        .map(
          (snippet) =>
            `[#${snippet.citation}] ${snippet.fileName} L${snippet.startLine}-${snippet.endLine}\n${snippet.content}`
        )
        .join('\n\n')
    : 'No relevant code snippets were found.';

  const messages = [
    {
      role: 'system',
      content:
        'You are an assistant that helps understand and explain code. Be concise, cite sources like [#1], and call out gaps or uncertainty.',
    },
    ...trimmedHistory.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      role: 'user',
      content: `Relevant snippets:\n${formattedSnippets}\n\nUser question:\n${question}`,
    },
  ];

  return messages;
}

async function askQuestion({ question, sessionId }) {
  const { v4: uuidv4 } = await import('uuid');
  const effectiveSessionId = await ensureSession(sessionId, question);

  const pinecone = getPineconeIndex();
  const embedding = await createEmbedding({
    input: question,
    model: 'text-embedding-3-large',
  });
  if (!embedding || !embedding.length) {
    throw new Error('Embedding response was empty.');
  }

  const queryResponse = await pinecone.query({
    topK: 8,
    vector: embedding,
    includeMetadata: true,
  });

  const allMatches = (queryResponse.matches || [])
    .filter(Boolean)
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  let matches = allMatches.filter(
    (match) => match.score === undefined || match.score >= config.minPineconeScore
  );

  if (!matches.length) {
    matches = allMatches.slice(0, 8);
  }

  const initialSnippets = matches
    .slice(0, 5)
    .map((match, index) => {
      const chunk = getChunkByVectorIdStmt.get(match.id);
      if (!chunk) {
        return null;
      }
      return {
        citation: index + 1,
        fileName: chunk.fileName || match.metadata?.fileName || 'Unknown file',
        startLine: chunk.startLine || match.metadata?.startLine || 0,
        endLine: chunk.endLine || match.metadata?.endLine || 0,
        content: chunk.content,
        score: match.score,
      };
    })
    .filter(Boolean);

  let resolvedSnippets = initialSnippets;

  if (!resolvedSnippets.length) {
    const recent = selectRecentChunksStmt.all() || [];
    resolvedSnippets = recent.map((chunk, index) => ({
      citation: index + 1,
      fileName: chunk.fileName || 'Unknown file',
      startLine: chunk.startLine || 0,
      endLine: chunk.endLine || 0,
      content: chunk.content,
      score: null,
    }));
  }

  const messages = buildMessages(effectiveSessionId, resolvedSnippets, question);
  const completion = await createChatCompletion({
    model: 'gpt-4o-mini',
    messages,
    maxTokens: 800,
  });

  const answer = completion.choices?.[0]?.message?.content?.trim() || 'I could not generate an answer.';

  const userMessageId = uuidv4();
  const assistantMessageId = uuidv4();
  const timestamp = new Date().toISOString();

  const transaction = db.transaction(() => {
    insertMessageStmt.run(userMessageId, effectiveSessionId, 'user', question, timestamp);
    insertMessageStmt.run(assistantMessageId, effectiveSessionId, 'assistant', answer, timestamp);
  });
  transaction();

  return {
    sessionId: effectiveSessionId,
    answer,
    citations: resolvedSnippets.map(({ citation, fileName, startLine, endLine, score }) => ({
      citation,
      fileName,
      startLine,
      endLine,
      score,
    })),
  };
}

module.exports = { askQuestion, ensureSession };
