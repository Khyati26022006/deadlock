# DeadlockGuard

An interactive simulator for OS deadlock concepts. DeadlockGuard covers all four pillars of deadlock theory — Avoidance (Banker's Algorithm), Detection (matrix-based multi-instance algorithm with Resource Allocation Graph visualization), Prevention (Coffman condition analysis), and Recovery (process termination and resource preemption strategies) — through a live, editable scenario model that propagates instantly across every page.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite 8 |
| Styling | Tailwind CSS 4 |
| Graph | React Flow 11 |
| Backend | Python 3.14 + FastAPI + Pydantic 2 |
| Testing | pytest (434 tests) |

---

## Quick Start

### Backend

**Windows (PowerShell)**
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Linux / macOS**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend API: http://localhost:8000  
Swagger docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173  
(Vite proxies all `/api/*` requests to port 8000 — no CORS configuration needed.)

---

## Pages

### Dashboard  `/`
Loads the active scenario and immediately runs both the Banker's safety check and the deadlock detection algorithm in parallel. Displays a color-coded system status banner (SAFE / UNSAFE / DEADLOCKED), four stat cards (process count, resource count, deadlocked count, safe-sequence length), the available resources vector, the safe execution sequence if one exists, and the list of confirmed deadlocked processes if any.

### Scenario Builder  `/scenario-builder`
Full matrix editor for building a scenario from scratch or loading one of the built-in presets. Add and remove processes and resources, edit the Allocation matrix (currently held), Maximum matrix (worst-case demand), and Available vector. The Need matrix (Maximum − Allocation) is computed client-side and validated against the backend with a 600 ms debounce. Saving pushes the scenario into a shared React context that all other pages read from immediately.

Preset scenarios available from the **Load preset** dropdown:

| Preset | Demonstrates |
|---|---|
| Safe State | Banker's safety check returns SAFE; safe sequence P1→P3→P0→P2→P4 |
| Unsafe State | No safe sequence exists (UNSAFE), but no process is currently blocked — shows that UNSAFE ≠ deadlocked |
| Classic Circular Deadlock | P0 holds R0/needs R1, P1 holds R1/needs R0, Available=[0,0] — confirmed deadlock |
| All Conditions Present | Three-process circular hold-and-wait; all 4 Coffman conditions flagged on the Prevention page |
| Resolvable Recovery Case | All three processes deadlocked; terminating or preempting P0 alone resolves it in one step |

### Detection  `/detection`
Edit the Request matrix (what each process is *currently* waiting for — distinct from the Need matrix) and run the matrix-based deadlock detection algorithm. Displays a DEADLOCKED / NO_DEADLOCK status banner, lists of confirmed deadlocked and completed processes, final Work and Finish vectors, a Resource Allocation Graph (React Flow — process circles, resource squares, solid allocation edges, dashed request edges, red glow highlighting on deadlocked nodes and edges), and a collapsible step-by-step algorithm trace.

### Avoidance  `/avoidance`
Two independent sections using the Banker's Algorithm:

- **Safety Check** — runs `POST /api/banker/safety` and shows SAFE / UNSAFE, the safe execution sequence, the final Work vector, and a step trace.
- **Resource Request** — select a process, enter a request vector, and submit. The backend checks whether granting the request keeps the system safe. Shows GRANTED / DENIED with reason, the updated state matrices if granted, and a hypothetical safety result with its own step trace.

### Prevention  `/prevention`
Analyzes whether the four Coffman conditions — all of which must hold simultaneously for deadlock to be possible — are present in the current scenario. Takes an editable Request matrix (same concept as Detection) for the Circular Wait check. Displays an overall summary banner showing how many of the 4 conditions are present, then four condition cards (one per condition) each showing present/absent status with color coding, a plain-language explanation derived from actual matrix values, and the standard OS prevention strategy for that condition.

### Recovery  `/recovery`
Only unlocks after a confirmed deadlock. Step 1 is an inline detection run using an editable Request matrix — the deadlocked process IDs are auto-populated directly from the algorithm result and cannot be overridden manually. Once deadlock is confirmed, two recovery strategies become available:

- **Option A — Terminate Processes** — choose a strategy (terminate all at once / one at a time by fewest resources held / one at a time by lowest PID), run `POST /api/recovery/terminate`, and see a step-by-step termination sequence showing which process was aborted, what resources it released, and whether deadlock was resolved after each step.
- **Option B — Preempt Resources** — choose a victim selection strategy, run `POST /api/recovery/preempt`, and see each preemption action including the victim's state transition (`blocked → waiting`) and the rollback checkpoint description.

---

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Backend health check |
| `/api/banker/safety` | POST | Banker's Algorithm safety check |
| `/api/banker/request` | POST | Resource request — GRANTED or DENIED |
| `/api/deadlock/detect` | POST | Matrix-based deadlock detection |
| `/api/prevention/analyze` | POST | Coffman condition analysis |
| `/api/recovery/terminate` | POST | Process termination recovery |
| `/api/recovery/preempt` | POST | Resource preemption recovery |
| `/api/scenarios` | GET | List stored scenarios |
| `/api/scenarios` | POST | Store a scenario |
| `/api/scenarios/{id}` | GET | Retrieve a stored scenario |

---

## Project Structure

```
deadlockguard/
├── backend/
│   ├── app/
│   │   ├── algorithms/
│   │   │   ├── bankers.py        # Safety check + resource request
│   │   │   ├── detection.py      # Matrix-based deadlock detection
│   │   │   ├── need.py           # Need matrix calculation
│   │   │   ├── prevention.py     # Coffman condition analysis
│   │   │   └── recovery.py       # Termination + preemption strategies
│   │   ├── models/
│   │   │   ├── api.py            # API request/response Pydantic models
│   │   │   └── schemas.py        # Domain Pydantic models
│   │   ├── routers/
│   │   │   ├── banker.py
│   │   │   ├── deadlock.py
│   │   │   ├── prevention.py
│   │   │   ├── recovery.py
│   │   │   ├── scenarios.py
│   │   │   └── health.py
│   │   ├── store.py              # In-memory scenario storage
│   │   └── main.py               # FastAPI app, CORS, exception handlers
│   ├── tests/
│   │   ├── test_api.py           # 72 tests — API endpoints
│   │   ├── test_bankers.py       # 63 tests — Banker's Algorithm
│   │   ├── test_detection.py     # 47 tests — detection algorithm
│   │   ├── test_need.py          # 35 tests — need matrix
│   │   ├── test_prevention.py    # 85 tests — Coffman conditions
│   │   ├── test_recovery.py      # 56 tests — recovery strategies
│   │   └── test_schemas.py       # 76 tests — Pydantic validation
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts         # Typed fetch wrapper for all endpoints
│   │   ├── components/
│   │   │   ├── ErrorBanner.tsx   # Dismissable error display
│   │   │   ├── MatrixEditor.tsx  # Editable / read-only 2-D integer grid
│   │   │   ├── NavBar.tsx        # Top navigation with active link highlighting
│   │   │   ├── ResourceGraph.tsx # React Flow RAG visualization
│   │   │   ├── SectionCard.tsx   # Consistent card wrapper
│   │   │   ├── StepTrace.tsx     # Collapsible step-by-step trace
│   │   │   └── VectorEditor.tsx  # 1-D vector input
│   │   ├── context/
│   │   │   └── ScenarioContext.tsx  # Global scenario state + useScenario hook
│   │   ├── data/
│   │   │   ├── sampleScenario.ts    # Classic Banker's textbook example
│   │   │   └── presetScenarios.ts   # 5 verified preset scenarios
│   │   ├── pages/
│   │   │   ├── Avoidance.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Detection.tsx
│   │   │   ├── Prevention.tsx
│   │   │   ├── Recovery.tsx
│   │   │   └── ScenarioBuilder.tsx
│   │   ├── types/
│   │   │   └── index.ts          # All TypeScript types
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   ├── vite.config.ts            # Dev proxy: /api/* → localhost:8000
│   └── package.json
│
└── scenarios/                    # Placeholder for future scenario files
```

---

## Test Coverage

```
tests/test_api.py         72 tests   HTTP contract, status codes, error envelopes
tests/test_bankers.py     63 tests   Safety algorithm, resource request
tests/test_detection.py   47 tests   Matrix detection, Finish[] init, deadlock/no-deadlock
tests/test_need.py        35 tests   Need matrix validation
tests/test_prevention.py  85 tests   All 4 Coffman conditions, module isolation
tests/test_recovery.py    56 tests   Termination strategies, preemption, state transitions
tests/test_schemas.py     76 tests   Pydantic schema validation, cross-field constraints
─────────────────────────────────────────────────────────────────────
Total                    434 tests   0 failures
```

Run the suite:
```bash
cd backend
pytest tests/ -v
```

---

## Architecture Notes

**Shared state** — `ScenarioContext` holds one `ScenarioDetail` object at the React root. Every page reads it via `useScenario()`. Updating it in the Scenario Builder (or by loading a preset) propagates instantly to Dashboard, Detection, Avoidance, Prevention, and Recovery without any page reload.

**Algorithm isolation** — each algorithm module (`bankers.py`, `detection.py`, `prevention.py`, `recovery.py`) imports from no other algorithm module. Enforced by dedicated module-isolation tests.

**Recovery gating** — the Recovery page runs deadlock detection inline before exposing recovery options. The deadlocked process set is derived entirely from the real API result; the user cannot manually select arbitrary processes as deadlocked.

**No hardcoded explanations** — Prevention analysis generates all explanation text dynamically from the actual matrix values at runtime.

---

## License

MIT
