import { describe, expect, it } from 'vitest';
import { PLAN_SYSTEM } from '../server/lib/plan';

// The model-facing prompt is part of the citation contract: these rules tell
// Nemotron how to produce quotes the strict exact-passage gate can accept,
// without teaching the engine any jurisdiction-specific fact. Assertions are
// wording-level so a prompt regression cannot silently weaken citation
// fidelity or re-open evidence-answerable questions.
describe('plan system prompt citation and uncertainty contract', () => {
  it('demands character-for-character passages without regional spelling changes', () => {
    expect(PLAN_SYSTEM).toMatch(/character for character/i);
    expect(PLAN_SYSTEM).toMatch(/exact spelling, punctuation, capitalization and hyphenation/i);
    expect(PLAN_SYSTEM).toMatch(/never localize regional spelling variants/i);
    expect(PLAN_SYSTEM).toMatch(/do not stitch separated fragments or invent quotes/i);
  });

  it('binds each citation to a supplied source id containing the exact passage', () => {
    expect(PLAN_SYSTEM).toMatch(
      /The sourceId must identify one of the supplied sources whose text contains that exact passage/i,
    );
    expect(PLAN_SYSTEM).toMatch(/quoted as that whole sentence rather than paraphrased/i);
  });

  it('forbids unresolved questions that supplied evidence already answers', () => {
    expect(PLAN_SYSTEM).toMatch(
      /Put only facts missing from the supplied sources in unresolvedQuestions/i,
    );
    expect(PLAN_SYSTEM).toMatch(
      /when a source already states a fee, date or requirement with the matching scope, cite that passage on a supported step instead of asking the question/i,
    );
  });

  it('forbids inventing collection, delivery or notification procedures', () => {
    expect(PLAN_SYSTEM).toMatch(
      /Never invent a collection, delivery or notification procedure that the sources do not describe/i,
    );
  });

  it('stays jurisdiction-neutral: no country, currency or agency names appear in the prompt', () => {
    expect(PLAN_SYSTEM).not.toMatch(/nigeria|naira|immigration|nemotron|nebius|£|\$|€|₦/i);
  });
});
