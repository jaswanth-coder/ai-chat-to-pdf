# 📄 AI Chat to PDF — ChatGPT, Claude & Gemini

<p align="center">
  <strong>Export AI chats into beautiful, publication-quality vector PDFs with in-chat message selection.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-10a37f.svg?style=flat-square" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Supported-ChatGPT%20%7C%20Claude%20%7C%20Gemini-blue.svg?style=flat-square" alt="Supported Platforms" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="MIT License" />
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome" />
</p>

---

## 🌟 Overview

**AI Chat to PDF** is a browser extension (Chrome, Edge, Brave, Chromium) built on **Manifest V3**. It solves the biggest flaws of conventional chat-saving tools:

1. **Selective Message Picking**: Instead of downloading entire multi-hour transcripts, pick only the critical answers or prompts directly inside the chat UI.
2. **Mathematical Precision (KaTeX)**: Bundled with the official KaTeX rendering engine. Multi-line equations, calculation steps, fractions (`\frac`), division signs (`÷`), matrices, and superscripts are formatted mathematically without collision or displacement.
3. **Preserves User Screenshots & Attachments**: Uploaded images, charts, and screenshots are extracted and scaled cleanly into the PDF.
4. **Bypasses ChatGPT’s 30-Message DOM Virtualization**: ChatGPT unmounts offscreen messages in long chats. Our **Continuous Harvester** and **Auto-Scan** engine captures every turn in conversations with 50, 80, or 100+ messages.
5. **Crystal-Clear Vector Text**: Generates searchable, selectable, hyperlinked vector PDFs using isolated print documents—not blurry, massive canvas screenshots.

---

## 🚀 Key Features

| Feature | Description |
| :--- | :--- |
| 🎯 **In-Chat Checkboxes** | Hover over any prompt or AI response to toggle selection with real-time visual highlighting. |
| 🎛️ **Floating Control Dock** | Non-intrusive bottom-right widget featuring **Scan All**, **Select All**, **Clear**, and **Download PDF**. |
| 🔍 **1-Click Auto-Scan** | Automatically sweeps through long conversations in 2 seconds to load and harvest all messages into memory. |
| 🧮 **Complete Math Support** | Bundled offline KaTeX engine ensures step-by-step calculations and fractions never collapse or misalign. |
| 🖼️ **Screenshot & Image Export** | Full support for user-uploaded screenshots and inline AI graphics with eager-load verification. |
| 💻 **Syntax-Highlighted Code** | Monospace blocks with pre-wrap protection so code never spills across page borders awkwardly. |
| 📑 **Smart Page Breaks** | Uses `break-inside: auto` with header-protection (`break-after: avoid`) for seamless multi-page pagination. |
| 🌐 **Multi-Platform Ready** | Modular adapter design supports **ChatGPT**, **Claude.ai**, and **Google Gemini**. |

---

## 📦 Installation Guide

Works out-of-the-box on **Google Chrome**, **Microsoft Edge**, **Brave**, **Opera**, or any Chromium-based browser.

### Step 1: Clone or Download
```bash
git clone https://github.com/jaswanth-coder/ai-chat-to-pdf.git
```
*(Or download and extract the ZIP file from GitHub)*

### Step 2: Load into Browser
1. Open your browser and navigate to the extensions manager:
   - **Chrome / Brave**: `chrome://extensions`
   - **Edge**: `edge://extensions`
2. Enable **Developer mode** (toggle switch in the top-right corner).
3. Click the **Load unpacked** button in the top-left.
4. Select the `ai-chat-to-pdf` directory.
5. The extension is now active! 🎉

---

## 📖 How to Use

1. Open any chat on:
   - [ChatGPT](https://chatgpt.com)
   - [Claude](https://claude.ai)
   - [Google Gemini](https://gemini.google.com)
2. **Selecting Messages**:
   - Hover over individual message turns to select specific ones via checkboxes.
   - Or click **Select All** on the floating control dock.
   - For long chats (50+ messages), click **`🔍 Scan All`** to automatically harvest all unmounted turns.
3. **Exporting**:
   - Click **Download PDF** on the floating dock or extension popup.
   - The browser's native print preview will open with your chat styled into an academic-grade document.
   - Destination: **Save as PDF** -> Click **Save**.

---

## ⚙️ Extension Settings

Click the extension icon in your browser toolbar to access quick controls:
- **Include Header**: Toggle conversation title, platform badge, and export date.
- **Include Timestamps**: Show or hide exact message timestamps.
- **Font Sizing**: Choose between Small (12px), Medium (14px), or Large (16px).

---

## 🏗️ Technical Architecture

```
ai-chat-to-pdf/
├── manifest.json              # Manifest V3 specification
├── popup/                     # Toolbar popup interface
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── icons/                     # Extension icons (16px, 48px, 128px)
├── src/
│   ├── content.js             # Main orchestrator, harvester, and floating UI
│   ├── styles.css             # In-chat checkbox & floating dock styling
│   ├── adapters/              # Platform DOM extractors
│   │   ├── baseAdapter.js     # Base adapter definition
│   │   ├── chatgptAdapter.js  # ChatGPT dual-pass turn & role extractor
│   │   ├── claudeAdapter.js   # Claude message extractor
│   │   ├── geminiAdapter.js   # Gemini query/response extractor
│   │   └── adapterManager.js  # Host detection & adapter dispatcher
│   ├── exporter/              # Vector PDF generation engine
│   │   ├── katexCss.js        # Bundled official KaTeX layout CSS
│   │   └── pdfRenderer.js     # Isolated print iframe renderer & font sync
│   └── utils/
│       └── domHelpers.js      # Node sanitization, image unwrap, & cloning
├── LICENSE                    # MIT License
└── README.md
```

### Key Engineering Highlights:
- **Persistent Message Store**: Solves React DOM virtualization by retaining cloned message representations in memory across scroll events.
- **Dual-Pass Turn Detection**: Accurately pairs user prompts (including image upload buttons) with model responses without missing turns.
- **Direct KaTeX Embedding**: Bundles official KaTeX styles with zero external CDN dependencies, preventing asynchronous font dropouts or displaced fraction lines during PDF generation.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to open an issue or submit a pull request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for details.
