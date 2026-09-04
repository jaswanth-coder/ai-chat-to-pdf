/**
 * ChatGPT Adapter for chatgpt.com & chat.openai.com
 * Handles user prompts, uploaded screenshots/images, assistant answers, code, and KaTeX equations.
 */
class ChatGPTAdapter extends BaseAdapter {
  constructor() {
    super('ChatGPT');
  }

  isMatching() {
    const host = window.location.hostname;
    return host === 'chatgpt.com' || host === 'chat.openai.com' || host.endsWith('.chatgpt.com');
  }

  getChatTitle() {
    const titleBtn = document.querySelector('button[data-testid*="conversation-title"], header h1, [data-testid="chat-title"]');
    if (titleBtn && titleBtn.textContent.trim()) {
      return titleBtn.textContent.trim();
    }

    let title = document.title || 'ChatGPT Conversation';
    title = title.replace(/\s*-\s*ChatGPT$/i, '').trim();
    return title || 'ChatGPT Conversation';
  }

  /**
   * Dual-pass turn detector: guarantees finding both user prompts AND assistant responses
   */
  getMessageElements() {
    // 1. Primary: conversation turn containers (OpenAI standard for all turns)
    const turns = Array.from(document.querySelectorAll('div[data-testid^="conversation-turn"]'));
    if (turns.length > 0) {
      return turns;
    }

    // 2. Secondary: collect all role containers, articles, and user message wrappers
    const roleNodes = Array.from(document.querySelectorAll('[data-message-author-role]'));
    const articles = Array.from(document.querySelectorAll('article'));
    const userPrompts = Array.from(document.querySelectorAll('[class*="user-message"], [data-testid*="user"]'));

    const candidateSet = new Set();
    [...turns, ...roleNodes, ...articles, ...userPrompts].forEach(el => {
      const parentTurn = el.closest('[data-testid^="conversation-turn"]') || el.closest('article') || el;
      candidateSet.add(parentTurn);
    });

    return Array.from(candidateSet);
  }

  /**
   * Robust turn data extractor
   */
  extractMessageData(element) {
    // Extract turn index from testid if available (e.g. conversation-turn-4 -> 4)
    const testId = element.getAttribute('data-testid') || element.closest('[data-testid]')?.getAttribute('data-testid') || '';
    const match = testId.match(/conversation-turn-(\d+)/);
    let turnIndex = match ? parseInt(match[1], 10) : -1;

    if (turnIndex === -1) {
      const allTurns = this.getMessageElements();
      turnIndex = allTurns.indexOf(element);
      if (turnIndex === -1) turnIndex = 0;
    }

    const id = `turn-${turnIndex}`;
    element.dataset.chatPdfId = id;

    // Detect role (user vs assistant)
    let role = 'assistant';
    const roleAttr = element.getAttribute('data-message-author-role');
    const userChild = element.querySelector('[data-message-author-role="user"]');
    const assistantChild = element.querySelector('[data-message-author-role="assistant"]');

    if (roleAttr === 'user' || userChild) {
      role = 'user';
    } else if (roleAttr === 'assistant' || assistantChild) {
      role = 'assistant';
    } else if (element.querySelector('.markdown, .prose') && !element.querySelector('[data-message-author-role="user"]')) {
      role = 'assistant';
    } else {
      // Even turns are user, odd turns are assistant in ChatGPT turn indexing
      role = (turnIndex % 2 === 0) ? 'user' : 'assistant';
    }

    const isUser = role === 'user';
    const authorName = isUser ? 'You' : 'ChatGPT';

    // Content element
    let contentElement = element;
    if (!isUser) {
      contentElement = element.querySelector('.markdown') || 
                       element.querySelector('.prose') || 
                       element.querySelector('[data-message-author-role="assistant"]') || 
                       element;
    }

    // Pre-harvest clean HTML string so it survives React DOM unmounting
    let contentHtml = '';
    if (window.ChatPdfUtils && window.ChatPdfUtils.cleanCloneForPrint) {
      const cleanNode = window.ChatPdfUtils.cleanCloneForPrint(contentElement);
      contentHtml = cleanNode ? cleanNode.innerHTML : '';
    }

    // Extract plain text snippet for index display
    let text = '';
    if (contentElement) {
      text = (contentElement.innerText || contentElement.textContent || '').replace(/\s+/g, ' ').trim();
    }

    return {
      id,
      turnIndex,
      role,
      authorName,
      text,
      contentElement,
      contentHtml,
      timestamp: window.ChatPdfUtils.formatDate()
    };
  }
}

window.ChatGPTAdapter = ChatGPTAdapter;
