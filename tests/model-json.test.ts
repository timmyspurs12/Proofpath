import { describe, expect, it } from 'vitest';
import { extractModelJson, stripReasoning } from '../server/lib/model-json';

describe('stripReasoning', () => {
  it('removes Nemotron-style think blocks, including braces that are not JSON', () => {
    const result = stripReasoning(
      '<think>braces { like this } are reasoning noise</think>\n{"low":10,"likely":20}',
    );
    expect(result.blocksRemoved).toBe(1);
    expect(result.text).toBe('{"low":10,"likely":20}');
  });

  it('removes every supported reasoning tag name and multiple blocks', () => {
    const result = stripReasoning(
      '<thinking>first {noise}</thinking><redacted_thinking>second [noise]</redacted_thinking>' +
        '<reasoning>third</reasoning>{"ok":true}',
    );
    expect(result.blocksRemoved).toBe(3);
    expect(result.text).toBe('{"ok":true}');
  });

  it('handles a reasoning trace whose opening tag was removed by the serving stack', () => {
    const result = stripReasoning('some reasoning with { braces } and prose</think>\n{"ok":true}');
    expect(result.blocksRemoved).toBe(1);
    expect(result.text).toBe('{"ok":true}');
  });

  it('leaves ordinary text untouched', () => {
    const result = stripReasoning('  plain answer {"ok":true} ');
    expect(result.blocksRemoved).toBe(0);
    expect(result.text).toBe('plain answer {"ok":true}');
  });
});

describe('extractModelJson', () => {
  it('accepts direct JSON without any extraction strategy', () => {
    const result = extractModelJson('  {"ok":true}  ');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ ok: true });
      expect(result.diagnostics.parseStrategy).toBe('direct');
      expect(result.diagnostics.thinkBlocksRemoved).toBe(0);
    }
  });

  it('recovers the payload from a think-prefixed Nemotron response (observed failure)', () => {
    const content =
      '<think>The user wants a plan. I need to output JSON like {"draft":true}.</think>' +
      '\n{"title":"Renew your UK passport","steps":[]}';
    const result = extractModelJson(content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ title: 'Renew your UK passport', steps: [] });
      expect(result.diagnostics.parseStrategy).toBe('reasoning-stripped');
      expect(result.diagnostics.thinkBlocksRemoved).toBe(1);
    }
  });

  it('recovers an orphaned reasoning trace followed by JSON', () => {
    const result = extractModelJson('reasoning prose { } </think>{"ok":true}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ ok: true });
      expect(result.diagnostics.thinkBlocksRemoved).toBe(1);
    }
  });

  it('unwraps fenced JSON with prose around it', () => {
    const result = extractModelJson(
      'Sure. Here is the plan:\n```json\n{"low":1,"likely":2}\n```\nLet me know.',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ low: 1, likely: 2 });
      expect(result.diagnostics.parseStrategy).toBe('code-fence');
      expect(result.diagnostics.codeFenceFound).toBe(true);
    }
  });

  it('unwraps a fence without a language tag', () => {
    const result = extractModelJson('```\n{"ok":true}\n```');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ ok: true });
      expect(result.diagnostics.parseStrategy).toBe('code-fence');
    }
  });

  it('falls back to a balanced object scan for prose-wrapped JSON', () => {
    const result = extractModelJson(
      'Here is your plan: {"title":"Passport","steps":[{"id":"s1"}]} — hope that helps.',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ title: 'Passport', steps: [{ id: 's1' }] });
      expect(result.diagnostics.parseStrategy).toBe('balanced-scan');
    }
  });

  it('does not treat braces inside JSON strings as structure', () => {
    const result = extractModelJson('prefix {"note":"a } inside string","ok":true} suffix');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ note: 'a } inside string', ok: true });
    }
  });

  it('supports top-level arrays as balanced candidates', () => {
    const result = extractModelJson('before [1, 2, 3] after');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([1, 2, 3]);
      expect(result.diagnostics.parseStrategy).toBe('balanced-scan');
    }
  });

  it('combines reasoning removal with fenced output', () => {
    const result = extractModelJson('<think>plan first</think>\n```json\n{"ok":true}\n```');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ ok: true });
      expect(result.diagnostics.thinkBlocksRemoved).toBe(1);
      expect(result.diagnostics.parseStrategy).toBe('code-fence');
    }
  });

  it('fails closed when no JSON value is present', () => {
    const text = 'I could not produce a plan today.';
    const result = extractModelJson(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.contentLength).toBe(text.length);
      expect(result.diagnostics.parseStrategy).toBe('direct');
    }
  });

  it('fails closed on empty or whitespace-only content', () => {
    expect(extractModelJson('').ok).toBe(false);
    expect(extractModelJson('   \n\t ').ok).toBe(false);
  });

  it('fails closed on malformed JSON even when a balanced span exists', () => {
    const result = extractModelJson('noise {not valid json} noise');
    expect(result.ok).toBe(false);
  });

  it('reports truncation and never scans beyond the defensive cap', () => {
    const padded = `{"ok":true}${'x'.repeat(200_050)}`;
    const result = extractModelJson(padded);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diagnostics.truncated).toBe(true);
      expect(result.diagnostics.contentLength).toBe(padded.length);
    }
  });
});
