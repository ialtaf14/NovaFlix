# 🎬 Novaflix 2.0 — Next-Gen Cinephile & Recommendation Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Vite](https://img.shields.io/badge/Frontend-Vite%20%2B%20React-646CFF?logo=vite)](https://vitejs.dev/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python)](https://www.python.org/)
[![Deploy on Render](https://img.shields.io/badge/Deploy%20on-Render-46E3B7?logo=render)](https://render.com/)
[![Deploy on Vercel](https://img.shields.io/badge/Deploy%20on-Vercel-000000?logo=vercel)](https://vercel.com/)

Novaflix 2.0 is a full-stack, content-based movie recommendation system and interactive entertainment web application. Built with a dark glassmorphism UI, real-time messaging, AI-driven mood recommendations, personalized watchlists, and social cinephile features.

---

## 📸 Screenshots & Showcase

### 1. 🌟 Discover & Mood Recommendations
Select your mood (*Happy, Emotional, Mind-Blowing, Horror, Action, Romantic*) and let Nova AI curate personalized picks for you.

![Discover Page](screenshots/discover_page.jpg)

---

### 2. 🎬 Movie Details & Streaming Links
Detailed movie information featuring IMDb & NovaFlix ratings, trailer viewer, streaming platform availability (*Disney+, Netflix, Hotstar, Prime, etc.*), cast details, and share options.

![Movie Details Page](screenshots/movie_details.png)

---

### 3. 🎯 Smart AI Recommendations
Get deep movie insights based on matching cast, director, genres, and watch patterns.

![Smart Recommendations](screenshots/smart_recommendations.png)

---

### 4. 💬 Real-Time Messaging
Connect and share recommendations, GIFs, and movie picks directly with friends.

![Messages Page](screenshots/messages_page.png)

---

### 5. 👤 User Profile & Movie DNA
Track your watchlists, cinephile rating, favorite genres, reviews, and personalized stats.

![User Profile](screenshots/user_profile.png)

---

### 6. ⛩️ Anime Collection
Explore popular anime series and movies with real-time genre and alphabetical filters.

![Anime Collection](screenshots/anime_collection.png)

---

## 🚀 Key Features

- **🎯 Content-Based Recommendation Engine**: Powered by Cosine Similarity and TF-IDF / Count Vectorization on genres, cast, crew, keywords, and production companies.
- **✨ Mood Recommendations**: Instant mood-based filtering (*Happy, Mind-Blowing, Horror, Action, Romantic, Emotional*).
- **💬 Real-Time Direct Messaging**: Instant messaging powered by WebSockets / Socket.IO with read receipts and movie sharing.
- **🎬 Streaming Service Badges**: Live streaming links for Disney+, Netflix, Prime, Hotstar, Apple TV, and YouTube.
- **👤 Cinephile Profiles & Movie DNA**: Profile completion tracking, custom avatar uploads, level progression, and stats.
- **📱 Responsive Glassmorphism Design**: High-performance UI built with React + Vite and custom Vanilla CSS design system.

---

## 🛠️ Tech Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Frontend** | React 18, Vite, React Router DOM, Zustand, Axios, Socket.IO Client, Vanilla CSS |
| **Backend** | Python 3.11+, FastAPI, Uvicorn, Pydantic, Scikit-learn, Pandas, Python-JOSE (JWT) |
| **Storage & ML** | Datasets (`CSV`), Scikit-learn Cosine Similarity (`.pkl` matrices), JSON Stores |
| **Deployment** | Vercel / Netlify (Frontend), Render / Railway (Backend) |

---

## ⚙️ Local Setup Guide

### 1. Prerequisites
- **Node.js**: v18 or higher
- **Python**: v3.10 or higher
- **Git & Git LFS**: Required for pushing large `.pkl` datasets (>100MB)

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
The React development server runs at `http://localhost:5173`.

### 3. Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py
```
The FastAPI server runs at `http://localhost:8000`.

---

## 🌐 Free Cloud Deployment Instructions

### Deploy Backend on **Render.com** (FREE)
1. Push this repository to GitHub using **Git LFS** for `.pkl` files:
   ```bash
   git lfs install
   git lfs track "backend/Files/*.pkl"
   git add .
   git commit -m "Deploy Novaflix 2.0"
   git push origin main
   ```
2. Log into [Render.com](https://render.com/) and click **New + -> Web Service**.
3. Connect your GitHub repository.
4. Set **Root Directory** to `backend`.
5. Set **Build Command** to `pip install -r requirements.txt`.
6. Set **Start Command** to `uvicorn main:app --host 0.0.0.0 --port $PORT`.
7. Add Environment Variable: `SECRET_KEY` = *(random 64-char string)*.

### Deploy Frontend on **Vercel** / **Netlify** (FREE)
1. Log into [Vercel.com](https://vercel.com/) or [Netlify.com](https://netlify.com/).
2. Import your GitHub repository.
3. Set **Root Directory** to `frontend`.
4. Set **Framework Preset** to `Vite`.
5. Add Environment Variable:
   - `VITE_API_URL` = `https://your-render-backend-url.onrender.com/api`
6. Click **Deploy**!

---

## 📜 License

This project is licensed under the [MIT License](LICENSE). Built with ❤️ by Altaf Khan.
