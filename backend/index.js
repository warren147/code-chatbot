// backend/index.js
const express = require('express');
const multer = require('multer');
const dotenv = require('dotenv');
const cors = require('cors');
const { processFiles } = require('./fileProcessor');
const { askQuestion } = require('./askHandler');
const { Pinecone } = require('@pinecone-database/pinecone');
const fs = require('fs');
const path = require('path');
dotenv.config();
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;

const pc = new Pinecone({
    apiKey: PINECONE_API_KEY
  });

const index = pc.Index('code-embeddings'); 



const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors({
    origin: 'http://localhost:3000', 
    credentials: true
  }));
app.use(express.json());

// File Upload Endpoint
app.post('/upload', upload.array('files'), async (req, res) => {
  try {
    const files = req.files;
    await processFiles(files);
    res.status(200).send({ message: 'Files uploaded and processed successfully.' });
  } catch (error) {
    console.error('Error processing files:', error);
    res.status(500).send({ error: 'File processing failed.' });
  }
});

// Chat Endpoint
app.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;
    const answer = await askQuestion(question);
    res.status(200).send({ answer });
  } catch (error) {
    console.error('Error processing question:', error);
    res.status(500).send({ error: 'Failed to process the question.' });
  }
});

app.get('/files', (req, res) => {
    try {
      const filesMetaPath = path.join(__dirname, 'files.json');
      if (!fs.existsSync(filesMetaPath)) {
        return res.status(200).send({ files: [] });
      }
      const data = fs.readFileSync(filesMetaPath, 'utf-8');
      const filesMeta = JSON.parse(data);
      res.status(200).send({ files: filesMeta });
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
  
      // **Delete from Pinecone**
      await index.deleteOne([fileId]);
      console.log(`Deleted vector with ID: ${fileId} from Pinecone`);
  
      // **Read files.json**
      const filesMetaPath = path.join(__dirname, 'files.json');
      let filesMeta = [];
      if (fs.existsSync(filesMetaPath)) {
        const data = fs.readFileSync(filesMetaPath, 'utf-8');
        try {
          filesMeta = JSON.parse(data);
          console.log(`Read existing metadata from files.json`);
        } catch (parseError) {
          console.error('Error parsing files.json:', parseError);
          return res.status(500).send({ error: 'Failed to parse files metadata.' });
        }
      }
  
      // **Find and Remove the File Entry**
      const fileIndex = filesMeta.findIndex(file => file.id === fileId);
      if (fileIndex === -1) {
        return res.status(404).send({ error: 'File not found.' });
      }
  
      const removedFile = filesMeta.splice(fileIndex, 1)[0];
      console.log(`Removed file metadata: ${removedFile.fileName}`);
  
      // **Write Updated Metadata Back to files.json**
      fs.writeFileSync(filesMetaPath, JSON.stringify(filesMeta, null, 2));
      console.log(`Updated files.json after deletion.`);
  
      res.status(200).send({ message: 'File deleted successfully.' });
    } catch (error) {
      console.error('Error deleting file:', error);
      res.status(500).send({ error: 'Failed to delete the file.' });
    }
  });

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});