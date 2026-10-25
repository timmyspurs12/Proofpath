import type { LiveCaseDefinition } from '../live-acceptance';
import {
  NIGERIA_CASE_ID,
  NIGERIA_OFFICIAL_HOST_SUFFIXES,
  NIGERIA_OFFICIAL_SOURCE_URLS,
  NIGERIA_TRAP_CLASSES,
  buildNigeriaTaskInput,
} from './nigeria-domestic-renewal';

// Registry of selectable live acceptance cases. The Nigerian domestic
// renewal is the default and currently only case; selection is explicit so
// future cases cannot silently change what `npm run verify:live` validates.
export const LIVE_CASES: readonly LiveCaseDefinition[] = [
  {
    caseId: NIGERIA_CASE_ID,
    expectedJurisdiction: 'Nigeria',
    expectedSourceUrls: NIGERIA_OFFICIAL_SOURCE_URLS,
    officialHostSuffixes: NIGERIA_OFFICIAL_HOST_SUFFIXES,
    trapClasses: NIGERIA_TRAP_CLASSES,
    buildRequest: buildNigeriaTaskInput,
  },
];

export const DEFAULT_CASE_ID = NIGERIA_CASE_ID;

export function selectCase(caseId: string): LiveCaseDefinition {
  const match = LIVE_CASES.find((entry) => entry.caseId === caseId);
  if (!match) {
    throw new Error(
      `Unknown live case "${caseId}". Available cases: ${LIVE_CASES.map((entry) => entry.caseId).join(', ')}`,
    );
  }
  return match;
}
