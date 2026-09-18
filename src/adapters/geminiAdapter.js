/**
 * Google Gemini Adapter for gemini.google.com
 */
class GeminiAdapter extends BaseAdapter {
  constructor() {
    super('Gemini');
  }

  isMatching() {
    return window.location.hostname === 'gemini.google.com';
  }

  getChatTitle() {
    const titleEl = document.querySelector('conversations-list-item[selected] .title, [data-test-id="chat-title"], header h1');
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim();
    }
    let title = document.title || 'Gemini Conversation';
    title = title.replace(/\s*-\s*Google\s*Gemini$/i, '').replace(/\s*-\s*Gemini$/i, '').trim();
    return title || 'Gemini Conversation';
  }

  getMessageElements() {
    // Gemini uses custom web components <user-query> and <model-response>
    let turns = Array.from(document.querySelectorAll('user-query, model-response'));
    if (turns.length === 0) {
      turns = Array.from(document.querySelectorAll('.query-container, .response-container, .conversation-container'));
    }
    if (turns.length === 0) {
      turns = Array.from(document.querySelectorAll('message-content, .message-content'));
    }
    return turns.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }

  extractMessageData(element) {
    const tagName = element.tagName.toLowerCase();
    const isUser = tagName === 'user-query' ||
                   element.classList.contains('query-container') ||
                   element.querySelector('.user-query') !== null ||
                   element.querySelector('.query-content') !== null ||
                   element.querySelector('user-query') !== null;

    const role = isUser ? 'user' : 'assistant';
    const authorName = isUser ? 'You' : 'Gemini';

    const contentElement = element.querySelector('.query-text') ||
                           element.querySelector('.query-content') ||
                           element.querySelector('.model-response-text') ||
                           element.querySelector('.markdown') ||
                           element.querySelector('message-content') ||
                           element;

    let contentHtml = '';
    if (window.ChatPdfUtils && window.ChatPdfUtils.cleanCloneForPrint) {
      const cleanNode = window.ChatPdfUtils.cleanCloneForPrint(contentElement);
      contentHtml = cleanNode ? cleanNode.innerHTML : '';
    }

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

    const id = window.ChatPdfUtils ? window.ChatPdfUtils.getStableId(element, 'gemini', role, text) : `gemini-${Date.now()}`;
    element.dataset.chatPdfId = id;

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

window.GeminiAdapter = GeminiAdapter;
