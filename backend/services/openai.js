const axios = require('axios');
const config = require('../config/env');

const openAiClient = axios.create({
  baseURL: 'https://api.openai.com/v1',
  headers: {
    Authorization: `Bearer ${config.openAiApiKey}`,
    'Content-Type': 'application/json',
  },
  timeout: 60_000,
});

async function createEmbedding({ input, model }) {
  const response = await openAiClient.post('/embeddings', { input, model });
  return response.data.data[0]?.embedding;
}

async function createChatCompletion({ messages, model, maxTokens }) {
  const response = await openAiClient.post('/chat/completions', {
    model,
    messages,
    max_tokens: maxTokens,
  });
  return response.data;
}

module.exports = {
  createEmbedding,
  createChatCompletion,
  openAiClient,
};
