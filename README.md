# AI Chat to PDF - ChatGPT, Claude & Gemini Extension

A modern Manifest V3 browser extension that allows you to download conversations from **ChatGPT**, **Claude**, and **Google Gemini** into cleanly formatted, publication-quality PDFs with in-chat message selection.

---

## ✨ Features

- 🎯 **In-Chat Selection**: Select checkboxes appear directly on message turns (user prompts & AI answers).
- 🎛️ **Floating Control Toolbar**: Shows count of selected messages, with 1-click **Select All**, **Clear**, and **Download PDF**.
- 📑 **Publication-Ready PDFs**:
  - Crisp, selectable vector text (not blurry canvas screenshots).
  - Preserved syntax-highlighted code blocks with pre-wrap protection.
  - Formatted tables, blockquotes, lists, and markdown styling.
  - Smart page breaks (`page-break-inside: avoid`) to prevent awkward splits across pages.
  - Customizable header (Chat title, platform badge, export date, message count).
- 🌐 **Multi-Platform Support**:
  - **ChatGPT** (`chatgpt.com` and `chat.openai.com`)
  - **Claude** (`claude.ai`)
  - **Google Gemini** (`gemini.google.com`)
- ⚙️ **Extension Popup**:
  - Quick status indicator.
  - Customizable settings (toggle header, timestamps, font sizes).

---

## 🚀 How to Install & Load in Browser

Works in **Google Chrome**, **Microsoft Edge**, **Brave**, or any Chromium-based browser:

1. Open your browser and navigate to:
   - Chrome / Brave: `chrome://extensions`
   - Edge: `edge://extensions`
2. Enable **Developer mode** (toggle switch in the top-right corner).
3. Click the **Load unpacked** button in the top-left.
4. Select this folder:
   ```
   /home/jaswanth/gpt_chat_dowloader
   ```
5. The extension **"AI Chat to PDF - ChatGPT, Claude & Gemini"** is now installed and active!

---

## 📖 How to Use

1. Go to any conversation on [ChatGPT](https://chatgpt.com), [Claude](https://claude.ai), or [Google Gemini](https://gemini.google.com).
2. Hover over any message: you will notice a selection checkbox in the top-right corner of each message turn.
3. Check the messages you want to include in your PDF (or leave all unchecked to export the entire thread).
4. Look at the bottom-right floating bar:
   - Click **Select All** if you want everything.
   - Click **Download PDF**.
5. The native print preview will open with your chat styled into a document.
6. Choose **"Save as PDF"** as the destination and click **Save**!

---

## 🛠 Project Structure

```
gpt_chat_downloader/
├── manifest.json            # Manifest V3 configuration
├── popup/                   # Extension popup interface
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── icons/                   # Extension icons (16px, 48px, 128px)
├── src/
│   ├── content.js           # Content script & floating UI controller
│   ├── styles.css           # In-chat checkboxes & floating toolbar CSS
│   ├── adapters/
│   │   ├── baseAdapter.js       # Base platform adapter
│   │   ├── chatgptAdapter.js    # ChatGPT DOM extractor
│   │   ├── claudeAdapter.js     # Claude DOM extractor
│   │   ├── geminiAdapter.js     # Google Gemini DOM extractor
│   │   └── adapterManager.js    # Platform detection & adapter switcher
│   ├── exporter/
│   │   └── pdfRenderer.js       # Isolated vector PDF rendering engine
│   └── utils/
│       └── domHelpers.js        # DOM cleaner & utility helpers
└── README.md
```
