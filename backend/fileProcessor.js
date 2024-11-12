// backend/fileProcessor.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Pinecone } = require('@pinecone-database/pinecone');
const { v4: uuidv4 } = require('uuid');
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
    console.log(response.data.data[0].embedding);
    return response.data.data[0].embedding;
}

const processFiles = async (files) => {
    const pc = new Pinecone({
        apiKey: "59f8869e-72fe-49ac-9dab-9a5038c90af7"
        });

    const index = pc.Index('code-embeddings'); 

  for (const file of files) {
    const content = fs.readFileSync(path.join(file.path), 'utf-8');
    const embedding = await generateEmbedding(content);
    vector = []
    vector.push({ id: uuidv4(), values: embedding, metadata: {
        fileName: file.originalname,
        content: content
      }})

    await index.upsert(vector);

    fs.unlinkSync(path.join(file.path));
  }
};

module.exports = { processFiles };