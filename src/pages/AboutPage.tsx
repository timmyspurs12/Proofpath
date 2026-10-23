import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CircleHelp,
  Code2,
  ExternalLink,
  Lightbulb,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { Alert } from '../components/ui';

interface EvaluationArtifact {
  ranAt: string;
  mode: string;
  liveModel: boolean;
  totals: { cases: number; passed: number; failed: number };
  metrics: {
    citationCoverage: number;
    unsupportedClaimRate: number;
    conflictsDetected: number;
    conflictsExpected: number;
    missingInformationHandled: number;
    missingInformationCases: number;
    endToEndCompleted: number;
    endToEndCases: number;
    providerFailuresHandled: number;
    providerFailureCases: number;
    medianFixtureLatencyMs: number;
  };
}

function EvaluationPanel() {
  const [result, setResult] = useState<EvaluationArtifact | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch('/evaluation.json')
      .then((response) => {
        if (!response.ok) throw new Error('No artifact');
        return response.json() as Promise<EvaluationArtifact>;
      })
      .then(setResult)
      .catch(() => setError(true));
  }, []);
  if (error)
    return (
      <Alert tone="info">
        No evaluation artifact is available in this build. Run <code>npm run evaluate</code> to
        generate one from actual test cases.
      </Alert>
    );
  if (!result)
    return (
      <div className="evaluation-loading" aria-busy="true">
        Loading measured evaluation…
      </div>
    );
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  return (
    <div className="evaluation-panel">
      <div className="evaluation-meta">
        <span className={result.liveModel ? 'live-eval' : 'fixture-eval'}>
          {result.liveModel ? 'Live model evaluation' : 'Deterministic fixture evaluation'}
        </span>
        <span>Ran {new Date(result.ranAt).toLocaleString()}</span>
      </div>
      {!result.liveModel && (
        <p>
          These results test validation and workflow logic with labelled model fixtures. They are{' '}
          <strong>not</strong> a Nemotron quality benchmark or evidence of live inference.
        </p>
      )}
      <div className="eval-grid">
        <div>
          <strong>
            {result.totals.passed}/{result.totals.cases}
          </strong>
          <span>cases passed</span>
        </div>
        <div>
          <strong>{percent(result.metrics.citationCoverage)}</strong>
          <span>final citation coverage</span>
        </div>
        <div>
          <strong>{percent(result.metrics.unsupportedClaimRate)}</strong>
          <span>raw supported claims rejected</span>
        </div>
        <div>
          <strong>
            {result.metrics.conflictsDetected}/{result.metrics.conflictsExpected}
          </strong>
          <span>expected conflicts detected</span>
        </div>
        <div>
          <strong>
            {result.metrics.missingInformationHandled}/{result.metrics.missingInformationCases}
          </strong>
          <span>missing-info cases handled</span>
        </div>
        <div>
          <strong>
            {result.metrics.endToEndCompleted}/{result.metrics.endToEndCases}
          </strong>
          <span>workflow cases completed</span>
        </div>
        <div>
          <strong>
            {result.metrics.providerFailuresHandled}/{result.metrics.providerFailureCases}
          </strong>
          <span>provider failures contained</span>
        </div>
        <div>
          <strong>{result.metrics.medianFixtureLatencyMs} ms</strong>
          <span>median fixture latency</span>
        </div>
      </div>
    </div>
  );
}

export function AboutPage() {
  return (
    <div className="about-page page-stack">
      <header className="page-heading about-heading">
        <span className="eyebrow">How ProofPath works</span>
        <h1>
          A plan should show
          <br />
          <em>what it stands on.</em>
        </h1>
        <p>
          ProofPath combines semantic extraction by NVIDIA Nemotron with a deterministic evidence
          gate. The model proposes the path; code decides which source claims can be called
          supported.
        </p>
      </header>

      <section className="architecture-flow" aria-label="ProofPath processing flow">
        <div>
          <span>01</span>
          <h3>Clarify</h3>
          <p>Identify the actual goal and ask only for details that change the process.</p>
        </div>
        <div>
          <span>02</span>
          <h3>Retrieve</h3>
          <p>Read supplied official URLs, uploaded text, and optional Tavily discoveries.</p>
        </div>
        <div>
          <span>03</span>
          <h3>Build</h3>
          <p>Nemotron orders concrete steps and attaches exact supporting passages.</p>
        </div>
        <div>
          <span>04</span>
          <h3>Validate</h3>
          <p>Code rejects invented citations, weak conflicts, unsupported dates, and cycles.</p>
        </div>
      </section>

      <section className="about-section">
        <span className="step-kicker">THE FOUR EVIDENCE STATES</span>
        <h2>Uncertainty is a visible state, not a footnote</h2>
        <div className="evidence-explainer-grid">
          <div>
            <CheckCircle2 />
            <h3>Supported by source</h3>
            <p>
              An exact contiguous passage was found in the cited retrieval. This does not prove that
              the source is current or the interpretation is perfect.
            </p>
          </div>
          <div>
            <Lightbulb />
            <h3>Inferred — confirm</h3>
            <p>
              A practical suggestion, user edit, or custom step without a direct factual requirement
              in the source.
            </p>
          </div>
          <div>
            <TriangleAlert />
            <h3>Conflicting evidence</h3>
            <p>
              Nemotron linked the concern to real passages from at least two sources. Both passages
              remain open for review.
            </p>
          </div>
          <div>
            <CircleHelp />
            <h3>Unable to verify</h3>
            <p>
              No valid supporting passage exists. ProofPath preserves the gap rather than presenting
              a confident requirement.
            </p>
          </div>
        </div>
      </section>

      <section className="about-section tech-section">
        <div>
          <span className="step-kicker">RUNTIME ARCHITECTURE</span>
          <h2>Small stack. Explicit trust boundaries.</h2>
          <p>
            React + TypeScript on the client, a bounded Express API on the server, and no database.
            Plans save only to the current browser unless exported.
          </p>
          <ul className="check-list">
            <li>
              <Code2 size={16} /> Server-side credentials and configurable endpoint/model
            </li>
            <li>
              <ShieldCheck size={16} /> JSON Schema plus Zod validation and exact-quote checks
            </li>
            <li>
              <CheckCircle2 size={16} /> Bounded sources, retries, timeouts, and payload limits
            </li>
          </ul>
        </div>
        <div className="tech-card">
          <span>DEFAULT LIVE PATH</span>
          <dl>
            <div>
              <dt>Inference</dt>
              <dd>Nebius Token Factory</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>
                <code>nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B</code>
              </dd>
            </div>
            <div>
              <dt>Endpoint</dt>
              <dd>
                <code>https://api.tokenfactory.nebius.com/v1/chat/completions</code>
              </dd>
            </div>
            <div>
              <dt>Discovery</dt>
              <dd>Direct URLs + optional Tavily Search</dd>
            </div>
            <div>
              <dt>Persistence</dt>
              <dd>Browser localStorage + user exports</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="about-section" id="evaluation">
        <span className="step-kicker">MEASURED, NOT INVENTED</span>
        <h2>Evaluation evidence</h2>
        <EvaluationPanel />
      </section>

      <section className="about-section limitations-section">
        <span className="step-kicker">LIMITS WORTH KNOWING</span>
        <h2>What ProofPath does not do</h2>
        <div className="limitations-grid">
          <ul>
            <li>No legal eligibility or approval decisions</li>
            <li>No automatic application submission or account syncing</li>
            <li>No PDF/image extraction in this version</li>
            <li>No silent source monitoring or background rechecks</li>
          </ul>
          <ul>
            <li>No guarantee that an official-domain page is current</li>
            <li>No claim that quote matching proves semantic correctness</li>
            <li>No encrypted browser library—avoid shared devices</li>
            <li>No live compliance claim without a successful Nebius call</li>
          </ul>
        </div>
        <Alert tone="warning" title="Protect your information">
          Do not upload identity numbers, financial details, passwords, medical records, or
          confidential notices. Live task and document content is sent to Nebius; Tavily receives
          discovery queries only when configured.
        </Alert>
        <a
          className="repository-link"
          href="https://github.com/timmyspurs12/WeatherPact"
          target="_blank"
          rel="noopener noreferrer"
        >
          Read the source and evaluation methods on GitHub <ExternalLink size={15} />
        </a>
      </section>
    </div>
  );
}
