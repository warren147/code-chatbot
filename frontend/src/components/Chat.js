import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import javascript from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript';
import python from 'react-syntax-highlighter/dist/esm/languages/hljs/python';
import { github } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'react-toastify';
import Modal from './Modal';
import client from '../api/client';
import './Chat.css';

SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('python', python);

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

const TYPING_DELAY = 15;

const Chat = ({
  sessionId,
  sessionTitle,
  ensureSession,
  onSessionsRefresh,
  onSessionCleared,
}) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const typingIntervalsRef = useRef(new Map());
  const currentSessionRef = useRef(sessionId);
  const previousLengthRef = useRef(0);

  useEffect(() => {
    currentSessionRef.current = sessionId;
  }, [sessionId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (messages.length > previousLengthRef.current) {
      scrollToBottom();
    }
    previousLengthRef.current = messages.length;
  }, [messages.length, scrollToBottom]);

  const clearTypingInterval = useCallback((messageId) => {
    const intervalId = typingIntervalsRef.current.get(messageId);
    if (intervalId) {
      clearInterval(intervalId);
      typingIntervalsRef.current.delete(messageId);
    }
  }, []);

  const clearAllTypingIntervals = useCallback(() => {
    typingIntervalsRef.current.forEach((intervalId) => clearInterval(intervalId));
    typingIntervalsRef.current.clear();
  }, []);

  useEffect(() => () => clearAllTypingIntervals(), [clearAllTypingIntervals]);

  const loadHistory = useCallback(
    async (id) => {
      if (!id) {
        setMessages([]);
        return;
      }
      clearAllTypingIntervals();
      setIsHistoryLoading(true);
      try {
        const { data } = await client.get(`/sessions/${id}/messages`);
        const history = (data.messages || []).map((message) => ({
          id: message.id,
          sender: message.role === 'user' ? 'user' : 'bot',
          text: message.content,
          citations: [],
          isPending: false,
        }));
        setMessages(history);
      } catch (error) {
        console.error('Failed to load session history:', error);
        toast.error('Could not load this conversation.');
      } finally {
        setIsHistoryLoading(false);
      }
    },
    [clearAllTypingIntervals]
  );

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      clearAllTypingIntervals();
      return;
    }
    if (isLoading) {
      return;
    }
    loadHistory(sessionId);
  }, [sessionId, isLoading, loadHistory, clearAllTypingIntervals]);

  const typeText = useCallback(
    (fullText, messageId, onComplete) => {
      const safeText = fullText || '';
      clearTypingInterval(messageId);

      if (!safeText.length) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === messageId ? { ...message, text: '', isPending: false } : message
          )
        );
        onComplete?.();
        return;
      }

      let index = 0;
      const intervalId = setInterval(() => {
        index += 1;
        const nextText = safeText.slice(0, index);
        setMessages((prev) =>
          prev.map((message) =>
            message.id === messageId
              ? { ...message, text: nextText, isPending: index < safeText.length }
              : message
          )
        );
        if (index >= safeText.length) {
          clearInterval(intervalId);
          typingIntervalsRef.current.delete(messageId);
          setMessages((prev) =>
            prev.map((message) =>
              message.id === messageId ? { ...message, isPending: false } : message
            )
          );
          onComplete?.();
        }
      }, TYPING_DELAY);

      typingIntervalsRef.current.set(messageId, intervalId);
    },
    [clearTypingInterval]
  );

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) {
      return;
    }

    const question = input.trim();
    const userMessage = { id: uuidv4(), sender: 'user', text: question };
    const botMessageId = uuidv4();

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: botMessageId, sender: 'bot', text: '', citations: [], isPending: true },
    ]);
    setInput('');
    setIsLoading(true);

    let activeSessionId = currentSessionRef.current;
    try {
      if (!activeSessionId) {
        if (ensureSession) {
          activeSessionId = await ensureSession();
          currentSessionRef.current = activeSessionId;
        } else {
          const { data } = await client.post('/sessions');
          activeSessionId = data.sessionId;
          currentSessionRef.current = activeSessionId;
        }
      }

      if (!activeSessionId) {
        throw new Error('Unable to start a new chat session.');
      }

      const { data } = await client.post('/ask', {
        question,
        sessionId: activeSessionId,
      });

      const answerText = data?.answer || '';

      if (data?.sessionId && data.sessionId !== currentSessionRef.current) {
        currentSessionRef.current = data.sessionId;
      }
      onSessionsRefresh?.();

      if (Array.isArray(data?.citations)) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === botMessageId
              ? { ...message, citations: data.citations }
              : message
          )
        );
      }

      typeText(answerText, botMessageId, () => {
        setIsLoading(false);
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      clearTypingInterval(botMessageId);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === botMessageId
            ? {
                ...message,
                text: 'Sorry, something went wrong while processing your request.',
                isPending: false,
              }
            : message
        )
      );
      setIsLoading(false);
      toast.error(error?.message || 'Could not process your request.');
    }
  }, [clearTypingInterval, ensureSession, input, isLoading, onSessionsRefresh, typeText]);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const confirmClearChat = async () => {
    clearAllTypingIntervals();
    setIsLoading(false);
    setMessages([]);
    setIsModalOpen(false);

    const activeId = currentSessionRef.current;
    if (activeId) {
      try {
        await client.delete(`/sessions/${activeId}`);
        currentSessionRef.current = null;
        onSessionCleared?.(activeId);
      } catch (error) {
        console.error('Failed to delete session:', error);
        toast.error('Could not clear this conversation.');
      }
    }
  };

  const headerTitle = sessionTitle || 'Chat';

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div>
          <h2>{headerTitle}</h2>
        </div>
        <button onClick={openModal} className="clear-button" aria-label="Clear chat history">
          Clear Chat
        </button>
      </div>

      <div className="messages-container">
        {isHistoryLoading && (
          <div className="chat-placeholder">
            <h3>Loading history...</h3>
            <p>Please wait a moment.</p>
          </div>
        )}

        {messages.length === 0 && !isLoading && !isHistoryLoading && (
          <div className="chat-placeholder">
            <h3>Ask about your repository</h3>
            <p>Try “Summarize the auth flow” or “Where do we call Pinecone embeddings?”</p>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          const avatarLabel = isUser ? 'You' : 'Bot';
          return (
            <div key={msg.id} className={`message ${isUser ? 'message--user' : 'message--bot'}`}>
              <div className="message__avatar" aria-hidden="true">
                {avatarLabel}
              </div>
              <div className="message__main">
                <div className="message__bubble">
                  {msg.isPending && !msg.text ? (
                    <div className="typing-indicator" aria-label="Bot is typing">
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={renderers}>
                      {msg.text}
                    </ReactMarkdown>
                  )}
                </div>
                {msg.citations && msg.citations.length > 0 && (
                  <div className="citation-list">
                    {msg.citations.map((citation) => (
                      <span key={citation.citation} className="citation-item">
                        {citation.fileName} | L{citation.startLine}-{citation.endLine} | score{' '}
                        {citation.score?.toFixed ? citation.score.toFixed(2) : citation.score}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage();
        }}
      >
        <div className="composer__field">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            className="composer__input"
            placeholder="Ask a question about the ingested files..."
            aria-label="Chat input"
            rows={1}
          />
          <div className="composer__actions">
            <button
              type="submit"
              className="send-button"
              aria-label="Send message"
              disabled={isLoading || !input.trim()}
            >
              <svg className="send-button__icon" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path fill="currentColor" d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>
        <p className="composer__hint">Shift + Enter for a new line</p>
      </form>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        onConfirm={confirmClearChat}
        title="Confirm Clear Chat"
        confirmLabel="Clear"
      >
        <p>Are you sure you want to clear the chat history?</p>
      </Modal>
    </div>
  );
};

export default Chat;
