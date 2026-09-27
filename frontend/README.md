# DeadlockGuard — Frontend

React + TypeScript + Vite frontend for the DeadlockGuard simulator.

For the full project description, page-by-page feature list, API reference, preset scenarios, and test coverage summary see the **[root README](../README.md)**.

---

## Development

### Install dependencies
```bash
npm install
```

### Start dev server
```bash
npm run dev
```
Runs at **http://localhost:5173**. The Vite dev server proxies all `/api/*` requests to the backend at `http://localhost:8000`.

### Type check
```bash
npx tsc --noEmit
```

### Production build
```bash
npm run build
```
Output goes to `dist/`.

### Lint
```bash
npm run lint
```

---

## Vite proxy

`vite.config.ts` forwards every `/api/*` request to `http://localhost:8000`, so the frontend never makes cross-origin requests during development and no CORS configuration is required in the browser.

---

## Tech

- React 19 · TypeScript · Vite 8
- Tailwind CSS 4
- React Router 7
- React Flow 11 (Resource Allocation Graph)
- Oxlint
