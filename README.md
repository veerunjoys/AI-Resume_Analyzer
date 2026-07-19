# AI Resume Analyzer — Frontend

The recruiter-facing web app for AI Resume Analyzer: a workspace for tracking candidates,
uploading resumes for AI-powered parsing and scoring, and matching candidates against open jobs.
Built as a single-page React application the working url :https://ai-resume-analyzer-plum-delta.vercel.app/.

## What it does

- **Authentication** — recruiter signup and login, with protected routes for the rest of the app.
- **Candidate pipeline** — browse, search, and filter candidates (by status, skill, location),
  with paginated lists and live detail panels.
- **Add / edit candidates** — create new candidate records and edit existing ones, with
  optimistic-concurrency conflict handling if two recruiters edit the same candidate at once.
- **Resume upload** — chunked, resumable resume uploads with a live progress/status tracker, so
  large files and flaky connections don't require starting over.
- **AI insights** — view the AI-extracted resume data and the AI-generated quality analysis
  (strengths, weaknesses, missing skills, recommendation) for each candidate.
- **Jobs & matching** — view job postings and see which candidates match, based on the backend's
  skill/experience matching.
- **Live updates** — a WebSocket connection pushes candidate and upload-status changes to the UI
  in real time, no manual refresh needed.
- **Offline support** — actions taken while offline are queued locally and automatically replayed
  against the server once connectivity returns, with conflict resolution if the record changed
  server-side in the meantime.
- **Metrics dashboard** — aggregate stats on candidates, uploads, and processing performance.

## Tech stack

| Layer | Technology |
|---|---|
| Language | JavaScript (JSX) |
| UI framework | React 19 (function components + hooks only) |
| Build tool | Vite |
| Routing | React Router |
| Icons | lucide-react |
| Real-time | native WebSocket client |
| Testing | Jest, React Testing Library |
| Linting | ESLint |

## Project structure

```
client/
├── src/
│   ├── components/            ← Page and UI components
│   │   ├── AuthPages.jsx           ← Login / signup
│   │   ├── ProtectedRoute.jsx      ← Route guard for authenticated pages
│   │   ├── CandidateList.jsx       ← Candidate pipeline list + pagination
│   │   ├── CandidateDetailPanel.jsx← Candidate profile, resume, AI analysis
│   │   ├── AddCandidateForm.jsx    ← Create/edit candidate form
│   │   ├── ConflictResolutionModal.jsx ← Optimistic-concurrency conflict UI
│   │   ├── FilterBar.jsx           ← Search/filter controls
│   │   ├── UploadPanel.jsx         ← Resume upload UI
│   │   ├── UploadStatusTracker.jsx ← Live chunked-upload/processing progress
│   │   ├── SearchPage.jsx          ← Full-text candidate search
│   │   ├── JobsPage.jsx            ← Job postings + candidate matches
│   │   ├── MetricsDashboardPage.jsx← Aggregate stats dashboard
│   │   └── Pagination.jsx
│   ├── contexts/
│   │   └── WebSocketContext.jsx    ← App-wide WebSocket connection/state
│   ├── utils/
│   │   ├── resumableUpload.js      ← Chunked upload logic
│   │   ├── offlineQueue.js         ← Local queue for offline actions
│   │   ├── syncManager.js          ← Replays queued actions once back online
│   │   ├── connectivityStatus.js   ← Online/offline detection
│   │   └── webSocketClient.js      ← WebSocket client wrapper
│   └── config.js                   ← Reads API/WebSocket base URLs from env
└── public/
```

## Getting started

```bash
npm install
npm run dev
```

The dev server starts at `http://localhost:5173` by default and expects the backend API
(see the companion [server](https://github.com/veerunjoys/AI-Resume_Analyzer_BE) repo) to be
running and reachable at the URL configured in `.env`.

## Environment variables

Copy `.env.example` to `.env` and set:

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Base URL of the backend API (REST, events, WebSocket all share this) |

For local development this points at `http://localhost:4000`; in production it points at the
deployed backend (e.g. on Render).

## Testing

```bash
npm test
```

## Build

```bash
npm run build
```

Outputs a production build to `dist/`, ready to deploy (e.g. on Vercel).
This is the workign
