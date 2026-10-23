import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Skeleton } from './components/ui/States';

const OverviewPage = lazy(() =>
  import('./pages/OverviewPage').then((module) => ({ default: module.OverviewPage })),
);
const ExplorerPage = lazy(() =>
  import('./pages/ExplorerPage').then((module) => ({ default: module.ExplorerPage })),
);
const CreatePactPage = lazy(() =>
  import('./pages/CreatePactPage').then((module) => ({ default: module.CreatePactPage })),
);
const ResolutionDeskPage = lazy(() =>
  import('./pages/ResolutionDeskPage').then((module) => ({ default: module.ResolutionDeskPage })),
);
const ActivityPage = lazy(() =>
  import('./pages/ActivityPage').then((module) => ({ default: module.ActivityPage })),
);
const PactDetailPage = lazy(() =>
  import('./pages/PactDetailPage').then((module) => ({ default: module.PactDetailPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
);

function RouteLoader() {
  return (
    <div className="space-y-6" aria-label="Loading page" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-4 w-[480px] max-w-full" />
      </div>
      <Skeleton className="h-[420px] w-full" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="explorer" element={<ExplorerPage />} />
          <Route path="create" element={<CreatePactPage />} />
          <Route path="resolution" element={<ResolutionDeskPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="pacts/:id" element={<PactDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
