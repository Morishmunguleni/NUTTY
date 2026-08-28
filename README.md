# 🤖 N.U.T.T.Y. AI Assistant (Cloud Ready)

Nutty is a full-stack personal AI assistant with a futuristic Iron Man / Jarvis-style HUD, speech recognition, voice synthesis, memory storage, diagnostics, and vision processing.

---

## 🚀 How to Deploy Online (24/7 Cloud Hosting)

### Step 1: Initialize Git and Push to GitHub

In your project terminal, run:

```bash
git init
git add .
git commit -m "Nutty Cloud Release 1.0"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/nutty-ai-assistant.git
git push -u origin main
```

*(If you haven't created the repository on GitHub yet, go to [github.com/new](https://github.com/new) and create a new repo named `nutty-ai-assistant` first).*

---

### Step 2: Deploy on Render (Free & 1-Click)

1. Go to **[render.com](https://render.com)** and sign up / log in with your GitHub account.
2. Click **New +** -> **Web Service**.
3. Select your `nutty-ai-assistant` repository.
4. Fill in the settings:
   - **Name**: `nutty-ai-assistant` (or your choice)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. *(Optional)* Add Environment Variables under **Environment**:
   - `GEMINI_API_KEY`: *(Your Google AI API Key for real conversational intelligence)*
   - `NODE_ENV`: `production`
6. Click **Deploy Web Service**.

Once deployed, Render will provide your public HTTPS link:
👉 `https://nutty-ai-assistant.onrender.com`

---

### Step 3: Alternative: Deploy on Railway

1. Go to **[railway.app](https://railway.app)**.
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select `nutty-ai-assistant`.
4. Railway will automatically detect Node.js and deploy.
5. In your Railway service settings, click **Generate Domain** to get your public HTTPS URL.

---

### Step 4: Point the Android App to Your Cloud URL

Once your cloud URL is live:

1. Open `capacitor.config.json`.
2. Replace the local IP with your cloud URL:

```json
{
  "appId": "com.nutty.assistant",
  "appName": "Nutty AI Assistant",
  "webDir": "public",
  "bundledWebRuntime": false,
  "server": {
    "url": "https://nutty-ai-assistant.onrender.com",
    "cleartext": false
  }
}
```

3. Sync and build the Android APK:

```bash
npx cap sync android
```

Now your Android app will connect anywhere globally over 4G/5G/Wi-Fi!

---

## 🛠 Local Development

To run locally on your PC:

```bash
npm install
npm run dev
```

Visit: `http://localhost:3000`
