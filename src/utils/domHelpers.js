/**
 * Helper utilities for DOM manipulation and cleaning
 */
window.ChatPdfUtils = {
  /**
   * Debounce function to limit rapid calls
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Generates a unique ID
   */
  generateId(prefix = 'chat-turn') {
    return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Generates or retrieves a deterministic stable ID for a message element
   * to survive DOM recycling / virtual scroll unmounting.
   */
  getStableId(element, prefix = 'chat', role = '', text = '') {
    let stableId = '';

    if (element) {
      // 1. Check data-message-id (OpenAI / Claude permanent message UUID)
      const msgId = element.getAttribute('data-message-id') || 
                    element.querySelector('[data-message-id]')?.getAttribute('data-message-id');
      if (msgId) {
        stableId = `${prefix}-${msgId}`;
      }

      // 2. Check conversation-turn-X in data-testid
      if (!stableId) {
        const testId = element.getAttribute('data-testid') || 
                       element.closest('[data-testid]')?.getAttribute('data-testid');
        if (testId) {
          const match = testId.match(/conversation-turn-(\d+)/);
          if (match) {
            stableId = `turn-${match[1]}`;
          }
        }
      }
    }

    // 3. Content hash fallback (includes image alt/src signatures to distinguish image prompts)
    if (!stableId) {
      const cleanText = (text || '').trim().replace(/\s+/g, ' ');
      const imgSignatures = element ? Array.from(element.querySelectorAll('img'))
        .map(img => (img.alt || img.getAttribute('src') || '').slice(0, 80))
        .filter(Boolean)
        .join('|') : '';

      const fingerprint = cleanText + (imgSignatures ? `::img:${imgSignatures}` : '');
      if (!fingerprint) {
        stableId = `${prefix}-${role}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 6)}`;
      } else {
        let hash = 0;
        for (let i = 0; i < fingerprint.length; i++) {
          hash = ((hash << 5) - hash) + fingerprint.charCodeAt(i);
          hash |= 0;
        }
        const sample = cleanText.slice(0, 16).replace(/[^a-zA-Z0-9]/g, '') || (imgSignatures ? 'img' : 'msg');
        stableId = `${prefix}-${role}-${Math.abs(hash).toString(36)}${sample ? '-' + sample : ''}`;
      }
    }

    if (element && element.dataset) {
      element.dataset.chatPdfId = stableId;
    }
    return stableId;
  },

  /**
   * Deep clone a DOM node, preserving images/screenshots and equations cleanly
   */
  cleanCloneForPrint(element) {
    if (!element) return null;
    const clone = element.cloneNode(true);

    // 1. Preserve images/screenshots inside buttons (e.g. ChatGPT thumbnail buttons)
    const buttons = clone.querySelectorAll('button');
    buttons.forEach(btn => {
      const imgs = btn.querySelectorAll('img');
      if (imgs.length > 0) {
        const wrapper = document.createElement('div');
        wrapper.className = 'chat-pdf-attachment-image';
        imgs.forEach(img => {
          const clonedImg = img.cloneNode(true);
          wrapper.appendChild(clonedImg);
        });
        btn.parentNode.replaceChild(wrapper, btn);
      } else {
        btn.remove();
      }
    });

    // 2. Remove interactive/action UI controls (preserve image thumbnails)
    const elementsToRemove = clone.querySelectorAll(
      '.chat-pdf-select-container, [aria-label*="Copy" i], [aria-label*="Thumbs up" i], [aria-label*="Thumbs down" i], [aria-label*="Thumb up" i], [aria-label*="Thumb down" i], [aria-label*="Edit" i], [aria-label*="Read aloud" i], [data-testid*="feedback" i], [data-testid*="copy" i], .gizmo-shadow'
    );
    elementsToRemove.forEach(el => el.remove());

    // 3. Process KaTeX math equations cleanly:
    // Remove the redundant hidden MathML blocks so only the visually rendered KaTeX HTML is printed
    clone.querySelectorAll('.katex-mathml').forEach(el => el.remove());

    // Remove aria-hidden on .katex-html so it is treated as visible by print renderers
    clone.querySelectorAll('.katex-html').forEach(el => {
      el.removeAttribute('aria-hidden');
    });

    // 4. Ensure all images and screenshots have eager loading and high quality
    const originalImgs = element.querySelectorAll('img');
    const clonedImgs = clone.querySelectorAll('img');

    clonedImgs.forEach((img, idx) => {
      img.setAttribute('loading', 'eager');
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.display = 'block';

      const orig = originalImgs[idx];
      if (orig) {
        if (orig.currentSrc && !img.src) {
          img.src = orig.currentSrc;
        }

        if (orig.complete && orig.naturalWidth > 0) {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = orig.naturalWidth;
            canvas.height = orig.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(orig, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            if (dataUrl && dataUrl.length > 100) {
              img.src = dataUrl;
            }
          } catch (err) {
            // Cross-origin fallback
          }
        }
      }

      // Segregate images into dedicated figure card with clean caption
      const isIcon = (orig && orig.naturalWidth > 0 && orig.naturalWidth <= 32);
      if (!isIcon && !img.closest('.chat-pdf-image-figure') && !img.closest('.chat-pdf-attachment-image')) {
        const figure = document.createElement('figure');
        figure.className = 'chat-pdf-image-figure';

        const captionText = img.alt || img.getAttribute('title') || '';
        const caption = document.createElement('figcaption');
        caption.className = 'chat-pdf-image-caption';
        caption.textContent = captionText ? `🖼️ ${captionText}` : '🖼️ Image / Screenshot';

        const parent = img.parentNode;
        if (parent) {
          parent.insertBefore(figure, img);
          figure.appendChild(img);
          figure.appendChild(caption);
        }
      }
    });

    // 5. Segregate Code Blocks with dedicated language header badge
    const preBlocks = clone.querySelectorAll('pre');
    preBlocks.forEach(pre => {
      if (pre.closest('.chat-pdf-code-container')) return;

      const codeEl = pre.querySelector('code');
      let lang = '';
      if (codeEl && codeEl.className) {
        const langMatch = codeEl.className.match(/(?:language-|lang-)([a-zA-Z0-9_+-]+)/i);
        if (langMatch) lang = langMatch[1];
      }

      if (!lang) {
        const prevSibling = pre.previousElementSibling;
        if (prevSibling) {
          const text = (prevSibling.textContent || '').trim().toLowerCase();
          if (text && text.length <= 20 && !text.includes('\n') && !text.includes('copy')) {
            lang = text;
          }
        }
      }

      const container = document.createElement('div');
      container.className = 'chat-pdf-code-container';

      const header = document.createElement('div');
      header.className = 'chat-pdf-code-header';
      header.innerHTML = `
        <span class="chat-pdf-code-badge">
          <span class="chat-pdf-code-icon">💻</span>
          <span class="chat-pdf-code-lang">${(lang || 'CODE').toUpperCase()}</span>
        </span>
      `;

      const parent = pre.parentNode;
      if (parent) {
        parent.insertBefore(container, pre);
        container.appendChild(header);
        container.appendChild(pre);
      }
    });

    // 6. Segregate Display Math & KaTeX equations
    const mathBlocks = clone.querySelectorAll('.katex-display');
    mathBlocks.forEach(mathEl => {
      if (mathEl.closest('.chat-pdf-math-container')) return;

      const mathCard = document.createElement('div');
      mathCard.className = 'chat-pdf-math-container';

      const label = document.createElement('div');
      label.className = 'chat-pdf-math-label';
      label.innerHTML = '<span>📐</span> Mathematical Formula';

      const parent = mathEl.parentNode;
      if (parent) {
        parent.insertBefore(mathCard, mathEl);
        mathCard.appendChild(label);
        mathCard.appendChild(mathEl);
      }
    });

    // 7. Segregate Tables with crisp borders and scroll wrapper
    const tables = clone.querySelectorAll('table');
    tables.forEach(table => {
      if (table.closest('.chat-pdf-table-container')) return;

      const wrap = document.createElement('div');
      wrap.className = 'chat-pdf-table-container';

      const parent = table.parentNode;
      if (parent) {
        parent.insertBefore(wrap, table);
        wrap.appendChild(table);
      }
    });

    return clone;
  },

  /**
   * Escape HTML string
   */
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * Format current date and time nicely
   */
  formatDate(date = new Date()) {
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  /**
   * Convert plain text or markdown snippet to clean segregated HTML (for API preloaded messages)
   */
  /**
   * Convert plain text or markdown snippet to clean segregated HTML (for API preloaded messages)
   * Preserves headings, lists, bold, italics, tables, math, and code blocks with full structure.
   */
  formatTextToHtml(md) {
    if (!md) return '';

    // Normalize newlines
    let text = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Inline formatting helper
    const inlineFormat = (str) => {
      if (!str) return '';
      return str
        // Inline math: $math$ or \(math\)
        .replace(/(?:\$([^\$\n]+)\$|\\\(([^\)\n]+)\\\))/g, '<span class="katex"><span class="katex-html">$1$2</span></span>')
        // Inline code: `code`
        .replace(/`([^`]+)`/g, '<code class="chat-pdf-inline-code">$1</code>')
        // Images: ![alt](url)
        .replace(/!\[(.*?)\]\((.*?)\)/g, '<figure class="chat-pdf-image-figure"><img src="$2" alt="$1" /><figcaption class="chat-pdf-image-caption">🖼️ $1</figcaption></figure>')
        // Links: [text](url)
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color:#2563eb;">$1</a>')
        // Bold + Italic: ***text*** or ___text___
        .replace(/(\*\*\*|___)(.*?)\1/g, '<strong><em>$2</em></strong>')
        // Bold: **text** or __text__
        .replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>')
        // Italic: *text* or _text_
        .replace(/(\*|_)(.*?)\1/g, '<em>$2</em>')
        // Strikethrough: ~~text~~
        .replace(/~~(.*?)~~/g, '<del>$1</del>');
    };

    // 1. Extract and stash Code Blocks
    const codeBlocks = [];
    text = text.replace(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      const displayLang = (lang || 'code').trim().toUpperCase();
      const escapedCode = this.escapeHtml(code.trim());
      codeBlocks.push(`
        <div class="chat-pdf-code-container">
          <div class="chat-pdf-code-header">
            <span class="chat-pdf-code-badge">
              <span class="chat-pdf-code-icon">💻</span>
              <span class="chat-pdf-code-lang">${displayLang}</span>
            </span>
          </div>
          <pre class="chat-pdf-pre"><code>${escapedCode}</code></pre>
        </div>
      `);
      return placeholder;
    });

    // 2. Extract and stash LaTeX Display Math blocks ($$ ... $$ or \[ ... \])
    const mathBlocks = [];
    text = text.replace(/(?:\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\])/g, (match, m1, m2) => {
      const placeholder = `__MATH_BLOCK_${mathBlocks.length}__`;
      const mathContent = (m1 || m2 || '').trim();
      const escapedMath = this.escapeHtml(mathContent);
      mathBlocks.push(`
        <div class="chat-pdf-math-container">
          <div class="chat-pdf-math-label"><span>📐</span> Mathematical Formula</div>
          <div class="katex-display"><span class="katex"><span class="katex-html">${escapedMath}</span></span></div>
        </div>
      `);
      return placeholder;
    });

    // 3. Extract and stash Tables
    const tableBlocks = [];
    text = text.replace(/(?:(?:^[ \t]*\|[^\n]+\|[ \t]*(?:\n|$))+)/gm, (match) => {
      const lines = match.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return match;

      const isSep = (line) => /^\|(?:\s*:?-+:?\s*\|)+$/.test(line);
      let headerLine = null;
      let bodyLines = [];

      if (lines.length >= 2 && isSep(lines[1])) {
        headerLine = lines[0];
        bodyLines = lines.slice(2);
      } else {
        bodyLines = lines;
      }

      const parseRow = (line) => {
        const raw = line.split('|');
        return raw.slice(1, raw.length - 1).map(c => c.trim());
      };

      let tableHtml = '<div class="chat-pdf-table-container"><table>';
      if (headerLine) {
        tableHtml += '<thead><tr>';
        parseRow(headerLine).forEach(h => {
          tableHtml += `<th>${inlineFormat(this.escapeHtml(h))}</th>`;
        });
        tableHtml += '</tr></thead>';
      }
      tableHtml += '<tbody>';
      bodyLines.forEach(row => {
        if (isSep(row)) return;
        tableHtml += '<tr>';
        parseRow(row).forEach(c => {
          tableHtml += `<td>${inlineFormat(this.escapeHtml(c))}</td>`;
        });
        tableHtml += '</tr>';
      });
      tableHtml += '</tbody></table></div>';

      const placeholder = `__TABLE_BLOCK_${tableBlocks.length}__`;
      tableBlocks.push(tableHtml);
      return placeholder;
    });

    // 4. Line-by-line block parser
    const rawLines = text.split('\n');
    const outputBlocks = [];
    let inList = null; // 'ul' or 'ol'
    let inBlockquote = false;
    let bqBuffer = [];

    const flushBlockquote = () => {
      if (inBlockquote) {
        outputBlocks.push(`<blockquote>${bqBuffer.join('<br/>')}</blockquote>`);
        inBlockquote = false;
        bqBuffer = [];
      }
    };

    const flushList = () => {
      if (inList) {
        outputBlocks.push(`</${inList}>`);
        inList = null;
      }
    };

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();

      // Check placeholder blocks
      if (trimmed.startsWith('__CODE_BLOCK_') || trimmed.startsWith('__MATH_BLOCK_') || trimmed.startsWith('__TABLE_BLOCK_')) {
        flushBlockquote();
        flushList();
        outputBlocks.push(trimmed);
        continue;
      }

      if (!trimmed) {
        flushBlockquote();
        flushList();
        continue;
      }

      // Horizontal Rule: --- or ***
      if (/^(?:---|\*\*\*|___)$/.test(trimmed)) {
        flushBlockquote();
        flushList();
        outputBlocks.push('<hr style="border:0; border-top:1px solid #e2e8f0; margin:16px 0;" />');
        continue;
      }

      // Blockquote: > text
      if (trimmed.startsWith('>')) {
        flushList();
        inBlockquote = true;
        bqBuffer.push(inlineFormat(this.escapeHtml(trimmed.replace(/^>\s*/, ''))));
        continue;
      } else {
        flushBlockquote();
      }

      // Headings: #, ##, ###, ####, #####, ######
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        flushList();
        const level = headingMatch[1].length;
        outputBlocks.push(`<h${level}>${inlineFormat(this.escapeHtml(headingMatch[2]))}</h${level}>`);
        continue;
      }

      // Lists: - item or * item or 1. item
      const bulletMatch = line.match(/^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/);
      if (bulletMatch) {
        const isNum = /^\d+\./.test(trimmed);
        const listType = isNum ? 'ol' : 'ul';

        if (inList !== listType) {
          flushList();
          inList = listType;
          outputBlocks.push(`<${inList}>`);
        }
        outputBlocks.push(`<li>${inlineFormat(this.escapeHtml(bulletMatch[2]))}</li>`);
        continue;
      } else {
        flushList();
      }

      // Paragraph
      outputBlocks.push(`<p>${inlineFormat(this.escapeHtml(trimmed))}</p>`);
    }

    flushBlockquote();
    flushList();

    let finalHtml = outputBlocks.join('\n');

    // Restore Code Blocks
    codeBlocks.forEach((cb, idx) => {
      finalHtml = finalHtml.replace(`__CODE_BLOCK_${idx}__`, cb);
    });

    // Restore Math Blocks
    mathBlocks.forEach((mb, idx) => {
      finalHtml = finalHtml.replace(`__MATH_BLOCK_${idx}__`, mb);
    });

    // Restore Tables
    tableBlocks.forEach((tb, idx) => {
      finalHtml = finalHtml.replace(`__TABLE_BLOCK_${idx}__`, tb);
    });

    return finalHtml;
  }
};
