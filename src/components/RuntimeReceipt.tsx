import type { ReactNode } from 'react';
import { Cpu, Globe, Gauge, Hash, MessageSquare, ShieldCheck, Timer } from 'lucide-react';
import type { RuntimeReceipt } from '../shared/schemas';

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="receipt-row">
      <dt>
        {icon}
        <span>{label}</span>
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Always-visible runtime provenance. The same fields exist in the JSON export;
 * rendering them here keeps the live/sample distinction and provider response
 * identity inspectable without opening a disclosure or an exported file.
 * No credentials or request content are part of the receipt.
 */
export function RuntimeReceipt({ runtime }: { runtime: RuntimeReceipt }) {
  const isLive = runtime.mode === 'live';
  return (
    <section
      className={`runtime-receipt-card runtime-receipt-${runtime.mode}`}
      aria-labelledby="runtime-receipt-heading"
    >
      <div className="runtime-receipt-heading">
        <ShieldCheck size={17} aria-hidden="true" />
        <h2 id="runtime-receipt-heading">Runtime receipt</h2>
        <span className={`runtime-badge runtime-${runtime.mode}`}>
          {isLive ? (
            <>
              <span className="live-dot" /> Live API response
            </>
          ) : (
            'Static sample — no provider response'
          )}
        </span>
      </div>
      <dl>
        <Row icon={<MessageSquare size={14} aria-hidden="true" />} label="Mode">
          {isLive ? 'Live provider inference' : 'Labelled sample, not a live call'}
        </Row>
        <Row icon={<Globe size={14} aria-hidden="true" />} label="Provider">
          {runtime.provider === 'nebius' ? 'Nebius Token Factory' : 'None'}
        </Row>
        {runtime.model && (
          <Row icon={<Cpu size={14} aria-hidden="true" />} label="Model">
            <code>{runtime.model}</code>
          </Row>
        )}
        {runtime.responseId && (
          <Row icon={<Hash size={14} aria-hidden="true" />} label="Provider response ID">
            <code>{runtime.responseId}</code>
          </Row>
        )}
        {runtime.latencyMs !== null && (
          <Row icon={<Timer size={14} aria-hidden="true" />} label="Model latency">
            {(runtime.latencyMs / 1000).toFixed(1)} s
          </Row>
        )}
        {runtime.usage && (
          <Row icon={<Gauge size={14} aria-hidden="true" />} label="Token usage">
            {runtime.usage.inputTokens.toLocaleString()} in ·{' '}
            {runtime.usage.outputTokens.toLocaleString()} out ·{' '}
            {runtime.usage.totalTokens.toLocaleString()} total
          </Row>
        )}
        <Row icon={<ShieldCheck size={14} aria-hidden="true" />} label="Source retrieval">
          {runtime.retrieval.directFetches} direct · {runtime.retrieval.tavilyCalls} Tavily
          {runtime.retrieval.tavilyRequestIds.length > 0 && (
            <>
              {' · '}
              <code>{runtime.retrieval.tavilyRequestIds.join(', ')}</code>
            </>
          )}
        </Row>
      </dl>
    </section>
  );
}
