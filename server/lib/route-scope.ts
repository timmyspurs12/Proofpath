// Generic application-route and location-scope helpers. They contain no
// country, agency, city or currency tables: only domain-neutral vocabulary
// describing where and how an administrative process is transacted, so the
// same logic works for any jurisdiction.
import type { RouteContext } from './claim-checks';

// Strong overseas/consular markers. Bare words such as "mission" are excluded
// deliberately: domestic documents can mention a mission statement, and a
// whole-document scope decision must not hinge on an ambiguous token.
export const ABROAD_SCOPE_PATTERN =
  /\b(?:abroad|overseas|diaspora|consular|consulate|embassy|high commission|diplomatic mission|from outside|living outside)\b/i;

export const DOMESTIC_SCOPE_PATTERN =
  /\b(?:domestic|in-country|within (?:the )?country|inside (?:the )?country|home country)\b/i;

export type LocationScope = 'domestic' | 'abroad' | 'unspecified';

export function textLocationScope(text: string): LocationScope {
  if (ABROAD_SCOPE_PATTERN.test(text)) return 'abroad';
  if (DOMESTIC_SCOPE_PATTERN.test(text)) return 'domestic';
  return 'unspecified';
}

// A scope conflicts with the request only when it is the opposite location.
// Unspecified scope never conflicts: absence of a location marker must not
// exclude material whose applicability is decided by the sentence-level gates.
export function scopeConflictsWithRoute(
  scope: LocationScope,
  route: Pick<RouteContext, 'abroad'>,
): boolean {
  if (scope === 'unspecified') return false;
  return route.abroad ? scope === 'domestic' : scope === 'abroad';
}

// Model-generated unresolved questions carry the same route discipline as
// steps: a question about an overseas/consular procedure cannot belong to a
// domestic request (and vice versa), even when a retrieved foreign-mission
// document prompted the model to ask it.
export function questionOutOfRoute(
  question: { question: string; reason: string },
  route: Pick<RouteContext, 'abroad'>,
): boolean {
  return scopeConflictsWithRoute(
    textLocationScope(`${question.question} ${question.reason}`),
    route,
  );
}
