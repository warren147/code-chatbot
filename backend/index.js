const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config/env');
const db = require('./db');
const { processFiles } = require('./fileProcessor');
const { askQuestion, askQuestionStream, ensureConversation } = require('./askHandler');
const { getPineconeIndex } = require('./services/pineconeClient');

const app = express();

async function deletePineconeNamespace(conversationId) {
  if (!conversationId) return;
  const index = getPineconeIndex();
  const namespace = index.namespace(conversationId);
  if (namespace && typeof namespace.deleteAll === 'function') {
    await namespace.deleteAll();
    return;
  }
  if (typeof index.delete === 'function') {
    await index.delete({ deleteAll: true, namespace: conversationId });
    return;
  }
  throw new Error('Pinecone namespace delete is not supported by the client.');
}

const uploadsPath = path.join(__dirname, config.uploadsDir);
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const conversationId = req.params.id;
    if (!conversationId) {
      return cb(new Error('Conversation ID is required.'));
    }
    const destination = path.join(uploadsPath, conversationId);
    fs.mkdirSync(destination, { recursive: true });
    return cb(null, destination);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeName = `${timestamp}-${file.originalname}`;
    cb(null, safeName);
  },
});

const upload = multer({ storage });

app.use(cors({
  origin: config.frontendOrigin,
  credentials: true,
}));
app.use(express.json());

const selectFilesStmt = db.prepare(`
  SELECT
    f.id,
    f.file_name AS fileName,
    f.upload_date AS uploadDate,
    f.status,
    f.error,
    (SELECT COUNT(*) FROM chunks c WHERE c.file_id = f.id) AS chunkCount
  FROM files f
  WHERE f.conversation_id = ?
  ORDER BY datetime(f.upload_date) DESC
`);

const getFileByIdStmt = db.prepare(`
  SELECT id, file_name AS fileName, conversation_id AS conversationId
  FROM files
  WHERE id = ?
`);

const getChunkVectorsStmt = db.prepare(`
  SELECT vector_id AS vectorId FROM chunks WHERE file_id = ?
`);

const deleteFileStmt = db.prepare(`DELETE FROM files WHERE id = ? AND conversation_id = ?`);
const deleteChunksStmt = db.prepare(`DELETE FROM chunks WHERE file_id = ? AND conversation_id = ?`);

const selectConversationsStmt = db.prepare(`
  SELECT id, title, created_at AS createdAt
  FROM conversations
  ORDER BY datetime(created_at) DESC
`);

const selectConversationMessagesStmt = db.prepare(`
  SELECT id, role, content, created_at AS createdAt
  FROM messages
  WHERE conversation_id = ?
  ORDER BY datetime(created_at) ASC
`);

const selectConversationMemoriesStmt = db.prepare(`
  SELECT
    id,
    type,
    content,
    confidence,
    created_at AS createdAt,
    last_used_at AS lastUsedAt,
    is_active AS isActive
  FROM memories
  WHERE conversation_id = ?
  ORDER BY datetime(created_at) DESC
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

const deleteConversationStmt = db.prepare(`DELETE FROM conversations WHERE id = ?`);
const deleteConversationMessagesStmt = db.prepare(`DELETE FROM messages WHERE conversation_id = ?`);

app.post('/conversations/:id/files', upload.array('files'), async (req, res) => {
  try {
    const conversationId = req.params.id;
    if (!conversationId) {
      return res.status(400).send({ error: 'Conversation ID is required.' });
    }
    await ensureConversation(conversationId, null);
    if (!req.files || !req.files.length) {
      return res.status(400).send({ error: 'No files received.' });
    }
    const result = await processFiles(req.files, conversationId);
    res.status(202).send({
      message: 'Files queued for processing.',
      ...result,
    });
  } catch (error) {
    const errorDetails = error?.response?.data || error?.message || error;
    console.error('Error processing files:', errorDetails);
    res.status(500).send({ error: 'File processing failed.' });
  }
});

app.get('/conversations/:id/files', (req, res) => {
  try {
    const conversationId = req.params.id;
    if (!conversationId) {
      return res.status(400).send({ error: 'Conversation ID is required.' });
    }
    const files = selectFilesStmt.all(conversationId);
    res.status(200).send({ files });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).send({ error: 'Failed to fetch files.' });
  }
});

app.delete('/conversations/:id/files/:fileId', async (req, res) => {
  try {
    const { id: conversationId, fileId } = req.params;
    if (!conversationId || !fileId) {
      return res.status(400).send({ error: 'Conversation ID and file ID are required.' });
    }

    const fileRecord = getFileByIdStmt.get(fileId);
    if (!fileRecord || fileRecord.conversationId !== conversationId) {
      return res.status(404).send({ error: 'File not found.' });
    }

    const vectorRows = getChunkVectorsStmt.all(fileId);
    const vectorIds = vectorRows.map((row) => row.vectorId).filter(Boolean);

    if (vectorIds.length) {
      const index = getPineconeIndex().namespace(conversationId);
      for (const vectorId of vectorIds) {
        await index.deleteOne(vectorId);
      }
    }

    const transaction = db.transaction(() => {
      deleteChunksStmt.run(fileId, conversationId);
      deleteFileStmt.run(fileId, conversationId);
    });
    transaction();

    res.status(200).send({ message: 'File deleted successfully.' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).send({ error: 'Failed to delete the file.' });
  }
});

app.get('/conversations', (req, res) => {
  try {
    const conversations = selectConversationsStmt.all();
    res.status(200).send({ conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).send({ error: 'Failed to fetch conversations.' });
  }
});

app.get('/conversations/:id/messages', (req, res) => {
  try {
    const conversationId = req.params.id;
    if (!conversationId) {
      return res.status(400).send({ error: 'Conversation ID is required.' });
    }

    const messages = selectConversationMessagesStmt.all(conversationId);
    res.status(200).send({ messages });
  } catch (error) {
    console.error('Error fetching conversation messages:', error);
    res.status(500).send({ error: 'Failed to fetch conversation messages.' });
  }
});

app.get('/conversations/:id/memories', (req, res) => {
  try {
    const conversationId = req.params.id;
    if (!conversationId) {
      return res.status(400).send({ error: 'Conversation ID is required.' });
    }

    const memories = selectConversationMemoriesStmt.all(conversationId);
    const conversationMemoryRow = selectConversationMemoryStmt.get(conversationId);
    let parsedMemory = null;
    if (conversationMemoryRow?.memory) {
      try {
        parsedMemory = JSON.parse(conversationMemoryRow.memory);
      } catch (parseError) {
        parsedMemory = null;
      }
    }
    res.status(200).send({
      memories,
      conversationMemory: parsedMemory,
      updatedAt: conversationMemoryRow?.updatedAt || null,
    });
  } catch (error) {
    console.error('Error fetching conversation memories:', error);
    res.status(500).send({ error: 'Failed to fetch conversation memories.' });
  }
});

app.patch('/conversations/:id/memory', (req, res) => {
  try {
    const conversationId = req.params.id;
    if (!conversationId) {
      return res.status(400).send({ error: 'Conversation ID is required.' });
    }
    const memory = req.body?.memory;
    if (!memory || typeof memory !== 'object') {
      return res.status(400).send({ error: 'Memory object is required.' });
    }
    const payload = JSON.stringify(memory);
    const updatedAt = new Date().toISOString();
    upsertConversationMemoryStmt.run(conversationId, payload, updatedAt);
    return res.status(200).send({ conversationId, updatedAt });
  } catch (error) {
    console.error('Error updating conversation memory:', error);
    return res.status(500).send({ error: 'Failed to update conversation memory.' });
  }
});

app.post('/conversations', async (req, res) => {
  try {
    const { title } = req.body || {};
    const conversationId = await ensureConversation(null, title || '');
    res.status(201).send({ conversationId });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).send({ error: 'Failed to create conversation.' });
  }
});

app.delete('/conversations/:id', async (req, res) => {
  try {
    const conversationId = req.params.id;
    if (!conversationId) {
      return res.status(400).send({ error: 'Conversation ID is required.' });
    }

    await deletePineconeNamespace(conversationId);

    const transaction = db.transaction(() => {
      deleteConversationMessagesStmt.run(conversationId);
      deleteConversationStmt.run(conversationId);
    });
    transaction();

    res.status(200).send({ message: 'Conversation deleted successfully.' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).send({ error: 'Failed to delete conversation.' });
  }
});

app.post('/conversations/:id/messages', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const message = req.body?.content || req.body?.question;
    if (!conversationId) {
      return res.status(400).send({ error: 'Conversation ID is required.' });
    }
    if (!message) {
      return res.status(400).send({ error: 'Message content is required.' });
    }
    const answer = await askQuestion({ question: message, conversationId });
    res.status(200).send(answer);
  } catch (error) {
    const errorDetails = error.response?.data || error.message || error;
    console.error('Error processing question:', errorDetails);
    res.status(500).send({ error: 'Failed to process the question.' });
  }
});

app.post('/conversations/:id/messages/stream', async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.flushHeaders?.();

  const closeConnection = () => {
    if (!res.writableEnded) {
      res.end();
    }
  };

  req.on('close', closeConnection);

  try {
    const conversationId = req.params.id;
    const message = req.body?.content || req.body?.question;
    if (!conversationId) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Conversation ID is required.' })}\n\n`);
      return closeConnection();
    }

    if (!message) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Message content is required.' })}\n\n`);
      return closeConnection();
    }

    let sessionSent = false;
    const sendSession = (payload) => {
      if (sessionSent) return;
      sessionSent = true;
      res.write(`event: session\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    const result = await askQuestionStream({
      question: message,
      conversationId,
      onSession: ({ conversationId: id, citations }) => {
        sendSession({ conversationId: id, citations });
      },
      onToken: (token) => {
        res.write(`event: token\ndata: ${JSON.stringify({ text: token })}\n\n`);
      },
    });

    if (!sessionSent) {
      sendSession({ conversationId: result.conversationId, citations: result.citations });
    }

    res.write('event: done\ndata: {}\n\n');
    closeConnection();
  } catch (error) {
    const errorDetails = error.response?.data || error.message || error;
    console.error('Streaming /ask failed:', errorDetails);
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Failed to process the question.' })}\n\n`);
    closeConnection();
  }
});

app.post('/ask', async (req, res) => {
  try {
    const { question, conversationId } = req.body || {};
    if (!question) {
      return res.status(400).send({ error: 'Question is required.' });
    }
    const answer = await askQuestion({ question, conversationId });
    res.status(200).send(answer);
  } catch (error) {
    const errorDetails = error.response?.data || error.message || error;
    console.error('Error processing question:', errorDetails);
    res.status(500).send({ error: 'Failed to process the question.' });
  }
});

app.post('/ask/stream', async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.flushHeaders?.();

  const closeConnection = () => {
    if (!res.writableEnded) {
      res.end();
    }
  };

  req.on('close', closeConnection);

  try {
    const { question, conversationId } = req.body || {};
    if (!question) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Question is required.' })}\n\n`);
      return closeConnection();
    }

    let sessionSent = false;
    const sendSession = (payload) => {
      if (sessionSent) return;
      sessionSent = true;
      res.write(`event: session\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    const result = await askQuestionStream({
      question,
      conversationId,
      onSession: ({ conversationId: id, citations }) => {
        sendSession({ conversationId: id, citations });
      },
      onToken: (token) => {
        res.write(`event: token\ndata: ${JSON.stringify({ text: token })}\n\n`);
      },
    });

    if (!sessionSent) {
      sendSession({ conversationId: result.conversationId, citations: result.citations });
    }

    res.write('event: done\ndata: {}\n\n');
    closeConnection();
  } catch (error) {
    const errorDetails = error.response?.data || error.message || error;
    console.error('Streaming /ask failed:', errorDetails);
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Failed to process the question.' })}\n\n`);
    closeConnection();
  }
});

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
