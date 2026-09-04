/**
 * Main Content Script for AI Chat to PDF
 */
(function () {
  let adapterManager = null;
  let activeAdapter = null;
  let pdfRenderer = null;
  let selectedMessageIds = new Set();
  let floatingBarEl = null;

  // Initialize
  function init() {
    adapterManager = new window.AdapterManager();
    activeAdapter = adapterManager.getActiveAdapter();

    if (!activeAdapter) {
      // Not on a supported chat page
      return;
    }

    pdfRenderer = new window.ChatPdfRenderer();

    // Inject Floating UI
    createFloatingBar();

    // Initial message scan & checkbox attachment
    scanAndAttachCheckboxes();

    // Observe changes in chat DOM (streaming, new messages, conversation switch)
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
    if (counterEl) {
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
      const isChecked = selectedMessageIds.has(data.id);

      activeAdapter.attachCheckbox(element, isChecked, (checked) => {
        if (checked) {
          selectedMessageIds.add(data.id);
        } else {
          selectedMessageIds.delete(data.id);
        }
        updateCounter();
      });
    });

    updateCounter();
  }

  /**
   * Select or deselect all messages currently in view
   */
  function selectAllMessages(select) {
    if (!activeAdapter) return;

    const elements = activeAdapter.getMessageElements();
    elements.forEach((element) => {
      const data = activeAdapter.extractMessageData(element);
      if (select) {
        selectedMessageIds.add(data.id);
      } else {
        selectedMessageIds.delete(data.id);
      }
      activeAdapter.attachCheckbox(element, select, (checked) => {
        if (checked) selectedMessageIds.add(data.id);
        else selectedMessageIds.delete(data.id);
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

    // If nothing selected, prompt user to export all
    if (selectedMessageIds.size === 0) {
      const confirmAll = confirm('No individual messages selected. Would you like to export the entire conversation?');
      if (!confirmAll) return;

      elements.forEach(element => {
        exportMessages.push(activeAdapter.extractMessageData(element));
      });
    } else {
      // Gather only selected messages in DOM order
      elements.forEach(element => {
        const data = activeAdapter.extractMessageData(element);
        if (selectedMessageIds.has(data.id)) {
          exportMessages.push(data);
        }
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

    pdfRenderer.exportToPdf({
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
    }, 300);

    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        // Only trigger on added nodes to avoid loops when toggling checkboxes
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
          sendResponse({
            active: !!activeAdapter,
            provider: activeAdapter ? activeAdapter.name : null,
            totalMessages: activeAdapter ? activeAdapter.getMessageElements().length : 0,
            selectedCount: selectedMessageIds.size
          });
        } else if (request.action === 'SELECT_ALL') {
          selectAllMessages(true);
          sendResponse({ success: true, count: selectedMessageIds.size });
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
