/**
 * Static drawings for the A2A note. No client directive: Astro
 * renders them as SVG in the page. Colors are the site's tokens,
 * so light and dark mode both apply.
 */
import type { ReactNode } from 'react';

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="not-prose my-6">
      <svg viewBox="0 0 720 280" role="img" aria-label={label} className="h-auto w-full">
        {children}
      </svg>
    </figure>
  );
}

export function LayerStack() {
  return (
    <Frame label="Two agents talk over A2A. The clinic agent calls a directory over MCP.">
      <rect x="24" y="36" width="200" height="200" rx="24" fill="var(--card)" stroke="var(--line)" />
      <text x="124" y="78" textAnchor="middle" fill="var(--accent)" fontSize="13" fontFamily="ui-monospace, monospace">
        AGENT
      </text>
      <text x="124" y="112" textAnchor="middle" fill="var(--ink)" fontSize="20" fontFamily="Georgia, serif">
        Plan reader
      </text>
      <text x="124" y="148" textAnchor="middle" fill="var(--muted)" fontSize="14" fontFamily="Georgia, serif">
        another framework
      </text>
      <text x="124" y="188" textAnchor="middle" fill="var(--muted)" fontSize="14" fontFamily="Georgia, serif">
        opaque from here
      </text>

      <path d="M236 110 H300" stroke="var(--ink)" strokeWidth="2" />
      <path d="M292 104 L306 110 L292 116" fill="none" stroke="var(--ink)" strokeWidth="2" />
      <path d="M306 168 H236" stroke="var(--highlight)" strokeWidth="2" />
      <path d="M244 162 L230 168 L244 174" fill="none" stroke="var(--highlight)" strokeWidth="2" />
      <text x="268" y="98" textAnchor="middle" fill="var(--accent)" fontSize="12" fontFamily="ui-monospace, monospace">
        A2A
      </text>
      <text x="268" y="198" textAnchor="middle" fill="var(--highlight)" fontSize="12" fontFamily="ui-monospace, monospace">
        artifact
      </text>

      <rect x="312" y="36" width="220" height="200" rx="24" fill="var(--accent-soft)" stroke="var(--line)" />
      <text x="422" y="78" textAnchor="middle" fill="var(--accent)" fontSize="13" fontFamily="ui-monospace, monospace">
        AGENT
      </text>
      <text x="422" y="112" textAnchor="middle" fill="var(--ink)" fontSize="20" fontFamily="Georgia, serif">
        Clinic finder
      </text>
      <text x="422" y="150" textAnchor="middle" fill="var(--muted)" fontSize="14" fontFamily="Georgia, serif">
        LangGraph inside
      </text>
      <text x="422" y="188" textAnchor="middle" fill="var(--muted)" fontSize="14" fontFamily="Georgia, serif">
        tools stay private
      </text>

      <path d="M544 120 H600" stroke="var(--highlight)" strokeWidth="2" strokeDasharray="4 4" />
      <text x="640" y="78" textAnchor="middle" fill="var(--highlight)" fontSize="12" fontFamily="ui-monospace, monospace">
        MCP
      </text>
      <rect x="588" y="96" width="112" height="120" rx="18" fill="var(--card)" stroke="var(--highlight)" />
      <text x="644" y="132" textAnchor="middle" fill="var(--ink)" fontSize="14" fontFamily="Georgia, serif">
        directory
      </text>
      <text x="644" y="158" textAnchor="middle" fill="var(--muted)" fontSize="13" fontFamily="Georgia, serif">
        find_clinics
      </text>
      <text x="644" y="182" textAnchor="middle" fill="var(--muted)" fontSize="13" fontFamily="Georgia, serif">
        a JSON file
      </text>
    </Frame>
  );
}

export function CardSketch() {
  return (
    <Frame label="A client fetches the Agent Card, then sends SendMessage to the URL on the card.">
      <rect x="28" y="48" width="180" height="170" rx="24" fill="var(--card)" stroke="var(--line)" />
      <text x="118" y="100" textAnchor="middle" fill="var(--accent)" fontSize="13" fontFamily="ui-monospace, monospace">
        CLIENT
      </text>
      <text x="118" y="136" textAnchor="middle" fill="var(--ink)" fontSize="18" fontFamily="Georgia, serif">
        reads the card
      </text>
      <text x="118" y="168" textAnchor="middle" fill="var(--muted)" fontSize="14" fontFamily="Georgia, serif">
        then sends
      </text>

      <path d="M220 100 H300" stroke="var(--ink)" strokeWidth="2" />
      <text x="260" y="88" textAnchor="middle" fill="var(--muted)" fontSize="12" fontFamily="ui-monospace, monospace">
        GET
      </text>
      <path d="M300 160 H220" stroke="var(--highlight)" strokeWidth="2" />
      <text x="260" y="184" textAnchor="middle" fill="var(--highlight)" fontSize="12" fontFamily="ui-monospace, monospace">
        JSON
      </text>

      <rect x="312" y="28" width="380" height="224" rx="24" fill="var(--accent-soft)" stroke="var(--line)" />
      <text x="340" y="68" fill="var(--accent)" fontSize="13" fontFamily="ui-monospace, monospace">
        /.well-known/agent-card.json
      </text>
      <text x="340" y="108" fill="var(--ink)" fontSize="16" fontFamily="ui-monospace, monospace">
        name, description, skills
      </text>
      <text x="340" y="142" fill="var(--ink)" fontSize="16" fontFamily="ui-monospace, monospace">
        supportedInterfaces[0]
      </text>
      <text x="340" y="176" fill="var(--muted)" fontSize="15" fontFamily="ui-monospace, monospace">
        JSONRPC · url · protocolVersion 1.0
      </text>
      <text x="340" y="214" fill="var(--muted)" fontSize="15" fontFamily="ui-monospace, monospace">
        capabilities.streaming true or false
      </text>
    </Frame>
  );
}

export function TaskLife() {
  return (
    <Frame label="A task moves from submitted to working, then to completed, or pauses, or stops on an error.">
      <g fontFamily="ui-monospace, monospace" fontSize="13">
        <rect x="24" y="96" width="150" height="56" rx="16" fill="var(--card)" stroke="var(--line)" />
        <text x="99" y="128" textAnchor="middle" fill="var(--ink)">
          SUBMITTED
        </text>
        <path d="M182 124 H214" stroke="var(--ink)" strokeWidth="2" />
        <rect x="222" y="96" width="140" height="56" rx="16" fill="var(--ink)" />
        <text x="292" y="128" textAnchor="middle" fill="var(--paper)">
          WORKING
        </text>
        <path d="M370 124 H402" stroke="var(--highlight)" strokeWidth="2" />
        <rect x="410" y="96" width="160" height="56" rx="16" fill="var(--highlight-soft)" stroke="var(--highlight)" />
        <text x="490" y="128" textAnchor="middle" fill="var(--ink)">
          COMPLETED
        </text>
      </g>
      <text x="292" y="64" textAnchor="middle" fill="var(--muted)" fontSize="14" fontFamily="Georgia, serif">
        input-required or auth-required pauses the task
      </text>
      <path d="M292 78 V96" stroke="var(--line)" strokeWidth="2" />
      <text x="490" y="196" textAnchor="middle" fill="var(--muted)" fontSize="14" fontFamily="Georgia, serif">
        failed, canceled, and rejected are finished
      </text>
      <path d="M490 176 V152" stroke="var(--line)" strokeWidth="2" />
      <text x="36" y="236" fill="var(--muted)" fontSize="14" fontFamily="Georgia, serif">
        The reply worth keeping is an artifact on the completed task.
      </text>
    </Frame>
  );
}
