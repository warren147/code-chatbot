const { BaseChatMessageHistory } = require('@langchain/core/chat_history');
const { AIMessage, HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { randomUUID } = require('crypto');
const config = require('../config/env');
const db = require('../db');

const selectMessagesStmt = db.prepare(`
  SELECT role, content
  FROM messages
  WHERE conversation_id = ?
  ORDER BY datetime(created_at) ASC
`);

const selectMessagesLimitedStmt = db.prepare(`
  SELECT role, content
  FROM messages
  WHERE conversation_id = ?
  ORDER BY datetime(created_at) DESC
  LIMIT ?
`);

const insertMessageStmt = db.prepare(`
  INSERT INTO messages (id, conversation_id, role, content, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

const deleteMessagesStmt = db.prepare(`
  DELETE FROM messages WHERE conversation_id = ?
`);

function toLangChainMessage(row) {
  switch (row.role) {
    case 'user':
      return new HumanMessage({ content: row.content });
    case 'assistant':
      return new AIMessage({ content: row.content });
    case 'system':
      return new SystemMessage({ content: row.content });
    default:
      return new AIMessage({ content: row.content });
  }
}

function toStoredRole(message) {
  const type =
    typeof message?.getType === 'function'
      ? message.getType()
      : typeof message?._getType === 'function'
      ? message._getType()
      : message?.type;

  switch (type) {
    case 'human':
      return 'user';
    case 'ai':
      return 'assistant';
    case 'system':
      return 'system';
    default:
      return 'assistant';
  }
}

function normalizeContent(content) {
  if (typeof content === 'string') return content;
  if (content === null || content === undefined) return '';
  try {
    return JSON.stringify(content);
  } catch (error) {
    return String(content);
  }
}

class SQLiteChatMessageHistory extends BaseChatMessageHistory {
  constructor({ conversationId }) {
    super();
    this.conversationId = conversationId;
  }

  async getMessages() {
    let rows;
    if (config.maxHistoryMessages > 0) {
      rows = selectMessagesLimitedStmt.all(
        this.conversationId,
        config.maxHistoryMessages
      );
      rows.reverse();
    } else {
      rows = selectMessagesStmt.all(this.conversationId);
    }
    return rows.map(toLangChainMessage);
  }

  async addMessage(message) {
    const role = toStoredRole(message);
    const content = normalizeContent(message?.content);
    insertMessageStmt.run(
      randomUUID(),
      this.conversationId,
      role,
      content,
      new Date().toISOString()
    );
  }

  async addMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return;
    const timestamp = new Date().toISOString();
    const transaction = db.transaction(() => {
      messages.forEach((message) => {
        const role = toStoredRole(message);
        const content = normalizeContent(message?.content);
        insertMessageStmt.run(randomUUID(), this.conversationId, role, content, timestamp);
      });
    });
    transaction();
  }

  async clear() {
    deleteMessagesStmt.run(this.conversationId);
  }
}

module.exports = { SQLiteChatMessageHistory };
