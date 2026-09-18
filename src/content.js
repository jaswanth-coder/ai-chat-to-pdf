/**
 * Main Content Script for AI Chat to PDF
 * Features Left Sidebar with Prompt Index, Smart Selection (Inverse, Prompts Only, Q&A),
 * Continuous Message Harvester, and Auto-Scroll Chat Scanner.
 */
(function () {
  let adapterManager = null;
  let activeAdapter = null;
  let pdfRenderer = null;

  // In-memory persistent message store (survives React DOM unmounting)
  const harvestedMessagesMap = new Map(); // id -> messageData
  const selectedMessageIds = new Set();
  let orderedMessageIds = []; // strictly ordered list of message IDs representing entire conversation
  let isAllSelected = false;
  let isScanning = false;
  let isScanningUpward = false;
  let stopScanRequested = false;
  let lastObservedScrollTop = 0;
  let isScrollingUp = false;

  // UI Element references
  let floatingBarEl = null;
  let sidebarEl = null;
  let sidebarToggleTabEl = null;
  let isSidebarCollapsed = false;

  // Search and filter state
  let searchQuery = '';
  let activeFilterMode = 'all'; // 'all' | 'prompts' | 'answers'

  // Safety limit to prevent browser memory exhaustion (increased from 150)
  const MAX_EXPORT_LIMIT = 1000;

  // Initialize
  function init() {
    adapterManager = new window.AdapterManager();
    activeAdapter = adapterManager.getActiveAdapter();

    if (!activeAdapter) {
      return;
    }

    pdfRenderer = new window.ChatPdfRenderer();

    // Inject Right Sidebar & Toggle Tab
    createSidebar();

    // Initial message harvest & checkbox attachment
    harvestAndAttach();

    // Continuous scroll harvester (captures messages as user scrolls up/down)
    setupScrollHarvester();

    // DOM mutation observer for live streaming & reactive updates
    setupMutationObserver();

    // Message listener for extension popup
    setupMessageListener();

    // SPA URL watcher to auto-handle conversation changes
    setupUrlWatcher();

    // Check for updates from GitHub release
    checkForUpdates();

    // Automatically perform initial scan after short delay for SPA hydration
    setTimeout(() => {
      autoScanEntireChat({ isAuto: true });
    }, 1500);
  }

  /**
   * Check GitHub for newer extension release
   */
  async function checkForUpdates() {
    try {
      const banner = document.getElementById('chat-pdf-sidebar-update-banner');
      const versionEl = document.getElementById('chat-pdf-sidebar-update-version');
      if (!banner) return;
      const manifest = (chrome?.runtime?.getManifest) ? chrome.runtime.getManifest() : null;
      if (!manifest) return;
      const currentVersion = manifest.version;

      const res = await fetch('https://raw.githubusercontent.com/jaswanth-coder/ai-chat-to-pdf/main/manifest.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const remote = await res.json();
      if (remote && remote.version) {
        const rParts = remote.version.split('.').map(Number);
        const cParts = currentVersion.split('.').map(Number);
        let isNewer = false;
        for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
          const r = rParts[i] || 0;
          const c = cParts[i] || 0;
          if (r > c) { isNewer = true; break; }
          if (r < c) { break; }
        }
        if (isNewer) {
          if (versionEl) versionEl.textContent = `v${remote.version}`;
          banner.style.display = 'flex';
        }
      }
    } catch (e) {
      // Offline fallback
    }
  }

  /**
   * Helper to find the active scrollable conversation container
   */
  function getScrollContainer() {
    const candidateSelectors = [
      'main div[class*="react-scroll-to-bottom"]',
      'div[class*="react-scroll-to-bottom"]',
      'main [class*="overflow-y-auto"]',
      '[class*="overflow-y-auto"]',
      'infinite-scroller',
      '.chat-history',
      '#chat-history',
      'main'
    ];

    for (const sel of candidateSelectors) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight + 40) {
        return el;
      }
    }

    if (document.documentElement.scrollHeight > window.innerHeight + 40) {
      return document.documentElement;
    }
    if (document.body.scrollHeight > window.innerHeight + 40) {
      return document.body;
    }
    return document.documentElement;
  }

  /**
   * Stitches newly observed DOM message IDs into the global ordered list
   * Ensures 100% stable chronological ordering across virtual scroll unmounting.
   */
  function updateGlobalMessageOrder(domMessageIds) {
    if (!domMessageIds || domMessageIds.length === 0) return;

    // Filter unique IDs in current DOM order
    const uniqueBatch = [];
    const seen = new Set();
    for (const id of domMessageIds) {
      if (!seen.has(id)) {
        seen.add(id);
        uniqueBatch.push(id);
      }
    }

    if (orderedMessageIds.length === 0) {
      orderedMessageIds = [...uniqueBatch];
    } else {
      for (let i = 0; i < uniqueBatch.length; i++) {
        const id = uniqueBatch[i];
        if (orderedMessageIds.includes(id)) {
          continue;
        }

        // Look forward in the batch for the nearest element already in orderedMessageIds
        let nextKnownIdx = -1;
        for (let j = i + 1; j < uniqueBatch.length; j++) {
          const idx = orderedMessageIds.indexOf(uniqueBatch[j]);
          if (idx !== -1) {
            nextKnownIdx = idx;
            break;
          }
        }

        if (nextKnownIdx !== -1) {
          orderedMessageIds.splice(nextKnownIdx, 0, id);
          continue;
        }

        // Look backward in the batch for the nearest element already in orderedMessageIds
        let prevKnownIdx = -1;
        for (let j = i - 1; j >= 0; j--) {
          const idx = orderedMessageIds.indexOf(uniqueBatch[j]);
          if (idx !== -1) {
            prevKnownIdx = idx;
            break;
          }
        }

        if (prevKnownIdx !== -1) {
          orderedMessageIds.splice(prevKnownIdx + 1, 0, id);
          continue;
        }

        // Fallback for ChatGPT numeric turn IDs (e.g. turn-2, turn-4)
        const curMatch = id.match(/turn-(\d+)/);
        if (curMatch) {
          const curTurnNum = parseInt(curMatch[1], 10);
          let inserted = false;
          for (let k = 0; k < orderedMessageIds.length; k++) {
            const kMatch = orderedMessageIds[k].match(/turn-(\d+)/);
            if (kMatch && parseInt(kMatch[1], 10) > curTurnNum) {
              orderedMessageIds.splice(k, 0, id);
              inserted = true;
              break;
            }
          }
          if (inserted) continue;
        }

        // Non-overlapping fallback: determine position based on scroll position / direction
        const scrollContainer = getScrollContainer();
        const maxScroll = Math.max(1, (scrollContainer ? scrollContainer.scrollHeight - scrollContainer.clientHeight : 1));
        const scrollRatio = scrollContainer ? (scrollContainer.scrollTop / maxScroll) : 0.5;

        if (isScanningUpward || (isScrollingUp && scrollRatio < 0.65) || scrollRatio < 0.25) {
          orderedMessageIds.unshift(id);
        } else {
          orderedMessageIds.push(id);
        }
      }
    }

    // Synchronize turnIndex for all harvested messages to their global sequential rank
    orderedMessageIds.forEach((id, index) => {
      const msg = harvestedMessagesMap.get(id);
      if (msg) {
        msg.turnIndex = index;
      }
    });
  }

  /**
   * Group harvested messages into Prompt Turns strictly in chronological order
   * Each turn contains: { id, number, turnIndex, prompt, responses: [] }
   */
  function getConversationTurns() {
    // 1. Build sorted array strictly from the global sequence tracker
    const sorted = orderedMessageIds
      .map(id => harvestedMessagesMap.get(id))
      .filter(Boolean);

    // 2. Append any harvested messages not yet tracked in orderedMessageIds
    if (sorted.length < harvestedMessagesMap.size) {
      harvestedMessagesMap.forEach((msg, id) => {
        if (!orderedMessageIds.includes(id)) {
          sorted.push(msg);
        }
      });
    }

    const turns = [];
    let currentTurn = null;

    for (const msg of sorted) {
      if (msg.role === 'user') {
        currentTurn = {
          id: msg.id,
          number: turns.length + 1,
          turnIndex: typeof msg.turnIndex === 'number' ? msg.turnIndex : turns.length * 2,
          prompt: msg,
          responses: []
        };
        turns.push(currentTurn);
      } else {
        if (currentTurn) {
          currentTurn.responses.push(msg);
        } else {
          // Assistant message before any user prompt (initial greeting)
          currentTurn = {
            id: msg.id,
            number: 1,
            turnIndex: typeof msg.turnIndex === 'number' ? msg.turnIndex : 0,
            prompt: {
              id: msg.id + '-intro',
              role: 'user',
              authorName: 'Intro',
              text: 'Initial Assistant Greeting',
              contentElement: null,
              contentHtml: ''
            },
            responses: [msg]
          };
          turns.push(currentTurn);
        }
      }
    }

    // Fallback: If no user messages were detected, wrap every message as a turn
    if (turns.length === 0 && sorted.length > 0) {
      sorted.forEach((msg, idx) => {
        turns.push({
          id: msg.id,
          number: idx + 1,
          turnIndex: typeof msg.turnIndex === 'number' ? msg.turnIndex : idx,
          prompt: msg,
          responses: []
        });
      });
    }

    return turns;
  }

  /**
   * Determine turn selection status: 'full' | 'partial' | 'none'
   */
  function getTurnSelectionStatus(turn) {
    const promptSelected = selectedMessageIds.has(turn.prompt.id);
    const respCount = turn.responses.length;
    const selectedRespCount = turn.responses.filter(r => selectedMessageIds.has(r.id)).length;

    if (respCount === 0) {
      return promptSelected ? 'full' : 'none';
    }

    if (promptSelected && selectedRespCount === respCount) {
      return 'full';
    }
    if (!promptSelected && selectedRespCount === 0) {
      return 'none';
    }
    return 'partial';
  }

  /**
   * Create Left Sidebar and its Floating Toggle Tab
   */
  function createSidebar() {
    if (document.getElementById('chat-pdf-sidebar')) return;

    // 1. Floating Toggle Tab (visible when sidebar is collapsed)
    sidebarToggleTabEl = document.createElement('div');
    sidebarToggleTabEl.id = 'chat-pdf-sidebar-toggle-tab';
    sidebarToggleTabEl.className = 'chat-pdf-hidden';
    sidebarToggleTabEl.title = 'Open Prompt Index Sidebar';
    sidebarToggleTabEl.innerHTML = `
      <span>📑</span>
      <span class="chat-pdf-tab-text">Prompt Index</span>
      <span id="chat-pdf-tab-count" style="font-size: 10px;">0</span>
    `;
    document.body.appendChild(sidebarToggleTabEl);

    // 2. Sidebar Container
    sidebarEl = document.createElement('aside');
    sidebarEl.id = 'chat-pdf-sidebar';

    sidebarEl.innerHTML = `
      <!-- Header -->
      <div class="chat-pdf-sidebar-header">
        <div class="chat-pdf-sidebar-brand">
          <span style="font-size: 18px;">📑</span>
          <span class="chat-pdf-sidebar-title">Prompt Index</span>
          <span class="chat-pdf-platform-pill">${activeAdapter ? activeAdapter.name : 'AI'}</span>
        </div>
        <div class="chat-pdf-sidebar-header-actions">
          <button class="chat-pdf-icon-btn" id="chat-pdf-sidebar-btn-rescan" title="Re-scan full conversation">🔄</button>
          <button class="chat-pdf-icon-btn" id="chat-pdf-sidebar-btn-collapse" title="Collapse Sidebar">▶</button>
        </div>
      </div>

      <!-- Update Notification Banner (shows when new version is released on GitHub) -->
      <div id="chat-pdf-sidebar-update-banner" style="display: none; padding: 6px 14px; background: linear-gradient(135deg, #eff6ff, #dbeafe); border-bottom: 1px solid #bfdbfe; font-size: 11px; align-items: center; justify-content: space-between;">
        <span style="color: #1e40af; font-weight: 600;">🚀 Update <span id="chat-pdf-sidebar-update-version">v1.2.0</span> ready!</span>
        <a href="https://github.com/jaswanth-coder/ai-chat-to-pdf/releases/latest" target="_blank" style="background: #2563eb; color: #ffffff; padding: 2px 8px; border-radius: 4px; font-weight: 700; text-decoration: none; font-size: 10px;">Update</a>
      </div>

      <!-- Search Box -->
      <div class="chat-pdf-search-wrap">
        <div class="chat-pdf-search-box">
          <input type="text" id="chat-pdf-sidebar-search" placeholder="🔍 Search prompts..." />
          <button class="chat-pdf-search-clear" id="chat-pdf-sidebar-search-clear" style="display: none;">✕</button>
        </div>
      </div>

      <!-- Smart Selection Toolbar -->
      <div class="chat-pdf-smart-toolbar">
        <div class="chat-pdf-smart-btn-row">
          <button class="chat-pdf-smart-btn" id="chat-pdf-smart-all" title="Select all prompts & answers">Select All</button>
          <button class="chat-pdf-smart-btn chat-pdf-smart-btn-inverse" id="chat-pdf-smart-inverse" title="Invert selection: select all unselected ones, unselect selected ones">⇄ Inverse</button>
          <button class="chat-pdf-smart-btn" id="chat-pdf-smart-clear" title="Clear all selections">Clear</button>
        </div>
        <div class="chat-pdf-smart-filters">
          <button class="chat-pdf-filter-pill chat-pdf-active" data-mode="all" title="Export both user prompts & AI responses">All Q&A</button>
          <button class="chat-pdf-filter-pill" data-mode="prompts" title="Select only user prompts">Prompts Only</button>
          <button class="chat-pdf-filter-pill" data-mode="answers" title="Select only AI responses">Answers Only</button>
        </div>
      </div>

      <!-- Auto-Scan Banner -->
      <div class="chat-pdf-scan-status-bar" id="chat-pdf-scan-banner" style="display: none;">
        <div>
          <span class="chat-pdf-spinner" id="chat-pdf-scan-spinner"></span>
          <span id="chat-pdf-scan-text">Scanning conversation...</span>
        </div>
        <button class="chat-pdf-scan-stop-btn" id="chat-pdf-scan-stop-btn">Stop</button>
      </div>

      <!-- Selection Summary -->
      <div class="chat-pdf-selection-summary">
        <span id="chat-pdf-summary-text">0 of 0 prompts selected</span>
        <span class="chat-pdf-selected-count-badge" id="chat-pdf-summary-badge">0 msgs</span>
      </div>

      <!-- Prompt List -->
      <div class="chat-pdf-prompt-list" id="chat-pdf-prompt-list">
        <div class="chat-pdf-empty-index">Scanning prompts...</div>
      </div>

      <!-- Footer / Export -->
      <div class="chat-pdf-sidebar-footer">
        <button class="chat-pdf-sidebar-export-btn" id="chat-pdf-sidebar-export-btn">
          <span>📥</span> Download PDF (<span id="chat-pdf-sidebar-export-count">0</span>)
        </button>
      </div>
    `;

    document.body.appendChild(sidebarEl);

    // Sidebar Event Handlers
    const btnCollapse = sidebarEl.querySelector('#chat-pdf-sidebar-btn-collapse');
    const btnRescan = sidebarEl.querySelector('#chat-pdf-sidebar-btn-rescan');
    const btnExport = sidebarEl.querySelector('#chat-pdf-sidebar-export-btn');
    const searchInput = sidebarEl.querySelector('#chat-pdf-sidebar-search');
    const searchClear = sidebarEl.querySelector('#chat-pdf-sidebar-search-clear');
    const btnStopScan = sidebarEl.querySelector('#chat-pdf-scan-stop-btn');

    // Smart Selection buttons
    const btnSmartAll = sidebarEl.querySelector('#chat-pdf-smart-all');
    const btnSmartInverse = sidebarEl.querySelector('#chat-pdf-smart-inverse');
    const btnSmartClear = sidebarEl.querySelector('#chat-pdf-smart-clear');

    // Collapse / Expand
    btnCollapse.addEventListener('click', () => setSidebarCollapsed(true));
    sidebarToggleTabEl.addEventListener('click', () => setSidebarCollapsed(false));

    // Rescan & Stop
    btnRescan.addEventListener('click', () => autoScanEntireChat({ isAuto: false }));
    btnStopScan.addEventListener('click', () => {
      stopScanRequested = true;
    });

    // Export
    btnExport.addEventListener('click', handleExport);

    // Smart selections
    btnSmartAll.addEventListener('click', () => selectAllMessages(true));
    btnSmartClear.addEventListener('click', () => selectAllMessages(false));
    btnSmartInverse.addEventListener('click', invertSelection);

    // Filter pills (All Q&A / Prompts Only / Answers Only)
    const filterPills = sidebarEl.querySelectorAll('.chat-pdf-filter-pill');
    filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        filterPills.forEach(p => p.classList.remove('chat-pdf-active'));
        pill.classList.add('chat-pdf-active');
        const mode = pill.dataset.mode;
        activeFilterMode = mode;
        applyFilterMode(mode);
      });
    });

    // Search input
    searchInput.addEventListener('input', (e) => {
      searchQuery = (e.target.value || '').trim().toLowerCase();
      searchClear.style.display = searchQuery ? 'block' : 'none';
      renderSidebarPromptList();
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      searchClear.style.display = 'none';
      renderSidebarPromptList();
    });
  }

  /**
   * Set sidebar collapsed state
   */
  function setSidebarCollapsed(collapsed) {
    isSidebarCollapsed = collapsed;
    if (sidebarEl) {
      sidebarEl.classList.toggle('chat-pdf-collapsed', collapsed);
    }
    if (sidebarToggleTabEl) {
      sidebarToggleTabEl.classList.toggle('chat-pdf-hidden', !collapsed);
    }
  }

  /**
   * Floating bar widget removed as requested to keep UI clean and unobtrusive.
   */
  function createFloatingBar() {
    // Intentionally left blank - all controls are unified inside the right sidebar
  }

  /**
   * Harvest messages currently in DOM and attach/update checkboxes
   */
  function harvestAndAttach() {
    if (!activeAdapter) return;

    const elements = activeAdapter.getMessageElements();
    const currentDomIds = [];

    elements.forEach((element) => {
      const data = activeAdapter.extractMessageData(element);
      if (!data || !data.id) return;

      currentDomIds.push(data.id);

      // Preserve previously harvested clean contentHtml if element is unmounting
      const existing = harvestedMessagesMap.get(data.id);
      if (existing && !data.contentHtml && existing.contentHtml) {
        data.contentHtml = existing.contentHtml;
      }

      // Save/update in persistent store
      harvestedMessagesMap.set(data.id, data);

      // If "Select All" was previously clicked, mark newly discovered items
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
        updateUI();
      });
    });

    // Merge observed DOM order into global chronological sequence
    updateGlobalMessageOrder(currentDomIds);

    updateUI();
  }

  /**
   * Render the prompt index list in the left sidebar
   */
  function renderSidebarPromptList() {
    const listContainer = document.getElementById('chat-pdf-prompt-list');
    if (!listContainer) return;

    const turns = getConversationTurns();

    // Filter turns if search query is present
    const filteredTurns = searchQuery
      ? turns.filter(turn => {
          const promptText = (turn.prompt.text || '').toLowerCase();
          const responsesText = turn.responses.map(r => r.text || '').join(' ').toLowerCase();
          return promptText.includes(searchQuery) || responsesText.includes(searchQuery);
        })
      : turns;

    if (filteredTurns.length === 0) {
      listContainer.innerHTML = `
        <div class="chat-pdf-empty-index">
          ${searchQuery ? 'No prompts matching "' + escapeHtml(searchQuery) + '"' : (isScanning ? 'Scanning prompts...' : 'No conversation prompts found yet. Try scrolling or click "🔄 Re-scan".')}
        </div>
      `;
      return;
    }

    let html = '';
    filteredTurns.forEach((turn) => {
      const status = getTurnSelectionStatus(turn);
      const isSelected = status === 'full' || status === 'partial';
      const hasImage = turn.prompt.contentHtml && turn.prompt.contentHtml.includes('<img');
      const promptFull = turn.prompt.text || (hasImage ? '🖼️ [Attached Image]' : 'Untitled Prompt');
      const promptSnippet = promptFull.length > 85 ? promptFull.slice(0, 85) + '...' : promptFull;

      // Extract response preview
      let respSnippet = '';
      if (turn.responses.length > 0) {
        const firstResp = turn.responses[0].text || '';
        respSnippet = firstResp.length > 70 ? firstResp.slice(0, 70) + '...' : firstResp;
      }

      html += `
        <div class="chat-pdf-prompt-item ${isSelected ? 'chat-pdf-turn-selected' : ''}" data-turn-id="${turn.id}">
          <input type="checkbox" class="chat-pdf-item-checkbox" ${status === 'full' ? 'checked' : ''} ${status === 'partial' ? 'data-indeterminate="true"' : ''} />
          <span class="chat-pdf-turn-badge">#${turn.number}</span>
          <div class="chat-pdf-prompt-body">
            <div class="chat-pdf-prompt-title" title="${escapeHtml(promptFull)}">${escapeHtml(promptSnippet)}</div>
            <div class="chat-pdf-prompt-preview">
              ${respSnippet ? '🤖 ' + escapeHtml(respSnippet) : (turn.responses.length > 0 ? `🤖 ${turn.responses.length} response(s)` : 'Waiting for answer...')}
            </div>
          </div>
          <button class="chat-pdf-jump-btn" title="Jump to this message in chat">🎯</button>
        </div>
      `;
    });

    listContainer.innerHTML = html;

    // Handle indeterminate checkboxes & attach card click events
    const itemCards = listContainer.querySelectorAll('.chat-pdf-prompt-item');
    itemCards.forEach((card, index) => {
      const turn = filteredTurns[index];
      const checkbox = card.querySelector('.chat-pdf-item-checkbox');
      const jumpBtn = card.querySelector('.chat-pdf-jump-btn');

      if (checkbox && checkbox.dataset.indeterminate === 'true') {
        checkbox.indeterminate = true;
      }

      // Card click toggles selection
      card.addEventListener('click', (e) => {
        if (e.target === jumpBtn || jumpBtn.contains(e.target)) {
          return; // Jump handled separately
        }
        if (e.target !== checkbox) {
          toggleTurn(turn);
        }
      });

      // Checkbox click
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        toggleTurn(turn, checkbox.checked);
      });

      // Jump button click
      jumpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        jumpToTurn(turn);
      });
    });
  }

  /**
   * Jump smoothly to a turn in the conversation
   */
  function jumpToTurn(turn) {
    if (!turn || !turn.prompt) return;

    let targetEl = turn.prompt.contentElement;
    if (!targetEl || !document.contains(targetEl)) {
      targetEl = document.querySelector(`[data-chat-pdf-id="${turn.prompt.id}"]`);
    }

    if (targetEl && document.contains(targetEl)) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.classList.remove('chat-pdf-pulse-highlight');
      void targetEl.offsetWidth; // force repaint
      targetEl.classList.add('chat-pdf-pulse-highlight');
      setTimeout(() => targetEl.classList.remove('chat-pdf-pulse-highlight'), 2000);
    } else {
      // Virtualized: approximate container scroll position
      const scrollContainer = getScrollContainer();
      const turns = getConversationTurns();
      const total = Math.max(1, turns.length);
      const ratio = Math.max(0, Math.min(1, (turn.number - 1) / total));
      const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      scrollContainer.scrollTo({ top: ratio * maxScroll, behavior: 'smooth' });

      // After scroll settles and DOM mounts
      setTimeout(() => {
        harvestAndAttach();
        const mountedEl = document.querySelector(`[data-chat-pdf-id="${turn.prompt.id}"]`) ||
                          activeAdapter?.getMessageElements()?.find(el => {
                            const d = activeAdapter.extractMessageData(el);
                            return d && d.id === turn.prompt.id;
                          });
        if (mountedEl) {
          mountedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          mountedEl.classList.add('chat-pdf-pulse-highlight');
          setTimeout(() => mountedEl.classList.remove('chat-pdf-pulse-highlight'), 2000);
        }
      }, 350);
    }
  }

  /**
   * Toggle a specific turn's selection
   */
  function toggleTurn(turn, forceState = null) {
    const currentStatus = getTurnSelectionStatus(turn);
    const shouldSelect = forceState !== null ? forceState : (currentStatus !== 'full');

    if (shouldSelect) {
      selectedMessageIds.add(turn.prompt.id);
      turn.responses.forEach(r => selectedMessageIds.add(r.id));
    } else {
      selectedMessageIds.delete(turn.prompt.id);
      turn.responses.forEach(r => selectedMessageIds.delete(r.id));
    }

    isAllSelected = (selectedMessageIds.size === harvestedMessagesMap.size && harvestedMessagesMap.size > 0);
    syncInChatCheckboxes();
    updateUI();
  }

  /**
   * Synchronize in-chat checkboxes mounted in DOM with selectedMessageIds
   */
  function syncInChatCheckboxes() {
    if (!activeAdapter) return;
    const elements = activeAdapter.getMessageElements();
    elements.forEach(element => {
      const data = activeAdapter.extractMessageData(element);
      if (data && data.id) {
        const isChecked = selectedMessageIds.has(data.id);
        const checkbox = element.querySelector('.chat-pdf-checkbox');
        if (checkbox) {
          checkbox.checked = isChecked;
        }
        if (isChecked) {
          element.classList.add('chat-pdf-selected');
        } else {
          element.classList.remove('chat-pdf-selected');
        }
      }
    });
  }

  /**
   * Smart Selection: Invert current selection
   * Selects all unselected turns and deselects selected ones
   */
  function invertSelection() {
    const turns = getConversationTurns();
    if (turns.length === 0) return;

    turns.forEach(turn => {
      const status = getTurnSelectionStatus(turn);
      if (status === 'full' || status === 'partial') {
        // Unselect turn
        selectedMessageIds.delete(turn.prompt.id);
        turn.responses.forEach(r => selectedMessageIds.delete(r.id));
      } else {
        // Select turn
        selectedMessageIds.add(turn.prompt.id);
        turn.responses.forEach(r => selectedMessageIds.add(r.id));
      }
    });

    isAllSelected = (selectedMessageIds.size === harvestedMessagesMap.size && harvestedMessagesMap.size > 0);
    syncInChatCheckboxes();
    updateUI();
  }

  /**
   * Smart Filter Modes: All Q&A / Prompts Only / Answers Only
   */
  function applyFilterMode(mode) {
    const turns = getConversationTurns();
    selectedMessageIds.clear();

    if (mode === 'all') {
      // Select both prompt and all responses
      turns.forEach(turn => {
        selectedMessageIds.add(turn.prompt.id);
        turn.responses.forEach(r => selectedMessageIds.add(r.id));
      });
      isAllSelected = true;
    } else if (mode === 'prompts') {
      // Select only user prompts
      turns.forEach(turn => {
        selectedMessageIds.add(turn.prompt.id);
      });
      isAllSelected = false;
    } else if (mode === 'answers') {
      // Select only assistant responses
      turns.forEach(turn => {
        turn.responses.forEach(r => selectedMessageIds.add(r.id));
      });
      isAllSelected = false;
    }

    syncInChatCheckboxes();
    updateUI();
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

    syncInChatCheckboxes();
    updateUI();
  }

  /**
   * Update UI badges, counters, and sidebar list
   */
  function updateUI() {
    updateCounters();
    renderSidebarPromptList();
  }

  /**
   * Update all badge counters across sidebar and floating bar
   */
  function updateCounters() {
    const turns = getConversationTurns();
    const totalPrompts = turns.length;
    const selectedPrompts = turns.filter(t => getTurnSelectionStatus(t) === 'full' || getTurnSelectionStatus(t) === 'partial').length;
    const totalMessages = harvestedMessagesMap.size;
    const selectedCount = isAllSelected ? totalMessages : selectedMessageIds.size;

    // Floating bar badge
    const counterEl = document.getElementById('chat-pdf-counter');
    if (counterEl) {
      if (isScanning) {
        counterEl.textContent = `Scanning... (${totalPrompts} prompts)`;
      } else if (isAllSelected) {
        counterEl.textContent = `${totalPrompts} prompts (All)`;
      } else {
        counterEl.textContent = `${selectedPrompts} / ${totalPrompts} prompts`;
      }
    }

    // Sidebar summary
    const summaryText = document.getElementById('chat-pdf-summary-text');
    if (summaryText) {
      summaryText.textContent = `${selectedPrompts} of ${totalPrompts} prompts selected`;
    }

    const summaryBadge = document.getElementById('chat-pdf-summary-badge');
    if (summaryBadge) {
      summaryBadge.textContent = `${selectedCount} msg${selectedCount === 1 ? '' : 's'}`;
    }

    // Sidebar export button count
    const exportCount = document.getElementById('chat-pdf-sidebar-export-count');
    const displayCount = selectedCount > 0 ? selectedCount : totalMessages;
    if (exportCount) {
      exportCount.textContent = displayCount;
    }

    // Floating tab count
    const tabCount = document.getElementById('chat-pdf-tab-count');
    if (tabCount) {
      tabCount.textContent = `${selectedPrompts}/${totalPrompts}`;
    }

    // Export button enabled/disabled: always enabled when messages exist
    const exportBtn = document.getElementById('chat-pdf-sidebar-export-btn');
    if (exportBtn) {
      exportBtn.disabled = totalMessages === 0;
    }
  }

  /**
   * Continuous Scroll Harvester
   * Captures newly mounted DOM messages into memory whenever the page is scrolled
   */
  function setupScrollHarvester() {
    const debouncedHarvest = window.ChatPdfUtils.debounce(() => {
      harvestAndAttach();
    }, 75);

    const onScroll = () => {
      const container = getScrollContainer();
      const curTop = container ? container.scrollTop : window.scrollY;
      if (curTop < lastObservedScrollTop - 15) {
        isScrollingUp = true;
      } else if (curTop > lastObservedScrollTop + 15) {
        isScrollingUp = false;
      }
      lastObservedScrollTop = curTop;
      debouncedHarvest();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });

    const container = getScrollContainer();
    if (container && container !== window && container !== document) {
      container.addEventListener('scroll', onScroll, { passive: true });
    }
  }

  /**
   * Auto-Scan Entire Chat (smooth auto-scroll up and down)
   * Automatically indexes all conversations and prompts into the left sidebar
   */
  async function autoScanEntireChat(options = {}) {
    if (isScanning) return;
    isScanning = true;
    stopScanRequested = false;

    const banner = document.getElementById('chat-pdf-scan-banner');
    const bannerText = document.getElementById('chat-pdf-scan-text');
    const spinner = document.getElementById('chat-pdf-scan-spinner');

    if (banner) {
      banner.style.display = 'flex';
      banner.className = 'chat-pdf-scan-status-bar scanning';
      if (spinner) spinner.style.display = 'inline-block';
      if (bannerText) bannerText.textContent = 'Auto-scanning chat...';
    }

    updateCounters();

    const scrollContainer = getScrollContainer();
    const originalScrollTop = scrollContainer.scrollTop;

    try {
      // 0. Fast Zero-Scroll API Preloader check
      if (activeAdapter && typeof activeAdapter.fetchConversationApi === 'function') {
        try {
          if (bannerText) bannerText.textContent = 'Checking fast conversation API...';
          const apiMessages = await activeAdapter.fetchConversationApi();
          if (apiMessages && apiMessages.length > 0) {
            apiMessages.forEach(msg => {
              if (!harvestedMessagesMap.has(msg.id)) {
                harvestedMessagesMap.set(msg.id, msg);
              } else {
                const existing = harvestedMessagesMap.get(msg.id);
                if (!existing.text && msg.text) existing.text = msg.text;
                if (!existing.contentHtml && msg.contentHtml) existing.contentHtml = msg.contentHtml;
              }
            });

            // Set orderedMessageIds directly from the 100% verified chronological sequence
            orderedMessageIds = apiMessages.map(m => m.id);

            // Enrich with any elements currently in DOM
            harvestAndAttach();

            // Select all by default
            selectAllMessages(true);

            if (banner) {
              banner.className = 'chat-pdf-scan-status-bar';
              if (spinner) spinner.style.display = 'none';
              const count = getConversationTurns().length;
              if (bannerText) {
                bannerText.textContent = `✓ Instant loaded ${count} prompts (${apiMessages.length} msgs) without scrolling!`;
              }
              setTimeout(() => {
                if (!isScanning && banner) banner.style.display = 'none';
              }, 3500);
            }
            isScanning = false;
            updateUI();
            return;
          }
        } catch (err) {
          console.warn('API preloader bypassed, continuing with auto-scroll scan:', err);
        }
      }

      // 1. Initial harvest pass
      harvestAndAttach();

      const stepSize = Math.min(720, Math.max(500, Math.floor((scrollContainer.clientHeight || 750) * 0.82)));
      const stepDelay = 125; // 125ms ensures virtual scroll renders reliably across all hardware

      // 2. Scroll upward to mount and harvest older messages up to top
      isScanningUpward = true;
      let lastTop = -1;
      let attempts = 0;
      const maxUpwardAttempts = 120;

      while (scrollContainer.scrollTop > 5 && attempts < maxUpwardAttempts) {
        if (stopScanRequested) break;
        if (scrollContainer.scrollTop === lastTop) break;
        lastTop = scrollContainer.scrollTop;
        scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop - stepSize);
        await new Promise(r => setTimeout(r, stepDelay));
        harvestAndAttach();

        if (bannerText) {
          bannerText.textContent = `Scanning upward... (${getConversationTurns().length} prompts)`;
        }
        attempts++;
      }
      isScanningUpward = false;

      // 3. Scroll downward from top to bottom
      let prevScrollTop = -1;
      let prevHeight = -1;
      let noProgressCount = 0;
      attempts = 0;
      const maxDownwardAttempts = 160;

      while (attempts < maxDownwardAttempts) {
        if (stopScanRequested) break;

        const maxScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
        const atBottom = scrollContainer.scrollTop >= maxScroll - 20;

        if (atBottom && scrollContainer.scrollHeight === prevHeight) {
          noProgressCount++;
          if (noProgressCount >= 3) break; // Reached end of thread
        } else if (scrollContainer.scrollTop === prevScrollTop && scrollContainer.scrollHeight === prevHeight) {
          noProgressCount++;
          if (noProgressCount >= 3) break;
        } else {
          noProgressCount = 0;
        }

        prevScrollTop = scrollContainer.scrollTop;
        prevHeight = scrollContainer.scrollHeight;

        scrollContainer.scrollTop = Math.min(scrollContainer.scrollHeight, scrollContainer.scrollTop + stepSize);
        await new Promise(r => setTimeout(r, stepDelay));
        harvestAndAttach();

        if (bannerText) {
          bannerText.textContent = `Scanning downward... (${getConversationTurns().length} prompts)`;
        }
        attempts++;
      }

      // Final harvest pass
      harvestAndAttach();

      // Select all by default after scan
      selectAllMessages(true);

      // Restore user's original scroll position smoothly
      scrollContainer.scrollTop = originalScrollTop;

      if (banner) {
        banner.className = 'chat-pdf-scan-status-bar';
        if (spinner) spinner.style.display = 'none';
        const count = getConversationTurns().length;
        if (bannerText) {
          bannerText.textContent = stopScanRequested ? `Scan stopped — ${count} prompts indexed` : `✓ Scan complete — ${count} prompts indexed`;
        }
        // Auto-fade banner after 4 seconds
        setTimeout(() => {
          if (!isScanning && banner) banner.style.display = 'none';
        }, 4000);
      }
    } catch (err) {
      console.error('Chat auto-scan error:', err);
    } finally {
      isScanning = false;
      isScanningUpward = false;
      stopScanRequested = false;
      updateUI();
    }
  }

  /**
   * Handle PDF Export click
   */
  async function handleExport() {
    if (!activeAdapter) return;

    const exportBtn = document.getElementById('chat-pdf-sidebar-export-btn');
    const originalText = exportBtn ? exportBtn.innerHTML : '';

    try {
      if (exportBtn) {
        exportBtn.innerHTML = '<span>⏳</span> Preparing PDF...';
        exportBtn.disabled = true;
      }

      harvestAndAttach();

      // Gather all messages in strict chronological order according to global sequence tracker
      const allOrderedMessages = orderedMessageIds
        .map(id => harvestedMessagesMap.get(id))
        .filter(Boolean);

      // Fallback: append any harvested messages not yet tracked in orderedMessageIds
      if (allOrderedMessages.length < harvestedMessagesMap.size) {
        harvestedMessagesMap.forEach((msg, id) => {
          if (!orderedMessageIds.includes(id)) {
            allOrderedMessages.push(msg);
          }
        });
      }

      let exportMessages = [];

      if (isAllSelected || selectedMessageIds.size === 0) {
        exportMessages = [...allOrderedMessages];
      } else {
        exportMessages = allOrderedMessages.filter(msg => selectedMessageIds.has(msg.id));
      }

      if (exportMessages.length === 0) {
        exportMessages = [...allOrderedMessages];
      }

      if (exportMessages.length === 0) {
        alert('No messages found. Try scrolling through the chat or clicking "🔄 Re-scan" first.');
        return;
      }

      // Always sort strictly by turnIndex so chronological order is 100% preserved
      exportMessages.sort((a, b) => {
        const idxA = (typeof a.turnIndex === 'number') ? a.turnIndex : 0;
        const idxB = (typeof b.turnIndex === 'number') ? b.turnIndex : 0;
        return idxA - idxB;
      });

      if (exportMessages.length > MAX_EXPORT_LIMIT) {
        const proceed = confirm(
          `You have ${exportMessages.length} messages selected (limit is ${MAX_EXPORT_LIMIT}). For optimal browser performance and PDF rendering, the first ${MAX_EXPORT_LIMIT} messages will be exported in chronological order. Proceed?`
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
    } catch (err) {
      console.error('PDF Export Error:', err);
      alert('PDF export failed: ' + (err.message || err));
    } finally {
      if (exportBtn) {
        exportBtn.innerHTML = originalText;
        exportBtn.disabled = false;
        updateCounters();
      }
    }
  }

  /**
   * Setup MutationObserver for DOM changes
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
            if (
              node.nodeType === 1 &&
              !node.classList?.contains('chat-pdf-select-container') &&
              node.id !== 'chat-pdf-sidebar' &&
              node.id !== 'chat-pdf-floating-bar' &&
              node.id !== 'chat-pdf-sidebar-toggle-tab'
            ) {
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

  function getConversationKey(url) {
    try {
      const u = new URL(url);
      return u.origin + u.pathname;
    } catch (e) {
      return (url || '').split('?')[0].split('#')[0];
    }
  }

  /**
   * Watch for SPA conversation URL changes (ChatGPT, Claude, Gemini)
   */
  function setupUrlWatcher() {
    let lastKey = getConversationKey(window.location.href);
    setInterval(() => {
      const currentKey = getConversationKey(window.location.href);
      if (currentKey !== lastKey) {
        lastKey = currentKey;
        // Clean reset for new conversation
        harvestedMessagesMap.clear();
        orderedMessageIds = [];
        selectedMessageIds.clear();
        isAllSelected = false;
        updateUI();

        // Auto-scan new conversation after hydration
        setTimeout(() => {
          autoScanEntireChat({ isAuto: true });
        }, 1500);
      }
    }, 1000);
  }

  /**
   * Escape HTML helper
   */
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Setup message listener for popup
   */
  function setupMessageListener() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'GET_STATUS') {
          const turns = getConversationTurns();
          sendResponse({
            active: !!activeAdapter,
            provider: activeAdapter ? activeAdapter.name : null,
            totalMessages: harvestedMessagesMap.size,
            selectedCount: isAllSelected ? harvestedMessagesMap.size : selectedMessageIds.size,
            totalPrompts: turns.length,
            selectedPrompts: turns.filter(t => getTurnSelectionStatus(t) !== 'none').length
          });
        } else if (request.action === 'SELECT_ALL') {
          selectAllMessages(true);
          sendResponse({ success: true, count: harvestedMessagesMap.size });
        } else if (request.action === 'CLEAR_SELECTION') {
          selectAllMessages(false);
          sendResponse({ success: true, count: 0 });
        } else if (request.action === 'INVERT_SELECTION') {
          invertSelection();
          sendResponse({ success: true, count: selectedMessageIds.size });
        } else if (request.action === 'SCAN_ALL') {
          autoScanEntireChat({ isAuto: false }).then(() => {
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
