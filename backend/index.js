const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config/env');
const db = require('./db');
const { processFiles } = require('./fileProcessor');
const { askQuestion, ensureSession } = require('./askHandler');
const { getPineconeIndex } = require('./services/pineconeClient');

const app = express();

function chunkAnswer(text, size = 200) {
  if (!text) return [];
  const regex = new RegExp(`.{1,${size}}`, 'g');
  return text.match(regex) || [];
}

const uploadsPath = path.join(__dirname, config.uploadsDir);
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

const upload = multer({ dest: uploadsPath });

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
  ORDER BY datetime(f.upload_date) DESC
`);

const getFileByIdStmt = db.prepare(`
  SELECT id, file_name AS fileName FROM files WHERE id = ?
`);

const getChunkVectorsStmt = db.prepare(`
  SELECT vector_id AS vectorId FROM chunks WHERE file_id = ?
`);

const deleteFileStmt = db.prepare(`DELETE FROM files WHERE id = ?`);
const deleteChunksStmt = db.prepare(`DELETE FROM chunks WHERE file_id = ?`);

const selectSessionsStmt = db.prepare(`
  SELECT id, title, created_at AS createdAt
  FROM sessions
  ORDER BY datetime(created_at) DESC
`);

const selectSessionMessagesStmt = db.prepare(`
  SELECT id, role, content, created_at AS createdAt
  FROM messages
  WHERE session_id = ?
  ORDER BY datetime(created_at) ASC
`);

const deleteSessionStmt = db.prepare(`DELETE FROM sessions WHERE id = ?`);
const deleteSessionMessagesStmt = db.prepare(`DELETE FROM messages WHERE session_id = ?`);

app.post('/upload', upload.array('files'), async (req, res) => {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).send({ error: 'No files received.' });
    }
    const result = await processFiles(req.files);
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

app.get('/files', (req, res) => {
  try {
    const files = selectFilesStmt.all();
    res.status(200).send({ files });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).send({ error: 'Failed to fetch files.' });
  }
});

app.delete('/files/:id', async (req, res) => {
  try {
    const fileId = req.params.id;
    if (!fileId) {
      return res.status(400).send({ error: 'File ID is required.' });
    }

    const fileRecord = getFileByIdStmt.get(fileId);
    if (!fileRecord) {
      return res.status(404).send({ error: 'File not found.' });
    }

    const vectorRows = getChunkVectorsStmt.all(fileId);
    const vectorIds = vectorRows.map((row) => row.vectorId).filter(Boolean);

    if (vectorIds.length) {
      const index = getPineconeIndex();
      for (const vectorId of vectorIds) {
        await index.deleteOne(vectorId);
      }
    }

    const transaction = db.transaction(() => {
      deleteChunksStmt.run(fileId);
      deleteFileStmt.run(fileId);
    });
    transaction();

    res.status(200).send({ message: 'File deleted successfully.' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).send({ error: 'Failed to delete the file.' });
  }
});

app.get('/sessions', (req, res) => {
  try {
    const sessions = selectSessionsStmt.all();
    res.status(200).send({ sessions });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).send({ error: 'Failed to fetch sessions.' });
  }
});

app.get('/sessions/:id/messages', (req, res) => {
  try {
    const sessionId = req.params.id;
    if (!sessionId) {
      return res.status(400).send({ error: 'Session ID is required.' });
    }

    const messages = selectSessionMessagesStmt.all(sessionId);
    res.status(200).send({ messages });
  } catch (error) {
    console.error('Error fetching session messages:', error);
    res.status(500).send({ error: 'Failed to fetch session messages.' });
  }
});

app.post('/sessions', async (req, res) => {
  try {
    const { title } = req.body || {};
    const sessionId = await ensureSession(null, title || '');
    res.status(201).send({ sessionId });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).send({ error: 'Failed to create session.' });
  }
});

app.delete('/sessions/:id', (req, res) => {
  try {
    const sessionId = req.params.id;
    if (!sessionId) {
      return res.status(400).send({ error: 'Session ID is required.' });
    }

    const transaction = db.transaction(() => {
      deleteSessionMessagesStmt.run(sessionId);
      deleteSessionStmt.run(sessionId);
    });
    transaction();

    res.status(200).send({ message: 'Session deleted successfully.' });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).send({ error: 'Failed to delete session.' });
  }
});

app.post('/ask', async (req, res) => {
  try {
    const { question, sessionId } = req.body;
    if (!question) {
      return res.status(400).send({ error: 'Question is required.' });
    }
    const answer = await askQuestion({ question, sessionId });
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
    const { question, sessionId } = req.body;
    if (!question) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Question is required.' })}\n\n`);
      return closeConnection();
    }

    const result = await askQuestion({ question, sessionId });

    res.write(`event: session\ndata: ${JSON.stringify({ sessionId: result.sessionId, citations: result.citations })}\n\n`);

    const tokens = chunkAnswer(result.answer);
    tokens.forEach((token) => {
      res.write(`event: token\ndata: ${JSON.stringify({ text: token })}\n\n`);
    });

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
