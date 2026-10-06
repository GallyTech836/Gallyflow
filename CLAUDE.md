# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Frontend (root):**
```bash
npm run dev       # Vite dev server with HMR
npm run build     # Production build to /dist
npm run preview   # Preview production build
npm run lint      # ESLint validation
```

**Backend (`/backend`):**
```bash
npm run dev       # Watch mode (node --watch src/server.js)
npm start         # Production server
```

## Architecture

GallyFlow is a multi-tenant appointment booking SaaS for service businesses (barbershops, salons). It has a React/Vite frontend deployed on Vercel and a Node.js/Express backend deployed on Railway, using Firebase (Firestore + Auth) as the database and real-time layer.

### Multi-App Frontend

A single Vite codebase serves three independent apps dispatched by URL in `src/App.jsx`:
- `/` or `/admin` → `AdminApp` — full management dashboard
- `/barber` → `BarberApp` — staff-facing view
- `/reservar` → `ClienteApp` — public booking (no auth)

Each app has its own auth flow. Admin uses Firebase Auth email/password (`src/auth/useAuth.js`). Barbers use a custom username/password scheme (`src/barber/useBarberAuth.js`). Clients have no auth.

### Multi-Tenancy

All data is scoped under `negocios/{slug}` in Firestore. The business slug comes from the URL. Sub-collections include `usuarios`, `citas` (appointments), `servicios`, `transacciones`, etc.

### Backend API

Express app in `backend/src/app.js`. Key route groups:
- `/api/appointments` — create/manage citas
- `/api/notifications/send` — multi-channel notification dispatch (OneSignal push, WhatsApp, Email)
- `/api/devices/register` — push notification subscriptions
- `/api/assistant` — AI-powered WhatsApp booking assistant
- `/api/finance` — commission tracking with PIN protection
- `/api/whatsappWebhook` — incoming WhatsApp messages
- `/api/superadmin` — cross-tenant admin operations (CORS open)

The notification system abstracts three providers (`oneSignalProvider`, `whatsappProvider`, `emailProvider`) behind a common `notificationService.js` with template-based messages.

### State Management

No Redux or Zustand. State lives in React hooks (`useState`/`useEffect`) and custom domain hooks. Firestore `onSnapshot` listeners drive real-time UI updates; always clean them up in `useEffect` return functions.

### Theme System

Tailwind CSS 4 with custom CSS design tokens in `src/shared/theme/tokens.css` (variables like `--nx-primary`, `--nx-accent`). For non-Tailwind contexts (e.g., Recharts chart colors), use `getNexusToken()` from `src/shared/theme/theme.js`.

### Feature Flags

Plan-based feature gating lives in `src/shared/negocioPlan/`. Check plan limits before adding features visible to business owners.

## Environment

**Backend `.env` keys** (see `backend/.env.example`):
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — service account
- `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`
- `ALLOWED_ORIGINS` — CORS whitelist (e.g. `https://gallyflow.vercel.app`)
- `FINANCE_SESSION_SECRET`

Firebase client config is hardcoded in `src/firebase/config.js` (project: `gally-flow`).
