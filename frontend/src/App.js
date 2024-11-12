// src/App.js
import React from 'react';
import FileUpload from './components/FileUpload';
import Chat from './components/Chat';

function App() {
  return (
    <div style={styles.container}>
      <h1>Code Chatbot</h1>
      <FileUpload />
      <Chat />
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '20px'
  }
};

export default App;