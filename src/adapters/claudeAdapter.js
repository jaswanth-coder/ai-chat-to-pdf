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
    return turns.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }

  extractMessageData(element) {
    const isUser = element.classList.contains('font-user-message') ||
                    element.querySelector('.font-user-message') !== null ||
                    element.closest('[data-testid*="user-message"]') !== null;

    const role = isUser ? 'user' : 'assistant';
    const authorName = isUser ? 'You' : 'Claude';

    const contentElement = element.querySelector('.font-claude-message') ||
                           element.querySelector('.font-user-message') ||
                           element.querySelector('[class*="markdown"]') ||
                           element;

    let contentHtml = '';
    if (window.ChatPdfUtils && window.ChatPdfUtils.cleanCloneForPrint) {
      const cleanNode = window.ChatPdfUtils.cleanCloneForPrint(contentElement);
      contentHtml = cleanNode ? cleanNode.innerHTML : '';
    }

    let text = '';
    if (contentElement) {
      text = (contentElement.innerText || contentElement.textContent || '').replace(/\s+/g, ' ').trim();
    }

    let id = element.dataset.chatPdfId;
    if (!id) {
      id = window.ChatPdfUtils ? window.ChatPdfUtils.getStableId(element, 'claude', role, text) : `claude-${Date.now()}`;
      element.dataset.chatPdfId = id;
    }

    return {
      id,
      turnIndex: 0,
      role,
      authorName,
      text,
      contentElement,
      contentHtml,
      timestamp: window.ChatPdfUtils ? window.ChatPdfUtils.formatDate() : new Date().toLocaleDateString()
    };
  }
}

window.ClaudeAdapter = ClaudeAdapter;
