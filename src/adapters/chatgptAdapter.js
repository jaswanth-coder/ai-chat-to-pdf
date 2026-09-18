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
    // Collect all conversation turns, articles, and role nodes
    const nodes = Array.from(document.querySelectorAll(
      '[data-testid^="conversation-turn"], article, [data-message-author-role], [class*="user-message"]'
    ));

    const candidateSet = new Set();
    nodes.forEach(el => {
      const parentTurn = el.closest('[data-testid^="conversation-turn"]') || el.closest('article') || el;
      candidateSet.add(parentTurn);
    });

    return Array.from(candidateSet).sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }

  /**
   * Robust turn data extractor
   */
  extractMessageData(element) {
    // Extract turn index from testid if available (e.g. conversation-turn-4 -> 4)
    const testId = element.getAttribute('data-testid') || element.closest('[data-testid]')?.getAttribute('data-testid') || '';
    const match = testId.match(/conversation-turn-(\d+)/);
    let turnIndex = match ? parseInt(match[1], 10) : -1;

    // Detect role (user vs assistant)
    let role = 'assistant';
    const roleAttr = element.getAttribute('data-message-author-role');
    const userChild = element.querySelector('[data-message-author-role="user"], [class*="user-message"], [data-testid*="user"], [class*="human"]');
    const assistantChild = element.querySelector('[data-message-author-role="assistant"]');
    const hasUserImage = (element.querySelector('img, [class*="attachment" i], button[aria-label*="image" i]') !== null) && 
                         !element.querySelector('.markdown, .prose, [data-message-author-role="assistant"]');

    if (roleAttr === 'user' || userChild || hasUserImage) {
      role = 'user';
    } else if (roleAttr === 'assistant' || assistantChild) {
      role = 'assistant';
    } else if (element.querySelector('.markdown, .prose') && !element.querySelector('[data-message-author-role="user"]')) {
      role = 'assistant';
    } else if (turnIndex !== -1) {
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

    // Extract plain text snippet for index display (including image labels)
    let text = '';
    if (contentElement) {
      text = (contentElement.innerText || contentElement.textContent || '').replace(/\s+/g, ' ').trim();
      const imgs = (contentElement || element).querySelectorAll('img');
      if (imgs.length > 0) {
        const imgDetails = Array.from(imgs).map(img => img.alt || img.title || '').filter(Boolean);
        const imgLabel = imgDetails.length > 0 
          ? `🖼️ [Image: ${imgDetails.join(', ').slice(0, 50)}]` 
          : `🖼️ [${imgs.length > 1 ? imgs.length + ' Images' : 'Attached Image'}]`;
        text = text ? `${imgLabel} ${text}` : imgLabel;
      }
    }

    // Always compute stable ID dynamically to prevent DOM recycling collisions
    let id = '';
    if (match) {
      id = `turn-${match[1]}`;
    } else if (window.ChatPdfUtils) {
      id = window.ChatPdfUtils.getStableId(element, 'chatgpt', role, text);
    } else {
      id = `turn-${Date.now()}`;
    }
    element.dataset.chatPdfId = id;

    return {
      id,
      turnIndex: turnIndex >= 0 ? turnIndex : 0,
      role,
      authorName,
      text,
      contentElement,
      contentHtml,
      timestamp: window.ChatPdfUtils ? window.ChatPdfUtils.formatDate() : new Date().toLocaleDateString()
    };
  }

  /**
   * Fast Zero-Scroll Conversation Preloader via ChatGPT internal session API
   * Fetches the entire conversation tree instantly without scrolling when available.
   */
  async fetchConversationApi() {
    try {
      const match = window.location.pathname.match(/\/c\/([a-f0-9-]+)/i);
      if (!match) return null;
      const conversationId = match[1];

      // 1. Get current session access token
      const sessionRes = await fetch('/api/auth/session', { credentials: 'include' });
      if (!sessionRes.ok) return null;
      const sessionData = await sessionRes.json();
      const accessToken = sessionData?.accessToken;
      if (!accessToken) return null;

      // 2. Fetch full conversation tree
      const convRes = await fetch(`/backend-api/conversation/${conversationId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      if (!convRes.ok) return null;
      const convData = await convRes.json();
      if (!convData || !convData.mapping || !convData.current_node) return null;

      // 3. Traverse mapping from current_node backwards to root to preserve 100% chronological order
      const rawList = [];
      let curr = convData.current_node;
      while (curr && convData.mapping[curr]) {
        const node = convData.mapping[curr];
        if (node.message && (node.message.author?.role === 'user' || node.message.author?.role === 'assistant')) {
          const parts = node.message.content?.parts || [];
          let text = '';
          parts.forEach(p => {
            if (typeof p === 'string') {
              text += p;
            } else if (p && typeof p.text === 'string') {
              text += p.text;
            } else if (p && p.asset_pointer) {
              text += '🖼️ [Attached Image] ';
            }
          });
          text = text.trim();

          const role = node.message.author.role;
          const authorName = role === 'user' ? 'You' : 'ChatGPT';
          const msgId = node.message.id;

          // Generate rich structured HTML preserving headings, lists, tables, code, and math
          const contentHtml = window.ChatPdfUtils ? window.ChatPdfUtils.formatTextToHtml(text) : '';

          rawList.push({
            id: `chatgpt-${msgId}`,
            role,
            authorName,
            text,
            contentElement: null,
            contentHtml,
            timestamp: node.message.create_time ? new Date(node.message.create_time * 1000).toLocaleString() : (window.ChatPdfUtils ? window.ChatPdfUtils.formatDate() : '')
          });
        }
        curr = node.parent;
      }

      // Reverse so messages are in order from first prompt to last
      const orderedMessages = rawList.reverse();
      orderedMessages.forEach((msg, idx) => {
        msg.turnIndex = idx;
      });

      return orderedMessages;
    } catch (e) {
      console.warn('ChatGPT instant API preload unavailable, falling back to virtual scroll harvester.', e);
      return null;
    }
  }
}

window.ChatGPTAdapter = ChatGPTAdapter;
