const DEFAULT_MEMORY = Object.freeze({
  preferences: {
    verbosity: 'default',
    format: 'default',
    tone: 'default',
  },
  facts: {
    user_goals: [],
    project_context: [],
  },
  constraints: {
    do_not: [],
  },
});

function cloneDefaultMemory() {
  return JSON.parse(JSON.stringify(DEFAULT_MEMORY));
}

function normalizeMemory(raw) {
  if (!raw || typeof raw !== 'object') {
    return cloneDefaultMemory();
  }
  const memory = cloneDefaultMemory();
  const preferences = raw.preferences && typeof raw.preferences === 'object' ? raw.preferences : {};
  const facts = raw.facts && typeof raw.facts === 'object' ? raw.facts : {};
  const constraints = raw.constraints && typeof raw.constraints === 'object' ? raw.constraints : {};

  if (typeof preferences.verbosity === 'string') {
    memory.preferences.verbosity = preferences.verbosity.toLowerCase();
  }
  if (typeof preferences.format === 'string') {
    memory.preferences.format = preferences.format.toLowerCase();
  }
  if (typeof preferences.tone === 'string') {
    memory.preferences.tone = preferences.tone.toLowerCase();
  }

  if (Array.isArray(facts.user_goals)) {
    memory.facts.user_goals = facts.user_goals.slice(0);
  }
  if (Array.isArray(facts.project_context)) {
    memory.facts.project_context = facts.project_context.slice(0);
  }

  if (Array.isArray(constraints.do_not)) {
    memory.constraints.do_not = constraints.do_not.slice(0);
  }

  return memory;
}

function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lastMatchIndex(text, patterns) {
  let last = -1;
  patterns.forEach((pattern) => {
    const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    for (const match of text.matchAll(regex)) {
      if (typeof match.index === 'number' && match.index > last) {
        last = match.index;
      }
    }
  });
  return last;
}

const SHORT_PATTERNS = [
  /\bshort answer(?:s)? only\b/,
  /\bshort response(?:s)? only\b/,
  /\bkeep it short\b/,
  /\bkeep this short\b/,
  /\bbe brief\b/,
  /\bbrief answer\b/,
  /\bbrief response\b/,
];

const LONG_PATTERNS = [
  /\blong answer(?:s)? only\b/,
  /\blong response(?:s)? only\b/,
  /\bbe detailed\b/,
  /\bmore detail\b/,
  /\bgo deeper\b/,
  /\bdeep dive\b/,
  /\bthorough\b/,
  /\bverbose\b/,
];

const RESET_PATTERNS = [
  /\bgo back to normal\b/,
  /\bback to normal\b/,
  /\breset preference(?:s)?\b/,
  /\breset verbosity\b/,
  /\bdefault answer(?:s)?\b/,
  /\bdefault response(?:s)?\b/,
  /\bignore that\b/,
  /\bforget that\b/,
];

function updateMemoryFromUserMessage(memory, text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return { memory, updated: false };
  }

  const shortIndex = lastMatchIndex(normalized, SHORT_PATTERNS);
  const longIndex = lastMatchIndex(normalized, LONG_PATTERNS);
  const resetIndex = lastMatchIndex(normalized, RESET_PATTERNS);
  const lastIndex = Math.max(shortIndex, longIndex, resetIndex);

  if (lastIndex === -1) {
    return { memory, updated: false };
  }

  const nextMemory = normalizeMemory(memory);
  const currentVerbosity = nextMemory.preferences.verbosity;

  let nextVerbosity = currentVerbosity;
  if (lastIndex === resetIndex) {
    nextVerbosity = 'default';
  } else if (lastIndex === shortIndex) {
    nextVerbosity = 'short';
  } else if (lastIndex === longIndex) {
    nextVerbosity = 'long';
  }

  if (nextVerbosity === currentVerbosity) {
    return { memory: nextMemory, updated: false };
  }

  nextMemory.preferences.verbosity = nextVerbosity;
  return { memory: nextMemory, updated: true };
}

function formatPreferencePrompt(memory) {
  if (!memory || !memory.preferences) return '';
  const { verbosity, format, tone } = memory.preferences;
  return [
    'Conversation preferences:',
    `verbosity=${verbosity || 'default'}`,
    `format=${format || 'default'}`,
    `tone=${tone || 'default'}`,
    'Always follow the latest stored preference.',
  ].join(' ');
}

function getVerbositySettings(memory) {
  const verbosity = memory?.preferences?.verbosity || 'default';
  if (verbosity === 'short') {
    return {
      maxTokens: 300,
      instruction: 'Keep the response concise (roughly 3-6 sentences).',
    };
  }
  if (verbosity === 'long') {
    return {
      maxTokens: 1200,
      instruction: 'Provide a detailed, thorough response.',
    };
  }
  return {
    maxTokens: 800,
    instruction: '',
  };
}

module.exports = {
  cloneDefaultMemory,
  formatPreferencePrompt,
  getVerbositySettings,
  normalizeMemory,
  updateMemoryFromUserMessage,
};
