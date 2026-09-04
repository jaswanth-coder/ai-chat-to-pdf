# 📄 AI Chat to PDF — ChatGPT, Claude & Gemini

<p align="center">
  <strong>Export AI chats into publication-quality vector PDFs with Left Sidebar Prompt Index and Smart Selection.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-10a37f.svg?style=flat-square" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Supported-ChatGPT%20%7C%20Claude%20%7C%20Gemini-blue.svg?style=flat-square" alt="Supported Platforms" />
  <img src="https://img.shields.io/badge/Release-v1.1.0-brightgreen.svg?style=flat-square" alt="Version 1.1.0" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="MIT License" />
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome" />
</p>

---

## 🌟 Overview

**AI Chat to PDF** is a browser extension (Chrome, Edge, Brave, Chromium) built on **Manifest V3**. It transforms AI conversations from ChatGPT, Claude, and Gemini into clean, beautifully formatted vector PDFs:

1. **📑 Left-Side Prompt Index Sidebar**: Displays an interactive index of all conversation prompts with numerical badges (`#1`, `#2`, `#3`...), search filtering, and 1-click jump navigation.
2. **🔄 Automatic Chat Scanner**: Automatically sweeps through the chat on load to harvest virtualized DOM messages into an in-memory store, even across 50–100+ turns.
3. **✨ Smart Selection & Inversion**:
   - **⇄ Inverse Selection**: Invert your selection with one click (selects all unselected prompts and unselects selected ones).
   - **Prompts Only**: Export only your questions/prompts without answers.
   - **Answers Only**: Export only the AI responses.
   - **All Q&A / Select All**: Export complete conversation turns.
4. **🧮 KaTeX Mathematical Precision**: Bundled offline KaTeX styles format formulas, multi-line equations, fractions (`\frac`), division symbols (`÷`), and matrices without clipping or misalignment.
5. **🖼️ User Screenshots & Attachments**: Preserves user-uploaded screenshots and inline graphics in high quality.
6. **🚀 In-App GitHub Update Alerts**: Automatically detects when a new release is available on GitHub and prompts you to update with 1 click.

---

## 🚀 Key Features

| Feature | Description |
| :--- | :--- |
| 📑 **Left Prompt Index Sidebar** | Clean sidebar listing every prompt turn as an index with individual check boxes and jump shortcuts. |
| 🔄 **Automatic Background Scanner** | Automatically sweeps through chats on page load to overcome ChatGPT 30-message virtualization. |
| ⇄ **Smart Inverse Selection** | Instantly inverts selection—selects all unselected prompts and unselects selected ones. |
| 🔍 **Real-Time Prompt Search** | Type in the search box to filter prompts by keyword in real-time. |
| 🎯 **Jump to Message** | Click any prompt card in the sidebar to smoothly scroll directly to that message in the conversation. |
| 🎛️ **Floating Control Dock** | Bottom-right toolbar with fast access to **Prompts**, **Scan All**, **Invert**, and **Download**. |
| 🧮 **Complete Math Support** | Bundled offline KaTeX layout engine guarantees mathematical expressions print cleanly. |
| 🖼️ **Screenshot & Image Export** | Extracts user-uploaded thumbnails and screenshots at full resolution. |
| 💻 **Syntax-Highlighted Code** | Monospace blocks with pre-wrap protection so code never spills across margins. |
| 🌓 **Full Dark Mode Support** | Seamlessly adapts to light and dark themes across ChatGPT, Claude, and Gemini. |

---

## 📦 1-Click Installation (Packed Extension)

You can install the extension into **Google Chrome**, **Microsoft Edge**, **Brave**, **Opera**, or any Chromium browser in less than a minute:

### Option A: Download Packed Extension (`ai-chat-to-pdf.zip`)
1. Download **[`ai-chat-to-pdf.zip`](https://github.com/jaswanth-coder/ai-chat-to-pdf/raw/main/ai-chat-to-pdf.zip)** from this repository (or from [Releases](https://github.com/jaswanth-coder/ai-chat-to-pdf/releases)).
2. Unzip `ai-chat-to-pdf.zip` into a folder.
3. Open your browser and go to:
   - **Chrome / Brave**: `chrome://extensions`
   - **Edge**: `edge://extensions`
4. Turn on **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** in the top-left and select the unzipped folder.
6. Done! The extension icon appears in your toolbar. 🎉

---

### Option B: Clone via Git
```bash
git clone https://github.com/jaswanth-coder/ai-chat-to-pdf.git
```
Then load the cloned folder via `chrome://extensions` -> **Load unpacked**.

---

## 📖 How to Use

1. Open any chat on:
   - [ChatGPT](https://chatgpt.com)
   - [Claude](https://claude.ai)
   - [Google Gemini](https://gemini.google.com)
2. **Left Sidebar Prompt Index**:
   - The sidebar on the left displays all prompts indexed as `#1`, `#2`, `#3`...
   - Check or uncheck any prompt to include/exclude it.
   - Click the **🎯 Jump** button to scroll straight to that message in the chat.
   - Use the **Search bar** to find specific questions quickly.
   - Click **⇄ Inverse** to invert selection.
   - Click **◀** to minimize the sidebar to a slim edge tab anytime.
3. **Exporting**:
   - Click **📥 Download PDF** in the sidebar or floating bar.
   - Choose **Save as PDF** in your browser's print dialog and click **Save**.

---

## 🔄 Automatic Update Notifications

The extension features a built-in release checker:
- When you release a new version or push updates to GitHub, the extension popup and in-chat sidebar will automatically detect the newer version.
- An **Update Available** banner with a direct link allows 1-click access to the latest release package.

---

## 🛠️ Packaging the Extension

To build the packed zip archive locally:
```bash
chmod +x package.sh
./package.sh
```
This produces `ai-chat-to-pdf.zip`, ready for distribution or uploading to GitHub Releases.

---

## 🏗️ Project Architecture

```
ai-chat-to-pdf/
├── manifest.json              # Manifest V3 configuration
├── ai-chat-to-pdf.zip         # Packed distribution archive
├── package.sh                 # Fast packaging script
├── popup/                     # Toolbar popup interface
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── icons/                     # Extension icons (16px, 48px, 128px)
├── src/
│   ├── content.js             # Sidebar, auto-scanner, harvester, & dock
│   ├── styles.css             # Sidebar, prompt list, & dark mode styling
│   ├── adapters/              # Modular platform DOM extractors
│   │   ├── baseAdapter.js     # Base adapter definition
│   │   ├── chatgptAdapter.js  # ChatGPT dual-pass turn & role extractor
│   │   ├── claudeAdapter.js   # Claude message extractor
│   │   ├── geminiAdapter.js   # Gemini query/response extractor
│   │   └── adapterManager.js  # Host detection & adapter dispatcher
│   ├── exporter/              # Vector PDF generation engine
│   │   ├── katexCss.js        # Bundled official KaTeX layout CSS
│   │   └── pdfRenderer.js     # Isolated print iframe renderer & font sync
│   └── utils/
│       └── domHelpers.js      # DOM sanitization & cloning helpers
├── LICENSE                    # MIT License
└── README.md
```

---

## 🤝 Contributing

Pull requests and issues are welcome!
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for details.
