# KhataLens Developer Onboarding Guide

Welcome to the KhataLens engineering team! This guide will help you set up your local development environment and explain the workflow for contributing to the repository.

## Prerequisites
Before you start, ensure you have the following installed:
- Node.js (v18+)
- Python (3.10+)
- Git
- Supabase CLI (Optional, but recommended for database migrations)

## 1. Project Structure
KhataLens is a monorepo containing two main directories:
- `/frontend`: React + Vite + Tailwind application.
- `/backend`: FastAPI Python application.
- `/docs`: All technical and product documentation (You are here!).
- `/*.sql`: Supabase database migration scripts.

## 2. Setting Up the Backend (FastAPI)
The backend handles AI orchestration and PyMuPDF extraction.

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```
2. **Create a virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```
4. **Environment Variables:**
   Create a `.env` file in the `/backend` folder:
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_service_role_key
   OPENAI_API_KEY=your_openai_api_key
   ```
5. **Run the server (local, single process):**
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   Production Docker uses `WEB_CONCURRENCY` (default 2) uvicorn workers. Semaphores are **per process**:
   - `AI_SEMAPHORE_LIMIT` (code default 5; Docker default 3)
   - `FILE_SEMAPHORE_LIMIT` (code default 4; Docker default 2)
   Effective AI capacity ≈ workers × `AI_SEMAPHORE_LIMIT`. Extraction result cache is process-local (not shared across workers). Platform hosts (Coolify/Azure) may override the container CMD — set these env vars there if needed.

## 3. Setting Up the Frontend (React/Vite)
The frontend is a PWA-optimized SPA.

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Environment Variables:**
   Create a `.env` file in the `/frontend` folder:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_API_URL=http://localhost:8000
   ```
4. **Run the development server:**
   ```bash
   npm run dev
   ```

## 4. Testing Protocols
We strictly enforce a "Zero Hallucination" and test-driven culture.
- **Backend Tests:** Run `pytest tests/ -v` before committing any changes to the `reconcile_service.py`.
- **Frontend Tests:** Run `npx playwright test` to ensure UI components don't break. *Note: Playwright tests currently rely on a mock session injection strategy.*

## 5. Deployment
- The **frontend** is automatically deployed to Vercel upon merging to `main`.
- The **backend** is deployed to Render via a Docker container.
- **Database schema changes** must be made using SQL files in the root directory (e.g., `migration_phase36_new_feature.sql`) and manually executed on the Supabase dashboard until CI/CD database migrations are fully set up.
