import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ScenarioProvider } from './context/ScenarioContext'
import NavBar from './components/NavBar'
import Dashboard from './pages/Dashboard'
import ScenarioBuilder from './pages/ScenarioBuilder'
import Detection from './pages/Detection'
import Avoidance from './pages/Avoidance'
import Prevention from './pages/Prevention'
import Recovery from './pages/Recovery'

export default function App() {
  return (
    <BrowserRouter>
      <ScenarioProvider>
        <div className="min-h-screen bg-gray-950 text-white">
          <NavBar />
          <Routes>
            <Route path="/"                 element={<Dashboard />} />
            <Route path="/scenario-builder" element={<ScenarioBuilder />} />
            <Route path="/detection"        element={<Detection />} />
            <Route path="/avoidance"        element={<Avoidance />} />
            <Route path="/prevention"       element={<Prevention />} />
            <Route path="/recovery"         element={<Recovery />} />
          </Routes>
        </div>
      </ScenarioProvider>
    </BrowserRouter>
  )
}
