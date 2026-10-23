// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlanView } from '../src/components/PlanView';
import { PlanLibraryProvider } from '../src/context/PlanLibraryContext';
import { validateEvidencePlan } from '../server/lib/evidence';
import { fixtureRuntime, makeInput, makeModelPlan, makeSource } from './fixtures';

describe('plan conflict presentation', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('keeps competing passages, source metadata, and recheck links inspectable', () => {
    const model = makeModelPlan();
    model.conflicts = [
      {
        topic: 'Fee amount',
        detail: 'The sources state different fixture fees.',
        stepIds: ['a'],
        evidence: [
          { sourceId: 'S1', quote: 'The fee is £102.' },
          { sourceId: 'S2', quote: 'The fee is £115.' },
        ],
      },
    ];
    const sources = [makeSource('S1', 'The fee is £102.'), makeSource('S2', 'The fee is £115.')];
    const { plan } = validateEvidencePlan({
      modelPlan: model,
      sources,
      input: makeInput(),
      runtime: fixtureRuntime,
      now: () => new Date('2026-10-23T12:00:00.000Z'),
      id: 'fixture-conflict-plan',
    });

    render(
      <MemoryRouter>
        <PlanLibraryProvider>
          <PlanView plan={plan} />
        </PlanLibraryProvider>
      </MemoryRouter>,
    );

    const conflict = screen.getByRole('heading', { name: 'Fee amount' }).closest('.conflict-card');
    expect(conflict).not.toBeNull();
    const panel = within(conflict as HTMLElement);
    expect(panel.getByText('The sources state different fixture fees.')).toBeVisible();
    expect(panel.getByText('“The fee is £102.”')).toBeVisible();
    expect(panel.getByText('“The fee is £115.”')).toBeVisible();
    expect(panel.getByText('Safe next step')).toBeVisible();
    expect(panel.getAllByText(/Retrieved Oct 23, 2026/)).toHaveLength(2);
    expect(panel.getByRole('link', { name: 'Recheck S1' })).toHaveAttribute(
      'href',
      'https://example.com/S1',
    );
    expect(panel.getByRole('link', { name: 'Recheck S2' })).toHaveAttribute(
      'href',
      'https://example.com/S2',
    );
  });
});
