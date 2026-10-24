// Bounded, deterministic extraction of a JSON value from model-generated text.
//
// Token Factory models (notably NVIDIA Nemotron-3-Nano, which defaults to
// enabled reasoning) can wrap an otherwise valid JSON payload in reasoning
// traces, Markdown code fences, or surrounding prose even when structured
// output is requested. This module removes only those transport wrappers.
// It never repairs, rewrites, or interprets content: every accepted value is
// returned untouched and must still pass the caller's full schema validation,
// so no unvalidated claim can ever be accepted.

const THINK_TAG_NAMES = 'think|thinking|redacted_thinking|reasoning';
const CLOSED_THINK_BLOCK = new RegExp(
  `<(?:${THINK_TAG_NAMES})\\b[^>]*>[\\s\\S]*?<\\/(?:${THINK_TAG_NAMES})\\s*>`,
  'gi',
);
const ORPHAN_THINK_CLOSE = new RegExp(`^[\\s\\S]*?<\\/(?:${THINK_TAG_NAMES})\\s*>`, 'i');
const CODE_FENCE = /```(?:json|JSON)?\s*([\s\S]*?)```/;
const ANY_FENCE = /```/;

// Model output is already bounded by max_tokens; this is only a defensive cap
// so a pathological response cannot make the balanced scan unbounded.
const MAX_MODEL_TEXT_LENGTH = 200_000;

export type ModelJsonParseStrategy =
  'direct' | 'reasoning-stripped' | 'code-fence' | 'balanced-scan';

export interface ModelJsonDiagnostics {
  contentLength: number;
  truncated: boolean;
  thinkBlocksRemoved: number;
  codeFenceFound: boolean;
  parseStrategy: ModelJsonParseStrategy;
}

export type ModelJsonResult =
  | { ok: true; value: unknown; diagnostics: ModelJsonDiagnostics }
  | { ok: false; diagnostics: ModelJsonDiagnostics };

function tryParse(text: string): { value: unknown } | undefined {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return undefined;
  }
}

export function stripReasoning(text: string): { text: string; blocksRemoved: number } {
  let blocksRemoved = 0;
  const withoutBlocks = text.replace(CLOSED_THINK_BLOCK, () => {
    blocksRemoved += 1;
    return ' ';
  });
  // Some serving stacks return the reasoning trace with its opening tag
  // already removed: drop everything up to and including the first close tag.
  const orphan = withoutBlocks.match(ORPHAN_THINK_CLOSE);
  if (orphan) {
    return {
      text: withoutBlocks.slice(orphan[0].length).trim(),
      blocksRemoved: blocksRemoved + 1,
    };
  }
  return { text: withoutBlocks.trim(), blocksRemoved };
}

// Returns every balanced {...} or [...] span in order, respecting JSON strings
// and escape sequences so braces inside quoted text are never treated as JSON.
function balancedCandidates(text: string): string[] {
  const candidates: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const opener = text[i];
    if (opener !== '{' && opener !== '[') continue;
    const closer = opener === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let j = i; j < text.length; j += 1) {
      const ch = text[j];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === opener) depth += 1;
      else if (ch === closer) {
        depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(i, j + 1));
          i = j;
          break;
        }
      }
    }
  }
  return candidates;
}

export function extractModelJson(rawContent: string): ModelJsonResult {
  const truncated = rawContent.length > MAX_MODEL_TEXT_LENGTH;
  const content = truncated ? rawContent.slice(0, MAX_MODEL_TEXT_LENGTH) : rawContent;
  const diagnostics: ModelJsonDiagnostics = {
    contentLength: rawContent.length,
    truncated,
    thinkBlocksRemoved: 0,
    codeFenceFound: false,
    parseStrategy: 'direct',
  };

  const direct = tryParse(content);
  if (direct !== undefined) {
    return { ok: true, value: direct.value, diagnostics };
  }

  const { text: withoutReasoning, blocksRemoved } = stripReasoning(content);
  diagnostics.thinkBlocksRemoved = blocksRemoved;
  if (blocksRemoved > 0) {
    const afterStrip = tryParse(withoutReasoning);
    if (afterStrip !== undefined) {
      diagnostics.parseStrategy = 'reasoning-stripped';
      return { ok: true, value: afterStrip.value, diagnostics };
    }
  }

  const fence = withoutReasoning.match(CODE_FENCE);
  diagnostics.codeFenceFound = Boolean(fence?.[1]) || ANY_FENCE.test(withoutReasoning);
  if (fence?.[1]) {
    const fromFence = tryParse(fence[1].trim());
    if (fromFence !== undefined) {
      diagnostics.parseStrategy = 'code-fence';
      return { ok: true, value: fromFence.value, diagnostics };
    }
  }

  for (const candidate of balancedCandidates(withoutReasoning)) {
    const parsed = tryParse(candidate);
    if (parsed !== undefined) {
      diagnostics.parseStrategy = 'balanced-scan';
      return { ok: true, value: parsed.value, diagnostics };
    }
  }

  return { ok: false, diagnostics };
}
