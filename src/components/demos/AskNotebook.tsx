import { useEffect, useId, useRef, useState } from 'react';
import {
  GROUPS,
  PASSAGES,
  REPLAY_FRAMES,
  SUGGESTIONS,
  keptPassage,
  reply,
  taskById,
  tokenize,
  waitingStatus,
  type Passage,
  type Reply,
  type TaskId,
  type TaskStatus,
} from './notebook';

/**
 * Interactive picture of an Ask Astro-style loop, pointed at this notebook.
 *
 * Astro ships this file because the project page renders
 * <AskNotebook client:load />. Ranking and the DAG frames live in
 * notebook.ts. This file asks "what should be on screen?"
 *
 * `not-prose` opts out of the article typography, which would restyle the
 * buttons inside the write-up.
 *
 * Motion: Run walks the graph from waiting to success on a timer, and the
 * edges dash while a downstream task is running. If the browser prefers
 * reduced motion, Run jumps every task to success and skips the timer.
 * Nothing is downloaded either way. The passages are already in the page.
 */

const FRAME_MS = 1000;

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

/** Wrap matched words so a visitor can see why a passage ranked. */
function Highlight({ text, terms }: { text: string; terms: readonly string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const wanted = new Set(terms.map((term) => term.toLowerCase()));
  const parts = text.split(/([^A-Za-z0-9]+)/);
  return (
    <>
      {parts.map((part, index) => {
        const stem = tokenize(part)[0];
        if (!stem || !wanted.has(stem)) return <span key={index}>{part}</span>;
        return (
          <mark key={index} className="rounded bg-accent-soft px-0.5 text-ink">
            {part}
          </mark>
        );
      })}
    </>
  );
}

function StatusDot({ status, pulse = false }: { status: TaskStatus; pulse?: boolean }) {
  if (status === 'success') {
    return (
      <span className="grid h-4 w-4 place-items-center rounded-full bg-highlight text-paper" aria-hidden="true">
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
          <path d="M2 6.2 4.6 8.8 10 3.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span className="relative grid h-4 w-4 place-items-center" aria-hidden="true">
        {pulse && <span className="absolute h-4 w-4 rounded-full bg-accent opacity-40 motion-safe:animate-ping" />}
        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
      </span>
    );
  }
  return <span className="h-4 w-4 rounded-full border border-line bg-paper" aria-hidden="true" />;
}

function TaskCard({ id, status }: { id: TaskId; status: TaskStatus }) {
  const task = taskById(id);
  const tone =
    status === 'success'
      ? 'border-highlight bg-highlight-soft'
      : status === 'running'
        ? 'border-accent bg-accent-soft'
        : 'border-line bg-paper';
  return (
    <li
      data-task={id}
      data-status={status}
      aria-current={status === 'running' ? 'step' : undefined}
      className={`rounded-2xl border px-3 py-3 ${tone}`}
    >
      <div className="flex items-center gap-2">
        <StatusDot status={status} pulse={status === 'running'} />
        <p className="font-mono text-[11px] tracking-wide text-muted uppercase">{status}</p>
      </div>
      <p className="mt-2 font-mono text-sm text-ink">{task.taskId}</p>
      <p className="text-sm leading-5 text-muted">{task.title}</p>
    </li>
  );
}

/**
 * The join under the three extract tasks. Stretched with
 * preserveAspectRatio="none" so it follows the column width.
 * Hidden on a single column, where a short rule is clearer.
 */
function FanIn({ mode }: { mode: 'idle' | 'flow' | 'done' }) {
  const tone = mode === 'flow' ? 'text-accent' : mode === 'done' ? 'text-highlight' : 'text-line';
  return (
    <svg
      viewBox="0 0 300 28"
      preserveAspectRatio="none"
      className={`hidden h-7 w-full sm:block ${tone}`}
      aria-hidden="true"
    >
      <path
        d="M50 0 V12 H150 V28 M150 0 V28 M250 0 V12 H150"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        vectorEffect="non-scaling-stroke"
        className={mode === 'flow' ? 'dag-flow' : undefined}
      />
    </svg>
  );
}

function Spine({ flowing, done }: { flowing: boolean; done: boolean }) {
  const tone = flowing ? 'bg-accent' : done ? 'bg-highlight' : 'bg-line';
  return (
    <div className="flex justify-center py-1" aria-hidden="true">
      <div className={`h-4 w-px ${tone} ${flowing ? 'motion-safe:animate-pulse' : ''}`} />
    </div>
  );
}

function passageById(passages: readonly Passage[], id: string): Passage | undefined {
  return passages.find((passage) => passage.id === id);
}

export default function AskNotebook() {
  const inputId = useId();
  const reduced = useReducedMotion();
  const logRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState<Reply | null>(null);
  const [kept, setKept] = useState<Passage[]>([]);
  const [feedbackStep, setFeedbackStep] = useState(-1);

  const ready = cursor === REPLAY_FRAMES.length - 1;
  const status = cursor < 0 ? waitingStatus() : REPLAY_FRAMES[cursor].status;
  const lines = cursor < 0 ? [] : REPLAY_FRAMES.slice(0, cursor + 1).flatMap((frame) => frame.lines);
  const running = playing || Object.values(status).some((item) => item === 'running');
  const library = [...PASSAGES, ...kept];

  useEffect(() => {
    if (!playing || reduced) return;
    if (cursor >= REPLAY_FRAMES.length - 1) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setCursor((current) => current + 1), FRAME_MS);
    return () => window.clearTimeout(id);
  }, [playing, cursor, reduced]);

  useEffect(() => {
    if (feedbackStep < 0 || feedbackStep >= 2) return;
    if (reduced) {
      setFeedbackStep(2);
      return;
    }
    const id = window.setTimeout(() => setFeedbackStep((step) => (step < 0 ? step : step + 1)), 700);
    return () => window.clearTimeout(id);
  }, [feedbackStep, reduced]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  function run() {
    if (reduced) {
      setCursor(REPLAY_FRAMES.length - 1);
      setPlaying(false);
      return;
    }
    setCursor(0);
    setPlaying(true);
  }

  function ask(text: string) {
    const next = text.trim();
    if (!ready || next.length === 0) return;
    setQuery(next);
    setAsked(reply(next, library));
  }

  function keep() {
    if (!asked || !asked.confident || asked.quotes.length === 0) return;
    const id = `saved-${kept.length + 1}`;
    if (kept.some((passage) => passage.text.includes(`Saved question: ${asked.query}`))) return;
    setKept((list) => [...list, keptPassage(asked.query, asked.quotes, id)]);
    setFeedbackStep(reduced ? 2 : 0);
  }

  const phaseLabel = ready ? 'Indexed' : running ? 'Running' : 'Waiting';
  const splitFlowing = status.split_chunks === 'running';
  const splitDone = status.split_chunks === 'success';
  const scoreFlowing = status.score_terms === 'running';
  const scoreDone = status.score_terms === 'success';
  const indexFlowing = status.write_index === 'running';
  const indexDone = status.write_index === 'success';

  const cited = asked
    ? asked.quotes
        .map((quote) => passageById(library, quote.passageId))
        .filter((passage): passage is Passage => Boolean(passage))
        .filter((passage, index, list) => list.findIndex((item) => item.id === passage.id) === index)
    : [];

  const alreadyKept = Boolean(asked && kept.some((passage) => passage.text.includes(`Saved question: ${asked.query}`)));

  return (
    <div className="not-prose rounded-2xl border border-line bg-card p-4 text-ink sm:p-6" data-demo="ask-notebook" data-ready={ready ? 'true' : 'false'}>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .dag-flow {
            stroke-dasharray: 5 8;
            animation: notebook-dag-flow 0.8s linear infinite;
          }
          @keyframes notebook-dag-flow {
            to { stroke-dashoffset: -26; }
          }
        }
      `}</style>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-2xl">Ask the notebook</h3>
        <p className={`rounded-full px-3 py-1 text-sm ${ready ? 'bg-highlight-soft text-ink' : running ? 'bg-accent-soft text-ink' : 'border border-line text-muted'}`}>
          {phaseLabel}
        </p>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted">
        DAG <span className="font-mono text-ink">notebook_load</span>. A replay, not a scheduler. No model is called.
        Search is BM25 in this browser. Sentences in an answer are copied from the passages.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="min-h-11 rounded-full bg-ink px-4 text-sm text-paper hover:bg-accent disabled:opacity-60" onClick={run} disabled={playing}>
          {ready ? 'Replay the DAG' : playing ? 'Running' : 'Run the DAG'}
        </button>
        <p className="text-sm text-muted">{PASSAGES.length} passages bundled in the page{kept.length > 0 ? `, ${kept.length} kept in this tab` : ''}.</p>
      </div>
      {reduced && (
        <p className="mt-2 text-sm text-muted">Motion is reduced in this browser, so Run jumps straight to the finished graph.</p>
      )}

      <ul className="mt-4 flex flex-wrap gap-3 text-xs text-muted" aria-hidden="true">
        <li className="flex items-center gap-1.5"><StatusDot status="waiting" /> waiting</li>
        <li className="flex items-center gap-1.5"><StatusDot status="running" /> running</li>
        <li className="flex items-center gap-1.5"><StatusDot status="success" /> success</li>
      </ul>

      <div className="mt-4" aria-label="Tasks in notebook_load">
        {GROUPS.map((group, index) => (
          <div key={group.id}>
            {index === 1 && (
              <>
                <div className="py-1 sm:hidden" aria-hidden="true">
                  <div className={`mx-auto h-4 w-px ${splitFlowing ? 'bg-accent' : splitDone ? 'bg-highlight' : 'bg-line'}`} />
                </div>
                <FanIn mode={splitFlowing ? 'flow' : splitDone ? 'done' : 'idle'} />
              </>
            )}
            {index > 1 && <Spine flowing={index === 2 ? scoreFlowing : indexFlowing} done={index === 2 ? scoreDone : indexDone} />}
            <p className="mb-2 font-mono text-[11px] tracking-wide text-muted uppercase">{group.label}</p>
            <ol className={group.taskIds.length > 1 ? 'grid gap-2 sm:grid-cols-3' : 'grid gap-2 sm:mx-auto sm:max-w-sm'}>
              {group.taskIds.map((id) => (
                <TaskCard key={id} id={id} status={status[id]} />
              ))}
            </ol>
          </div>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {ready ? `Index ready, ${PASSAGES.length} passages.` : running ? 'Pipeline running.' : ''}
      </p>

      <div
        ref={logRef}
        className="mt-4 max-h-40 overflow-auto rounded-2xl border border-line bg-paper p-3 font-mono text-xs leading-5 text-muted"
        aria-label="Replay log"
      >
        {lines.length === 0 ? (
          <p>Run the DAG to fill the log. The lines are the script of the replay, not a live worker.</p>
        ) : (
          <ol className="space-y-1">
            {lines.map((line, index) => (
              <li key={`${line.taskId}-${index}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
                <span className="text-accent">{line.taskId}</span>
                <span className="text-ink">{line.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <form
        className="mt-6 border-t border-line pt-5"
        onSubmit={(event) => {
          event.preventDefault();
          ask(query);
        }}
      >
        <label htmlFor={inputId} className="font-serif text-xl">
          Ask a question
        </label>
        <p id={`${inputId}-hint`} className="mt-1 text-sm leading-6 text-muted">
          {ready
            ? 'The index is the passages above. A question only searches this browser.'
            : 'Run the DAG first. That plays the steps. The passages are already in the page, and Run does not fetch them.'}
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            value={query}
            disabled={!ready}
            aria-describedby={`${inputId}-hint`}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="What is Ask Astro?"
            className="min-h-11 w-full rounded-full border border-line bg-paper px-4 text-sm text-ink placeholder:text-muted disabled:opacity-60"
          />
          <button type="submit" disabled={!ready || query.trim().length === 0} className="min-h-11 shrink-0 rounded-full bg-ink px-4 text-sm text-paper hover:bg-accent disabled:opacity-60">
            Search the index
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={!ready}
              onClick={() => ask(suggestion)}
              className="min-h-11 rounded-full border border-line bg-paper px-3 text-left text-sm text-ink hover:border-accent hover:bg-accent-soft disabled:opacity-60"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </form>

      {asked && (
        <div className="mt-5" data-answer="true" aria-live="polite">
          <h4 className="font-serif text-xl">{asked.confident ? 'Copied from the passages' : 'No sentence to copy'}</h4>
          {asked.confident ? (
            <div className="mt-3 rounded-2xl border border-line bg-paper p-4">
              {asked.quotes.map((quote) => (
                <p key={quote.text} className="mt-2 text-sm leading-6 text-ink first:mt-0">
                  {quote.text}
                </p>
              ))}
              {cited.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {cited.map((passage) => (
                    <li key={passage.id}>
                      <a
                        className="inline-flex min-h-11 items-center rounded-full bg-accent-soft px-3 text-sm text-accent underline decoration-line underline-offset-4"
                        href={passage.href}
                        target={passage.href.startsWith('http') ? '_blank' : undefined}
                        rel={passage.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                      >
                        {passage.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={keep}
                  disabled={alreadyKept}
                  className="min-h-11 rounded-full border border-line bg-card px-4 text-sm text-ink hover:border-accent hover:bg-accent-soft disabled:opacity-60"
                >
                  {alreadyKept ? 'Kept in this tab' : 'Keep this answer'}
                </button>
                <p className="text-sm leading-6 text-muted">
                  Stored here until refresh. Ask Astro would write an approved pair into Weaviate.
                </p>
              </div>
              {feedbackStep >= 0 && (
                <div className="mt-4" data-feedback={feedbackStep >= 2 ? 'done' : 'running'}>
                  <p className="font-mono text-[11px] tracking-wide text-muted uppercase">notebook_feedback</p>
                  <ol className="mt-2 grid gap-2 sm:grid-cols-2">
                    <FeedbackCard
                      taskId="check_pair"
                      title="Person kept the pair"
                      status={feedbackStep >= 1 ? 'success' : 'running'}
                    />
                    <FeedbackCard
                      taskId="write_back"
                      title="Remember it in this tab"
                      status={feedbackStep >= 2 ? 'success' : feedbackStep >= 1 ? 'running' : 'waiting'}
                    />
                  </ol>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-muted">
              Nothing scored high enough to quote. The index only holds this site&apos;s notes and projects, plus a short primer on Ask Astro and Airflow.
              {asked.hits.length > 0 ? ' The closest passages are below, unscored as an answer.' : ' Try one of the suggested questions.'}
            </p>
          )}

          {asked.hits.length > 0 && (
            <div className="mt-4">
              <h4 className="font-serif text-xl">Retrieved</h4>
              <ol className="mt-3 space-y-3">
                {asked.hits.map((hit, index) => {
                  const width = Math.max(8, Math.round((hit.score / asked.hits[0].score) * 100));
                  return (
                    <li key={hit.passage.id} className="rounded-2xl border border-line bg-paper p-4" data-hit={hit.passage.id}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-mono text-xs text-muted">
                          {index + 1}. {hit.passage.source}
                        </p>
                        <p className="font-mono text-xs text-muted">BM25 {hit.score.toFixed(2)}</p>
                      </div>
                      <p className="mt-1 text-sm text-ink">
                        <a
                          className="underline decoration-line underline-offset-4 hover:text-accent"
                          href={hit.passage.href}
                          target={hit.passage.href.startsWith('http') ? '_blank' : undefined}
                          rel={hit.passage.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                        >
                          {hit.passage.title}
                        </a>
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                        <div className="h-full rounded-full bg-accent motion-safe:transition-all" style={{ width: `${width}%` }} />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        <Highlight text={hit.passage.text} terms={hit.matched} />
                      </p>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FeedbackCard({ taskId, title, status }: { taskId: string; title: string; status: TaskStatus }) {
  const tone =
    status === 'success'
      ? 'border-highlight bg-highlight-soft'
      : status === 'running'
        ? 'border-accent bg-accent-soft'
        : 'border-line bg-card';
  return (
    <li data-task={taskId} data-status={status} className={`rounded-2xl border px-3 py-3 ${tone}`}>
      <div className="flex items-center gap-2">
        <StatusDot status={status} pulse={status === 'running'} />
        <p className="font-mono text-sm text-ink">{taskId}</p>
      </div>
      <p className="mt-1 text-sm text-muted">{title}</p>
    </li>
  );
}
