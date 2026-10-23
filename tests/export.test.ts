import { describe, expect, it } from 'vitest';
import { planJsonFilename, planMarkdownFilename, planToMarkdown } from '../src/lib/export';
import { samplePlan } from '../src/data/sample-plan';

describe('plan exports', () => {
  it('includes evidence states, exact quotes, sources, unresolved questions and sample provenance', () => {
    const markdown = planToMarkdown(samplePlan);
    expect(markdown).toContain('Labelled sample — not live inference');
    expect(markdown).toContain('Supported by source');
    expect(markdown).toContain('Inferred — confirm');
    expect(markdown).toContain('It costs £102 to renew or replace your passport');
    expect(markdown).toContain('https://www.gov.uk/renew-adult-passport');
    expect(markdown).toContain('Do you need the passport urgently?');
    expect(markdown).toContain('Done when:');
  });

  it('uses safe, predictable filenames', () => {
    expect(planMarkdownFilename(samplePlan)).toBe('renew-your-uk-passport.md');
    expect(planJsonFilename(samplePlan)).toBe('renew-your-uk-passport.json');
  });
});
