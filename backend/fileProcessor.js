const fs = require('fs');
const path = require('path');
const db = require('./db');
const config = require('./config/env');
const { chunkLines } = require('./utils/chunking');
const { sha256 } = require('./utils/hash');
const { enqueue } = require('./services/ingestionQueue');
const { getPineconeIndex } = require('./services/pineconeClient');
const { createEmbedding } = require('./services/openai');

function detectLanguage(fileName) {
  const ext = path.extname(fileName || '').toLowerCase();
  if (ext === '.py') return 'python';
  if (ext === '.js' || ext === '.jsx') return 'javascript';
  if (ext === '.ts' || ext === '.tsx') return 'typescript';
  if (ext === '.java') return 'java';
  if (ext === '.go') return 'go';
  if (ext === '.rs') return 'rust';
  return null;
}

const insertFileStmt = db.prepare(`
  INSERT INTO files (id, conversation_id, file_name, upload_date, sha256, status)
  VALUES (@id, @conversationId, @fileName, @uploadDate, @sha256, @status)
`);

const insertChunkStmt = db.prepare(`
  INSERT INTO chunks (id, file_id, conversation_id, position, content, start_line, end_line, vector_id)
  VALUES (@id, @fileId, @conversationId, @position, @content, @startLine, @endLine, @vectorId)
`);

const selectFileByHashStmt = db.prepare(`
  SELECT id, file_name AS fileName, status
  FROM files
  WHERE sha256 = ? AND conversation_id = ?
`);

const updateFileStatusStmt = db.prepare(`
  UPDATE files SET status = ?, error = ? WHERE id = ?
`);

const getChunksForFileStmt = db.prepare(`
  SELECT id, content, start_line AS startLine, end_line AS endLine, position, vector_id AS vectorId FROM chunks
  WHERE file_id = ?
  ORDER BY position ASC
`);

const getFileByIdStmt = db.prepare(`
  SELECT file_name AS fileName FROM files WHERE id = ?
`);

async function processFiles(files, conversationId) {
  const { v4: uuidv4 } = await import('uuid');
  const results = {
    processed: [],
    skipped: [],
  };

  for (const file of files) {
    if (!conversationId) {
      throw new Error('Conversation ID is required for file ingestion.');
    }
    const tempPath = path.join(file.path);
    const content = fs.readFileSync(tempPath, 'utf8');
    const digest = sha256(content);

    const duplicate = selectFileByHashStmt.get(digest, conversationId);
    if (duplicate) {
      fs.unlinkSync(tempPath);
      results.skipped.push({ fileName: file.originalname, reason: 'duplicate', existingFileId: duplicate.id });
      continue;
    }

    const fileId = uuidv4();
    const uploadDate = new Date().toISOString();
    const language = detectLanguage(file.originalname);

    const chunks = chunkLines(content, config.maxChunkTokens * 4, config.chunkOverlapTokens * 4, { language }).map(
      (chunk, index) => ({
        id: uuidv4(),
        fileId,
        conversationId,
        position: index,
        content: chunk.content,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        vectorId: uuidv4(),
      })
    );

    const status = chunks.length ? 'queued' : 'skipped';

    const transaction = db.transaction(() => {
      insertFileStmt.run({
        id: fileId,
        conversationId,
        fileName: file.originalname,
        uploadDate,
        sha256: digest,
        status,
      });
      chunks.forEach((chunk) => {
        insertChunkStmt.run(chunk);
      });
    });

    transaction();
    fs.unlinkSync(tempPath);

    results.processed.push({ fileId, fileName: file.originalname, chunkCount: chunks.length });

    if (!chunks.length) {
      updateFileStatusStmt.run('empty', 'File did not contain any readable content.', fileId);
      continue;
    }

    enqueue(async () => {
      try {
        updateFileStatusStmt.run('processing', null, fileId);
        const pinecone = getPineconeIndex().namespace(conversationId);
        const storedChunks = getChunksForFileStmt.all(fileId);
        const fileRecord = getFileByIdStmt.get(fileId);

        for (const chunk of storedChunks) {
          const embedding = await createEmbedding({
            input: chunk.content,
            model: 'text-embedding-3-large',
          });
          if (!embedding || !embedding.length) {
            throw new Error('Embedding response was empty.');
          }

          await pinecone.upsert([
            {
              id: chunk.vectorId || chunk.id,
              values: embedding,
              metadata: {
                fileId,
                fileName: fileRecord?.fileName,
                startLine: chunk.startLine,
                endLine: chunk.endLine,
              },
            },
          ]);
        }

        updateFileStatusStmt.run('ready', null, fileId);
      } catch (error) {
        const normalizedError = error?.response?.data || error?.message || 'Unknown error';
        updateFileStatusStmt.run('failed', JSON.stringify(normalizedError).slice(0, 3000), fileId);
        console.error(`Failed to process file ${fileId}:`, normalizedError);
      }
    });
  }

  return results;
}

module.exports = { processFiles };
