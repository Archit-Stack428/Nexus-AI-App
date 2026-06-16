# Nexus AI - Advanced Smart Assistant

Nexus AI is a highly sophisticated, client-side single-page application (SPA) designed as an advanced smart assistant. It delivers real-time information processing, multimodal document and image analysis, language translation, voice input/output features, and session state security.

Built with clean HTML, vanilla CSS, and structured modular Javascript, it requires no backend installation and is fully compatible with static hosting solutions like GitHub Pages.

---

## 🌟 Key Features

### 🤖 AI Chat Engine
* **Context-Aware Conversationalist**: Multi-turn dialogue capability powered by Google's Gemini models.
* **LinkMapper Redirection Safeguard**: Short-token mapping for case-sensitive, base64-encoded search redirection URLs (e.g. Google News links) to prevent model truncation errors.
* **Utility Triggers**: Complete responses with quick action utilities (Copy responses, Regenerate queries, Clear current session).

### 📄 Document & Image Assistants
* **Multimodal PDF Reader**: Client-side parsing using `pdf.js` to extract text, summarize, outline key points, or ask specific document questions.
* **Deep Visual Inspector**: Describes visual elements, analyzes layout code errors, and extracts text via browser-based OCR (`tesseract.js`).

### 🌐 Real-Time Intent Detection & APIs
* **wttr.in Weather Forecast**: Real-time atmospheric conditions and 3-day forecasting (equipped with 4-second timeout abort protection).
* **Wikipedia search context**: Direct extracts and references of searchable entities (with 3-second timeout protection).
* **Google News RSS Reader**: Instantly parses and displays recent feeds based on tags or search terms.
* **MyMemory translation API**: Auto-detects text and performs translation between English and Hindi.

### 🔐 Security & Local Storage
* **SHA-256 Hashing**: Passwords are securely processed client-side using Web Crypto APIs.
* **JWT Authentication**: Mock token authentication structures manage active session lifespans.
* **Local Data Sovereignty**: All user records, chat history indexes, settings, and LinkMapper stores reside strictly within the client browser's `localStorage`.

---

## 🛠️ Technology Stack
* **Markup**: Semantic HTML5
* **Styles**: Vanilla CSS3 (Custom Glassmorphism gradients & HSL variables)
* **Libraries**: 
  * FontAwesome 6.5.1 (icons)
  * PDF.js 3.11.174 (PDF reading)
  * Tesseract.js 5.0.0 (OCR engine)
* **API Providers**:
  * Google Gemini API (v1beta API endpoints)
  * MyMemory Translation API
  * wttr.in (Weather reports)
  * en.wikipedia.org (Wiki summaries)

---

## 🚀 Local Setup & Development

To run the application locally on your computer:

1. Clone the repository:
   ```bash
   git clone https://github.com/Archit-Stack428/Nexus-AI-App.git
   ```
2. Open the directory:
   ```bash
   cd Nexus-AI-App
   ```
3. Run a local development server:
   * **Python 3**:
     ```bash
     python -m http.server 8080
     ```
   * **Node.js (http-server)**:
     ```bash
     npx http-server -p 8080
     ```
4. Access the application in your browser at:
   `http://localhost:8080`

---

## 🌐 Deploying to GitHub Pages (Live Hosting)

Nexus AI can be hosted for free on GitHub Pages:

1. Push all your changes to the main branch on GitHub.
2. In your GitHub Repository:
   * Go to **Settings** -> **Pages**.
   * Under **Build and deployment**, select **Deploy from a branch** under Source.
   * Under **Branch**, select `main` and `/ (root)`, then click **Save**.
3. After a minute, your app will be live at:
   `https://<your-username>.github.io/Nexus-AI-App/`
