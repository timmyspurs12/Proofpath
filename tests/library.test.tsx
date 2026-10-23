// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanLibraryProvider, usePlanLibrary } from '../src/context/PlanLibraryContext';
import { samplePlan } from '../src/data/sample-plan';
import { clone } from './fixtures';

function Harness() {
  const {
    plans,
    currentPlan,
    currentIsSaved,
    storageError,
    openPlan,
    saveCurrentPlan,
    updateCurrentPlan,
  } = usePlanLibrary();
  return (
    <div>
      <span data-testid="count">{plans.length}</span>
      <span data-testid="current">{currentPlan?.id ?? 'none'}</span>
      <span data-testid="saved">{String(currentIsSaved)}</span>
      <span data-testid="complete">{currentPlan?.completedStepIds.length ?? 0}</span>
      {storageError && <span data-testid="error">{storageError}</span>}
      <button onClick={() => openPlan(clone(samplePlan))}>Open</button>
      <button onClick={saveCurrentPlan}>Save</button>
      <button
        disabled={!currentPlan}
        onClick={() =>
          currentPlan &&
          updateCurrentPlan(
            { ...currentPlan, completedStepIds: [currentPlan.steps[0].id] },
            currentIsSaved,
          )
        }
      >
        Complete
      </button>
    </div>
  );
}

function renderLibrary() {
  return render(
    <PlanLibraryProvider>
      <Harness />
    </PlanLibraryProvider>,
  );
}

describe('browser plan library', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('saves explicitly, assigns a new local ID, and persists completion', async () => {
    const user = userEvent.setup();
    renderLibrary();
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    await user.click(screen.getByText('Open'));
    expect(screen.getByTestId('saved')).toHaveTextContent('false');
    await user.click(screen.getByText('Save'));
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByTestId('saved')).toHaveTextContent('true');
    expect(screen.getByTestId('current')).not.toHaveTextContent('sample-uk-passport');
    await user.click(screen.getByText('Complete'));
    expect(screen.getByTestId('complete')).toHaveTextContent('1');
    const stored = JSON.parse(localStorage.getItem('proofpath.plans.v1')!);
    expect(stored[0].completedStepIds).toHaveLength(1);
  });

  it('reloads saved plans from durable browser storage', async () => {
    const user = userEvent.setup();
    const first = renderLibrary();
    await user.click(screen.getByText('Open'));
    await user.click(screen.getByText('Save'));
    first.unmount();
    renderLibrary();
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByTestId('current')).toHaveTextContent('none');
  });

  it('does not overwrite unreadable existing browser data', () => {
    localStorage.setItem('proofpath.plans.v1', '{broken');
    renderLibrary();
    expect(screen.getByTestId('error')).toHaveTextContent('was not overwritten');
    expect(localStorage.getItem('proofpath.plans.v1')).toBe('{broken');
  });
});
