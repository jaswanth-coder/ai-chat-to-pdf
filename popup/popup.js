/**
 * Popup Script
 */
document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('status-badge');
  const activePanel = document.getElementById('active-panel');
  const inactivePanel = document.getElementById('inactive-panel');
  const platformNameEl = document.getElementById('platform-name');
  const msgStatsEl = document.getElementById('msg-stats');

  const btnScanAll = document.getElementById('btn-scan-all');
  const btnSelectAll = document.getElementById('btn-select-all');
  const btnClear = document.getElementById('btn-clear');
  const btnExportPdf = document.getElementById('btn-export-pdf');

  const settingHeader = document.getElementById('setting-header');
  const settingTimestamps = document.getElementById('setting-timestamps');
  const settingFontSize = document.getElementById('setting-font-size');

  // Load saved settings
  if (chrome?.storage?.sync) {
    chrome.storage.sync.get(['includeHeader', 'includeTimestamps', 'fontSize'], (data) => {
      if (data.includeHeader !== undefined) settingHeader.checked = data.includeHeader;
      if (data.includeTimestamps !== undefined) settingTimestamps.checked = data.includeTimestamps;
      if (data.fontSize) settingFontSize.value = data.fontSize;
    });

    const saveSettings = () => {
      chrome.storage.sync.set({
        includeHeader: settingHeader.checked,
        includeTimestamps: settingTimestamps.checked,
        fontSize: settingFontSize.value
      });
    };

    settingHeader.addEventListener('change', saveSettings);
    settingTimestamps.addEventListener('change', saveSettings);
    settingFontSize.addEventListener('change', saveSettings);
  }

  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    showInactive();
    return;
  }

  // Send status request to content script
  try {
    chrome.tabs.sendMessage(tab.id, { action: 'GET_STATUS' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.active) {
        showInactive();
        return;
      }

      showActive(response);
    });
  } catch (err) {
    showInactive();
  }

  function showActive(data) {
    statusBadge.textContent = 'Ready';
    statusBadge.className = 'badge badge-active';
    platformNameEl.textContent = data.provider || 'AI Chat';
    msgStatsEl.textContent = `${data.selectedCount} / ${data.totalMessages} selected`;

    activePanel.classList.remove('hidden');
    inactivePanel.classList.add('hidden');
  }

  function showInactive() {
    statusBadge.textContent = 'Inactive';
    statusBadge.className = 'badge badge-inactive';
    activePanel.classList.add('hidden');
    inactivePanel.classList.remove('hidden');
  }

  // Button actions
  if (btnScanAll) {
    btnScanAll.addEventListener('click', () => {
      msgStatsEl.textContent = 'Scanning full chat...';
      chrome.tabs.sendMessage(tab.id, { action: 'SCAN_ALL' }, (res) => {
        if (res) {
          msgStatsEl.textContent = `${res.count} / ${res.count} selected`;
        }
      });
    });
  }

  btnSelectAll.addEventListener('click', () => {
    chrome.tabs.sendMessage(tab.id, { action: 'SELECT_ALL' }, (res) => {
      if (res) {
        msgStatsEl.textContent = `${res.count} selected`;
      }
    });
  });

  const btnInvert = document.getElementById('btn-invert');
  if (btnInvert) {
    btnInvert.addEventListener('click', () => {
      chrome.tabs.sendMessage(tab.id, { action: 'INVERT_SELECTION' }, (res) => {
        if (res) {
          msgStatsEl.textContent = `${res.count} selected`;
        }
      });
    });
  }

  btnClear.addEventListener('click', () => {
    chrome.tabs.sendMessage(tab.id, { action: 'CLEAR_SELECTION' }, (res) => {
      if (res) {
        msgStatsEl.textContent = `0 selected`;
      }
    });
  });

  btnExportPdf.addEventListener('click', () => {
    chrome.tabs.sendMessage(tab.id, { action: 'EXPORT_PDF' });
    window.close();
  });

  // Check for updates from GitHub
  checkForUpdates();

  async function checkForUpdates() {
    try {
      const updateBanner = document.getElementById('update-banner');
      const newVersionText = document.getElementById('new-version-text');
      if (!updateBanner) return;

      const currentVersion = chrome.runtime.getManifest().version;
      const res = await fetch('https://raw.githubusercontent.com/jaswanth-coder/ai-chat-to-pdf/main/manifest.json', {
        cache: 'no-cache'
      });
      if (!res.ok) return;

      const remoteManifest = await res.json();
      const remoteVersion = remoteManifest.version;

      if (isNewerVersion(remoteVersion, currentVersion)) {
        newVersionText.textContent = `v${remoteVersion}`;
        updateBanner.classList.remove('hidden');
      }
    } catch (e) {
      // Offline / rate limit silent fallback
    }
  }

  function isNewerVersion(remote, current) {
    const rParts = (remote || '').split('.').map(Number);
    const cParts = (current || '').split('.').map(Number);
    for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
      const r = rParts[i] || 0;
      const c = cParts[i] || 0;
      if (r > c) return true;
      if (r < c) return false;
    }
    return false;
  }
});
