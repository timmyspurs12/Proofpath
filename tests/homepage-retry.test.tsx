// @vitest-environment jsdom
// Frontend regression for the timeout failure mode: when plan generation
// fails after intake, every submitted answer and the whole case state must
// remain on screen, and "Retry plan" must re-send the identical request
// instead of rebuilding or fabricating anything. All responses are mocked;
// no network or live inference occurs.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from '../src/pages/HomePage';
import { PlanLibraryProvider } from '../src/context/PlanLibraryContext';
import { samplePlan } from '../src/data/sample-plan';
import { fixtureRuntime } from './fixtures';

const intakeResponse = {
  goal: 'Complete the domestic adult passport renewal using the official online route.',
  questions: [
    {
      id: 'clarify-route',
      question: 'Which application route will you use?',
      reason: 'Requirements differ by route, so the answer changes which instructions apply.',
    },
  ],
  searchQueries: ['domestic passport renewal official requirements'],
  runtime: fixtureRuntime,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <PlanLibraryProvider>
        <Routes>
          <Route index element={<HomePage />} />
          <Route path="/plans/current" element={<div>plan-page-marker</div>} />
        </Routes>
      </PlanLibraryProvider>
    </MemoryRouter>,
  );
}

describe('HomePage plan-generation retry preserves intake state', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps submitted answers after a timeout failure and re-sends them unchanged on retry', async () => {
    const planBodies: string[] = [];
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/api/health')) {
        return jsonResponse({
          status: 'ok',
          liveInferenceConfigured: true,
          tavilyConfigured: false,
          model: 'nvidia/fixture-model',
          provider: 'nebius',
          liveInferenceVerified: false,
        });
      }
      if (method === 'POST' && url.endsWith('/api/intake')) {
        return jsonResponse(intakeResponse);
      }
      if (method === 'POST' && url.endsWith('/api/plans')) {
        planBodies.push(String(init?.body));
        if (planBodies.length === 1) {
          return jsonResponse(
            {
              error: {
                code: 'NEBIUS_TIMEOUT',
                message:
                  'Nebius did not complete the plan request after 3 attempts: Nebius did not return a complete response in time.',
                retryable: true,
              },
            },
            504,
          );
        }
        return jsonResponse({ plan: samplePlan });
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderHome();

    await user.type(
      screen.getByLabelText('Your task'),
      'Renew my expired domestic passport with an evidence-backed checklist.',
    );
    await user.type(screen.getByLabelText(/Jurisdiction/), 'Fixtureland');
    await user.type(
      screen.getByLabelText('Official source URLs'),
      'https://example.gov/renewal-guide',
    );
    await user.click(screen.getByRole('button', { name: 'Find my next steps' }));

    // Intake produced one clarification question.
    const answerBox = await screen.findByLabelText(/1\. Which application route/);
    const answer = 'Domestic online route, then an in-person biometric appointment.';
    await user.type(answerBox, answer);
    await user.click(screen.getByRole('button', { name: 'Retrieve sources & build plan' }));

    // The first plan attempt fails: the error offers a retry, the clarify
    // stage stays mounted and the typed answer is preserved verbatim.
    const retryButton = await screen.findByRole('button', { name: 'Retry plan' });
    expect(screen.getByText(/Please try again/)).toBeInTheDocument();
    // The clarify stage re-renders, but the submitted answer survives intact.
    expect(screen.getByLabelText(/1\. Which application route/)).toHaveValue(answer);
    expect(screen.queryByText('plan-page-marker')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3); // health + intake + first plan

    await user.click(retryButton);

    // The identical plan request is re-sent and the plan opens on success.
    await waitFor(() => expect(screen.getByText('plan-page-marker')).toBeInTheDocument());
    expect(planBodies).toHaveLength(2);
    expect(planBodies[0]).toBe(planBodies[1]);
    const sent = JSON.parse(planBodies[0]);
    expect(sent.answers).toEqual([
      {
        question: intakeResponse.questions[0].question,
        answer,
      },
    ]);
    expect(sent.goal).toBe(intakeResponse.goal);
    expect(sent.sourceUrls).toEqual(['https://example.gov/renewal-guide']);
  });
});
