/**
 * Base Adapter definition for chat providers
 */
class BaseAdapter {
  constructor(name) {
    this.name = name;
  }

  isMatching() {
    return false;
  }

  getChatTitle() {
    return document.title || 'Chat Export';
  }

  getMessageElements() {
    return [];
  }

  extractMessageData(element) {
    const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
    let contentHtml = '';
    if (window.ChatPdfUtils && window.ChatPdfUtils.cleanCloneForPrint) {
      const cleanNode = window.ChatPdfUtils.cleanCloneForPrint(element);
      contentHtml = cleanNode ? cleanNode.innerHTML : '';
    }
    return {
      id: element.dataset.chatPdfId || window.ChatPdfUtils.generateId(),
      turnIndex: 0,
      role: 'assistant',
      authorName: 'AI',
      text,
      contentElement: element,
      contentHtml,
      timestamp: window.ChatPdfUtils.formatDate()
    };
  }

  attachCheckbox(element, isChecked, onChange) {
    let container = element.querySelector('.chat-pdf-select-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'chat-pdf-select-container';
      
      // Stop clicks on the selection tool from triggering page navigation or image popups
      container.addEventListener('click', (e) => e.stopPropagation());
      container.addEventListener('mousedown', (e) => e.stopPropagation());

      const label = document.createElement('label');
      label.className = 'chat-pdf-checkbox-label';
      label.title = 'Select message for PDF export';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'chat-pdf-checkbox';
      checkbox.checked = isChecked;

      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
          element.classList.add('chat-pdf-selected');
        } else {
          element.classList.remove('chat-pdf-selected');
        }
        onChange(checkbox.checked);
      });

      const customCheck = document.createElement('span');
      customCheck.className = 'chat-pdf-custom-check';

      label.appendChild(checkbox);
      label.appendChild(customCheck);
      container.appendChild(label);

      // Positioning helper
      const computedPos = window.getComputedStyle(element).position;
      if (computedPos === 'static') {
        element.style.position = 'relative';
      }

      element.prepend(container);
    } else {
      const checkbox = container.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.checked = isChecked;
        if (isChecked) {
          element.classList.add('chat-pdf-selected');
        } else {
          element.classList.remove('chat-pdf-selected');
        }
        checkbox.onchange = (e) => {
          e.stopPropagation();
          if (checkbox.checked) {
            element.classList.add('chat-pdf-selected');
          } else {
            element.classList.remove('chat-pdf-selected');
          }
          onChange(checkbox.checked);
        };
      }
    }
  }
}

window.BaseAdapter = BaseAdapter;
