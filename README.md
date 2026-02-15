# Rightclicked

Save LinkedIn posts in one click and view them later in a searchable, organized library.

Live: https://rightclicked.vercel.app

---

## What it does

- Save any LinkedIn post with a right-click or the extension popup
- Posts are automatically analyzed by AI on save (topic, tags, summary, sentiment)
- Search and filter saved posts by author, topic, keywords, or date
- Group posts by author, topic, engagement level, or custom tags
- View engagement stats and analytics for saved posts

## Architecture

```
extension/   Chrome extension (Manifest V3)
frontend/    React web app (Vite + Tailwind CSS v4)
backend/     Express API server (Node.js + MongoDB)
```

Backend -- Express REST API with JWT auth, MongoDB for storage, Ollama Cloud for AI analysis. Deployed on Vercel as a serverless function.

Frontend -- React 18 SPA with Zustand for state, React Router for navigation, Tailwind CSS v4 for styling. Deployed on Vercel.

Extension -- Chrome Manifest V3 extension. Uses context menus and content scripts to extract post data from LinkedIn. Communicates with the backend API.

## Setup (local development)

### Backend

```
cd backend
cp .env.example .env
npm install
npm run dev
```

Required env vars:

| Variable | Description |
|---|---|
| MONGODB_URI | MongoDB connection string |
| JWT_SECRET | Secret for signing JWT tokens |
| OLLAMA_BASE_URL | Ollama API base URL (https://ollama.com for cloud) |
| OLLAMA_MODEL | Model name (e.g. ministral-3:3b) |
| OLLAMA_API_KEY | API key for Ollama Cloud (omit for local Ollama) |
| RECAPTCHA_SECRET | Google reCAPTCHA v3 secret key |
| FRONTEND_URL | Frontend origin for CORS (e.g. http://localhost:5173) |

### Frontend

```
cd frontend
cp .env.example .env
npm install
npm run dev
```

Required env vars:

| Variable | Description |
|---|---|
| VITE_API_URL | Backend API URL (e.g. http://localhost:3001/api) |
| VITE_RECAPTCHA_SITE_KEY | Google reCAPTCHA v3 site key |

### Extension

1. Open chrome://extensions in Chrome, Edge, or Brave
2. Enable Developer mode
3. Click Load unpacked and select the extension/ folder
4. Go to LinkedIn and right-click any post to save it

For local development, update the URLs in extension/background.js to point to localhost.

## AI Analysis

Posts are analyzed automatically when saved. The backend sends the post text to Ollama and returns:

- Topic classification
- Keyword extraction
- Short summary
- Sentiment (positive, negative, neutral, mixed)
- Suggested tags

Analysis runs inline before the save response is sent. If the AI is unavailable or the daily quota is reached, the post is saved without analysis. You can manually trigger analysis later from the dashboard.

Auto-analyze can be toggled off in Settings. There is also a batch analyze option for unanalyzed posts.

## Deployment

Both backend and frontend are deployed on Vercel. The extension is distributed as a zip from GitHub releases.

Backend Vercel env vars: same as the backend table above, plus set FRONTEND_URL to your frontend domain.

Frontend Vercel env vars: set VITE_API_URL to your backend URL (e.g. https://rightclicked-backend.vercel.app/api).

## Tech Stack

- Node.js, Express, MongoDB, Mongoose
- React 18, Vite, Tailwind CSS v4, Zustand, React Router
- Chrome Extension Manifest V3
- Ollama Cloud (AI analysis)
- Vercel (hosting)
- JWT authentication, bcrypt, Helmet, express-rate-limit
