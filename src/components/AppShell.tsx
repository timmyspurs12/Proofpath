import { BookOpen, Folder, LayoutList, Plus } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { usePlanLibrary } from '../context/PlanLibraryContext';
import { Logo } from './Logo';
import { Alert } from './ui';

export function AppShell() {
  const { plans, storageError } = usePlanLibrary();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Logo />
          <nav className="main-nav" aria-label="Main navigation">
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <LayoutList size={17} aria-hidden="true" />
              <span>Workspace</span>
            </NavLink>
            <NavLink
              to="/saved"
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <Folder size={17} aria-hidden="true" />
              <span>Saved plans</span>
              {plans.length > 0 && (
                <span className="nav-count" aria-label={`${plans.length} saved`}>
                  {plans.length}
                </span>
              )}
            </NavLink>
            <NavLink
              to="/about"
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <BookOpen size={17} aria-hidden="true" />
              <span>How it works</span>
            </NavLink>
            <NavLink to="/" className="nav-new" aria-label="New plan">
              <Plus size={17} aria-hidden="true" />
              <span>New plan</span>
            </NavLink>
          </nav>
        </div>
      </header>
      {storageError && (
        <div className="storage-notice page-width">
          <Alert tone="warning">{storageError}</Alert>
        </div>
      )}
      <main id="main-content" className="page-width">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="footer-inner">
          <Logo compact />
          <p>Evidence before confidence. Built for inspection, not blind automation.</p>
          <span>Local saves · No account · Open source</span>
        </div>
      </footer>
    </div>
  );
}
