# QuickSummarizer ⚡

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Chrome-green.svg)
![Tech Stack](https://img.shields.io/badge/tech-Vanilla%20JS%20%7C%20Manifest%20V3-orange.svg)

**QuickSummarizer** is a seamless, hover-based Google Chrome Extension that tackles information overload and clickbait. Powered by Google's Gemini AI, it provides instant article summaries, sentiment analysis, and topic categorization simply by hovering over a news headline—without ever leaving your current page.

---

## ✨ Key Features

- **Hover-to-Summarize:** Hover over any valid article link for 1.5 seconds to trigger the AI summary. Features a visual intent progress bar to prevent accidental triggers.
- **Gemini AI Integration:** Utilizes Google Gemini (via local proxy) to deliver accurate, bullet-point summaries in seconds.
- **Smart Analysis:** Automatically detects and displays the article's Category and Sentiment (Positive, Negative, Neutral) with dynamically colored UI badges.
- **Save for Later:** Bookmark your favorite summaries locally using Chrome's `storage.local` API. Access them anytime from the extension popup.
- **One-Click Copy:** Easily copy the generated summary, sentiment, and category to your clipboard.
- **Premium UI/UX:** Built with a sleek Dark Mode interface, skeleton loading animations, inline SVG icons, and a highly responsive design.
- **Robust Error Handling:** Includes graceful degradation for API timeouts and 503 errors, ensuring the browser never hangs.

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **Extension API:** Chrome Extension Manifest V3
- **Backend (Proxy):** Node.js / Express (for secure Gemini API calls)
- **AI Model:** Google Gemini API

---

## 🚀 Installation & Setup

Since this extension communicates with a local backend proxy (to securely hold the API keys and prevent CORS issues), you will need to run both the extension and the local server.

### 1. Backend Proxy Setup (API Server)

*Ensure you have Node.js installed.*

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/cs-kaine/QuickSummarizer.git
   ```
2. Navigate to your backend server directory.
3. Install dependencies:
   ```bash
   npm install express cors dotenv @google/genai
   ```
4. Set your Google Gemini API Key in your environment variables (`.env`):
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```
5. Start the server on port 3000:
   ```bash
   node server.js
   ```
   > The extension listens to `http://localhost:3000/api/summarize`.

### 2. Chrome Extension Setup

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **"Developer mode"** by toggling the switch in the top right corner.
3. Click **"Load unpacked"** in the top left corner.
4. Select the folder containing the QuickSummarizer extension files (the folder containing `manifest.json`).

---

## 💡 How to Use

1. **Activate the Extension:** Press the extension icon in your Chrome toolbar or use the shortcut `Ctrl` + `Shift` + `S` to toggle ON/OFF. A toast notification will confirm the state.
2. **Hover over a Headline:** Find a news headline or article link and rest your cursor on it.
3. **Wait for the Cue:** A subtle progress bar will appear at the bottom of the screen. Keep hovering for **1.5 seconds**.
4. **Read the Summary:** A sleek popup will appear — skeleton loader first, then AI-generated bullet points, category, and sentiment.
5. **Interact:** Use the footer buttons to:
   - **Copy** the summary text to your clipboard.
   - **Save** it to your local dashboard (click again to unsave).
6. **View Saved Items:** Click the extension icon in the Chrome toolbar to open the popup dashboard and view/manage all saved summaries.

---

## 📂 Project Structure

```
quicksummarizer/
│
├── Backend/                    # Local proxy server (Node.js)
│   ├── server.js               # Express server — handles Gemini API calls securely
│   ├── package.json            # Backend dependencies
│   ├── package-lock.json       # Dependency lock file
│   └── .gitignore              # Files excluded from version control
│
├── manifest.json               # Chrome Extension configuration (Manifest V3)
├── script.js                   # Content script — hover logic, DOM injection, API calls
├── background.js               # Service worker — handles extension toggle state
├── poptions.html               # Extension popup UI — dashboard for saved summaries
├── popup.js                    # Logic for retrieving and managing saved summaries
├── styles.css                  # Global extension styles
├── package.json                # Frontend/tooling dependencies
├── package-lock.json           # Dependency lock file
└── README.md                   # Project documentation
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the repository.
2. Create your feature branch:
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. Commit your changes:
   ```bash
   git commit -m 'Add some AmazingFeature'
   ```
4. Push to the branch:
   ```bash
   git push origin feature/AmazingFeature
   ```
5. Open a Pull Request.

---

