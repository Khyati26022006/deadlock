# DeadlockGuard Frontend

Interactive web interface for visualizing and analyzing deadlock detection, avoidance, and prevention algorithms in operating systems.

Built with **React** + **TypeScript** + **Vite** + **TailwindCSS** + **React Flow**.

---

## Features

### 1. **Dashboard** (`/`)
- Real-time system status: SAFE / UNSAFE / DEADLOCKED
- Auto-runs both Banker's Algorithm (safety check) and Deadlock Detection on page load
- Visual stat cards showing process/resource counts, deadlocked processes, safe sequence length
- Available resources vector display
- Safe execution sequence (if system is SAFE)
- Deadlocked process list (if DEADLOCKED)
- Scenario metadata display

### 2. **Scenario Builder** (`/scenario-builder`)
- Add/remove processes and resources dynamically
- Edit Allocation matrix (currently held resources)
- Edit Maximum matrix (worst-case demand)
- Edit Available vector (free instances)
- **Need matrix** (Maximum − Allocation) computed client-side, validated by backend with 600ms debounce
- Load hardcoded sample scenario or clear to blank slate
- Save scenario to shared context (updates all pages instantly)
- "Save & View Dashboard" — one-click workflow

### 3. **Deadlock Detection** (`/detection`)
- Edit **Request matrix** (current pending waits) — defaults to all-zero
- Reference cards: Allocation matrix (read-only), Available vector (read-only)
- "Run Detection" button → calls `POST /api/deadlock/detect`
- Result banner: NO_DEADLOCK ✅ / DEADLOCKED 🔴
- Deadlocked process list, completed process list
- Work & Finish vectors (final state)
- **Resource Allocation Graph** (React Flow visualization)
  - Process nodes (circles), resource nodes (squares)
  - Allocation edges (resource→process, solid gray)
  - Request edges (process→resource, dashed blue)
  - Deadlocked nodes/edges highlighted in red with glow filter
  - Zoom, pan, reset view controls
  - Legend showing node/edge types
- Step-by-step trace (collapsible)

### 4. **Deadlock Avoidance** (`/avoidance`)
Two independent sections:

#### Safety Check
- "Run Safety Check" → calls `POST /api/banker/safety`
- SAFE ✅ / UNSAFE ⚠️ banner
- Safe execution sequence (process order)
- Work vector (final state)
- Step-by-step trace

#### Resource Request
- Select a process from button row
- Enter request vector (additional instances needed)
- Reference: Need vector for selected process
- "Submit Request" → calls `POST /api/banker/request`
- GRANTED ✅ / DENIED ❌ banner with reason
- If GRANTED: updated Available, Allocation, Need vectors
- Hypothetical safety result (is the new state SAFE?)
- Step trace for the hypothetical state

---

## Architecture

### Shared State
- `ScenarioContext` (src/context/ScenarioContext.tsx) — single source of truth for the active scenario
- `ScenarioProvider` wraps the entire app in App.tsx
- `useScenario()` hook — all pages read/write the same scenario object

### Reusable Components
- `MatrixEditor` — editable or read-only 2-D integer grid
- `VectorEditor` — single-row vector input
- `ResourceGraph` — React Flow-based Resource Allocation Graph (process nodes, resource nodes, allocation/request edges, deadlock highlighting)
- `ErrorBanner` — dismissable error message
- `SectionCard` — consistent card wrapper
- `StepTrace` — collapsible step-by-step execution trace

### API Client
- `src/api/client.ts` — typed functions for all backend endpoints
- Base URL: `''` (relative) — Vite proxy forwards `/api/*` to `http://localhost:8000`
- No CORS issues — all requests appear same-origin to the browser

### Routing
- React Router v6
- Four routes: `/`, `/scenario-builder`, `/detection`, `/avoidance`
- NavBar with active link highlighting

---

## Development

### Prerequisites
- Node.js 18+ (or compatible with ES2022)
- npm 9+

### Install
```bash
npm install
```

### Run Dev Server
```bash
npm run dev
```
Frontend: http://localhost:5173  
(Vite will auto-increment port if 5173 is in use)

### Build for Production
```bash
npm run build
```
Output: `dist/` directory

### Type Check
```bash
npx tsc -b
```

### Lint
```bash
npm run lint
```

---

## Configuration

### Vite Proxy (vite.config.ts)
```ts
server: {
  port: 5173,
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true,
    },
  },
}
```
All `/api/*` requests are forwarded to the FastAPI backend.

### Tailwind CSS
`tailwind.config.js` — configured for dark theme (gray-950 background)

### TypeScript
- `tsconfig.json` — strict mode enabled
- `tsconfig.app.json` — app-specific settings
- `tsconfig.node.json` — Vite config settings

---

## Resource Allocation Graph

The **ResourceGraph** component (src/components/ResourceGraph.tsx) visualizes deadlock scenarios dynamically:

### Node Types
- **ProcessNode** — circle, labeled with process ID (e.g. P0, P1)
- **ResourceNode** — rounded square, labeled with resource ID (e.g. R0, R1), displays instance dots

### Edge Types
- **Allocation** — resource → process (solid gray arrow)
  - Drawn for every nonzero cell in the Allocation matrix
- **Request** — process → resource (dashed blue arrow)
  - Drawn for every nonzero cell in the Request matrix

### Deadlock Highlighting
When `detectionResult.deadlock_detected === true`:
- Deadlocked process nodes: red background, red border, red glow (`box-shadow`)
- Deadlocked resource nodes: red if any deadlocked process holds or requests it
- Deadlocked edges: red, thicker stroke, animated (request edges only)

### Visualization Logic
The graph does **NOT** run cycle detection itself — it is a pure visualization layer.  
Deadlock status comes entirely from the backend's `POST /api/deadlock/detect` response.

### Layout
- Processes: vertical column on the left (x=60)
- Resources: vertical column on the right (x=320)
- Auto-calculated Y spacing: `NODE_GAP = 110px`
- Canvas height adapts to max(processes, resources) count

### Controls
- **Zoom** — mouse wheel
- **Pan** — click and drag
- **Reset View** button (top-right panel)
- **Legend** (bottom-left panel)

---

## Sample Workflow

1. **Start the backend** (in `../backend/`):
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

2. **Start the frontend**:
   ```bash
   npm run dev
   ```

3. **Open http://localhost:5173** in your browser

4. **View the sample scenario** on the Dashboard (3 processes, 3 resources, SAFE state by default)

5. **Edit the scenario** in Scenario Builder:
   - Change process/resource counts
   - Modify Allocation, Maximum, Available
   - Need matrix updates automatically (debounced)
   - Click "Save & View Dashboard"

6. **Test deadlock detection**:
   - Go to Detection page
   - Edit Request matrix to create circular wait:
     - Example: P0 requests R1, P1 requests R0
   - Click "Run Deadlock Detection"
   - Graph highlights deadlocked nodes/edges in red

7. **Test resource requests** (Avoidance page):
   - Run Safety Check → see SAFE/UNSAFE result
   - Select a process, enter a request vector
   - Submit Request → see GRANTED/DENIED with reason
   - If GRANTED, view the updated state and hypothetical safety result

---

## Tech Stack

- **React 18.3** — UI library
- **TypeScript 5.6** — static typing
- **Vite 8.3** — build tool, dev server, HMR
- **React Router 7** — client-side routing
- **TailwindCSS 3.4** — utility-first CSS
- **React Flow 11.11** — graph visualization (zoom, pan, custom nodes/edges)
- **Oxlint** — fast linter (replaces ESLint)

---

## API Endpoints (via Vite Proxy)

All requests go to `/api/*` and are proxied to `http://localhost:8000`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Backend health check |
| `/api/banker/safety` | POST | Banker's Algorithm safety check |
| `/api/banker/request` | POST | Resource request (GRANTED/DENIED) |
| `/api/deadlock/detect` | POST | Deadlock detection (circular wait analysis) |
| `/api/scenarios` | GET | List saved scenarios *(not wired yet)* |
| `/api/scenarios` | POST | Save scenario *(not wired yet)* |

See `../backend/README.md` for full API documentation.

---

## Project Structure

```
frontend/
├── src/
│   ├── api/
│   │   └── client.ts           # Typed API client
│   ├── components/
│   │   ├── ErrorBanner.tsx     # Error display
│   │   ├── MatrixEditor.tsx    # 2-D grid editor
│   │   ├── NavBar.tsx          # Top navigation
│   │   ├── ResourceGraph.tsx   # React Flow graph (NEW)
│   │   ├── SectionCard.tsx     # Card wrapper
│   │   ├── StepTrace.tsx       # Collapsible trace
│   │   └── VectorEditor.tsx    # 1-D vector editor
│   ├── context/
│   │   └── ScenarioContext.tsx # Shared scenario state
│   ├── data/
│   │   └── sampleScenario.ts   # Default scenario
│   ├── pages/
│   │   ├── Avoidance.tsx       # /avoidance
│   │   ├── Dashboard.tsx       # /
│   │   ├── Detection.tsx       # /detection (includes graph)
│   │   └── ScenarioBuilder.tsx # /scenario-builder
│   ├── types/
│   │   └── index.ts            # TypeScript type definitions
│   ├── App.tsx                 # Root component
│   ├── main.tsx                # Entry point
│   └── index.css               # Tailwind directives
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── dist/                       # Production build output
├── vite.config.ts              # Vite config (proxy)
├── tailwind.config.js          # Tailwind config
├── tsconfig.json               # TS config (root)
├── package.json
└── README.md                   # This file
```

---

## Known Limitations

- No persistent storage yet — scenarios only live in memory (context)
- Graph layout is fixed-column (not force-directed)
- No undo/redo for scenario edits
- No scenario export/import (JSON download/upload)

---

## Phase Completion Status

✅ Phase 1–7: Backend core algorithms  
✅ Phase 8: Full frontend with Dashboard, Scenario Builder, Detection, Avoidance  
✅ Phase 9: Resource Allocation Graph visualization (React Flow)  
⬜ Phase 10+: Prevention, Recovery, persistent scenarios

---

## License

MIT
