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

  getMessageElements() {
    // 1. ChatGPT tags every user and assistant turn with [data-message-author-role]
    const roleElements = Array.from(document.querySelectorAll('[data-message-author-role]'));
    if (roleElements.length > 0) {
      return roleElements;
    }

    // 2. Fallback: conversation turns (data-testid="conversation-turn-0", etc.)
    const turns = Array.from(document.querySelectorAll('div[data-testid^="conversation-turn"]'));
    if (turns.length > 0) {
      return turns;
    }

    // 3. Fallback: articles + any user message wrappers
    const articles = Array.from(document.querySelectorAll('article'));
    const userPrompts = Array.from(document.querySelectorAll('[class*="user-message"], [data-testid*="user"]'));
    const combined = [...articles, ...userPrompts].filter((el, idx, arr) => arr.indexOf(el) === idx);
    if (combined.length > 0) {
      return combined;
    }

    return [];
  }

  extractMessageData(element) {
    let id = element.dataset.chatPdfId;
    if (!id) {
      id = window.ChatPdfUtils.generateId('gpt');
      element.dataset.chatPdfId = id;
    }

    // Determine role (user vs assistant)
    let role = 'assistant';
    const roleAttr = element.getAttribute('data-message-author-role');
    if (roleAttr === 'user') {
      role = 'user';
    } else if (roleAttr === 'assistant') {
      role = 'assistant';
    } else {
      if (element.querySelector('[data-message-author-role="user"]') ||
          element.querySelector('[data-testid*="user"], img[alt*="User"]')) {
        role = 'user';
      }
    }

    const isUser = role === 'user';
    const authorName = isUser ? 'You' : 'ChatGPT';

    // Content container
    let contentElement = null;
    if (isUser) {
      // For user messages, take the whole turn container so screenshots/images AND prompt text are both preserved
      contentElement = element;
    } else {
      // For assistant messages, prefer .markdown or .prose container
      contentElement = element.querySelector('.markdown') || 
                       element.querySelector('.prose') || 
                       element;
    }

    return {
      id,
      role,
      authorName,
      contentElement,
      timestamp: window.ChatPdfUtils.formatDate()
    };
  }
}

window.ChatGPTAdapter = ChatGPTAdapter;
