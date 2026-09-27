import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/',                  label: 'Dashboard' },
  { to: '/scenario-builder',  label: 'Scenario Builder' },
  { to: '/detection',         label: 'Detection' },
  { to: '/avoidance',         label: 'Avoidance' },
  { to: '/prevention',        label: 'Prevention' },
  { to: '/recovery',          label: 'Recovery' },
]

export default function NavBar() {
  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6">
      {/* Brand */}
      <span className="text-white font-bold text-lg tracking-tight mr-4">
        🔒 DeadlockGuard
      </span>

      {/* Links */}
      <div className="flex gap-1">
        {NAV_ITEMS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              [
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800',
              ].join(' ')
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
