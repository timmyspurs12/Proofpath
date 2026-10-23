import { Route, Routes } from 'react-router-dom';
import { PlanLibraryProvider } from './context/PlanLibraryContext';
import { AppShell } from './components/AppShell';
import { HomePage } from './pages/HomePage';
import { PlanPage } from './pages/PlanPage';
import { SavedPage } from './pages/SavedPage';
import { AboutPage } from './pages/AboutPage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  return (
    <PlanLibraryProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="plans/:id" element={<PlanPage />} />
          <Route path="saved" element={<SavedPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </PlanLibraryProvider>
  );
}
