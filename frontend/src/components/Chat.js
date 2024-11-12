// src/components/Chat.js
import React, { useState } from 'react';
import axios from 'axios';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import javascript from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript';
import python from 'react-syntax-highlighter/dist/esm/languages/hljs/python';
// Import additional languages as needed
import { github } from 'react-syntax-highlighter/dist/esm/styles/hljs';

// Register languages for syntax highlighting
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('python', python);
// Register other languages as needed

const Chat = () => {
  const [messages, setMessages] = useState([]); // { sender: 'user' | 'bot', text: string }
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { sender: 'user', text: input };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setIsLoading(true);

    try {
      const response = await axios.post('http://localhost:5001/ask', { question: input });
      const botMessage = { sender: 'bot', text: response.data.answer };
      setMessages((prevMessages) => [...prevMessages, botMessage]);
    } catch (error) {
      console.error('Error fetching answer:', error);
      const errorMessage = { sender: 'bot', text: 'Sorry, something went wrong.' };
      setMessages((prevMessages) => [...prevMessages, errorMessage]);
    }

    setIsLoading(false);
    setInput('');
  };

  const handleKeyDown = (e) => { // Changed from onKeyPress to onKeyDown
    if (e.key === 'Enter') {
      sendMessage();
    }
  };

  // Function to determine the language of the code snippet
  const getLanguage = (text) => {
    // Simple heuristic based on file extensions or keywords
    if (text.includes('function') || text.includes('console.log')) return 'javascript';
    if (text.includes('def') || text.includes('import')) return 'python';
    // Add more conditions as needed
    return 'plaintext';
  };

  return (
    <div style={styles.chatContainer}>
      <div style={styles.messagesContainer}>
        {messages.map((msg, index) => (
          <div key={index} style={msg.sender === 'user' ? styles.userMessage : styles.botMessage}>
            <strong>{msg.sender === 'user' ? 'You' : 'Bot'}:</strong>
            {msg.text.includes('```') ? (
              msg.text.split('```').map((part, i) => (
                i % 2 === 1 ? (
                  <SyntaxHighlighter key={i} language={getLanguage(part)} style={github}>
                    {part}
                  </SyntaxHighlighter>
                ) : (
                  <span key={i}>{part}</span>
                )
              ))
            ) : (
              <span> {msg.text}</span>
            )}
          </div>
        ))}
        {isLoading && (
          <div style={styles.botMessage}>
            <strong>Bot:</strong> Typing...
          </div>
        )}
      </div>
      <div style={styles.inputContainer}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown} // Updated event handler
          style={styles.input}
          placeholder="Ask a question about your code..."
        />
        <button onClick={sendMessage} style={styles.button}>Send</button>
      </div>
    </div>
  );
};

const styles = {
  chatContainer: {
    border: '1px solid #ddd',
    borderRadius: '5px',
    padding: '10px',
    maxHeight: '500px',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f9f9f9'
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    marginBottom: '10px',
    padding: '5px'
  },
  userMessage: {
    textAlign: 'right',
    margin: '5px 0',
    padding: '5px',
    backgroundColor: '#dcf8c6',
    borderRadius: '10px',
    display: 'inline-block'
  },
  botMessage: {
    textAlign: 'left',
    margin: '5px 0',
    padding: '5px',
    backgroundColor: '#fff',
    borderRadius: '10px',
    display: 'inline-block'
  },
  inputContainer: {
    display: 'flex',
    borderTop: '1px solid #ddd',
    paddingTop: '10px'
  },
  input: {
    flex: 1,
    padding: '10px',
    borderRadius: '5px 0 0 5px',
    border: '1px solid #ccc',
    fontSize: '16px'
  },
  button: {
    padding: '10px 20px',
    borderRadius: '0 5px 5px 0',
    border: 'none',
    backgroundColor: '#28a745',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '16px'
  }
};

export default Chat;