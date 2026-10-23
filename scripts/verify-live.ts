import { mkdir, writeFile } from 'node:fs/promises';
import { getConfig } from '../server/config';
import { NebiusClient } from '../server/lib/nebius';
import { runIntake, runPlan } from '../server/lib/plan';
import { TavilyClient } from '../server/lib/tavily';
import type { TaskInput } from '../src/shared/schemas';

const config = getConfig();

if (!config.nebiusApiKey) {
  console.error(
    'BLOCKED: NEBIUS_API_KEY is not set. No live request was made and no compliance claim can be established.',
  );
  console.error(
    'Add a server-side credential to .env, then rerun npm run verify:live. The labelled sample is not a substitute.',
  );
  process.exitCode = 2;
} else {
  const documentText = `Renew or replace your adult passport

It costs £102 to renew or replace your passport if you apply online or £115.50 if you fill in a paper form.

You must be aged 16 or over (or turning 16 in the next 3 weeks) to get an adult passport.

Check how long it will take to get a passport before you apply.

Do not book travel until you have a valid passport - your new passport will not have the same number as your old one.

You can track your passport application using your application reference number.`;

  const input: TaskInput = {
    task: 'Create an action plan to renew my adult UK passport online.',
    jurisdiction: 'United Kingdom',
    category: 'Travel & identity',
    details:
      'The applicant is 32, lives in the UK, is renewing a standard adult passport, prefers the online route, and is not asking about an urgent service.',
    sourceUrls: [],
    document: { name: 'govuk-renewal-excerpt-2026-10-23.txt', text: documentText },
  };

  try {
    const client = new NebiusClient(config);
    const tavily = new TavilyClient(config);
    const intake = await runIntake(client, input);
    // Do not invent personal facts to silence clarification questions. The model
    // must retain any unresolved uncertainty in the resulting plan.
    const answers = intake.questions.map((entry) => ({
      question: entry.question,
      answer:
        'No additional personal fact is supplied. Keep any resulting uncertainty explicit and do not guess.',
    }));
    const result = await runPlan(client, tavily, {
      ...input,
      goal: intake.goal,
      searchQueries: intake.searchQueries,
      answers,
    });
    if (result.plan.runtime.mode !== 'live' || result.plan.runtime.provider !== 'nebius') {
      throw new Error('The successful result did not contain a live Nebius receipt.');
    }
    const artifact = {
      verifiedAt: new Date().toISOString(),
      note: 'Genuine live API calls for this run only. Not a production availability or future-performance guarantee.',
      intakeRuntime: intake.runtime,
      planRuntime: result.plan.runtime,
      metrics: result.metrics,
      intakeQuestions: intake.questions,
      plan: result.plan,
    };
    await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
    await writeFile(
      new URL('../artifacts/live-verification.json', import.meta.url),
      JSON.stringify(artifact, null, 2),
    );
    console.log(`LIVE NEBIUS VERIFIED: ${result.plan.runtime.model}`);
    console.log(
      `Plan response ID: ${result.plan.runtime.responseId ?? 'not supplied by provider'}`,
    );
    console.log(
      `Validated steps: ${result.plan.steps.length}; supported: ${result.plan.steps.filter((step) => step.status === 'supported').length}`,
    );
    console.log(`Tavily runtime calls: ${result.plan.runtime.retrieval.tavilyCalls}`);
    console.log(
      'Receipt and plan written to ignored artifacts/live-verification.json. This does not verify a public deployment.',
    );
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error ? String(error.code) : 'UNKNOWN';
    console.error(
      `LIVE VERIFICATION FAILED [${code}]: ${error instanceof Error ? error.message : 'Unknown provider error'}`,
    );
    console.error(
      'No live verification artifact was written. Check model access, structured-output support, quota, and source discovery configuration.',
    );
    process.exitCode = 1;
  }
}
