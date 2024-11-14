import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import javascript from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript';
import python from 'react-syntax-highlighter/dist/esm/languages/hljs/python';
import { github } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { v4 as uuidv4 } from 'uuid';
import './Chat.css'; 

SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('python', python);


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
  const [messages, setMessages] = useState([]); 
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false); 

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return; 

    const userMessage = { id: uuidv4(), sender: 'user', text: input };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setIsLoading(true);
    setInput('');

    try {
      const response = await axios.post('http://localhost:5001/ask', { question: input });
      const botFullText = response.data.answer;

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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); 
      sendMessage();
    }
  };

  const getLanguage = (text, fileName) => {
    const extension = fileName ? fileName.split('.').pop().toLowerCase() : '';
    switch (extension) {
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'py':
        return 'python';
      default:
        return 'plaintext';
    }
  };

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

  const typeText = (fullText, messageIndex) => {
    let currentText = '';
    const delay = 15; 

    const interval = setInterval(() => {
      currentText += fullText[currentText.length];
      setMessages((prevMessages) => {
        const newMessages = [...prevMessages];
        if (messageIndex < newMessages.length) {
          newMessages[messageIndex].text = currentText;
        }
        return newMessages;
      });

      if (currentText.length === fullText.length) {
        clearInterval(interval);
      }
    }, delay);
  };

  const openModal = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const confirmClearChat = () => {
    setMessages([]);
    closeModal();
  };

  return (
    <div className="chat-container">
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