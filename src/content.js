/**
 * Main Content Script for AI Chat to PDF
 */
(function () {
  let adapterManager = null;
  let activeAdapter = null;
  let pdfRenderer = null;
  let selectedMessageIds = new Set();
  let isAllSelected = false;
  let floatingBarEl = null;

  // Initialize
  function init() {
    adapterManager = new window.AdapterManager();
    activeAdapter = adapterManager.getActiveAdapter();

    if (!activeAdapter) {
      return;
    }

    pdfRenderer = new window.ChatPdfRenderer();

    // Inject Floating UI
    createFloatingBar();

    // Initial message scan & checkbox attachment
    scanAndAttachCheckboxes();

    // Observe changes in chat DOM (streaming, scrolling, new messages)
    setupMutationObserver();

    // Listen for messages from extension popup
    setupMessageListener();
  }

  /**
   * Create Floating Bar Widget
   */
  function createFloatingBar() {
    if (document.getElementById('chat-pdf-floating-bar')) return;

    floatingBarEl = document.createElement('div');
    floatingBarEl.id = 'chat-pdf-floating-bar';

    floatingBarEl.innerHTML = `
      <div class="chat-pdf-bar-content" style="display: flex; align-items: center; gap: 8px;">
        <div class="chat-pdf-bar-title">
          <span class="chat-pdf-icon">📄</span>
          <span>PDF Export</span>
          <span class="chat-pdf-badge" id="chat-pdf-counter">0</span>
        </div>
        <div class="chat-pdf-btn-group">
          <button class="chat-pdf-btn" id="chat-pdf-btn-all" title="Select all messages">Select All</button>
          <button class="chat-pdf-btn" id="chat-pdf-btn-clear" title="Clear selection">Clear</button>
          <button class="chat-pdf-btn chat-pdf-btn-primary" id="chat-pdf-btn-export" title="Download selected as PDF">
            <span>📥</span> Download PDF
          </button>
        </div>
      </div>
      <button class="chat-pdf-bar-collapse" id="chat-pdf-btn-toggle" title="Minimize / Expand">✕</button>
    `;

    document.body.appendChild(floatingBarEl);

    // Event handlers
    const btnAll = floatingBarEl.querySelector('#chat-pdf-btn-all');
    const btnClear = floatingBarEl.querySelector('#chat-pdf-btn-clear');
    const btnExport = floatingBarEl.querySelector('#chat-pdf-btn-export');
    const btnToggle = floatingBarEl.querySelector('#chat-pdf-btn-toggle');

    btnAll.addEventListener('click', () => selectAllMessages(true));
    btnClear.addEventListener('click', () => selectAllMessages(false));
    btnExport.addEventListener('click', handleExport);

    let isMinimized = false;
    btnToggle.addEventListener('click', () => {
      isMinimized = !isMinimized;
      floatingBarEl.classList.toggle('chat-pdf-minimized', isMinimized);
      btnToggle.textContent = isMinimized ? '📄' : '✕';
      btnToggle.title = isMinimized ? 'Expand PDF Exporter' : 'Minimize';
    });
  }

  /**
   * Update the badge counter showing how many messages are selected
   */
  function updateCounter() {
    const counterEl = document.getElementById('chat-pdf-counter');
    if (!counterEl) return;

    if (!activeAdapter) {
      counterEl.textContent = '0';
      return;
    }

    const total = activeAdapter.getMessageElements().length;
    if (isAllSelected) {
      counterEl.textContent = `${total} (All)`;
    } else {
      counterEl.textContent = `${selectedMessageIds.size}`;
    }
  }

  /**
   * Scan messages and attach checkboxes
   */
  function scanAndAttachCheckboxes() {
    if (!activeAdapter) return;

    const elements = activeAdapter.getMessageElements();
    elements.forEach((element) => {
      const data = activeAdapter.extractMessageData(element);
      const isChecked = isAllSelected || selectedMessageIds.has(data.id);

      activeAdapter.attachCheckbox(element, isChecked, (checked) => {
        if (checked) {
          selectedMessageIds.add(data.id);
        } else {
          isAllSelected = false;
          selectedMessageIds.delete(data.id);
        }
        updateCounter();
      });
    });

    updateCounter();
  }

  /**
   * Select or deselect all messages
   */
  function selectAllMessages(select) {
    if (!activeAdapter) return;

    isAllSelected = select;
    selectedMessageIds.clear();

    const elements = activeAdapter.getMessageElements();
    elements.forEach((element) => {
      const data = activeAdapter.extractMessageData(element);
      if (select) {
        selectedMessageIds.add(data.id);
      }
      activeAdapter.attachCheckbox(element, select, (checked) => {
        if (checked) {
          selectedMessageIds.add(data.id);
        } else {
          isAllSelected = false;
          selectedMessageIds.delete(data.id);
        }
        updateCounter();
      });
    });

    updateCounter();
  }

  /**
   * Handle PDF Export click
   */
  async function handleExport() {
    if (!activeAdapter) return;

    const elements = activeAdapter.getMessageElements();
    let exportMessages = [];

    // Collect messages based on selection
    elements.forEach(element => {
      const data = activeAdapter.extractMessageData(element);
      const checkbox = element.querySelector('.chat-pdf-checkbox');
      const isChecked = isAllSelected ||
                        (checkbox && checkbox.checked) ||
                        element.classList.contains('chat-pdf-selected') ||
                        selectedMessageIds.has(data.id);

      if (isChecked) {
        exportMessages.push(data);
      }
    });

    // Fallback if nothing was explicitly marked
    if (exportMessages.length === 0) {
      const confirmAll = confirm(`No messages individually selected. Would you like to export all ${elements.length} messages?`);
      if (!confirmAll) return;

      elements.forEach(element => {
        exportMessages.push(activeAdapter.extractMessageData(element));
      });
    }

    if (exportMessages.length === 0) {
      alert('No messages found to export.');
      return;
    }

    const title = activeAdapter.getChatTitle();

    // Get settings from storage if available
    let settings = { theme: 'light', includeTimestamps: true, includeHeader: true, fontSize: 'medium' };
    if (chrome && chrome.storage && chrome.storage.sync) {
      try {
        const stored = await chrome.storage.sync.get(['theme', 'includeTimestamps', 'includeHeader', 'fontSize']);
        if (stored) settings = { ...settings, ...stored };
      } catch (e) {
        console.warn('Could not read storage settings, using defaults.', e);
      }
    }

    await pdfRenderer.exportToPdf({
      title,
      providerName: activeAdapter.name,
      messages: exportMessages,
      settings
    });
  }

  /**
   * Setup MutationObserver for dynamic single-page app loading
   */
  function setupMutationObserver() {
    const debouncedScan = window.ChatPdfUtils.debounce(() => {
      scanAndAttachCheckboxes();
    }, 250);

    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1 && !node.classList?.contains('chat-pdf-select-container')) {
              shouldScan = true;
              break;
            }
          }
        }
        if (shouldScan) break;
      }

      if (shouldScan) {
        debouncedScan();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Setup message listener for communication with popup
   */
  function setupMessageListener() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'GET_STATUS') {
          const total = activeAdapter ? activeAdapter.getMessageElements().length : 0;
          sendResponse({
            active: !!activeAdapter,
            provider: activeAdapter ? activeAdapter.name : null,
            totalMessages: total,
            selectedCount: isAllSelected ? total : selectedMessageIds.size
          });
        } else if (request.action === 'SELECT_ALL') {
          selectAllMessages(true);
          const total = activeAdapter ? activeAdapter.getMessageElements().length : 0;
          sendResponse({ success: true, count: total });
        } else if (request.action === 'CLEAR_SELECTION') {
          selectAllMessages(false);
          sendResponse({ success: true, count: 0 });
        } else if (request.action === 'EXPORT_PDF') {
          handleExport();
          sendResponse({ success: true });
        }
        return true;
      });
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
