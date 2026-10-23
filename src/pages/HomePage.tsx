import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Link2,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import {
  HealthResponseSchema,
  IntakeResponseSchema,
  PlanResponseSchema,
  TaskInputSchema,
  type HealthResponse,
  type IntakeResponse,
  type TaskInput,
} from '../shared/schemas';
import { apiFetch, ApiError } from '../lib/api';
import { usePlanLibrary } from '../context/PlanLibraryContext';
import { samplePlan } from '../data/sample-plan';
import { Alert, Button, Skeleton } from '../components/ui';
import { PlanPreview } from '../components/PlanPreview';

const initialForm: TaskInput = {
  task: '',
  jurisdiction: 'United Kingdom',
  category: 'Travel & identity',
  details: '',
  sourceUrls: [],
  document: null,
};

export function HomePage() {
  const navigate = useNavigate();
  const { openPlan } = usePlanLibrary();
  const [form, setForm] = useState<TaskInput>(initialForm);
  const [sourceText, setSourceText] = useState('');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [intake, setIntake] = useState<IntakeResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<'edit' | 'clarify'>('edit');
  const [busy, setBusy] = useState<'intake' | 'plan' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    apiFetch('/api/health', HealthResponseSchema, {}, 8_000)
      .then(setHealth)
      .catch(() => setHealthError(true));
  }, []);

  function update<K extends keyof TaskInput>(key: K, value: TaskInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function parseSources() {
    return sourceText
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean);
  }

  function validateForm() {
    const candidate = { ...form, sourceUrls: parseSources() };
    const parsed = TaskInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(
        new ApiError(
          'INVALID_REQUEST',
          parsed.error.issues[0]?.message ?? 'Check the form.',
          false,
          400,
        ),
      );
      return null;
    }
    if (
      !parsed.data.sourceUrls.length &&
      !parsed.data.document &&
      health &&
      !health.tavilyConfigured
    ) {
      setError(
        new ApiError(
          'SOURCES_REQUIRED',
          'Add at least one official source URL or a text document. ProofPath will not invent instructions from model memory.',
          false,
          422,
        ),
      );
      return null;
    }
    setForm(parsed.data);
    return parsed.data;
  }

  async function generatePlan(
    intakeResult: IntakeResponse,
    answerList: Array<{ question: string; answer: string }>,
    input = form,
  ) {
    setBusy('plan');
    setError(null);
    try {
      const result = await apiFetch(
        '/api/plans',
        PlanResponseSchema,
        {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            sourceUrls: parseSources(),
            goal: intakeResult.goal,
            searchQueries: intakeResult.searchQueries,
            answers: answerList,
          }),
        },
        90_000,
      );
      openPlan(result.plan);
      navigate('/plans/current');
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError('UNKNOWN', 'The plan could not be created.', true, 500),
      );
      setStage(intakeResult.questions.length ? 'clarify' : 'edit');
    } finally {
      setBusy(null);
    }
  }

  async function submitTask(event: FormEvent) {
    event.preventDefault();
    const input = validateForm();
    if (!input) return;
    setBusy('intake');
    setError(null);
    try {
      const result = await apiFetch(
        '/api/intake',
        IntakeResponseSchema,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        35_000,
      );
      setIntake(result);
      setAnswers({});
      if (result.questions.length) {
        setStage('clarify');
      } else {
        await generatePlan(result, [], input);
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError('UNKNOWN', 'The task could not be analyzed.', true, 500),
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitAnswers(event: FormEvent) {
    event.preventDefault();
    if (!intake) return;
    const answerList = intake.questions.map((question) => ({
      question: question.question,
      answer: answers[question.id]?.trim() ?? '',
    }));
    if (answerList.some((answer) => !answer.answer)) {
      setError(
        new ApiError(
          'ANSWERS_REQUIRED',
          'Answer each essential question so ProofPath does not guess.',
          false,
          400,
        ),
      );
      return;
    }
    await generatePlan(intake, answerList);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    if (!/\.(txt|text|md|markdown)$/i.test(file.name)) {
      setError(
        new ApiError(
          'UNSUPPORTED_FILE',
          'Choose a .txt or .md file. PDF and image extraction are not supported in this version.',
          false,
          400,
        ),
      );
      return;
    }
    if (file.size > 40_000) {
      setError(
        new ApiError('FILE_TOO_LARGE', 'Choose a text file smaller than 40 KB.', false, 400),
      );
      return;
    }
    const text = await file.text();
    if (!text.trim()) {
      setError(new ApiError('EMPTY_FILE', 'That document has no readable text.', false, 400));
      return;
    }
    update('document', { name: file.name, text });
  }

  function fillLiveExample() {
    const next = {
      ...initialForm,
      task: 'I need to renew my adult UK passport and want a clear application checklist.',
      jurisdiction: 'United Kingdom',
      category: 'Travel & identity',
      details:
        'I am 32, live in the UK, and want to renew a standard adult passport online. I am not asking about an urgent service.',
    };
    setForm(next);
    setSourceText('https://www.gov.uk/renew-adult-passport\nhttps://www.gov.uk/passport-fees');
    setIntake(null);
    setStage('edit');
    setError(null);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById('task-builder')
      ?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function fillTaskOutline(outline: 'scholarship' | 'utility') {
    const fields =
      outline === 'scholarship'
        ? {
            task: 'Prepare the documents for a scholarship application.',
            jurisdiction: 'Nigeria',
            category: 'Education & funding',
            details:
              'I need an ordered document checklist and submission plan. I will provide the official scholarship instructions or prospectus below.',
          }
        : {
            task: 'Review an electricity bill and dispute an incorrect charge.',
            jurisdiction: 'Nigeria',
            category: 'Utilities & bills',
            details:
              'I want to understand the charges and follow the provider’s official complaint process. I will add the bill or provider guidance as a source.',
          };
    setForm({ ...initialForm, ...fields });
    setSourceText('');
    setIntake(null);
    setStage('edit');
    setError(null);
    document.getElementById('task')?.focus();
  }

  function openSample() {
    openPlan({ ...samplePlan, steps: samplePlan.steps.map((step) => ({ ...step })) });
    navigate('/plans/current');
  }

  return (
    <div className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="eyebrow-line" /> Evidence-backed action plans
          </span>
          <h1 id="home-title">
            Know what to do next.
            <em>See why.</em>
          </h1>
          <p className="hero-lede">
            Turn official pages and dense documents into an ordered checklist. Inspect the passage
            behind each important step, keep uncertainties visible, and decide what to do next.
          </p>
          <div className="hero-actions">
            <a href="#task-builder" className="button button-primary button-large">
              Build my action plan <ArrowRight size={18} aria-hidden="true" />
            </a>
            <Button variant="secondary" size="large" onClick={openSample}>
              Explore a labelled sample
            </Button>
          </div>
          <span className="sample-caption">Sample: 2 real GOV.UK pages · 6 steps · no AI call</span>
          <ul className="hero-assurances" aria-label="ProofPath principles">
            <li>
              <FileText size={15} aria-hidden="true" /> Exact source passages
            </li>
            <li>
              <ShieldCheck size={15} aria-hidden="true" /> Visible uncertainty
            </li>
            <li>
              <LockKeyhole size={15} aria-hidden="true" /> Explicit local saves
            </li>
          </ul>
        </div>
        <PlanPreview onOpen={openSample} />
      </section>

      <section id="task-builder" className="builder-section" aria-labelledby="builder-title">
        <div className="builder-heading">
          <div>
            <span className="step-kicker">01 / DEFINE THE TASK</span>
            <h2 id="builder-title">What do you need to get done?</h2>
            <p>Start with the outcome. Add context and evidence only where they matter.</p>
          </div>
          <button type="button" className="text-button" onClick={fillLiveExample}>
            <RotateCcw size={14} /> Fill a real UK passport task
          </button>
        </div>

        {health && !health.liveInferenceConfigured && (
          <Alert tone="warning" title="Live inference is not configured on this server">
            The labelled sample is available. Real plan requests will explain how to connect Nebius;
            no simulated response will be marked as live.
          </Alert>
        )}
        {health?.liveInferenceConfigured && (
          <Alert tone="info" title="Nebius is configured">
            The server has a credential for <code>{health.model}</code>. This configuration check is
            not itself proof of a successful call; a generated live plan includes its actual
            response receipt.
          </Alert>
        )}
        {healthError && (
          <Alert tone="error">
            The API status could not be loaded. The sample remains available; live requests may be
            unavailable.
          </Alert>
        )}
        {error && (
          <Alert tone="error" title={error.retryable ? 'Please try again' : 'Action needed'}>
            {error.message}
            {error.retryable && intake && (
              <div>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() =>
                    void generatePlan(
                      intake,
                      intake.questions.map((q) => ({
                        question: q.question,
                        answer: answers[q.id] ?? '',
                      })),
                    )
                  }
                >
                  Retry plan
                </Button>
              </div>
            )}
          </Alert>
        )}

        {busy ? (
          <div className="generation-state" aria-live="polite" aria-busy="true">
            <div className="generation-orbit">
              <FileText size={25} aria-hidden="true" />
            </div>
            <span className="step-kicker">
              {busy === 'intake' ? 'UNDERSTANDING YOUR GOAL' : 'BUILDING WITH RECEIPTS'}
            </span>
            <h2>
              {busy === 'intake'
                ? 'Finding the essential questions…'
                : 'Turning evidence into action…'}
            </h2>
            <p>
              {busy === 'intake'
                ? 'The server is checking what must be clarified before sources are selected.'
                : 'The server retrieves sources, requests a draft plan, then checks every cited passage. This can take up to a minute.'}
            </p>
            <div className="generation-steps" aria-label="Plan generation process">
              <span>
                <CheckCircle2 size={15} aria-hidden="true" /> Scope the task
              </span>
              <span>
                <Link2 size={15} aria-hidden="true" /> Retrieve and draft
              </span>
              <span>
                <ShieldCheck size={15} aria-hidden="true" /> Check citations
              </span>
            </div>
            <div className="generation-skeleton">
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </div>
          </div>
        ) : stage === 'clarify' && intake ? (
          <form className="clarify-card" onSubmit={submitAnswers}>
            <span className="step-kicker">02 / ONE SHORT CLARIFICATION</span>
            <h2>Before we build the plan</h2>
            <div className="goal-callout">
              <span>Your goal</span>
              <strong>{intake.goal}</strong>
            </div>
            <p className="form-intro">
              These answers change which instructions apply. ProofPath asks rather than guesses.
            </p>
            {intake.questions.map((question, index) => (
              <div className="field" key={question.id}>
                <label htmlFor={`answer-${question.id}`}>
                  {index + 1}. {question.question}
                </label>
                <p id={`reason-${question.id}`} className="field-help">
                  {question.reason}
                </p>
                <textarea
                  id={`answer-${question.id}`}
                  rows={2}
                  maxLength={2000}
                  value={answers[question.id] ?? ''}
                  aria-describedby={`reason-${question.id}`}
                  onChange={(event) =>
                    setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
                  }
                  required
                />
              </div>
            ))}
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={() => setStage('edit')}>
                Back to task
              </Button>
              <Button type="submit">
                Retrieve sources & build plan <ArrowRight size={17} />
              </Button>
            </div>
          </form>
        ) : (
          <form className="task-form" onSubmit={submitTask}>
            <div className="task-examples">
              <div>
                <span>Need a starting point?</span>
                <p>Prefill an outline, then add the instructions that apply to you.</p>
              </div>
              <div className="task-example-links">
                <button type="button" onClick={() => fillTaskOutline('scholarship')}>
                  Scholarship documents <ArrowRight size={14} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => fillTaskOutline('utility')}>
                  Utility bill review <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="field field-task">
              <label htmlFor="task">Your task</label>
              <textarea
                id="task"
                rows={4}
                maxLength={4000}
                value={form.task}
                onChange={(event) => update('task', event.target.value)}
                placeholder="For example: I need to renew my adult passport and want to know exactly what to prepare, pay, and do next."
                required
                minLength={8}
              />
              <span className="field-help">
                Describe the outcome, not just a topic. Do not include names, ID numbers, passwords,
                or payment details.
              </span>
            </div>
            <div className="form-grid two-columns">
              <div className="field">
                <label htmlFor="jurisdiction">Jurisdiction</label>
                <input
                  id="jurisdiction"
                  list="jurisdiction-options"
                  value={form.jurisdiction}
                  onChange={(event) => update('jurisdiction', event.target.value)}
                  required
                />
                <datalist id="jurisdiction-options">
                  <option value="United Kingdom" />
                  <option value="Nigeria" />
                  <option value="United States" />
                  <option value="Canada" />
                  <option value="European Union" />
                </datalist>
                <span className="field-help">Requirements are never assumed across borders.</span>
              </div>
              <div className="field">
                <label htmlFor="category">Task category</label>
                <select
                  id="category"
                  value={form.category}
                  onChange={(event) => update('category', event.target.value)}
                >
                  <option>Travel & identity</option>
                  <option>Education & funding</option>
                  <option>Public services</option>
                  <option>Utilities & bills</option>
                  <option>Documents & applications</option>
                  <option>Other administrative task</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="details">
                What already applies to you? <span className="optional">Optional</span>
              </label>
              <textarea
                id="details"
                rows={2}
                maxLength={8000}
                value={form.details}
                onChange={(event) => update('details', event.target.value)}
                placeholder="Age band, application route, location, school year, or other non-sensitive context."
              />
            </div>
            <div className="source-input-group">
              <div className="source-input-heading">
                <div>
                  <Link2 size={18} />
                  <strong>Give the plan something to stand on</strong>
                </div>
                <span>Up to 6 sources</span>
              </div>
              <div className="field">
                <label htmlFor="sources">Official source URLs</label>
                <textarea
                  id="sources"
                  rows={3}
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                  placeholder={
                    'https://www.gov.uk/renew-adult-passport\nhttps://www.gov.uk/passport-fees'
                  }
                />
                <span className="field-help">
                  One public HTML or plain-text URL per line. Pages are fetched by the server;
                  snippets are not treated as proof.
                </span>
              </div>
              <div className="upload-row">
                <div>
                  <FileText size={18} />
                  <div>
                    <strong>Or add a text document</strong>
                    <span>.txt or .md, up to 40 KB</span>
                  </div>
                </div>
                {form.document ? (
                  <span className="file-chip">
                    {form.document.name}
                    <button
                      type="button"
                      aria-label="Remove document"
                      onClick={() => update('document', null)}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ) : (
                  <label className="upload-button">
                    <Upload size={15} /> Choose file
                    <input
                      type="file"
                      accept=".txt,.text,.md,.markdown"
                      onChange={(event) => void handleFile(event)}
                    />
                  </label>
                )}
              </div>
            </div>
            <div className="form-footer">
              <p>
                <LockKeyhole size={15} /> Live inputs go to Nebius for processing. Optional
                discovery uses Tavily only when configured. Saved plans stay in this browser.
              </p>
              <Button type="submit" size="large">
                Find my next steps <ArrowRight size={18} />
              </Button>
            </div>
          </form>
        )}
      </section>

      <section className="difference-strip" aria-label="How ProofPath is different">
        <div>
          <span>01</span>
          <h3>Sources become steps</h3>
          <p>Requirements, conditions, and completion criteria—not another chat answer.</p>
        </div>
        <div>
          <span>02</span>
          <h3>Code checks the model</h3>
          <p>A “supported” label survives only when the exact passage exists.</p>
        </div>
        <div>
          <span>03</span>
          <h3>Gaps stay visible</h3>
          <p>Inference, conflicts, and missing proof are never smoothed into certainty.</p>
        </div>
      </section>
    </div>
  );
}
