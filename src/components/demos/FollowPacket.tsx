import { useEffect, useId, useRef, useState } from 'react';
import {
  DEFAULT_DESCRIPTION,
  PLAN_DESCRIPTION,
  PRESETS,
  STATIONS,
  STUDY_DESCRIPTION,
  buildHops,
  routeQuestion,
  type Hop,
} from './packet';

/**
 * Animated walk through one A2A task that calls an MCP tool.
 *
 * The directory and the "model" are the functions in packet.ts.
 * This file only decides what is on screen. `not-prose` keeps the
 * article typography from restyling the buttons.
 */

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  return reduced;
}

function choiceClass(on: boolean): string {
  return `min-h-11 rounded-full px-3 py-2 text-left text-sm ${
    on ? 'bg-ink text-paper' : 'border border-line bg-paper text-ink'
  }`;
}

export default function FollowPacket() {
  const titleId = useId();
  const jsonId = useId();
  const reduced = useReducedMotion();
  const [question, setQuestion] = useState<string>(PRESETS[0]);
  const [draft, setDraft] = useState('');
  const [description, setDescription] = useState(DEFAULT_DESCRIPTION);
  const [streaming, setStreaming] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const posRef = useRef(1);
  const [pos, setPos] = useState(1);
  const regionRef = useRef<HTMLDivElement>(null);
  const hopCount = useRef(0);
  const armed = useRef(false);

  const hops = buildHops(question, description, streaming);
  hopCount.current = hops.length;
  const hop: Hop = hops[Math.min(index, hops.length - 1)];
  const route = routeQuestion(question, description);
  const finished = index >= hops.length - 1;

  useEffect(() => {
    if (reduced && playing) setPlaying(false);
  }, [reduced, playing]);

  useEffect(() => {
    if (!playing || reduced) return;
    if (finished) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setIndex((current) => Math.min(current + 1, hops.length - 1)), 1100);
    return () => window.clearTimeout(timer);
  }, [playing, reduced, finished, index, hops.length]);

  useEffect(() => {
    const target = hop.station;
    const from = posRef.current;
    if (reduced || from === target) {
      posRef.current = target;
      setPos(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 480);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const next = from + (target - from) * eased;
      posRef.current = next;
      setPos(next);
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [hop.station, reduced]);

  function ask(next: string) {
    const trimmed = next.trim();
    if (!trimmed) return;
    setQuestion(trimmed);
    setIndex(0);
    setPlaying(false);
  }

  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;

    const arm = (event: PointerEvent) => {
      const node = event.target;
      armed.current = node instanceof Node && region.contains(node);
    };

    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        active.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }
      const inside = active instanceof Node && region.contains(active);
      if (!inside && !armed.current) return;
      event.preventDefault();
      setPlaying(false);
      setIndex((current) =>
        event.key === 'ArrowRight'
          ? Math.min(current + 1, hopCount.current - 1)
          : Math.max(current - 1, 0),
      );
    };

    document.addEventListener('pointerdown', arm, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', arm, true);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const packetX = 56 + pos * 132;

  return (
    <div
      ref={regionRef}
      tabIndex={0}
      role="region"
      aria-labelledby={titleId}
      aria-keyshortcuts="ArrowLeft ArrowRight"
      className="not-prose rounded-2xl border border-line bg-card p-4 text-ink outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:p-6"
      data-hop={hop.id}
      data-streaming={streaming ? 'on' : 'off'}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={titleId} className="font-serif text-2xl">
          Follow the packet
        </h3>
        <p className="rounded-full bg-accent-soft px-3 py-1 text-sm">Simulation</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted">
        A scripted directory of fictional clinics. No language model and no network. Click the demo, then use the
        left and right arrow keys to change hops. Typing in a field keeps the arrows for the text.
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Example questions">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={choiceClass(preset === question && draft.trim() === '')}
            aria-pressed={preset === question}
            onClick={() => {
              setDraft('');
              ask(preset);
            }}
          >
            {preset}
          </button>
        ))}
      </div>

      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          ask(draft);
        }}
      >
        <label className="sr-only" htmlFor={`${titleId}-q`}>
          Your question
        </label>
        <input
          id={`${titleId}-q`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Or type a question"
          className="min-h-11 flex-1 rounded-full border border-line bg-paper px-4 text-sm text-ink"
        />
        <button type="submit" className="btn btn-solid min-h-11">
          Ask
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-solid min-h-11"
          onClick={() => {
            if (reduced) return;
            if (finished) setIndex(0);
            setPlaying((on) => !on);
          }}
          aria-pressed={playing}
          disabled={reduced}
        >
          {playing ? 'Pause' : finished ? 'Replay' : 'Play'}
        </button>
        <button
          type="button"
          className="btn btn-line min-h-11"
          onClick={() => {
            setPlaying(false);
            setIndex((current) => Math.max(current - 1, 0));
          }}
        >
          Back
        </button>
        <button
          type="button"
          className="btn btn-line min-h-11"
          onClick={() => {
            setPlaying(false);
            setIndex((current) => Math.min(current + 1, hops.length - 1));
          }}
        >
          Step
        </button>
        <button
          type="button"
          className="btn btn-line min-h-11"
          onClick={() => {
            setPlaying(false);
            setIndex(0);
          }}
        >
          Reset
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={streaming}
          className="min-h-11 rounded-full border border-line bg-paper px-3 text-sm"
          onClick={() => {
            setStreaming((on) => !on);
            setPlaying(false);
          }}
        >
          Streaming {streaming ? 'on' : 'off'}
        </button>
      </div>
      {reduced ? (
        <p className="mt-2 text-sm text-muted">Reduced motion is on, so Play stays off and each step appears at once.</p>
      ) : null}

      <svg viewBox="0 0 640 96" className="mt-4 h-auto w-full" role="img" aria-label={`Packet at ${STATIONS[hop.station].label}`}>
        <line x1="56" y1="36" x2="584" y2="36" stroke="var(--line)" strokeWidth="2" />
        {STATIONS.map((station, stationIndex) => {
          const x = 56 + stationIndex * 132;
          const on = stationIndex === hop.station;
          return (
            <g key={station.id}>
              <circle cx={x} cy="36" r={on ? 16 : 12} fill={on ? 'var(--ink)' : 'var(--card)'} stroke="var(--ink)" strokeWidth="1.5" />
              <text x={x} y="72" textAnchor="middle" fill="var(--muted)" fontSize="12" fontFamily="ui-monospace, monospace">
                {station.label}
              </text>
            </g>
          );
        })}
        <g transform={`translate(${packetX} 36)`}>
          <rect x="-18" y="-10" width="36" height="20" rx="6" fill="var(--accent)" />
          <text textAnchor="middle" y="4" fill="var(--paper)" fontSize="10" fontFamily="ui-monospace, monospace">
            msg
          </text>
        </g>
      </svg>

      <ol className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Hops">
        {hops.map((item, hopIndex) => {
          const on = hopIndex === index;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`min-h-11 w-full rounded-xl px-2 py-2 text-left text-xs ${
                  on ? 'bg-ink text-paper' : 'border border-line text-ink'
                }`}
                aria-current={on ? 'step' : undefined}
                onClick={() => {
                  setPlaying(false);
                  setIndex(hopIndex);
                }}
              >
                <span className="font-mono">{hopIndex + 1}</span> {item.title}
              </button>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-base leading-7" aria-live="polite">
        {hop.plain}
      </p>

      <div className="mt-4">
        <h4 id={jsonId} className="font-mono text-xs tracking-wide text-muted uppercase">
          On this hop
        </h4>
        <pre
          aria-labelledby={jsonId}
          className="mt-2 max-h-80 overflow-auto rounded-xl border border-line bg-paper p-3 text-xs leading-5 whitespace-pre-wrap"
        >
          {`${hop.preface}\n\n${JSON.stringify(hop.body, null, 2)}`}
        </pre>
      </div>

      <div className="mt-6 border-t border-line pt-4">
        <h4 className="font-serif text-xl">Would an orchestrator pick this agent?</h4>
        <p className="mt-2 text-sm leading-6 text-muted">
          Three cards, one editable. The score is a count of overlapping words, not a model. Change the clinic
          finder&apos;s description and ask again.
        </p>
        <label className="mt-3 block text-sm" htmlFor={`${titleId}-card`}>
          Clinic finder description
          <textarea
            id={`${titleId}-card`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded-2xl border border-line bg-paper p-3 text-sm leading-6 text-ink"
          />
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn btn-line min-h-11 text-sm" onClick={() => setDescription(DEFAULT_DESCRIPTION)}>
            Restore the clinic description
          </button>
          <button
            type="button"
            className="btn btn-line min-h-11 text-sm"
            onClick={() => setDescription('A helpful assistant.')}
          >
            Make it vague
          </button>
        </div>
        <ul className="mt-3 space-y-2" aria-label="Routing scores">
          {route.scores.map((item) => {
            const winner = item.id === route.winnerId;
            const blurb =
              item.id === 'finder' ? description : item.id === 'plan' ? PLAN_DESCRIPTION : STUDY_DESCRIPTION;
            return (
              <li
                key={item.id}
                className={`rounded-2xl border px-3 py-2 ${winner ? 'border-ink bg-highlight-soft' : 'border-line'}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">
                    {item.name}
                    {winner ? <span className="ml-2 font-mono text-xs uppercase">Routed here</span> : null}
                  </p>
                  <p className="font-mono text-sm">{item.score}</p>
                </div>
                <p className="mt-1 text-sm leading-6 text-muted">{blurb}</p>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-sm leading-6">{route.reason}</p>
      </div>
    </div>
  );
}
