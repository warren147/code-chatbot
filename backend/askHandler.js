// backend/askHandler.js
const axios = require('axios');
const { Pinecone } = require('@pinecone-database/pinecone');
OPENAI_API_KEY = "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";
const pc = new Pinecone({
    apiKey: "59f8869e-72fe-49ac-9dab-9a5038c90af7"
  });

const index = pc.Index('code-embeddings'); 

async function generateEmbedding(text) {
    const response = await axios.post('https://api.openai.com/v1/embeddings', {
        input: text,
        model: "text-embedding-3-large"
    }, {
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
    });
    return response.data.data[0].embedding;
}

const askQuestion = async (question) => {
    const pc = new Pinecone({
        apiKey: "59f8869e-72fe-49ac-9dab-9a5038c90af7"
      });
    
    const index = pc.Index('code-embeddings'); 

  const questionEmbedding = await generateEmbedding(question);

  const queryResponse = await index.query({
    vector: questionEmbedding,
    topK: 5,
    includeMetadata: true
  });

  const relevantSnippets = queryResponse.matches.map(match => match.metadata.content).join('\n\n');

  const prompt = `
You are an assistant that helps understand and explain code.

Relevant Code Snippets:
${relevantSnippets}

User Question:
${question}

Answer:
`;

  const gptResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 3000
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  return gptResponse.data.choices[0].message.content.trim();
};

module.exports = { askQuestion };