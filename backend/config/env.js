const dotenv = require('dotenv');

dotenv.config();

const requiredVars = ['OPENAI_API_KEY', 'PINECONE_API_KEY', 'PINECONE_INDEX'];

const missing = requiredVars.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT ? Number(process.env.PORT) : 5001,
  openAiApiKey: process.env.OPENAI_API_KEY,
  pineconeApiKey: process.env.PINECONE_API_KEY,
  pineconeIndex: process.env.PINECONE_INDEX,
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  maxChunkTokens: process.env.MAX_CHUNK_TOKENS ? Number(process.env.MAX_CHUNK_TOKENS) : 1000,
  chunkOverlapTokens: process.env.CHUNK_OVERLAP_TOKENS
    ? Number(process.env.CHUNK_OVERLAP_TOKENS)
    : 200,
  minPineconeScore: process.env.MIN_PINECONE_SCORE ? Number(process.env.MIN_PINECONE_SCORE) : 0.75,
  uploadsDir: process.env.UPLOADS_DIR || 'uploads',
  databaseFile: process.env.DATABASE_FILE || 'data/app.db',
  maxHistoryMessages: process.env.MAX_HISTORY_MESSAGES ? Number(process.env.MAX_HISTORY_MESSAGES) : 10,
  memoryMaxPerSession: process.env.MEMORY_MAX_PER_SESSION
    ? Number(process.env.MEMORY_MAX_PER_SESSION)
    : 200,
  memoryTopK: process.env.MEMORY_TOP_K ? Number(process.env.MEMORY_TOP_K) : 5,
  memoryMinSimilarity: process.env.MEMORY_MIN_SIMILARITY
    ? Number(process.env.MEMORY_MIN_SIMILARITY)
    : 0.25,
  memoryConflictSimilarity: process.env.MEMORY_CONFLICT_SIMILARITY
    ? Number(process.env.MEMORY_CONFLICT_SIMILARITY)
    : 0.78,
  memoryMinConfidence: process.env.MEMORY_MIN_CONFIDENCE
    ? Number(process.env.MEMORY_MIN_CONFIDENCE)
    : 0.35,
};

module.exports = config;
