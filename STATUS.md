# DeadlockGuard — Project Status

**Last Updated:** Phase 9 Complete

---

## ✅ Completed Phases

### Phase 1–7: Backend Core Algorithms
- ✅ Banker's Algorithm (safety check + resource request)
- ✅ Deadlock Detection (matrix-based, circular wait)
- ✅ Need matrix calculation
- ✅ Full backend test coverage (pytest, 100% pass rate)
- ✅ FastAPI REST API with typed Pydantic models
- ✅ CORS configured for frontend
- ✅ Health check endpoint

### Phase 8: Full Frontend Implementation
- ✅ Dashboard (real-time status, auto-runs both algorithms)
- ✅ Scenario Builder (add/remove processes/resources, matrix editors, need validation)
- ✅ Deadlock Detection page (request matrix editor, result display)
- ✅ Deadlock Avoidance page (safety check + resource request)
- ✅ Shared scenario context (ScenarioContext + useScenario hook)
- ✅ Reusable components (MatrixEditor, VectorEditor, ErrorBanner, SectionCard, StepTrace)
- ✅ Vite proxy (/api → backend, no CORS issues)
- ✅ TypeScript strict mode, 0 build errors
- ✅ TailwindCSS dark theme

### Phase 9: Resource Allocation Graph Visualization ⭐ NEW
- ✅ React Flow integration (v11.11.4)
- ✅ ResourceGraph component (410 lines)
- ✅ Custom node types (ProcessNode circles, ResourceNode squares)
- ✅ Dynamic edge generation (allocation solid, request dashed)
- ✅ Deadlock highlighting (red glow, animated edges)
- ✅ Zoom, pan, reset view controls
- ✅ Legend (dynamic, shows deadlock icon only when detected)
- ✅ Integrated into Detection page
- ✅ Tested with safe + deadlocked scenarios
- ✅ Production build: 442 KB bundle (includes D3 dependencies)

---

## 🎯 Current Status

**Both servers running:**
- Frontend: **http://localhost:5173**
- Backend: **http://localhost:8000**

**Test the graph:**
1. Open http://localhost:5173/detection
2. Default state: all-zero request matrix → graph shows calm gray/blue colors
3. Edit request matrix:
   - Set P0→R1 = 1
   - Set P1→R0 = 1
4. Click "Run Deadlock Detection"
5. Graph highlights deadlocked nodes/edges in red with glow effect

---

## 📂 Project Structure

```
deadlockguard/
├── backend/                    # FastAPI server
│   ├── app/
│   │   ├── algorithms/         # Banker's, Detection, Need calculation
│   │   ├── models/             # Pydantic schemas
│   │   ├── routers/            # API endpoints
│   │   ├── store.py            # In-memory scenario storage
│   │   └── main.py             # FastAPI app
│   ├── tests/                  # Pytest test suite (100% pass)
│   ├── venv/                   # Python virtual environment
│   └── requirements.txt
│
├── frontend/                   # React + TypeScript + Vite
│   ├── src/
│   │   ├── api/                # Typed API client
│   │   ├── components/         # Reusable UI components
│   │   │   ├── ResourceGraph.tsx    ⭐ NEW (React Flow)
│   │   │   ├── MatrixEditor.tsx
│   │   │   ├── VectorEditor.tsx
│   │   │   ├── ErrorBanner.tsx
│   │   │   ├── SectionCard.tsx
│   │   │   ├── StepTrace.tsx
│   │   │   └── NavBar.tsx
│   │   ├── context/            # ScenarioContext (shared state)
│   │   ├── data/               # Sample scenario
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ScenarioBuilder.tsx
│   │   │   ├── Detection.tsx   ⭐ UPDATED (includes graph)
│   │   │   └── Avoidance.tsx
│   │   ├── types/              # TypeScript definitions
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── dist/                   # Production build output
│   ├── node_modules/
│   ├── package.json
│   ├── vite.config.ts          # Vite config (proxy)
│   ├── tailwind.config.js
│   └── tsconfig.json
│
├── docs/                       # Empty (future: architecture docs)
├── PHASE9_SUMMARY.md           ⭐ NEW
├── STATUS.md                   # This file
└── README.md                   # Project overview
```

---

## 🔧 Tech Stack

### Backend
- **Python 3.14**
- **FastAPI 0.115.6**
- **Pydantic 2.10**
- **Uvicorn** (ASGI server)
- **Pytest** (testing)

### Frontend
- **React 18.3**
- **TypeScript 5.6**
- **Vite 8.3** (build tool, dev server)
- **React Router 7** (routing)
- **TailwindCSS 3.4** (styling)
- **React Flow 11.11** ⭐ (graph visualization)
- **Oxlint** (fast linter)

---

## 🚀 Quick Start

### 1. Start Backend
```bash
cd backend
# First time: create venv and install deps
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# Run server
uvicorn app.main:app --reload --port 8000
```
Backend: http://localhost:8000

### 2. Start Frontend
```bash
cd frontend
# First time: install deps
npm install

# Run dev server
npm run dev
```
Frontend: http://localhost:5173

### 3. Test
```bash
# Backend tests
cd backend
pytest -v

# Frontend build
cd frontend
npm run build
```

---

## 📊 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Backend health check |
| `/api/banker/safety` | POST | Banker's Algorithm safety check |
| `/api/banker/request` | POST | Resource request (GRANTED/DENIED) |
| `/api/deadlock/detect` | POST | Deadlock detection (circular wait) |
| `/api/scenarios` | GET | List saved scenarios *(not wired yet)* |
| `/api/scenarios` | POST | Save scenario *(not wired yet)* |

Full API docs: http://localhost:8000/docs (auto-generated by FastAPI)

---

## 🧪 Test Results

### Backend Tests (pytest)
```
tests/test_api.py        14 passed
tests/test_bankers.py    10 passed
tests/test_detection.py   9 passed
tests/test_need.py        9 passed
tests/test_schemas.py     8 passed
========================
Total: 50 tests, 100% pass rate
```

### Frontend Build
```
✓ 198 modules transformed
✓ TypeScript: 0 errors
✓ Production bundle: 442 KB minified
```

### Live Verification
✅ Dashboard auto-runs both algorithms on load  
✅ Scenario Builder need matrix validation (debounced 600ms)  
✅ Detection page graph highlights deadlock correctly  
✅ Avoidance page request approval/denial works  
✅ All API endpoints respond via Vite proxy  

---

## 🎨 Resource Allocation Graph Features

### Visual Elements
- **Process nodes:** Circles (64×64px), labeled with process ID
- **Resource nodes:** Rounded squares (72×72px), labeled with resource ID + instance dots
- **Allocation edges:** Resource → Process, solid gray arrows
- **Request edges:** Process → Resource, dashed blue arrows

### Deadlock Highlighting
When backend returns `deadlock_detected: true`:
- Deadlocked nodes: red background, red border, red glow (`box-shadow`)
- Deadlocked edges: red color, thicker stroke, animated (request edges)
- Non-deadlocked elements stay calm gray/blue

### Interactions
- **Zoom:** Mouse wheel (0.3× to 2×)
- **Pan:** Click and drag
- **Drag nodes:** Reposition for clearer layout
- **Reset View button:** Fits all nodes in viewport

### Layout
- Processes: left column (x=60)
- Resources: right column (x=320)
- Y-spacing: 110px per node
- Canvas height: auto-scales to node count

---

## 📝 Documentation

- **Backend:** `backend/README.md` (API reference, algorithm descriptions)
- **Frontend:** `frontend/README.md` ⭐ UPDATED (full feature list, graph documentation)
- **Phase 9:** `PHASE9_SUMMARY.md` (implementation details, test results)
- **This file:** `STATUS.md` (project overview, current status)

---

## 🔮 Roadmap (Future Phases)

### Phase 10: Prevention Analysis
- [ ] Coffman condition checker (mutual exclusion, hold-and-wait, no preemption, circular wait)
- [ ] Prevention strategy recommendations
- [ ] UI page: `/prevention`

### Phase 11: Recovery Strategies
- [ ] Process termination algorithms (one-at-a-time, batch)
- [ ] Resource preemption algorithms
- [ ] Cost model for recovery decisions
- [ ] UI page: `/recovery`

### Phase 12: Persistent Scenarios
- [ ] Wire frontend to `POST /api/scenarios` (save to backend)
- [ ] Scenario list page with load/delete
- [ ] JSON export/import
- [ ] Local storage fallback

### Phase 13: Graph Enhancements
- [ ] Force-directed layout option (dagre/elkjs)
- [ ] Animated resource grants/releases
- [ ] Cycle path highlighting (if backend returns cycle indices)
- [ ] Export graph as PNG/SVG

### Phase 14: Advanced Features
- [ ] Real-time simulation mode (step-by-step execution)
- [ ] Multiple scenario comparison (side-by-side)
- [ ] Historical state timeline (undo/redo)
- [ ] Markdown export (report generation)

---

## 🐛 Known Issues

None critical. Minor limitations:
1. Graph layout is fixed two-column (not force-directed) — intentional for clarity
2. Multi-instance resources show max 6 dots + overflow text
3. No persistent storage yet — scenarios only in memory
4. No undo/redo for scenario edits

---

## 📜 License

MIT

---

## 👤 Contributors

Solo project by [User]

---

**Phase 9 Status:** ✅ COMPLETE  
**Next Phase:** Prevention Analysis (Phase 10)

**STOP** — awaiting user direction for Phase 10.
