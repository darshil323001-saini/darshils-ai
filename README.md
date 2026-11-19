# 🧠 DARSHIL'S AI

**Your Mind Matters. Let's Understand It Together.**

A psychology-informed AI companion for students and young adults. Helps with academic stress, emotional wellness, relationships, personal growth, and everyday life problems.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18+ (you have v24.22.1 ✅)

### 1. Start the Backend
```bash
cd backend
node server.js
```
Backend runs on `http://localhost:3001`.

### 2. Open the Frontend
Open `frontend/index.html` directly in your browser.

### 3. (Optional) Connect AI — Install Ollama
For actual AI-powered conversations:

1. Download Ollama: https://ollama.com/download
2. Install and run it
3. Pull a model:
   ```bash
   ollama pull llama3.2
   ```
   Or lighter alternatives: `ollama pull gemma2:2b` or `ollama pull mistral`
4. Ollama runs on `http://localhost:11434` by default
5. DARSHIL'S AI will auto-detect it and show a green "Online" badge

**Hardware requirements for local models:**
- `gemma2:2b` — ~2 GB RAM, runs on most machines
- `llama3.2` (3B) — ~4 GB RAM
- `llama3.2` (8B) — ~8 GB RAM, needs decent GPU
- `mistral` (7B) — ~6 GB RAM

**Without Ollama:** The app works in Offline Guided Framework Mode — breathing exercises, mood tracker, thought reframer, journaling, and habit tracker all work without AI.

---

## 📂 Project Structure

```
mindmate-ai/
├── backend/
│   ├── server.js          # HTTP server (zero npm dependencies)
│   ├── aiProvider.js       # Ollama provider abstraction layer
│   ├── systemPrompt.js     # Psychology-grounded system prompt engine
│   └── safetyFilter.js     # Crisis detection & emergency resources
├── frontend/
│   └── index.html          # Complete SPA (Tailwind CDN + vanilla JS)
└── README.md
```

## 🛡️ Safety

- **Crisis detection** for self-harm, suicide, and immediate danger keywords (English + Hindi/Hinglish)
- **Emergency resources** shown immediately when triggered:
  - 🚨 India Emergency: **112**
  - 📞 Tele-MANAS: **14416** / **1800-891-4416**
  - 📞 KIRAN: **1800-599-0019**
  - 📞 Vandrevala Foundation: **+91 9999 666 555**
  - 🌐 USA/Canada: **988**
  - 🌐 Global: **findahelpline.com**

## 🔒 Privacy

- **Anonymous by default** — no registration, no sign-in
- **Local storage only** — moods, reflections, habits stored in YOUR browser
- **No tracking** — no analytics, no cookies, no third-party data
- **Server conversations** exist only in RAM — restarting the backend clears them
- **User-controlled deletion** — clear any/all data anytime

## 💰 Cost

**₹0.** Zero. Completely free.
- No paid APIs, no subscriptions, no credit card needed
- Ollama runs locally on your own machine
- All data stays on your device

---

## ⚙️ Environment Variables (Optional)

```bash
PORT=3001              # Backend port (default: 3001)
OLLAMA_URL=http://localhost:11434   # Ollama endpoint
OLLAMA_MODEL=llama3.2  # Default model name
```

## 📜 License

Built for educational and personal wellness use. Not a clinical tool.
