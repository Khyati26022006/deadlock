import { NavLink } from 'react-router-dom'
import { useScenario } from '../context/ScenarioContext'

const NAV_ITEMS = [
  { to: '/',                 label: 'Dashboard' },
  { to: '/scenario-builder', label: 'Scenario Builder' },
  { to: '/detection',        label: 'Detection' },
  { to: '/avoidance',        label: 'Avoidance' },
  { to: '/prevention',       label: 'Prevention' },
  { to: '/recovery',         label: 'Recovery' },
  { to: '/auto-simulation',  label: 'Auto Simulation' },
]

export default function NavBar() {
  const { scenario } = useScenario()

  return (
    <nav className="bg-white/95 backdrop-blur-sm border-b border-neutral-200/80 sticky top-0 z-50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-md bg-neutral-900 flex items-center justify-center text-white shadow-xs">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-neutral-900 leading-none">
                DeadlockGuard
              </span>
              <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-medium">
                OS Engine
              </span>
            </div>
          </div>

          <div className="hidden sm:block w-px h-5 bg-neutral-200 shrink-0" />

          <div className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none">
            {NAV_ITEMS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  [
                    'px-3 py-1.5 text-xs sm:text-sm font-medium tracking-tight transition-all rounded-md whitespace-nowrap',
                    isActive
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/80',
                  ].join(' ')
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        </div>

        {/* Right side active scenario badge */}
        <div className="hidden lg:flex items-center gap-2 text-xs">
          <span className="text-neutral-400 font-medium">Active:</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-800 font-medium border border-neutral-200/60 max-w-[180px] truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 shrink-0" />
            <span className="truncate">{scenario.name}</span>
          </span>
        </div>
      </div>
    </nav>
  )
}
