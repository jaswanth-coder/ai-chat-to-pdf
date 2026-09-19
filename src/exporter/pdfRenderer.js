/**
 * PDF Renderer for AI Chats
 * Generates an isolated, beautifully formatted print document for crisp vector PDF export.
 * Includes official bundled KaTeX CSS and sorts messages by turnIndex.
 */
class ChatPdfRenderer {
  constructor() {
    this.iframe = null;
  }

  /**
   * Render and trigger PDF download for selected messages
   * @param {Object} options
   * @param {string} options.title
   * @param {string} options.providerName
   * @param {Array<Object>} options.messages - Array of { id, turnIndex, role, authorName, contentElement, contentHtml, timestamp }
   * @param {Object} options.settings - Settings from extension popup or defaults
   */
  async exportToPdf({ title, providerName, messages, settings = {} }) {
    if (!messages || messages.length === 0) {
      alert('Please select at least one message to export.');
      return;
    }

    // Sort messages strictly by turnIndex so chronological sequence is 100% preserved
    const sortedMessages = [...messages].sort((a, b) => {
      const idxA = (typeof a.turnIndex === 'number') ? a.turnIndex : 0;
      const idxB = (typeof b.turnIndex === 'number') ? b.turnIndex : 0;
      return idxA - idxB;
    });

    const {
      theme = 'light',
      includeTimestamps = true,
      includeHeader = true,
      fontSize = 'medium'
    } = settings;

    // Remove existing print iframe
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }

    this.iframe = document.createElement('iframe');
    this.iframe.style.position = 'fixed';
    this.iframe.style.right = '0';
    this.iframe.style.bottom = '0';
    this.iframe.style.width = '1px';
    this.iframe.style.height = '1px';
    this.iframe.style.border = '0';
    this.iframe.style.opacity = '0.01';
    this.iframe.style.pointerEvents = 'none';
    this.iframe.id = 'chat-pdf-print-frame';
    document.body.appendChild(this.iframe);

    const doc = this.iframe.contentWindow.document;
    doc.open();

    const formattedMessagesHtml = sortedMessages.map((msg, index) => {
      const isUser = msg.role === 'user';
      const roleClass = isUser ? 'msg-user' : 'msg-assistant';
      const roleBadgeClass = isUser ? 'badge-user' : 'badge-assistant';
      const avatarIcon = isUser ? '👤' : (providerName === 'Claude' ? '🟣' : (providerName === 'Gemini' ? '✨' : '🤖'));
      
      // Prioritize live DOM element clone so active images, code, and KaTeX are captured
      let contentHtml = '';
      if (msg.contentElement && document.contains(msg.contentElement)) {
        const cleanContent = window.ChatPdfUtils.cleanCloneForPrint(msg.contentElement);
        if (cleanContent && cleanContent.innerHTML.trim()) {
          contentHtml = cleanContent.innerHTML;
        }
      }
      if (!contentHtml && msg.contentHtml) {
        contentHtml = msg.contentHtml;
      }
      if (!contentHtml && msg.text && window.ChatPdfUtils && window.ChatPdfUtils.formatTextToHtml) {
        contentHtml = window.ChatPdfUtils.formatTextToHtml(msg.text);
      }

      return `
        <article class="message-card ${roleClass}">
          <div class="message-header">
            <span class="role-badge ${roleBadgeClass}">
              <span class="role-icon">${avatarIcon}</span>
              <span class="role-name">${window.ChatPdfUtils.escapeHtml(msg.authorName)}</span>
            </span>
            ${includeTimestamps && msg.timestamp ? `<span class="message-time">${window.ChatPdfUtils.escapeHtml(msg.timestamp)}</span>` : ''}
            <span class="message-index">#${index + 1}</span>
          </div>
          <div class="message-body markdown-body">
            ${contentHtml || ''}
          </div>
        </article>
      `;
    }).join('\n');

    // Bundled official KaTeX CSS
    const embeddedKaTeXCss = window.KATEX_EMBEDDED_CSS || '';

    // Safe typography/code styles from host
    const hostStylesheets = this._getFilteredHostStyles();

    const fullHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>${window.ChatPdfUtils.escapeHtml(title)}</title>
        <!-- Official KaTeX Mathematical Engine Styles -->
        <style id="chat-pdf-katex-bundled">
          ${embeddedKaTeXCss}
        </style>
        ${hostStylesheets}
        <style id="chat-pdf-print-styles">
          ${this._getPrintStyles(theme, fontSize)}
        </style>
      </head>
      <body>
        ${includeHeader ? `
          <header class="export-header">
            <div class="header-main">
              <h1 class="chat-title">${window.ChatPdfUtils.escapeHtml(title)}</h1>
              <div class="chat-meta">
                <span class="meta-tag platform-tag">${window.ChatPdfUtils.escapeHtml(providerName)}</span>
                <span class="meta-tag date-tag">📅 ${window.ChatPdfUtils.formatDate()}</span>
                <span class="meta-tag count-tag">💬 ${sortedMessages.length} message${sortedMessages.length === 1 ? '' : 's'}</span>
              </div>
            </div>
          </header>
        ` : ''}

        <main class="chat-thread">
          ${formattedMessagesHtml}
        </main>

        <footer class="export-footer">
          <span>Exported via AI Chat to PDF Extension (${sortedMessages.length} messages)</span>
        </footer>
      </body>
      </html>
    `;

    doc.write(fullHtml);
    doc.close();

    // Wait for fonts and images in iframe to fully settle
    await this._waitForReady(doc);

    try {
      this.iframe.contentWindow.focus();
      this.iframe.contentWindow.print();
    } catch (err) {
      console.error('Print trigger failed:', err);
    }
  }

  /**
   * Extract safe syntax highlighting and font stylesheets from host page
   */
  _getFilteredHostStyles() {
    let html = '';
    const styleElements = document.querySelectorAll('style, link[rel="stylesheet"]');
    styleElements.forEach(el => {
      if (el.href && el.href.includes('src/styles.css')) return;

      if (el.tagName.toLowerCase() === 'link') {
        const href = el.getAttribute('href') || '';
        if (href.includes('font') || href.includes('prism') || href.includes('highlight') || href.includes('cdn.oaistatic.com')) {
          html += el.outerHTML + '\n';
        }
      } else if (el.tagName.toLowerCase() === 'style') {
        const text = el.textContent || '';
        if (!text.includes('overflow:hidden') && !text.includes('height:100%')) {
          html += el.outerHTML + '\n';
        }
      }
    });
    return html;
  }

  /**
   * Wait until images and KaTeX fonts have loaded
   */
  async _waitForReady(doc) {
    if (doc.fonts && doc.fonts.ready) {
      try {
        await Promise.race([
          doc.fonts.ready,
          new Promise(resolve => setTimeout(resolve, 2000))
        ]);
      } catch (e) {
        console.warn('Font loading check skipped:', e);
      }
    }

    const images = Array.from(doc.images || []);
    if (images.length > 0) {
      const imagePromises = images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 2000);
        });
      });
      await Promise.race([
        Promise.all(imagePromises),
        new Promise(resolve => setTimeout(resolve, 2500))
      ]);
    }

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  /**
   * Print layout and typography styling
   */
  _getPrintStyles(theme, fontSize) {
    const fontSizeMap = {
      small: '12px',
      medium: '14px',
      large: '16px'
    };
    const baseSize = fontSizeMap[fontSize] || '14px';

    return `
      @page {
        size: A4;
        margin: 14mm 12mm 14mm 12mm;
        @bottom-right {
          content: counter(page);
        }
      }

      * {
        box-sizing: border-box !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      html, body {
        height: auto !important;
        min-height: auto !important;
        max-height: none !important;
        overflow: visible !important;
        overflow-x: visible !important;
        overflow-y: visible !important;
        position: static !important;
        display: block !important;
        background-color: #ffffff !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: ${baseSize};
        line-height: 1.6;
        color: #1e293b;
      }

      .export-header {
        border-bottom: 2px solid #e2e8f0;
        padding-bottom: 12px;
        margin-bottom: 20px;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }

      .chat-title {
        font-size: 20px;
        font-weight: 700;
        color: #0f172a;
        margin: 0 0 8px 0;
        word-break: break-word;
      }

      .chat-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 11px;
        color: #64748b;
      }

      .meta-tag {
        background-color: #f1f5f9;
        border: 1px solid #e2e8f0;
        padding: 2px 8px;
        border-radius: 6px;
        font-weight: 500;
      }

      .platform-tag {
        background-color: #ecfdf5;
        color: #065f46;
        border-color: #a7f3d0;
        font-weight: 600;
      }

      .chat-thread {
        display: block !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      .message-card {
        display: block !important;
        width: 100% !important;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 14px 16px;
        background-color: #ffffff;
        margin-bottom: 18px !important;
        page-break-inside: auto !important;
        break-inside: auto !important;
        position: relative;
        box-sizing: border-box;
      }

      .message-card.msg-user {
        background-color: #f8fafc;
        border-color: #cbd5e1;
        border-left: 4px solid #3b82f6;
      }

      .message-card.msg-assistant {
        background-color: #ffffff;
        border-left: 4px solid #10a37f;
      }

      .message-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
        font-size: 12px;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }

      .role-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 12px;
      }

      .badge-user {
        background-color: #eff6ff;
        color: #1d4ed8;
      }

      .badge-assistant {
        background-color: #f0fdf4;
        color: #15803d;
      }

      .message-time {
        color: #94a3b8;
        font-size: 11px;
      }

      .message-index {
        margin-left: auto;
        color: #94a3b8;
        font-size: 11px;
        font-weight: 600;
      }

      .message-body {
        display: block !important;
        overflow: visible !important;
        max-height: none !important;
        height: auto !important;
        word-break: break-word;
      }

      /* Mathematical Formulas & KaTeX */
      .chat-pdf-math-container {
        margin: 14px 0;
        padding: 12px 18px;
        background-color: #f8fafc;
        border: 1px solid #e2e8f0;
        border-left: 4px solid #7c3aed;
        border-radius: 8px;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .chat-pdf-math-label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: #7c3aed;
        margin-bottom: 6px;
      }

      .katex {
        text-rendering: auto !important;
        color: #0f172a !important;
        font-size: 1.05em !important;
      }

      .katex-display {
        display: block !important;
        margin: 0.6em 0 !important;
        text-align: center !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        overflow-x: auto;
      }

      /* Images (Generated DALL-E, Screenshots, Attachments) */
      .chat-pdf-image-figure {
        margin: 16px auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background-color: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 10px;
        max-width: 96%;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .chat-pdf-image-figure img,
      .chat-pdf-attachment-image img,
      .message-body img {
        max-width: 100%;
        max-height: 520px;
        width: auto;
        height: auto;
        border-radius: 6px;
        display: block;
        margin: 0 auto;
        object-fit: contain;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .chat-pdf-image-caption {
        font-size: 11px;
        font-weight: 500;
        color: #64748b;
        margin-top: 8px;
        text-align: center;
        font-style: italic;
      }

      .chat-pdf-attachment-image {
        margin: 12px 0;
        display: block;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      /* Code Blocks & Syntax Segregation */
      .chat-pdf-code-container {
        margin: 14px 0;
        border-radius: 8px;
        border: 1px solid #334155;
        background-color: #0f172a;
        overflow: hidden;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.12);
      }

      .chat-pdf-code-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background-color: #1e293b;
        padding: 6px 14px;
        border-bottom: 1px solid #334155;
        user-select: none;
      }

      .chat-pdf-code-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 700;
        color: #94a3b8;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        letter-spacing: 0.5px;
      }

      .chat-pdf-code-lang {
        color: #38bdf8;
      }

      .chat-pdf-code-container pre {
        margin: 0 !important;
        border-radius: 0 !important;
        border: 0 !important;
        padding: 14px 16px !important;
        background: transparent !important;
        color: #f8fafc !important;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        line-height: 1.55;
        white-space: pre-wrap;
        word-break: break-word;
        overflow-wrap: break-word;
      }

      .message-body pre {
        background-color: #0f172a !important;
        color: #f8fafc !important;
        padding: 12px 14px;
        border-radius: 8px;
        border: 1px solid #334155;
        overflow-x: auto;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        line-height: 1.55;
        margin: 12px 0;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        white-space: pre-wrap;
        word-break: break-word;
        overflow-wrap: break-word;
      }

      .message-body code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.9em;
      }

      .message-body :not(pre) > code {
        background-color: #f1f5f9;
        color: #0f172a;
        padding: 2px 6px;
        border-radius: 4px;
        border: 1px solid #e2e8f0;
      }

      /* Tables Segregation */
      .chat-pdf-table-container {
        margin: 14px 0;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        overflow: hidden;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      }

      .chat-pdf-table-container table,
      .message-body table {
        border-collapse: collapse;
        width: 100%;
        margin: 0 !important;
        font-size: 12px;
      }

      .message-body th, .message-body td {
        border: 1px solid #cbd5e1;
        padding: 8px 12px;
        text-align: left;
        font-size: 12px;
      }

      .message-body th {
        background-color: #f1f5f9;
        color: #0f172a;
        font-weight: 600;
      }

      .message-body tr:nth-child(even) td {
        background-color: #f8fafc;
      }

      /* Typography & Blockquotes */
      .message-body h1, .message-body h2, .message-body h3, .message-body h4 {
        color: #0f172a;
        margin: 14px 0 8px 0;
        font-weight: 700;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }

      .message-body p {
        margin: 0 0 10px 0;
        line-height: 1.62;
      }

      .message-body p:last-child {
        margin-bottom: 0;
      }

      .message-body ul, .message-body ol {
        margin: 8px 0;
        padding-left: 24px;
      }

      .message-body li {
        margin-bottom: 4px;
      }

      .message-body blockquote {
        border-left: 4px solid #3b82f6;
        background-color: #f8fafc;
        margin: 10px 0;
        padding: 8px 14px;
        border-radius: 0 6px 6px 0;
        color: #334155;
        font-style: italic;
      }

      .export-footer {
        margin-top: 24px;
        border-top: 1px solid #e2e8f0;
        padding-top: 10px;
        font-size: 11px;
        color: #94a3b8;
        text-align: center;
        page-break-before: avoid !important;
      }
    `;
  }
}

window.ChatPdfRenderer = ChatPdfRenderer;
