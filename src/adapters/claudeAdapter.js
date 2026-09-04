/**
 * Claude Adapter for claude.ai
 */
class ClaudeAdapter extends BaseAdapter {
  constructor() {
    super('Claude');
  }

  isMatching() {
    return window.location.hostname === 'claude.ai' || window.location.hostname.endsWith('.claude.ai');
  }

  getChatTitle() {
    const titleEl = document.querySelector('[data-testid="chat-title"], header h1, div[class*="ChatTitle"]');
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim();
    }
    let title = document.title || 'Claude Conversation';
    title = title.replace(/\s*-\s*Claude$/i, '').trim();
    return title || 'Claude Conversation';
  }

  getMessageElements() {
    // Claude usually groups turns in containers with user or assistant messages
    let turns = Array.from(document.querySelectorAll('[data-test-render-count], .font-claude-message, .font-user-message'));
    if (turns.length === 0) {
      turns = Array.from(document.querySelectorAll('div[data-is-streaming], div[class*="MessageRow"]'));
    }
    if (turns.length === 0) {
      // General turn fallback
      turns = Array.from(document.querySelectorAll('div[class*="standard-markdown"], div[class*="font-user-message"]'));
    }
    return turns;
  }

  extractMessageData(element) {
    let id = element.dataset.chatPdfId;
    if (!id) {
      id = window.ChatPdfUtils.generateId('claude');
      element.dataset.chatPdfId = id;
    }

    const isUser = element.classList.contains('font-user-message') ||
                    element.querySelector('.font-user-message') !== null ||
                    element.closest('[data-testid*="user-message"]') !== null;

    const role = isUser ? 'user' : 'assistant';
    const authorName = isUser ? 'You' : 'Claude';

    const contentElement = element.querySelector('.font-claude-message') ||
                           element.querySelector('.font-user-message') ||
                           element.querySelector('[class*="markdown"]') ||
                           element;

    return {
      id,
      role,
      authorName,
      contentElement,
      timestamp: window.ChatPdfUtils.formatDate()
    };
  }
}

window.ClaudeAdapter = ClaudeAdapter;
