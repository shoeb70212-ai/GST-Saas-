# KhataLens Project Context (GST SAAS)

## Overview
KhataLens is an AI-powered invoice scanning and reconciliation platform tailored for Indian Chartered Accountants. It extracts tabular data from PDFs/Images using LLMs (OpenAI/Gemini) and matches them against GSTR-2B datasets.

## Architecture Stack
- **Frontend**: React 19, Vite, TailwindCSS v4, TanStack Query (`react-query`), React Router DOM v7.
- **Backend**: Python 3.11, FastAPI.
- **Database & Auth**: Supabase (PostgreSQL).
- **Testing**: Playwright (E2E), Vitest.

## Development Commands
- **Frontend**: 
  - `cd frontend`
  - `npm ci`
  - `npm run dev`
  - `npm run test:e2e` (Run Playwright E2E tests)
  - `npm run lint` (Oxlint)
- **Backend**:
  - `cd backend`
  - `pip install -r requirements.txt`
  - `uvicorn main:app --reload` (or specific run command)

## Key Project Rules
1. **Performance**: All complex data transformations (like the 1000+ row grids in `ReconciliationPage.tsx`) must be strictly memoized using `useMemo` and `useCallback` to prevent UI freezing on keystrokes.
2. **Resilience**: Every `useQuery` fetch MUST destruct `isError` and conditionally render the `<ErrorState>` component (Phase 4). Do not leave the UI in an infinite loading state if the backend 500s.
3. **Security**: 
 - Never use `allow_origins=["*"]` in production FastAPI.
 - Always validate inputs server-side.
 - Avoid `dangerouslySetInnerHTML`.
4. **Tailwind v4**: The project uses Tailwind v4 alpha via `@tailwindcss/vite`. CSS variables are stored in `index.css` under the `@theme` block.
5. **Credits-only gating**: Do not reintroduce hard Pro feature locks (`ProGate`). Core tools stay available; AI work spends org wallet credits (`backend/credits.py`). Keep Pricing / `CREDITS_DOCUMENTATION.md` in sync.

## Testing Strategy
The project enforces *Network Resilience Testing*. Playwright tests (e.g., `network-resilience.spec.ts`) mock 500 Internal Server Errors using `page.route` to verify the frontend gracefully recovers using the custom "Retry" mechanisms without a hard page refresh.
