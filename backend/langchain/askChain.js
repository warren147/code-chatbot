const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { RunnableWithMessageHistory } = require('@langchain/core/runnables');
const { ChatOpenAI } = require('@langchain/openai');
const config = require('../config/env');
const { SQLiteChatMessageHistory } = require('./sqliteMessageHistory');

const chainCache = new Map();

function buildPrompt() {
  return ChatPromptTemplate.fromMessages([
    ['system', '{systemMessage}'],
    new MessagesPlaceholder('history'),
    [
      'human',
      'Relevant snippets:\n{snippetsText}\n\nUser question:\n{question}',
    ],
  ]);
}

function getAskChain({ streaming, maxTokens }) {
  const cacheKey = `${streaming ? 'stream' : 'invoke'}:${maxTokens || 'default'}`;
  if (chainCache.has(cacheKey)) {
    return chainCache.get(cacheKey);
  }

  const llm = new ChatOpenAI({
    apiKey: config.openAiApiKey,
    model: 'gpt-4o-mini',
    maxTokens,
    streaming: Boolean(streaming),
  });

  const prompt = buildPrompt();
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  const chainWithHistory = new RunnableWithMessageHistory({
    runnable: chain,
    getMessageHistory: (sessionId) =>
      new SQLiteChatMessageHistory({ conversationId: sessionId }),
    inputMessagesKey: 'question',
    historyMessagesKey: 'history',
  });

  chainCache.set(cacheKey, chainWithHistory);
  return chainWithHistory;
}

module.exports = { getAskChain };
