const db = require('./db');
const config = require('./config/env');
const { getPineconeIndex } = require('./services/pineconeClient');
const { createEmbedding } = require('./services/openai');
const { getAskChain } = require('./langchain/askChain');
const {
  cloneDefaultMemory,
  formatPreferencePrompt,
  getVerbositySettings,
  normalizeMemory,
  updateMemoryFromUserMessage,
} = require('./utils/conversationMemory');

const getChunkByVectorIdStmt = db.prepare(`
  SELECT
    c.content,
    c.start_line AS startLine,
    c.end_line AS endLine,
    f.file_name AS fileName
  FROM chunks c
  JOIN files f ON f.id = c.file_id
  WHERE c.vector_id = ? AND c.conversation_id = ?
`);

const getConversationStmt = db.prepare(`
  SELECT id, title FROM conversations WHERE id = ?
`);

const selectRecentChunksStmt = db.prepare(`
  SELECT
    c.content,
    c.start_line AS startLine,
    c.end_line AS endLine,
    f.file_name AS fileName
  FROM chunks c
  JOIN files f ON f.id = c.file_id
  WHERE c.conversation_id = ?
  ORDER BY datetime(f.upload_date) DESC, c.position ASC
  LIMIT 5
`);

const insertConversationStmt = db.prepare(`
  INSERT INTO conversations (id, title, created_at) VALUES (?, ?, ?)
`);

const updateConversationTitleStmt = db.prepare(`
  UPDATE conversations SET title = ? WHERE id = ? AND (title IS NULL OR title = '')
`);

const selectConversationMemoryStmt = db.prepare(`
  SELECT memory, updated_at AS updatedAt
  FROM conversation_memory
  WHERE conversation_id = ?
`);

const upsertConversationMemoryStmt = db.prepare(`
  INSERT INTO conversation_memory (conversation_id, memory, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(conversation_id) DO UPDATE SET
    memory = excluded.memory,
    updated_at = excluded.updated_at
`);

function formatSnippets(snippets) {
  if (!snippets.length) return 'No relevant code snippets were found.';
  return snippets
    .map(
      (snippet) =>
        `${snippet.fileName} L${snippet.startLine}-${snippet.endLine}\n${snippet.content}`
    )
    .join('\n\n');
}

function buildSystemMessage({ preferenceText, verbosityInstruction }) {
  return [
    'You are an assistant that helps understand and explain code. Be clear, and call out gaps or uncertainty.',
    preferenceText,
    verbosityInstruction,
  ]
    .filter(Boolean)
    .join(' ');
}

function extractChunkText(chunk) {
  if (typeof chunk === 'string') return chunk;
  const content = chunk?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('');
  }
  return '';
}

async function ensureConversation(conversationId, previewText) {
  const { v4: uuidv4 } = await import('uuid');
  const id = conversationId || uuidv4();

  const existing = getConversationStmt.get(id);
  if (!existing) {
    insertConversationStmt.run(id, null, new Date().toISOString());
    const defaultMemory = cloneDefaultMemory();
    upsertConversationMemoryStmt.run(id, JSON.stringify(defaultMemory), new Date().toISOString());
  }

  if (previewText) {
    const title = previewText.slice(0, 60);
    updateConversationTitleStmt.run(title, id);
  }

  return id;
}

async function prepareAskContext({ question, conversationId }) {
  const effectiveConversationId = await ensureConversation(conversationId, question);

  const storedConversationMemoryRow = selectConversationMemoryStmt.get(effectiveConversationId);
  let storedConversationMemory = cloneDefaultMemory();
  if (storedConversationMemoryRow?.memory) {
    try {
      storedConversationMemory = normalizeMemory(JSON.parse(storedConversationMemoryRow.memory));
    } catch (error) {
      storedConversationMemory = cloneDefaultMemory();
    }
  }
  const { memory: updatedConversationMemory, updated: memoryUpdated } =
    updateMemoryFromUserMessage(storedConversationMemory, question);

  if (memoryUpdated || !storedConversationMemoryRow) {
    upsertConversationMemoryStmt.run(
      effectiveConversationId,
      JSON.stringify(updatedConversationMemory),
      new Date().toISOString()
    );
  }

  const pinecone = getPineconeIndex().namespace(effectiveConversationId);
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
      const chunk = getChunkByVectorIdStmt.get(match.id, effectiveConversationId);
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
    const recent = selectRecentChunksStmt.all(effectiveConversationId) || [];
    resolvedSnippets = recent.map((chunk, index) => ({
      citation: index + 1,
      fileName: chunk.fileName || 'Unknown file',
      startLine: chunk.startLine || 0,
      endLine: chunk.endLine || 0,
      content: chunk.content,
      score: null,
    }));
  }

  const preferenceText = formatPreferencePrompt(updatedConversationMemory);
  const verbositySettings = getVerbositySettings(updatedConversationMemory);
  const systemMessage = buildSystemMessage({
    preferenceText,
    verbosityInstruction: verbositySettings.instruction,
  });

  return {
    conversationId: effectiveConversationId,
    conversationMemory: updatedConversationMemory,
    snippets: resolvedSnippets,
    snippetsText: formatSnippets(resolvedSnippets),
    systemMessage,
    verbositySettings,
  };
}

async function askQuestion({ question, conversationId }) {
  const context = await prepareAskContext({ question, conversationId });
  const chain = getAskChain({
    streaming: false,
    maxTokens: context.verbositySettings.maxTokens,
  });
  const answer = await chain.invoke(
    {
      question,
      snippetsText: context.snippetsText,
      systemMessage: context.systemMessage,
    },
    { configurable: { sessionId: context.conversationId } }
  );

  const normalizedAnswer =
    typeof answer === 'string' && answer.trim()
      ? answer.trim()
      : 'I could not generate an answer.';

  return {
    conversationId: context.conversationId,
    answer: normalizedAnswer,
    conversationMemory: context.conversationMemory,
    citations: context.snippets.map(({ citation, fileName, startLine, endLine, score }) => ({
      citation,
      fileName,
      startLine,
      endLine,
      score,
    })),
  };
}

async function askQuestionStream({ question, conversationId, onToken, onSession }) {
  const context = await prepareAskContext({ question, conversationId });
  if (typeof onSession === 'function') {
    onSession({
      conversationId: context.conversationId,
      citations: context.snippets.map(({ citation, fileName, startLine, endLine, score }) => ({
        citation,
        fileName,
        startLine,
        endLine,
        score,
      })),
      conversationMemory: context.conversationMemory,
    });
  }
  const chain = getAskChain({
    streaming: true,
    maxTokens: context.verbositySettings.maxTokens,
  });
  const stream = await chain.stream(
    {
      question,
      snippetsText: context.snippetsText,
      systemMessage: context.systemMessage,
    },
    { configurable: { sessionId: context.conversationId } }
  );

  let answer = '';
  for await (const chunk of stream) {
    const token = extractChunkText(chunk);
    if (!token) continue;
    answer += token;
    if (typeof onToken === 'function') {
      onToken(token);
    }
  }

  const normalizedAnswer =
    typeof answer === 'string' && answer.trim()
      ? answer.trim()
      : 'I could not generate an answer.';

  return {
    conversationId: context.conversationId,
    answer: normalizedAnswer,
    conversationMemory: context.conversationMemory,
    citations: context.snippets.map(({ citation, fileName, startLine, endLine, score }) => ({
      citation,
      fileName,
      startLine,
      endLine,
      score,
    })),
  };
}

module.exports = { askQuestion, askQuestionStream, ensureConversation };
