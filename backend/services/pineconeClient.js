const { Pinecone } = require('@pinecone-database/pinecone');
const config = require('../config/env');

let pineconeClient;
let pineconeIndex;

function getPineconeClient() {
  if (!pineconeClient) {
    pineconeClient = new Pinecone({ apiKey: config.pineconeApiKey });
  }
  return pineconeClient;
}

function getPineconeIndex() {
  if (!pineconeIndex) {
    const client = getPineconeClient();
    pineconeIndex = client.Index(config.pineconeIndex);
  }
  return pineconeIndex;
}

module.exports = {
  getPineconeClient,
  getPineconeIndex,
};
