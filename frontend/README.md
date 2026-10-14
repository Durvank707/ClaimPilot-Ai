# ClaimPilot AI — Frontend

React + TypeScript + Vite + Tailwind CSS dashboard for ClaimPilot AI, the
insurance claims intelligence platform. The UI is designed for claims officers:
it presents model outputs as decision support and never approves, rejects or
accuses.

> **Status:** Step 5 — backend claim submission. The form validates input and
> submits to the real `POST /api/v1/claims/analyze` endpoint, with loading,
> error and success states. On success it shows only the identifiers the API
> actually returns. The detailed results dashboard, claims history and lookup
> are later steps.

## Requirements

- Node.js 20+ and npm.

> This environment runs Node 20.12.1. The toolchain is pinned to versions that
> work on that version (Vite 5, Tailwind 3). See "Toolchain notes" below.

## Install and run

```bash
cd frontend
npm install
npm run dev
```

The dev server runs at http://localhost:5173 by default.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run build` | Type-check (`tsc -b`) and produce a production build in `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm run lint` | Run oxlint. |
| `npm test` | Run the test suite once (Vitest). |
| `npm run test:watch` | Run tests in watch mode. |

## Environment

Copy `.env.example` to `.env` and adjust as needed:

```text
VITE_API_BASE_URL=http://localhost:8000
```

`.env` is git-ignored. Never place secrets (database credentials, Supabase
service-role keys, etc.) in frontend configuration — all privileged access
stays server-side.

Setting `VITE_API_BASE_URL` to an empty string routes requests through the Vite
dev proxy instead; see "CORS" below.

## API layer

`src/api/` holds a small, dependency-free API layer built on native `fetch`
(no Axios):

- `config.ts` — derives every backend URL from `VITE_API_BASE_URL`. Nothing
  else hardcodes a host.
- `errors.ts` — a typed `ApiError` (`kind` = `network` | `timeout` | `http` |
  `parse` | `aborted`) plus `describeApiError`, which returns safe, generic
  wording with no response bodies or internal detail.
- `client.ts` — `requestJson`, a reusable JSON helper. It joins the base URL,
  serialises an optional JSON body (setting `Content-Type`), enforces a timeout
  via `AbortController`, checks `response.ok`, reads the body as text first (so
  a non-JSON error page never throws an opaque parse error) and returns
  `unknown`. On an HTTP error it attaches the parsed error body as
  `ApiError.details` so callers can extract validation messages.
- `health.ts` — `fetchHealth` / `fetchReady` plus runtime validation of the
  response shape.
- `claims.ts` — `submitClaim`, `parseClaimAnalysisResponse` and
  `describeSubmitError`. `submitClaim` POSTs a `ClaimRequest` and validates the
  `ClaimResponse`; `describeSubmitError` maps FastAPI validation errors onto
  fields and never surfaces raw bodies or stack traces.
- `connection.ts` — `checkBackend`, which probes health first and readiness
  second.

Response shapes mirror the backend exactly (`backend/routers/health.py`):

| Endpoint | Response |
| --- | --- |
| `GET /api/v1/health` | `{ "status": "healthy" }` |
| `GET /api/v1/ready` | `{ "status": "ready" \| "not_ready", "models_loaded": boolean }` |

`/ready` returns HTTP 200 even when the service is not ready, so readiness is
decided from the body, not the status code.

## Backend connection indicator

The header shows a compact status (`src/components/layout/ConnectionStatus.tsx`)
backed by `src/hooks/useBackendStatus.ts`:

| State | Meaning |
| --- | --- |
| Checking backend… | A check is in progress. |
| Backend ready | Reachable and `/ready` reports `ready` + `models_loaded`. |
| Backend not ready | Reachable, but the analysis models are not ready (or readiness could not be confirmed). |
| Backend unavailable | The backend could not be reached at all. |

It checks once on mount and exposes a manual refresh — there is no background
polling. Reachability and readiness are separate signals, so a reachable but
not-ready backend is never reported as ready.

## New Claim Analysis form

`src/pages/NewClaimPage.tsx` renders the claim-input form. It is **UI only** as
of Step 4: it validates input and (on request) shows a read-only preview, but it
never calls `POST /api/v1/claims/analyze`. Submission is wired up in Step 5.

- **Contract.** `src/features/claimAnalysis/claimForm.ts` is the single source of
  truth. Field names match `backend/schemas.py :: ClaimRequest` exactly.
  Categorical options are the values present in the training data
  (`data/processed/processed_all.csv`); `incident_city` is free text because the
  dataset contains ~17,900 distinct city names.
- **Required fields.** The API schema marks every field optional. The form
  follows the project's own data contract instead
  (`claimpilot/data/validators.py` → `REQUIRED_COLUMNS`, minus the label
  `fraud_reported`): `policy_id`, `incident_date` and `claim_amount` are
  required. Every other field is optional, matching the schema.
- **Sections.** Policy Information, Insured Person, Incident Details and Claim
  Information, laid out in a responsive grid inside `<fieldset>`/`<legend>`
  groups.
- **Validation.** `src/features/claimAnalysis/validateClaimForm.ts` checks
  integers/decimals, the documented hour range (0–23), non-negative amounts,
  ISO dates (`YYYY-MM-DD`, real calendar dates) and categorical membership.
  Bounds are only applied where the schema or project validation logic supports
  them; other typical ranges are shown as helper text, not enforced.
- **Submission.** The primary action posts to `/api/v1/claims/analyze` through
  the shared API client (`src/api/claims.ts`). While in flight the form is
  disabled, the button reads "Analysing…", and duplicate submissions are blocked
  by a synchronous guard. Failures keep the input and offer a retry; a timeout
  or network failure is flagged as an *unknown outcome* and is never retried
  automatically (the server may have processed it).
- **Success state.** Only the identifiers the API actually returns are shown.
  `claim_id` mirrors the submitted `policy_id`; `analysis_id` is **not** returned
  by the current API (the route sets it, but `response_model=ClaimResponse` has
  no such field and strips it), so the UI says so rather than inventing one. The
  response does not confirm database persistence, and the UI says that too. No
  risk scores, levels or recommendations are displayed yet.
- **Trust.** The page states that information is analysed to support a human
  officer, and that ClaimPilot never approves, rejects or accuses.

The form uses no form/schema library: the contract is small and static, so a
typed module plus native controls keep the dependency surface minimal.

## CORS (important)

The backend does **not** currently send CORS headers. Verified locally: a
request to `/api/v1/health` with `Origin: http://localhost:5173` returns no
`Access-Control-Allow-Origin` header. Calling `http://localhost:8000` directly
from the browser is therefore blocked, and the indicator shows **Backend
unavailable** even though the backend is healthy.

Two ways to run locally:

1. **Vite dev proxy (no backend change needed).** Set the base URL to an empty
   string in `frontend/.env` so requests are same-origin and forwarded to the
   backend:

   ```text
   VITE_API_BASE_URL=
   ```

   Set this in the `.env` file — an empty shell environment variable is treated
   as unset by Vite. The proxy lives in `vite.config.ts` (`/api` →
   `http://localhost:8000`) and has been verified to return the real backend
   responses. This is a development-only convenience and does not fix CORS for
   deployments.

2. **Configure CORS on the backend** (a later, backend-side change). Until the
   FastAPI app adds `CORSMiddleware` allowing the Vite origin, direct
   cross-origin calls fail. This step does not modify the backend.

## Running the backend locally

From the project root (`D:\opsell\ClaimPilot`; see `docs/backend_api.md`). The
Python package uses a `src/` layout, so `src` must be on `PYTHONPATH`:

```powershell
$env:PYTHONPATH = "src"
$env:DATABASE_URL = "sqlite:///:memory:"   # or a PostgreSQL URL
python -m uvicorn backend.main:app --port 8000
```

Then, in another terminal, `npm run dev` in `frontend/`.

## Testing

Tests run with **Vitest**. This is the smallest setup that fits the existing
Vite project: `vitest` (shares the Vite config) plus `jsdom` and
`@testing-library/react` (+ `@testing-library/dom` for the component test). The
API tests mock `fetch` directly and the component test uses Testing Library's
built-in `fireEvent` — no extra test dependencies.

```bash
npm test          # run once
npm run test:watch
```

Coverage:

- `src/api/client.test.ts` — success + JSON parsing, empty body, non-2xx
  (including a non-JSON body), network failure, timeout, external abort, and
  invalid JSON.
- `src/api/health.test.ts` — response-shape validation for `/health` and
  `/ready`, and `isReady`.
- `src/api/connection.test.ts` — ready / not-ready / unreachable transitions
  (readiness is not consulted when health fails).
- `src/components/layout/ConnectionStatus.test.tsx` — loading → ready, not-ready,
  unavailable, and manual refresh behaviour.
- `src/api/claims.test.ts` — request shape, response validation, FastAPI 422
  field mapping, HTTP/network/timeout failures, unexpected shapes, and
  `describeSubmitError` safety.
- `src/features/claimAnalysis/validateClaimForm.test.ts` — required fields,
  numeric/categorical/date validation, and ISO-date edge cases.
- `src/features/claimAnalysis/toClaimRequest.test.ts` — payload matches the
  backend `ClaimRequest` (numbers vs strings, blanks omitted, no UI-only keys).
- `src/pages/NewClaimPage.test.tsx` — section/label rendering, accepted
  categorical options, validation blocking submission, successful submit and
  returned identifiers, loading/duplicate prevention, server/http/network/
  unexpected errors, and that no analysis results are displayed. `fetch` is
  stubbed; no live database is required.

## Project structure

```text
frontend/src
├── api/            # typed API client: config, errors, fetch helper, health/ready, connection, claims
├── app/            # navigation config (view ids, labels, icons)
├── components/
│   ├── layout/     # AppShell, Sidebar, Header, ConnectionStatus
│   ├── ui/         # Button, Card, Badge, FormField, Input, Select, PageHeader, StatePanel, ...
│   └── icons.tsx   # inline SVG icon set (no icon dependency)
├── features/       # claimAnalysis: form contract, validation, field renderer, payload mapper
├── hooks/          # useBackendStatus (backend connection state)
├── lib/            # cn (class joiner) and form styles
├── pages/          # Overview, New Claim Analysis, Claims History, Claim Lookup
├── test/           # Vitest setup (Testing Library cleanup)
├── App.tsx         # shell wiring + local view state (no router yet)
├── index.css       # Tailwind layers, design tokens, focus + reduced-motion
└── main.tsx
```

## Design system

Design tokens live in `tailwind.config.js` (colours, radii, shadows,
typography) and `src/index.css` (base styles, focus ring, reduced motion).

- **Colours:** deep `navy` for navigation/headings, `ink` neutrals for text and
  borders, a single `accent` blue for primary actions, and semantic `status`
  colours for risk levels.
- **Risk levels** (LOW / MEDIUM / HIGH / CRITICAL) are shown with a text label
  and a dot, never colour alone (`RiskBadge`).
- **Focus:** every interactive element uses a visible `:focus-visible` ring.
- **Motion:** respects `prefers-reduced-motion`.

## Illustrative content

Placeholder metrics and the risk distribution on the Overview page are clearly
labelled **Illustrative**. They are examples of the intended layout and are not
data from the database.

## Toolchain notes

This environment runs Node 20.12.1. Two issues were surfaced and handled:

1. Vite 8 (and the oxlint engine) require Node `^20.19.0 || >=22.12.0`, so the
   toolchain was pinned to **Vite 5** and **Tailwind CSS 3**, which work here.
2. npm 10.5.0 has a known bug ([npm/cli#4828](https://github.com/npm/cli/issues/4828))
   that skips some optional native dependencies, which left oxlint without its
   binary. `@oxlint/binding-win32-x64-msvc` is therefore listed as an explicit
   devDependency. It can be removed once the project runs on Node ≥ 20.19.0.
