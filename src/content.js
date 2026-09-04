/**
 * Main Content Script for AI Chat to PDF
 * Features Continuous Message Harvester to overcome DOM virtualization (30+ messages)
 * and Auto-Scroll Chat Scanner.
 */
(function () {
  let adapterManager = null;
  let activeAdapter = null;
  let pdfRenderer = null;

  // In-memory persistent message store (survives React DOM unmounting)
  const harvestedMessagesMap = new Map(); // id -> messageData
  const selectedMessageIds = new Set();
  let isAllSelected = false;
  let isScanning = false;
  let floatingBarEl = null;

  // Safety limit to prevent browser memory exhaustion
  const MAX_EXPORT_LIMIT = 150;

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

    // Initial message harvest & checkbox attachment
    harvestAndAttach();

    // Continuous scroll harvester (captures messages as user scrolls up/down)
    setupScrollHarvester();

    // DOM mutation observer for live streaming & reactive updates
    setupMutationObserver();

    // Message listener for extension popup
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
          <button class="chat-pdf-btn" id="chat-pdf-btn-scan" title="Auto-scroll to load and capture the entire chat">
            <span>🔍</span> Scan All
          </button>
          <button class="chat-pdf-btn" id="chat-pdf-btn-all" title="Select all captured messages">Select All</button>
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
    const btnScan = floatingBarEl.querySelector('#chat-pdf-btn-scan');
    const btnAll = floatingBarEl.querySelector('#chat-pdf-btn-all');
    const btnClear = floatingBarEl.querySelector('#chat-pdf-btn-clear');
    const btnExport = floatingBarEl.querySelector('#chat-pdf-btn-export');
    const btnToggle = floatingBarEl.querySelector('#chat-pdf-btn-toggle');

    btnScan.addEventListener('click', autoScanEntireChat);
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
   * Harvest messages currently in DOM and attach/update checkboxes
   */
  function harvestAndAttach() {
    if (!activeAdapter) return;

    const elements = activeAdapter.getMessageElements();
    elements.forEach((element) => {
      const data = activeAdapter.extractMessageData(element);

      // Save/update in persistent store
      if (data && data.id) {
        harvestedMessagesMap.set(data.id, data);
      }

      // If "Select All" was clicked, automatically mark new items
      if (isAllSelected) {
        selectedMessageIds.add(data.id);
      }

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
   * Update the badge counter showing total harvested and selected count
   */
  function updateCounter() {
    const counterEl = document.getElementById('chat-pdf-counter');
    if (!counterEl) return;

    if (isScanning) {
      counterEl.textContent = `Scanning... (${harvestedMessagesMap.size})`;
      return;
    }

    const totalHarvested = harvestedMessagesMap.size;
    if (isAllSelected) {
      counterEl.textContent = `${totalHarvested} (All)`;
    } else {
      counterEl.textContent = `${selectedMessageIds.size} / ${totalHarvested}`;
    }
  }

  /**
   * Select or deselect all messages
   */
  function selectAllMessages(select) {
    isAllSelected = select;
    selectedMessageIds.clear();

    if (select) {
      harvestedMessagesMap.forEach((_, id) => {
        selectedMessageIds.add(id);
      });
    }

    // Update all checkboxes currently mounted in DOM
    if (activeAdapter) {
      const elements = activeAdapter.getMessageElements();
      elements.forEach((element) => {
        activeAdapter.attachCheckbox(element, select, (checked) => {
          const data = activeAdapter.extractMessageData(element);
          if (checked) {
            selectedMessageIds.add(data.id);
          } else {
            isAllSelected = false;
            selectedMessageIds.delete(data.id);
          }
          updateCounter();
        });
      });
    }

    updateCounter();
  }

  /**
   * Continuous Scroll Harvester
   * Whenever user scrolls up or down, captures newly mounted DOM messages into memory
   */
  function setupScrollHarvester() {
    const debouncedHarvest = window.ChatPdfUtils.debounce(() => {
      harvestAndAttach();
    }, 150);

    window.addEventListener('scroll', debouncedHarvest, { passive: true });
    document.addEventListener('scroll', debouncedHarvest, { passive: true, capture: true });
  }

  /**
   * Auto-Scan Entire Chat (smooth auto-scroll up and down)
   * Resolves ChatGPT 30-message virtualization by loading all messages into the persistent store
   */
  async function autoScanEntireChat() {
    if (isScanning) return;
    isScanning = true;
    updateCounter();

    // Find ChatGPT's scrollable conversation container
    const scrollContainer = document.querySelector('main div[class*="react-scroll-to-bottom"], main, [class*="overflow-y-auto"]') || document.documentElement;

    const originalScrollTop = scrollContainer.scrollTop;

    // 1. Scroll upward to mount and harvest older messages
    let lastTop = -1;
    let attempts = 0;
    while (scrollContainer.scrollTop > 0 && attempts < 35) {
      if (scrollContainer.scrollTop === lastTop) break;
      lastTop = scrollContainer.scrollTop;
      scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop - 900);
      await new Promise(r => setTimeout(r, 120));
      harvestAndAttach();
      attempts++;
    }

    // 2. Scroll downward to mount and harvest all responses down to the bottom
    let lastHeight = -1;
    attempts = 0;
    while (attempts < 35) {
      const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      if (scrollContainer.scrollTop >= maxScroll - 50 && scrollContainer.scrollHeight === lastHeight) break;
      lastHeight = scrollContainer.scrollHeight;
      scrollContainer.scrollTop = Math.min(scrollContainer.scrollHeight, scrollContainer.scrollTop + 900);
      await new Promise(r => setTimeout(r, 120));
      harvestAndAttach();
      attempts++;
    }

    // Final harvest pass
    harvestAndAttach();

    // Auto-select all harvested messages
    selectAllMessages(true);

    isScanning = false;
    updateCounter();
  }

  /**
   * Handle PDF Export click
   */
  async function handleExport() {
    if (!activeAdapter) return;

    // Refresh currently visible DOM messages first
    harvestAndAttach();

    let exportMessages = [];

    if (isAllSelected || selectedMessageIds.size === 0) {
      // Export all harvested messages
      exportMessages = Array.from(harvestedMessagesMap.values());
    } else {
      // Export only chosen messages
      harvestedMessagesMap.forEach((data, id) => {
        if (selectedMessageIds.has(id)) {
          exportMessages.push(data);
        }
      });
    }

    // If still empty, confirm export all
    if (exportMessages.length === 0) {
      const confirmAll = confirm(`Export all ${harvestedMessagesMap.size} harvested messages?`);
      if (!confirmAll) return;
      exportMessages = Array.from(harvestedMessagesMap.values());
    }

    if (exportMessages.length === 0) {
      alert('No messages found. Try scrolling through the chat or clicking "Scan All" first.');
      return;
    }

    // Apply safe limit if chat is excessively long (>150 messages)
    if (exportMessages.length > MAX_EXPORT_LIMIT) {
      const proceed = confirm(
        `You have ${exportMessages.length} messages selected. For best PDF rendering and performance, the top ${MAX_EXPORT_LIMIT} messages will be exported. Proceed?`
      );
      if (!proceed) return;
      exportMessages = exportMessages.slice(0, MAX_EXPORT_LIMIT);
    }

    const title = activeAdapter.getChatTitle();

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
   * Setup MutationObserver
   */
  function setupMutationObserver() {
    const debouncedScan = window.ChatPdfUtils.debounce(() => {
      harvestAndAttach();
    }, 200);

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
   * Setup message listener for popup
   */
  function setupMessageListener() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'GET_STATUS') {
          sendResponse({
            active: !!activeAdapter,
            provider: activeAdapter ? activeAdapter.name : null,
            totalMessages: harvestedMessagesMap.size,
            selectedCount: isAllSelected ? harvestedMessagesMap.size : selectedMessageIds.size
          });
        } else if (request.action === 'SELECT_ALL') {
          selectAllMessages(true);
          sendResponse({ success: true, count: harvestedMessagesMap.size });
        } else if (request.action === 'CLEAR_SELECTION') {
          selectAllMessages(false);
          sendResponse({ success: true, count: 0 });
        } else if (request.action === 'SCAN_ALL') {
          autoScanEntireChat().then(() => {
            sendResponse({ success: true, count: harvestedMessagesMap.size });
          });
          return true; // async
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
