/**
 * Honest, automated screen recording of the Nigeria domestic renewal demo on a
 * deployed ProofPath build. The script drives the real browser UI end to end,
 * lets the deployed application make the genuine Nebius calls, captures the
 * live runtime receipt (response id, latency, token usage) straight from the
 * POST /api/plans response, and writes:
 *   - a WebM screen recording under artifacts/demo-recordings/
 *   - a sidecar JSON with the post-remediation acceptance observations
 *
 * It never fabricates content. Every frame is the real deployed application.
 * If the server is unconfigured, a request fails, or the live receipt is
 * missing, the script exits non-zero and marks the sidecar as failed instead of
 * producing something that looks like a passing demo.
 *
 * First-time setup:  npx playwright install chromium
 * Run:               npm run record:demo:nigeria
 *
 * Environment overrides:
 *   PROOFPATH_DEMO_URL   Deployment URL (default https://proofpath-woad.vercel.app)
 *   DEMO_HEADLESS=1      Run headless (default: headed, for presenting)
 *   DEMO_BUDGET_S        Maximum seconds of scripted holds, keeps the video
 *                        under three minutes even on a slow generation
 *                        (default 175)
 *
 * Clarification questions are factual and belong to the human: when the
 * clarify card appears, answer it in the browser and press Enter in the
 * terminal. In a non-interactive shell the script exits rather than inventing
 * answers.
 *
 * Exit codes mirror scripts/verify-live.ts:
 *   0 live run completed and every acceptance observation passed
 *   1 runtime failure (network, HTTP error, selector timeout)
 *   2 blocked before a live call (unconfigured server, no TTY for clarification)
 *   3 live inference succeeded but one or more acceptance observations failed
 */
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createInterface } from 'node:readline/promises';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_URL = 'https://proofpath-woad.vercel.app';
const TASK_TEXT =
  'Renew an expired Nigerian passport online as an adult Nigerian citizen living in Nigeria, using a valid NIN and existing passport.';
const JURISDICTION = 'Nigeria';
const CATEGORY = 'Passport renewal';
const DETAILS =
  'Adult Nigerian citizen living in Nigeria, applying through the domestic online renewal route. I have a valid NIN and my existing passport.';
const OFFICIAL_SOURCES = [
  'https://immigration.gov.ng/info-center/renewal-of-passport/',
  'https://passport.immigration.gov.ng/',
  'https://immigration.gov.ng/nigeria-immigration-service-announces-upward-review-of-nigerian-standard-passport-fees/',
  'https://immigration.gov.ng/wp-content/uploads/2026/04/SERVICE-LEVEL-AGREEMENT-2026_.pdf',
].join('\n');

const PLAN_TIMEOUT_MS = 95_000;
const TYPING_DELAY_MS = 18;

interface HealthResponse {
  status: string;
  liveInferenceConfigured: boolean;
  tavilyConfigured: boolean;
  model: string | null;
  provider: string;
  liveInferenceVerified: boolean;
}

interface RuntimeReceipt {
  mode: 'live' | 'sample';
  provider: string;
  model: string | null;
  responseId: string | null;
  latencyMs: number | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;
  retrieval: {
    tavilyCalls: number;
    directFetches: number;
    tavilyRequestIds: string[];
  };
}

interface PlanApiEnvelope {
  plan: {
    runtime: RuntimeReceipt;
  };
}

interface StepSnapshot {
  title: string;
  statusText: string;
  supported: boolean;
  hasUnverifiedNote: boolean;
}

interface Observations {
  receiptMode: string | null;
  responseId: string | null;
  feeQuestionAbsentFromUnresolved: boolean;
  appointmentStepSupported: boolean;
  twentyOneDayTimelinePresent: boolean;
  collectionStaysUnverifiable: boolean;
  rejectedCitationCount: number;
  unresolvedQuestions: string[];
  steps: StepSnapshot[];
}

interface Sidecar {
  recordedAt: string;
  deploymentUrl: string;
  health: HealthResponse;
  runtime: RuntimeReceipt | null;
  observations: Observations | null;
  acceptancePassed: boolean;
  failureReason: string | null;
  durationSeconds: number;
  videoFile: string | null;
}

const HELP = `ProofPath Nigeria demo recorder

Usage:
  npm run record:demo:nigeria [-- --help]

Environment:
  PROOFPATH_DEMO_URL   Deployment to record (default ${DEFAULT_URL})
  DEMO_HEADLESS=1      Headless Chromium (default headed)
  DEMO_BUDGET_S        Max seconds of scripted holds (default 175)

Prerequisites:
  npx playwright install chromium
  The deployment must have live Nebius inference configured.

Outputs (gitignored under artifacts/):
  artifacts/demo-recordings/nigeria-demo-<timestamp>-<response-id>.webm
  artifacts/demo-recordings/nigeria-demo-<timestamp>-<response-id>.json
`;

function log(label: string, message: string): void {
  console.log(`[${label}] ${message}`);
}

async function main(): Promise<number> {
  if (process.argv.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const baseUrl = (process.env.PROOFPATH_DEMO_URL ?? DEFAULT_URL).replace(/\/+$/, '');
  const headless = process.env.DEMO_HEADLESS === '1';
  const budgetSeconds = Number(process.env.DEMO_BUDGET_S ?? '175');
  if (!Number.isFinite(budgetSeconds) || budgetSeconds <= 10) {
    console.error('DEMO_BUDGET_S must be a number greater than 10.');
    return 1;
  }

  const startedAt = Date.now();
  const startedISO = new Date(startedAt).toISOString();
  const stamp = startedISO.replace(/[:.]/g, '-');
  const outputDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'artifacts',
    'demo-recordings',
  );
  await mkdir(outputDir, { recursive: true });

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let planEnvelope: PlanApiEnvelope | null = null;
  let health: HealthResponse | null = null;
  let failureReason: string | null = null;

  // Read through an accessor because TS does not track assignments made
  // inside the page response callback when narrowing this outer variable.
  const capturedPlan = (): PlanApiEnvelope | null => planEnvelope;

  const elapsedSeconds = () => (Date.now() - startedAt) / 1000;
  // Budget-aware hold: never let scripted pacing push the recording past the
  // three-minute cap, regardless of how long generation took.
  const hold = async (wantedSeconds: number, label: string): Promise<void> => {
    const remaining = budgetSeconds - elapsedSeconds();
    const seconds = Math.max(0, Math.min(wantedSeconds, remaining));
    if (seconds > 0) {
      log('hold', `${label} (${seconds.toFixed(1)}s)`);
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    } else {
      log('hold', `${label} skipped — recording budget exhausted`);
    }
  };

  try {
    browser = await chromium.launch({ headless });
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      recordVideo: { dir: outputDir, size: { width: 1440, height: 1000 } },
    });
    page = await context.newPage();

    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname === '/api/plans' && response.request().method() === 'POST') {
        void response
          .json()
          .then((body) => {
            planEnvelope = body as PlanApiEnvelope;
          })
          .catch(() => {
            /* A parse failure surfaces later as a missing receipt. */
          });
      }
    });

    log('preflight', `GET ${baseUrl}/api/health`);
    const healthResponse = await page.request.get(`${baseUrl}/api/health`, { timeout: 15_000 });
    if (!healthResponse.ok()) {
      failureReason = `Health endpoint returned HTTP ${healthResponse.status()}.`;
      return 1;
    }
    health = (await healthResponse.json()) as HealthResponse;
    log(
      'preflight',
      `inference configured: ${health.liveInferenceConfigured}; Tavily: ${health.tavilyConfigured}; model: ${health.model}; liveInferenceVerified flag: ${health.liveInferenceVerified} (hardcoded placeholder — this recording's receipt is the verification)`,
    );
    if (!health.liveInferenceConfigured) {
      failureReason =
        'Deployment has no Nebius credential. No live call was made, so no honest demo can be recorded.';
      return 2;
    }

    log('intake', `Opening ${baseUrl}`);
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await hold(8, 'home screen / opening hook');

    await page.getByLabel('Your task').pressSequentially(TASK_TEXT, { delay: TYPING_DELAY_MS });
    await page.getByLabel('Jurisdiction').fill(JURISDICTION);
    await page.getByLabel('Task category').fill(CATEGORY);
    await page.getByLabel(/What already applies/).fill(DETAILS);
    await page.getByLabel('Official source URLs').fill(OFFICIAL_SOURCES);
    await hold(8, 'completed task form with the four official NIS sources');

    await page.getByRole('button', { name: 'Find my next steps' }).click();
    log('intake', 'Task submitted; waiting for intake clarification or the plan.');

    const clarifyOrPlan = page.locator('.clarify-card, .action-step').first();
    await clarifyOrPlan.waitFor({ timeout: PLAN_TIMEOUT_MS });

    if (await page.locator('.clarify-card').isVisible()) {
      log(
        'clarify',
        'The deployment asked clarification questions. Answer every required field in the browser window.',
      );
      if (!process.stdin.isTTY) {
        failureReason =
          'Clarification questions appeared in a non-interactive shell. Re-run in a terminal so a human can answer them; answers must never be invented.';
        return 2;
      }
      const readline = createInterface({ input: process.stdin, output: process.stdout });
      await readline.question(
        '>> Answer the clarification questions in the browser, then press Enter here to continue...\n',
      );
      readline.close();
      await page.getByRole('button', { name: 'Retrieve sources & build plan' }).click();
      log('plan', 'Answers submitted; waiting for the live plan.');
    }

    const errorAlert = page.getByRole('alert');
    if (await errorAlert.isVisible().catch(() => false)) {
      failureReason = `Application error before the plan: ${(await errorAlert.innerText()).trim()}`;
      return 1;
    }

    await page.locator('.action-step').first().waitFor({ timeout: PLAN_TIMEOUT_MS });
    await page.locator('.runtime-receipt-card').waitFor({ timeout: 15_000 });
    log('plan', 'Live plan rendered.');

    const receipt = capturedPlan()?.plan.runtime ?? null;
    if (!receipt || receipt.mode !== 'live' || !receipt.responseId?.startsWith('chatcmpl-')) {
      failureReason =
        'No live chatcmpl-* receipt was captured from POST /api/plans. A recording without a genuine receipt cannot be released.';
      return 1;
    }
    log('receipt', `${receipt.responseId} — model ${receipt.model}, ${receipt.latencyMs} ms`);

    await hold(12, 'finished action plan overview');

    // Fee evidence: expand the fee step's exact-passage citations.
    const feeStep = page.locator('.action-step', { hasText: /₦|100,000|fee/i }).first();
    if (await feeStep.isVisible().catch(() => false)) {
      await feeStep.scrollIntoViewIfNeeded();
      const feeCitations = feeStep.locator('details.evidence-detail');
      const feeCount = await feeCitations.count();
      for (let index = 0; index < Math.min(feeCount, 2); index += 1) {
        await feeCitations
          .nth(index)
          .locator('summary')
          .click()
          .catch(() => undefined);
      }
      await hold(18, 'fee step with exact NIS passages and bank-charge exclusion');
    } else {
      log('walkthrough', 'Fee step not found by expected text; continuing.');
    }

    // Appointment evidence: the verbatim portal passage.
    const appointmentStep = page.locator('.action-step', { hasText: /appointment/i }).first();
    if (await appointmentStep.isVisible().catch(() => false)) {
      await appointmentStep.scrollIntoViewIfNeeded();
      const appointmentCitations = appointmentStep.locator('details.evidence-detail');
      if ((await appointmentCitations.count()) > 0) {
        await appointmentCitations
          .first()
          .locator('summary')
          .click()
          .catch(() => undefined);
      }
      await hold(16, 'appointment step with the verbatim biometric-enrolment passage');
    } else {
      log('walkthrough', 'Appointment step not found; continuing.');
    }

    // Rejected citations panel, if the gate removed anything on this run.
    const rejected = page.locator('.rejected-evidence details').first();
    if (await rejected.isVisible().catch(() => false)) {
      await rejected.scrollIntoViewIfNeeded();
      await rejected
        .locator('summary')
        .click()
        .catch(() => undefined);
      await hold(10, 'rejected-citation panel with provenance and reason');
    } else {
      log('walkthrough', 'No rejected-citation panel on this run; segment skipped.');
    }

    // The 21-day service standard is separate from the collection step.
    const trackingStep = page.locator('.action-step', { hasText: /21 day|re-?issue/i }).first();
    if (await trackingStep.isVisible().catch(() => false)) {
      await trackingStep.scrollIntoViewIfNeeded();
      await hold(10, '21-day reissue service standard');
    }
    const collectionStep = page.locator('.action-step', { hasText: /collect/i }).first();
    if (await collectionStep.isVisible().catch(() => false)) {
      await collectionStep.scrollIntoViewIfNeeded();
      await hold(10, 'collection step kept unable to verify');
    }

    // Structured unresolved questions — the fee/bank-charge question must be gone.
    const questionsSection = page.locator('.questions-section');
    if (await questionsSection.isVisible().catch(() => false)) {
      await questionsSection.scrollIntoViewIfNeeded();
      await hold(14, 'still-unresolved questions, not guesses');
    }

    // Source ledger then the runtime receipt close-up.
    const ledger = page.locator('.sources-sidebar');
    if (await ledger.isVisible().catch(() => false)) {
      await ledger.scrollIntoViewIfNeeded();
      await hold(8, 'official source ledger');
    }
    const receiptCard = page.locator('.runtime-receipt-card');
    await receiptCard.scrollIntoViewIfNeeded();
    await hold(16, 'live runtime receipt: model, response id, latency, tokens');

    // Deterministic acceptance observations read from the rendered DOM.
    const observations = await page.evaluate((): Observations => {
      const stepElements = Array.from(document.querySelectorAll('.action-step'));
      const steps: StepSnapshot[] = stepElements.map((element) => {
        const node = element as HTMLElement;
        return {
          title: node.querySelector('h3')?.textContent?.trim() ?? '(untitled step)',
          statusText: node.textContent?.includes('Unable to verify') ? 'unverifiable' : 'other',
          supported: Boolean(node.querySelector('.evidence-supported')),
          hasUnverifiedNote: Boolean(node.querySelector('.unverified-note')),
        };
      });
      const unresolvedQuestions = Array.from(
        document.querySelectorAll('.questions-section .question-row h3'),
      ).map((node) => node.textContent?.trim() ?? '');
      const bodyText = document.body.innerText;
      return {
        receiptMode: null,
        responseId: null,
        feeQuestionAbsentFromUnresolved: !unresolvedQuestions.some((question) =>
          /bank charge|\bfee\b/i.test(question),
        ),
        appointmentStepSupported: steps.some(
          (step) => /appointment/i.test(step.title) && step.supported,
        ),
        twentyOneDayTimelinePresent: /21 day|re-?issue/i.test(bodyText),
        collectionStaysUnverifiable: steps.some(
          (step) =>
            /collect/i.test(step.title) &&
            (step.statusText === 'unverifiable' || step.hasUnverifiedNote),
        ),
        rejectedCitationCount: document.querySelectorAll('.rejected-evidence details').length,
        unresolvedQuestions,
        steps,
      };
    });
    observations.receiptMode = receipt.mode;
    observations.responseId = receipt.responseId;

    const checks = [
      [
        'fee/bank-charge question absent from unresolved',
        observations.feeQuestionAbsentFromUnresolved,
      ],
      ['appointment step supported by an exact passage', observations.appointmentStepSupported],
      ['21-day timeline present as a service standard', observations.twentyOneDayTimelinePresent],
      ['collection remains unable to verify', observations.collectionStaysUnverifiable],
    ] as const;
    log('acceptance', 'Post-remediation observations for this live run:');
    for (const [label, passed] of checks) {
      log(passed ? 'PASS' : 'FAIL', label);
    }
    const acceptancePassed = checks.every(([, passed]) => passed);

    const durationSeconds = Math.round(elapsedSeconds());
    const idSuffix = receipt.responseId.replace(/^chatcmpl-/, '').slice(0, 12);
    const baseName = `nigeria-demo-${stamp}-${idSuffix}`;

    await context.close();
    context = null;
    const recordedVideo = page.video();
    const rawVideoPath = recordedVideo ? await recordedVideo.path() : null;
    const videoFile = rawVideoPath ? join(outputDir, `${baseName}.webm`) : null;
    if (rawVideoPath && videoFile) {
      await rename(rawVideoPath, videoFile);
    }

    const sidecar: Sidecar = {
      recordedAt: startedISO,
      deploymentUrl: baseUrl,
      health,
      runtime: receipt,
      observations,
      acceptancePassed,
      failureReason: null,
      durationSeconds,
      videoFile,
    };
    const sidecarPath = join(outputDir, `${baseName}.json`);
    await writeFile(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');

    log('result', `Acceptance ${acceptancePassed ? 'PASS' : 'FAIL'} in ${durationSeconds}s`);
    log('result', `Video:   ${videoFile ?? '(no video produced)'}`);
    log('result', `Sidecar: ${sidecarPath}`);
    if (durationSeconds > 180) {
      log(
        'result',
        'WARNING: recording exceeds 180 seconds; trim before upload or re-run with a lower DEMO_BUDGET_S.',
      );
    }
    return acceptancePassed ? 0 : 3;
  } catch (error) {
    failureReason = error instanceof Error ? error.message : String(error);
    log('error', failureReason);
    return 1;
  } finally {
    if (context) await context.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
    if (failureReason && health) {
      const failureSidecar: Sidecar = {
        recordedAt: startedISO,
        deploymentUrl: baseUrl,
        health,
        runtime: capturedPlan()?.plan.runtime ?? null,
        observations: null,
        acceptancePassed: false,
        failureReason,
        durationSeconds: Math.round(elapsedSeconds()),
        videoFile: null,
      };
      await writeFile(
        join(outputDir, `nigeria-demo-${stamp}-FAILED.json`),
        `${JSON.stringify(failureSidecar, null, 2)}\n`,
        'utf8',
      ).catch(() => undefined);
    }
  }
}

void main().then((exitCode) => {
  process.exitCode = exitCode;
});
