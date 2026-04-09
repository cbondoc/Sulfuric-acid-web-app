import { Link, Outlet, useLocation } from 'react-router-dom';

const nav = [
  { to: '/', label: 'Live Status' },
  { to: '/control', label: 'Control' },
  { to: '/production', label: 'Production Summary' },
  { to: '/process', label: 'Process Info' },
];

export function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-white text-stone-900">
      <header className="border-b border-yellow-400 bg-yellow-300">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-stone-900">
            Sulfuric Acid Mixing Dashboard
          </h1>
          <nav className="flex gap-1">
            {nav.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={`rounded px-3 py-2 text-sm font-medium transition ${
                  location.pathname === to
                    ? 'bg-yellow-500 text-white shadow-sm'
                    : 'text-stone-800 hover:bg-yellow-200'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
