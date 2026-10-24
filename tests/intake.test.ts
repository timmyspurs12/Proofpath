import { describe, expect, it } from 'vitest';
import { mergeClarifications, requiredClarifications } from '../server/lib/intake';
import type { Question, TaskInput } from '../src/shared/schemas';

function makeInput(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    task: 'Apply for a permit',
    jurisdiction: 'Kenya',
    category: 'Business registration & licensing',
    details: '',
    sourceUrls: [],
    document: null,
    ...overrides,
  };
}

describe('requiredClarifications', () => {
  it('asks for the jurisdiction instead of guessing when it is blank', () => {
    const questions = requiredClarifications(makeInput({ jurisdiction: '' }));
    expect(questions[0]?.id).toBe('clarify-jurisdiction');
    expect(questions[0]?.question).toMatch(/jurisdiction|country/i);
    expect(questions[0]?.question).toMatch(/abroad/i);
  });

  it('asks for the application route when an application has no route and no evidence anchor', () => {
    const questions = requiredClarifications(
      makeInput({
        task: 'I need to renew my residence permit and am not sure how.',
        details: '',
      }),
    );
    expect(questions.map((question) => question.id)).toContain('clarify-route');
    const route = questions.find((question) => question.id === 'clarify-route')!;
    expect(route.question).toMatch(/online|paper|in person|consular/i);
  });

  it('does not ask the route question when the request names a route', () => {
    const questions = requiredClarifications(
      makeInput({
        task: 'Renew my residence permit online through the official portal.',
      }),
    );
    expect(questions.some((question) => question.id === 'clarify-route')).toBe(false);
  });

  it('does not ask the route question when the user supplies evidence', () => {
    const questions = requiredClarifications(
      makeInput({
        task: 'Renew my residence permit.',
        sourceUrls: ['https://permits.example.gov/guide'],
      }),
    );
    expect(questions.some((question) => question.id === 'clarify-route')).toBe(false);
  });

  it('stays silent when the request is already adequately specified', () => {
    const questions = requiredClarifications(
      makeInput({
        task: 'Renew my adult passport in person at the consulate while I am abroad.',
        jurisdiction: 'Brazil',
        details: 'Consular route from outside the country.',
      }),
    );
    expect(questions).toEqual([]);
  });

  it('contains no country-specific vocabulary in its generic questions', () => {
    const questions = requiredClarifications(makeInput({ jurisdiction: '' }));
    const joined = questions.map((question) => `${question.question} ${question.reason}`).join(' ');
    for (const country of ['Nigeria', 'Kenya', 'United Kingdom', 'Canada', 'France']) {
      expect(joined).not.toContain(country);
    }
  });
});

describe('mergeClarifications', () => {
  const deterministic: Question[] = [
    {
      id: 'clarify-jurisdiction',
      question:
        'Which country or jurisdiction runs this process, and are you applying from inside it or from abroad?',
      reason: 'Requirements differ between jurisdictions.',
    },
  ];

  it('keeps deterministic questions first and supplements with distinct model questions', () => {
    const model: Question[] = [
      {
        id: 'q1',
        question: 'Which application route do you intend to use?',
        reason: 'Fees differ between routes.',
      },
    ];
    const merged = mergeClarifications(deterministic, model);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.id).toBe('clarify-jurisdiction');
  });

  it('drops model questions that duplicate the deterministic topic', () => {
    const model: Question[] = [
      {
        id: 'q1',
        question: 'Which country runs this application process?',
        reason: 'The jurisdiction is needed to select sources.',
      },
    ];
    const merged = mergeClarifications(deterministic, model);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('clarify-jurisdiction');
  });

  it('never exceeds the five-question schema cap', () => {
    const model: Question[] = Array.from({ length: 7 }, (_, index) => ({
      id: `q${index}`,
      question: `Distinct model question number ${index} about permits`,
      reason: 'A separate clarification reason.',
    }));
    const merged = mergeClarifications(deterministic, model);
    expect(merged.length).toBeLessThanOrEqual(5);
  });
});
