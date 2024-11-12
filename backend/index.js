// backend/index.js
const express = require('express');
const multer = require('multer');
const dotenv = require('dotenv');
const cors = require('cors');
const { processFiles } = require('./fileProcessor');
const { askQuestion } = require('./askHandler');

dotenv.config();

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});