/**
 * PDF Renderer for AI Chats
 * Generates an isolated, beautifully formatted print document for crisp vector PDF export.
 * Includes full support for KaTeX equations, numbers, code blocks, screenshots, and multi-page pagination.
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
   * @param {Array<Object>} options.messages - Array of { role, authorName, contentElement, timestamp }
   * @param {Object} options.settings - Settings from extension popup or defaults
   */
  async exportToPdf({ title, providerName, messages, settings = {} }) {
    if (!messages || messages.length === 0) {
      alert('Please select at least one message to export.');
      return;
    }

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
    this.iframe.style.width = '0';
    this.iframe.style.height = '0';
    this.iframe.style.border = '0';
    this.iframe.id = 'chat-pdf-print-frame';
    document.body.appendChild(this.iframe);

    const doc = this.iframe.contentWindow.document;
    doc.open();

    const formattedMessagesHtml = messages.map((msg, index) => {
      const isUser = msg.role === 'user';
      const roleClass = isUser ? 'msg-user' : 'msg-assistant';
      const roleBadgeClass = isUser ? 'badge-user' : 'badge-assistant';
      const avatarIcon = isUser ? '👤' : (providerName === 'Claude' ? '🟣' : (providerName === 'Gemini' ? '✨' : '🤖'));
      
      const cleanContent = window.ChatPdfUtils.cleanCloneForPrint(msg.contentElement);
      const contentHtml = cleanContent ? cleanContent.innerHTML : '';

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
            ${contentHtml}
          </div>
        </article>
      `;
    }).join('\n');

    // Gather typography/code styles from host document (skipping SPA layout CSS that breaks pagination)
    const hostStylesheets = this._getFilteredHostStyles();

    const fullHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>${window.ChatPdfUtils.escapeHtml(title)}</title>
        <!-- Official KaTeX CSS for mathematical accuracy -->
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" crossorigin="anonymous">
        ${hostStylesheets}
        <style>
          ${this._getPrintStyles(theme, fontSize)}
          ${this._getKaTeXFallbackStyles()}
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
                <span class="meta-tag count-tag">💬 ${messages.length} message${messages.length === 1 ? '' : 's'}</span>
              </div>
            </div>
          </header>
        ` : ''}

        <main class="chat-thread">
          ${formattedMessagesHtml}
        </main>

        <footer class="export-footer">
          <span>Exported via AI Chat to PDF Extension (${messages.length} messages)</span>
        </footer>
      </body>
      </html>
    `;

    doc.write(fullHtml);
    doc.close();

    // Wait for all images and stylesheets to fully render before printing
    await this._waitForReady(doc);

    try {
      this.iframe.contentWindow.focus();
      this.iframe.contentWindow.print();
    } catch (err) {
      console.error('Print trigger failed:', err);
    }
  }

  /**
   * Extract only safe stylesheets (fonts, code syntax, katex) from host
   * Avoids copying viewport-clamping CSS (height: 100%, overflow: hidden) that truncates print pages.
   */
  _getFilteredHostStyles() {
    let html = '';
    const styleElements = document.querySelectorAll('style, link[rel="stylesheet"]');
    styleElements.forEach(el => {
      // Don't copy extension's own injected CSS
      if (el.href && el.href.includes('src/styles.css')) return;

      // If it's a link, only include if it's related to fonts, katex, or prism/highlight
      if (el.tagName.toLowerCase() === 'link') {
        const href = el.getAttribute('href') || '';
        if (href.includes('font') || href.includes('katex') || href.includes('prism') || href.includes('highlight') || href.includes('cdn.oaistatic.com')) {
          html += el.outerHTML + '\n';
        }
      } else if (el.tagName.toLowerCase() === 'style') {
        // Only include inline styles that don't clamp body overflow/height
        const text = el.textContent || '';
        if (!text.includes('overflow:hidden') && !text.includes('height:100%')) {
          html += el.outerHTML + '\n';
        }
      }
    });
    return html;
  }

  /**
   * Wait until images and fonts in iframe have loaded
   */
  async _waitForReady(doc) {
    const images = Array.from(doc.images || []);
    if (images.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 400));
      return;
    }

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

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  /**
   * Robust multi-page print layout and component styling
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

      /* CRITICAL: Never clamp height or overflow on root elements so multi-page printing never cuts off */
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

      /* CRITICAL: Use display: block for thread container so Chromium page fragmentation works across 50+ pages */
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

      /* Uploaded Screenshots and Images */
      .chat-pdf-attachment-image {
        margin: 10px 0;
        display: block;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .chat-pdf-attachment-image img,
      .message-body img {
        max-width: 100%;
        max-height: 480px;
        width: auto;
        height: auto;
        border-radius: 8px;
        border: 1px solid #cbd5e1;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        display: block;
        margin: 8px 0;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      /* Code Blocks and Markdown */
      .message-body p {
        margin: 0 0 10px 0;
      }

      .message-body p:last-child {
        margin-bottom: 0;
      }

      .message-body pre {
        background-color: #0f172a !important;
        color: #f8fafc !important;
        padding: 12px 14px;
        border-radius: 6px;
        overflow-x: auto;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        line-height: 1.5;
        margin: 10px 0;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        white-space: pre-wrap;
        word-break: break-all;
      }

      .message-body code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.9em;
      }

      .message-body :not(pre) > code {
        background-color: #f1f5f9;
        color: #0f172a;
        padding: 2px 5px;
        border-radius: 4px;
        border: 1px solid #e2e8f0;
      }

      .message-body table {
        border-collapse: collapse;
        width: 100%;
        margin: 12px 0;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .message-body th, .message-body td {
        border: 1px solid #cbd5e1;
        padding: 6px 10px;
        text-align: left;
        font-size: 12px;
      }

      .message-body th {
        background-color: #f1f5f9;
        font-weight: 600;
      }

      .message-body ul, .message-body ol {
        margin: 8px 0;
        padding-left: 24px;
      }

      .message-body li {
        margin-bottom: 4px;
      }

      .message-body blockquote {
        border-left: 3px solid #cbd5e1;
        margin: 8px 0;
        padding-left: 12px;
        color: #475569;
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

  /**
   * Complete KaTeX layout rules for fractions, division lines, and mathematical stacks
   */
  _getKaTeXFallbackStyles() {
    return `
      /* ================= Exact KaTeX Layout & Fraction Alignment ================= */
      .katex {
        font: normal 1.15em KaTeX_Main, "Times New Roman", Cambria Math, serif !important;
        line-height: 1.2 !important;
        text-indent: 0 !important;
        text-rendering: auto !important;
        display: inline-block !important;
        position: relative !important;
        color: #0f172a !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .katex-display {
        display: block !important;
        margin: 1em 0 !important;
        text-align: center !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      .katex-display > .katex {
        display: block !important;
        text-align: center !important;
        white-space: nowrap !important;
      }

      /* Hide duplicate MathML so numbers and symbols are never double-printed */
      .katex-mathml {
        display: none !important;
      }

      .katex-html {
        display: inline-block !important;
        position: relative !important;
      }

      .katex .base {
        position: relative !important;
        display: inline-block !important;
        white-space: nowrap !important;
        width: min-content !important;
      }

      .katex .strut {
        display: inline-block !important;
      }

      /* Fractions & Division line vertical alignment */
      .katex .mfrac {
        display: inline-block !important;
        vertical-align: -0.5em !important;
        padding: 0 0.2em !important;
        text-align: center !important;
      }

      .katex .mfrac > span > span {
        text-align: center !important;
      }

      .katex .frac-line {
        display: block !important;
        border-bottom-style: solid !important;
        border-bottom-width: 0.08em !important;
        border-color: #0f172a !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      /* Exact vertical stack rules: height 0 on vlist spans prevents displaced fraction bars */
      .katex .vlist-t {
        display: inline-table !important;
        table-layout: fixed !important;
        border-collapse: collapse !important;
      }

      .katex .vlist-r {
        display: table-row !important;
      }

      .katex .vlist {
        display: table-cell !important;
        vertical-align: bottom !important;
        position: relative !important;
        height: 100% !important;
      }

      .katex .vlist > span {
        display: block !important;
        height: 0 !important;
        position: relative !important;
      }

      .katex .vlist > span > span {
        display: inline-block !important;
      }

      .katex .vlist > span > .pstrut {
        overflow: hidden !important;
        width: 0 !important;
        height: 0 !important;
      }

      .katex .vlist-t2 {
        margin-right: -2px !important;
      }

      .katex .vlist-s {
        display: table-cell !important;
        vertical-align: bottom !important;
        font-size: 1px !important;
        width: 2px !important;
        min-width: 2px !important;
      }

      /* Numbers, operators, division symbol (÷) and variables */
      .katex .mord, 
      .katex .mbin, 
      .katex .mrel, 
      .katex .mopen, 
      .katex .mclose, 
      .katex .mpunct, 
      .katex .minner {
        display: inline-block !important;
        position: relative !important;
        color: #0f172a !important;
        opacity: 1 !important;
        visibility: visible !important;
      }

      .katex .mbin {
        padding-left: 0.2222em !important;
        padding-right: 0.2222em !important;
        vertical-align: baseline !important;
      }

      .katex .mrel {
        padding-left: 0.2778em !important;
        padding-right: 0.2778em !important;
        vertical-align: baseline !important;
      }

      /* Subscripts and superscripts */
      .katex .msupsub {
        display: inline-block !important;
        position: relative !important;
        vertical-align: 0 !important;
      }

      /* Square roots */
      .katex .sqrt {
        display: inline-block !important;
        position: relative !important;
      }

      .katex .sqrt > .root {
        margin-left: 0.2778em !important;
        margin-right: -0.5556em !important;
      }
    `;
  }
}

window.ChatPdfRenderer = ChatPdfRenderer;
