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
   * Deep clone a DOM node, preserving images/screenshots, equations, and stripping action controls
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

    // 2. Remove interactive/action UI controls
    const elementsToRemove = clone.querySelectorAll(
      '.chat-pdf-select-container, [aria-label*="Copy" i], [aria-label*="Thumb" i], [aria-label*="Edit" i], [aria-label*="Read aloud" i], [data-testid*="feedback" i], [data-testid*="copy" i], .gizmo-shadow'
    );
    elementsToRemove.forEach(el => el.remove());

    // 3. Process KaTeX / MathJax Math Equations
    // Hide MathML duplicates so math numbers and symbols aren't rendered twice or overlapped
    const mathMlElements = clone.querySelectorAll('.katex-mathml');
    mathMlElements.forEach(el => {
      el.style.setProperty('display', 'none', 'important');
      el.setAttribute('aria-hidden', 'true');
    });

    // Ensure KaTeX HTML is visible and numbers are sharp
    const katexHtmlElements = clone.querySelectorAll('.katex-html');
    katexHtmlElements.forEach(el => {
      el.removeAttribute('aria-hidden');
      el.style.setProperty('display', 'inline-block', 'important');
    });

    // 4. Ensure all images and screenshots have eager loading and inline styling
    const originalImgs = element.querySelectorAll('img');
    const clonedImgs = clone.querySelectorAll('img');

    clonedImgs.forEach((img, idx) => {
      img.setAttribute('loading', 'eager');
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.display = 'block';

      // If original image is available, attempt to capture high-res canvas data URL
      const orig = originalImgs[idx];
      if (orig) {
        if (orig.currentSrc && !img.src) {
          img.src = orig.currentSrc;
        }

        // Try canvas export for instant inline rendering
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
            // Tainted canvas (CORS), keep original src
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
