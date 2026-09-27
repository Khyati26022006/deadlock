# DeadlockGuard

**Interactive Deadlock Detection, Avoidance, Prevention and Recovery Simulator**

An educational Operating Systems simulator that visualizes core deadlock concepts:

- Deadlock characterization (Coffman conditions)
- Deadlock prevention
- Deadlock avoidance (Banker's Algorithm)
- Deadlock detection (Resource Allocation Graph)
- Deadlock recovery strategies
- Safe and unsafe state transitions
- Process and resource management

## Technology Stack

| Layer         | Technology                          |
|---------------|-------------------------------------|
| Frontend      | React + TypeScript + Vite           |
| Styling       | Tailwind CSS                        |
| Visualization | React Flow + Recharts               |
| Backend       | Python + FastAPI + Pydantic         |

## Project Structure

```
deadlockguard/
├── backend/        # FastAPI Python backend
├── frontend/       # React + TypeScript + Vite frontend
├── scenarios/      # Pre-built simulation scenario files
├── docs/           # Documentation and design notes
└── README.md
```

## Getting Started

### Backend

```bash
cd backend
python -m venv venv

# Linux/macOS
source venv/bin/activate
# Windows
venv\Scripts\activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: http://localhost:5173  
Backend API runs at: http://localhost:8000  
API docs (Swagger): http://localhost:8000/docs

## License

MIT
