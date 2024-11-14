
import React, { useState } from 'react';
import FileUpload from './components/FileUpload';
import FileList from './components/FileList';
import Chat from './components/Chat';
import { ToastContainer } from 'react-toastify'; 
import 'react-toastify/dist/ReactToastify.css'; 

function App() {
  const [refreshFiles, setRefreshFiles] = useState(false);

  const handleUploadSuccess = () => {
    setRefreshFiles(prev => !prev);
  };

  return (
    <div style={styles.container}>
      <FileUpload onUploadSuccess={handleUploadSuccess} />
      <FileList refresh={refreshFiles} />
      <Chat />
      <ToastContainer />
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1500px', 
    margin: 'auto',
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
    minHeight: '80vh'
  },
  title: {
    textAlign: 'center',
    color: '#333',
    marginBottom: '20px'
  }
};

export default App;