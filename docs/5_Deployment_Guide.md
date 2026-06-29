# Deployment Guide: GST SAAS

This document outlines the steps to deploy the GST SAAS application. The application consists of a Vite/React frontend, a FastAPI Python backend, and a Supabase database.

## Prerequisites
1. Ensure your entire `GST SAAS` folder is pushed to a repository on your GitHub account.
2. Both Vercel and Render will connect directly to this repository.

---

## 1. Deploy Backend (Render)

The backend is deployed using a Docker container to ensure system dependencies like `poppler-utils` (required for PDF processing) are installed.

1. Go to [Render.com](https://render.com/) and sign in.
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository.
4. Configure the Web Service:
   * **Name**: `gst-saas-backend` (or your preferred name)
   * **Root Directory**: `backend` *(Crucial: This tells Render to look in the backend folder)*
   * **Environment**: Select **Docker** (Render will automatically detect the `Dockerfile`).
   * **Region**: Choose the region closest to your target users.
5. Scroll down to **Environment Variables** and add:
   * `OPENAI_API_KEY` (or `OPENROUTER_API_KEY`)
   * `GEMINI_API_KEY`
6. Click **Create Web Service**. 
7. **Important**: Once deployed, Render will provide a live URL (e.g., `https://gst-saas-backend.onrender.com`). **Copy this URL**, as you will need it for the frontend.

---

## 2. Deploy Frontend (Vercel)

The frontend is a static Single Page Application (SPA) built with Vite, which Vercel handles perfectly.

1. Go to [Vercel.com](https://vercel.com/) and sign in.
2. Click **Add New...** -> **Project**.
3. Import your GitHub repository.
4. Configure the Project:
   * **Framework Preset**: Vercel should auto-detect **Vite**.
   * **Root Directory**: Click `Edit` and select `frontend`.
5. Open the **Environment Variables** section and add these exactly:
   * `VITE_SUPABASE_URL`: Your Supabase Project URL
   * `VITE_SUPABASE_ANON_KEY`: Your Supabase Anon Key
   * `VITE_API_URL`: **Paste the Render URL from Step 1** *(Ensure there is NO trailing slash, e.g., `https://gst-saas-backend.onrender.com`)*.
6. Click **Deploy**.

---

## 3. Configure Supabase

Since your database is hosted on Supabase Cloud, it is already live. You just need to configure authentication to accept requests from your new Vercel domain.

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Navigate to **Authentication** -> **URL Configuration** (or Site URL).
3. Under **Site URL**, add your new Vercel domain (e.g., `https://your-app.vercel.app`).
4. Under **Redirect URLs**, add the Vercel domain as well.
5. This ensures that user login and authentication tokens work correctly in the production environment.

---

## Post-Deployment Checklist
- [ ] Verify that the frontend loads correctly on the Vercel URL.
- [ ] Attempt to upload an invoice to verify that the frontend successfully communicates with the Render backend.
- [ ] Check the Render logs if there are any 500 errors during the PDF processing step to ensure the Docker container installed `poppler-utils` correctly.
