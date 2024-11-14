// src/components/Chat.js
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import javascript from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript';
import python from 'react-syntax-highlighter/dist/esm/languages/hljs/python';
import { github } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { v4 as uuidv4 } from 'uuid';
import './Chat.css'; // Import external CSS for styling

// Register languages for syntax highlighting
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('python', python);
// Register other languages as needed

// Modal Component
const Modal = ({ isOpen, onClose, onConfirm, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} aria-modal="true" role="dialog">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          <button onClick={onConfirm} className="modal-confirm-button">
            Confirm
          </button>
          <button onClick={onClose} className="modal-cancel-button">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

const Chat = () => {
  const [messages, setMessages] = useState([]); // { id, sender: 'user' | 'bot', text: string }
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false); // State for modal visibility

  const messagesEndRef = useRef(null);

  // Function to scroll to the bottom of the messages container
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Function to handle sending messages
  const sendMessage = async () => {
    if (!input.trim()) return; // Prevent sending empty messages

    const userMessage = { id: uuidv4(), sender: 'user', text: input };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setIsLoading(true);
    setInput('');

    try {
      const response = await axios.post('http://localhost:5001/ask', { question: input });
      const botFullText = response.data.answer;

      // Add an empty bot message and get its index
      setMessages((prevMessages) => {
        const newMessages = [...prevMessages, { id: uuidv4(), sender: 'bot', text: '' }];
        const messageIndex = newMessages.length - 1;
        typeText(botFullText, messageIndex);
        return newMessages;
      });
    } catch (error) {
      console.error('Error fetching answer:', error);
      const errorMessage = {
        id: uuidv4(),
        sender: 'bot',
        text: 'Sorry, something went wrong while processing your request.',
      };
      setMessages((prevMessages) => [...prevMessages, errorMessage]);
    }

    setIsLoading(false);
  };

  // Function to handle key presses (Enter key to send message)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent default behavior
      sendMessage();
    }
  };

  // Function to determine the language of the code snippet based on file extension or content
  const getLanguage = (text, fileName) => {
    const extension = fileName ? fileName.split('.').pop().toLowerCase() : '';
    switch (extension) {
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'py':
        return 'python';
      // Add more cases as needed
      default:
        return 'plaintext';
    }
  };

  // Custom renderer for code blocks to integrate with react-syntax-highlighter
  const renderers = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <SyntaxHighlighter language={match[1]} style={github} PreTag="div" {...props}>
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
  };

  // Function to implement the typing effect
  const typeText = (fullText, messageIndex) => {
    let currentText = '';
    const delay = 15; // Delay in ms between each character

    const interval = setInterval(() => {
      currentText += fullText[currentText.length];
      setMessages((prevMessages) => {
        const newMessages = [...prevMessages];
        // Ensure the messageIndex is within bounds
        if (messageIndex < newMessages.length) {
          newMessages[messageIndex].text = currentText;
        }
        return newMessages;
      });

      // If the entire text has been typed, clear the interval
      if (currentText.length === fullText.length) {
        clearInterval(interval);
      }
    }, delay);
  };

  // Function to open the modal
  const openModal = () => {
    setIsModalOpen(true);
  };

  // Function to close the modal
  const closeModal = () => {
    setIsModalOpen(false);
  };

  // Function to confirm clearing chat
  const confirmClearChat = () => {
    setMessages([]);
    closeModal();
  };

  return (
    <div className="chat-container">
      {/* Header with Clear Chat button */}
      <div className="chat-header">
        <h2>Chat</h2>
        <button onClick={openModal} className="clear-button" aria-label="Clear chat history">
          Clear Chat
        </button>
      </div>

      <div className="messages-container">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={msg.sender === 'user' ? 'user-message' : 'bot-message'}
          >
            <strong>{msg.sender === 'user' ? 'You' : 'Bot'}:</strong>
            <ReactMarkdown
              children={msg.text}
              remarkPlugins={[remarkGfm]}
              components={renderers}
            />
          </div>
        ))}
        {isLoading && (
          <div className="bot-message">
            <strong>Bot:</strong> Typing...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="input-container">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="input-field"
          placeholder="Ask a question about your code..."
          aria-label="Chat input"
        />
        <button onClick={sendMessage} className="send-button" aria-label="Send message">
          Send
        </button>
      </div>

      {/* Modal for confirming clear chat */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        onConfirm={confirmClearChat}
        title="Confirm Clear Chat"
      >
        <p>Are you sure you want to clear the chat history?</p>
      </Modal>
    </div>
  );
};

export default Chat;