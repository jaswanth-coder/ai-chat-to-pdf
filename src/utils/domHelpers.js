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
  }
};
