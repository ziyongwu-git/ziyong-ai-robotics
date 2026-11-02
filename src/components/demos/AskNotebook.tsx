import { useEffect, useId, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  SUGGESTIONS,
  TASK_CATALOG,
  catalogEntry,
  createTask,
  defaultPipeline,
  describeSettings,
  moveTask,
  notesPipeline,
  reply,
  runPipeline,
  tinyPipeline,
  tokenize,
  validatePipeline,
  type Hit,
  type PipelineTask,
  type RankMethod,
  type Reply,
  type RunResult,
  type SourceKind,
  type TagFilter,
  type TaskKind,
  type TaskOutput,
} from './notebook';

/**
 * Pipeline builder for the Ask the notebook project.
 *
 * The ranking lives in notebook.ts. This file is the canvas: a palette,
 * a list you can reorder, settings, and the answer from the last run.
 *
 * Drag and drop uses dnd-kit, which is only imported here, so other pages
 * do not download it. Add, Up, and Down do the same job without a pointer,
 * including on a phone and from the keyboard.
 *
 * `not-prose` opts out of the article typography, which would restyle the
 * buttons. If the browser prefers reduced motion, Run skips the timer and
 * shows every result at once.
 */

type FinishedRun = Extract<RunResult, { ok: true }> & { number: number };

type NodeStatus = 'idle' | 'running' | 'success';

const FRAME_MS = 700;

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

function formatMs(ms: number): string {
  if (ms < 1) return '<1 ms';
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  return `${Math.round(ms)} ms`;
}

function signatureOf(tasks: readonly PipelineTask[]): string {
  return JSON.stringify(tasks);
}

const collide: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const card = hits.find((hit) => hit.id !== 'canvas' && !String(hit.id).startsWith('palette:'));
  if (card) return [card];
  if (hits.length > 0) return hits;
  return closestCenter(args);
};

function Highlight({ text, terms }: { text: string; terms: readonly string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const wanted = new Set(terms);
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

function StatusDot({ status }: { status: NodeStatus }) {
  if (status === 'success') {
    return (
      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-highlight text-paper" aria-hidden="true">
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
          <path d="M2 6.2 4.6 8.8 10 3.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span className="relative grid h-4 w-4 shrink-0 place-items-center" aria-hidden="true">
        <span className="absolute h-4 w-4 rounded-full bg-accent opacity-40 motion-safe:animate-ping" />
        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
      </span>
    );
  }
  return <span className="h-4 w-4 shrink-0 rounded-full border border-line bg-paper" aria-hidden="true" />;
}

function GripIcon() {
  return (
    <svg viewBox="0 0 12 16" className="h-4 w-3" aria-hidden="true">
      <path d="M2 2h2v2H2zm6 0h2v2H8zM2 7h2v2H2zm6 0h2v2H8zM2 12h2v2H2zm6 0h2v2H8z" fill="currentColor" />
    </svg>
  );
}

export default function AskNotebook() {
  const inputId = useId();
  const reduced = useReducedMotion();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [tasks, setTasks] = useState<PipelineTask[]>(() => defaultPipeline());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  const [finished, setFinished] = useState<FinishedRun | null>(null);
  const [ranSignature, setRanSignature] = useState<string | null>(null);
  const [reveal, setReveal] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [history, setHistory] = useState<FinishedRun[]>([]);
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState<Reply | null>(null);

  const signature = signatureOf(tasks);
  const problem = validatePipeline(tasks);
  const stale = Boolean(finished && ranSignature !== signature);
  const revealed = Boolean(finished && !stale && reveal >= finished.outputs.length);
  const ready = Boolean(finished && revealed);

  useEffect(() => {
    if (!playing || !finished) return;
    if (reduced || reveal >= finished.outputs.length) {
      setReveal(finished.outputs.length);
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setReveal((count) => count + 1), FRAME_MS);
    return () => window.clearTimeout(id);
  }, [playing, reveal, reduced, finished]);

  function statusFor(index: number): NodeStatus {
    if (!finished || stale) return 'idle';
    if (index < reveal) return 'success';
    if (playing && index === reveal) return 'running';
    return 'idle';
  }

  function outputFor(task: PipelineTask): TaskOutput | undefined {
    if (!finished || stale) return undefined;
    const output = finished.outputs.find((item) => item.id === task.id);
    if (!output) return undefined;
    const index = tasks.findIndex((item) => item.id === task.id);
    return statusFor(index) === 'success' ? output : undefined;
  }

  function applyPipeline(next: PipelineTask[]) {
    setTasks(next);
    setSelectedId(next.find((task) => task.kind === 'chunk')?.id ?? next[0]?.id ?? null);
  }

  function run() {
    const result = runPipeline(tasks);
    if (!result.ok) return;
    const stored: FinishedRun = { ...result, number: (history[0]?.number ?? 0) + 1 };
    setFinished(stored);
    setRanSignature(signature);
    setAsked(null);
    setHistory((items) => [stored, ...items].slice(0, 4));
    if (reduced) {
      setReveal(stored.outputs.length);
      setPlaying(false);
      return;
    }
    setReveal(0);
    setPlaying(true);
  }

  function ask(text: string) {
    const next = text.trim();
    if (!finished || !ready || next.length === 0) return;
    setQuery(next);
    setAsked(reply(next, finished.passages, finished.scoring));
  }

  function onDragStart(event: DragStartEvent) {
    setActiveDrag(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    if (activeId.startsWith('palette:')) {
      const kind = activeId.slice('palette:'.length) as TaskKind;
      if (tasks.some((task) => task.kind === kind)) return;
      const task = createTask(kind);
      const overId = String(over.id);
      setTasks((list) => {
        if (overId === 'canvas') return [...list, task];
        const index = list.findIndex((item) => item.id === overId);
        const next = [...list];
        next.splice(index === -1 ? next.length : index, 0, task);
        return next;
      });
      setSelectedId(task.id);
      return;
    }
    if (active.id === over.id || over.id === 'canvas') return;
    setTasks((list) => {
      const from = list.findIndex((item) => item.id === active.id);
      const to = list.findIndex((item) => item.id === over.id);
      if (from < 0 || to < 0) return list;
      return arrayMove(list, from, to);
    });
  }

  function patch(id: string, next: PipelineTask) {
    setTasks((list) => list.map((task) => (task.id === id ? next : task)));
  }

  const selected = tasks.find((task) => task.id === selectedId) ?? null;
  const selectedOutput = selected ? outputFor(selected) : undefined;
  const dragLabel = activeDrag
    ? activeDrag.startsWith('palette:')
      ? catalogEntry(activeDrag.slice('palette:'.length) as TaskKind).title
      : catalogEntry((tasks.find((task) => task.id === activeDrag)?.kind ?? 'extract') as TaskKind).title
    : '';

  return (
    <div className="not-prose rounded-2xl border border-line bg-card p-4 text-ink sm:p-6" data-demo="ask-notebook" data-ready={ready ? 'true' : 'false'}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-2xl">Ask the notebook</h3>
        <p className={`rounded-full px-3 py-1 text-sm ${ready ? 'bg-highlight-soft text-ink' : playing ? 'bg-accent-soft text-ink' : 'border border-line text-muted'}`}>
          {ready ? 'Indexed' : playing ? 'Running' : 'Editing'}
        </p>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted">
        Build the DAG, then run it in this browser. No model is called. Sentences in an answer are copied from the chunks that run produced. The task times are real. The lighting-up is just the playback.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="min-h-11 rounded-full border border-line bg-paper px-3 text-sm hover:border-accent" onClick={() => applyPipeline(defaultPipeline())}>
          Reset to default
        </button>
        <button type="button" className="min-h-11 rounded-full border border-line bg-paper px-3 text-sm hover:border-accent" onClick={() => applyPipeline(notesPipeline())}>
          Notes only
        </button>
        <button type="button" className="min-h-11 rounded-full border border-line bg-paper px-3 text-sm hover:border-accent" onClick={() => applyPipeline(tinyPipeline())}>
          Tiny chunks
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={collide} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveDrag(null)}>
        <p className="mt-5 font-mono text-[11px] tracking-wide text-muted uppercase">Palette</p>
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TASK_CATALOG.map((item) => (
            <PaletteCard
              key={item.kind}
              kind={item.kind}
              used={tasks.some((task) => task.kind === item.kind)}
              onAdd={() => {
                if (tasks.some((task) => task.kind === item.kind)) return;
                const task = createTask(item.kind);
                setTasks((list) => [...list, task]);
                setSelectedId(task.id);
              }}
            />
          ))}
        </ul>
        <p className="mt-2 text-xs leading-5 text-muted">
          Drag a handle onto the canvas, or press Add. Focus a handle and press space, then the arrow keys, to move a task without a pointer.
        </p>

        <p className="mt-4 font-mono text-[11px] tracking-wide text-muted uppercase">Canvas · notebook_load</p>
        <Canvas>
          {tasks.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted">Drop a task here, or press Add on the palette.</p>
          ) : (
            <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
              <ol className="space-y-0" aria-label="Pipeline tasks">
                {tasks.map((task, index) => (
                  <li key={task.id}>
                    {index > 0 && <Edge state={statusFor(index) === 'running' ? 'running' : statusFor(index) === 'success' ? 'done' : 'idle'} />}
                    <TaskRow
                      task={task}
                      status={statusFor(index)}
                      summary={outputFor(task)?.summary}
                      selected={task.id === selectedId}
                      first={index === 0}
                      last={index === tasks.length - 1}
                      onSelect={() => setSelectedId((current) => (current === task.id ? null : task.id))}
                      onMove={(direction) => setTasks((list) => moveTask(list, task.id, direction))}
                      onRemove={() => {
                        setTasks((list) => list.filter((item) => item.id !== task.id));
                        if (selectedId === task.id) setSelectedId(null);
                      }}
                    />
                  </li>
                ))}
              </ol>
            </SortableContext>
          )}
        </Canvas>
        <DragOverlay>
          {dragLabel ? <div className="rounded-full bg-ink px-3 py-2 text-sm text-paper shadow">{dragLabel}</div> : null}
        </DragOverlay>
      </DndContext>

      {problem ? (
        <p className="mt-3 rounded-2xl bg-accent-soft px-3 py-3 text-sm leading-6 text-ink" role="alert">
          This pipeline will not run. {problem}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">The order is valid. Extract comes before the steps that read text, and the index is last.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="min-h-11 rounded-full bg-ink px-4 text-sm text-paper hover:bg-accent disabled:opacity-60" onClick={run} disabled={Boolean(problem) || playing}>
          {playing ? 'Running' : finished ? 'Run again' : 'Run the pipeline'}
        </button>
        {reduced && <p className="text-sm text-muted">Motion is reduced, so Run shows every result at once.</p>}
      </div>
      <p className="sr-only" aria-live="polite">
        {problem ? problem : ready ? 'Pipeline finished. The index is ready.' : playing ? 'Pipeline running.' : ''}
      </p>

      {selected && (
        <TaskPanel task={selected} output={selectedOutput} stale={stale} onChange={(next) => patch(selected.id, next)} />
      )}

      {finished && revealed && !stale && (
        <section className="mt-4 rounded-2xl border border-highlight bg-highlight-soft p-4" data-summary="run">
          <h4 className="font-serif text-xl">Run {finished.number}</h4>
          <p className="mt-1 text-sm leading-6 text-ink">
            Finished in {formatMs(finished.totalMs)}. {finished.label}. {finished.passages.length} passages in the index, {finished.termCount} terms.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {finished.outputs.map((output) => (
              <li key={output.id}>
                <span className="font-mono text-xs text-muted">{output.kind}</span> {output.summary}
                <span className="text-muted"> · {formatMs(output.durationMs)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stale && finished && (
        <p className="mt-3 text-sm leading-6 text-muted" role="status">
          The canvas changed after run {finished.number}. Answers below still use that index until you run again.
        </p>
      )}

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
            ? 'Search uses the index from the last finished run. A different chunk size or ranker changes the scores.'
            : 'Run a valid pipeline first. The question box waits so it cannot search an index you have not built.'}
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
              className="min-h-11 rounded-full border border-line bg-paper px-3 text-left text-sm hover:border-accent hover:bg-accent-soft disabled:opacity-60"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </form>

      {asked && <Answer answer={asked} />}
      {asked && history.length >= 2 && <Compare query={asked.query} history={history} />}
    </div>
  );
}

function Canvas({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas' });
  return (
    <div ref={setNodeRef} className={`mt-2 rounded-2xl border border-dashed p-2 sm:p-3 ${isOver ? 'border-accent bg-accent-soft/60' : 'border-line'}`}>
      {children}
    </div>
  );
}

function Edge({ state }: { state: 'idle' | 'running' | 'done' }) {
  const tone = state === 'running' ? 'bg-accent motion-safe:animate-pulse' : state === 'done' ? 'bg-highlight' : 'bg-line';
  return (
    <div className="flex justify-center py-0.5" aria-hidden="true">
      <div className={`h-3 w-px ${tone}`} />
    </div>
  );
}

function PaletteCard({ kind, used, onAdd }: { kind: TaskKind; used: boolean; onAdd: () => void }) {
  const entry = catalogEntry(kind);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: `palette:${kind}`,
    disabled: used,
    data: { kind },
  });
  return (
    <li ref={setNodeRef} className={`rounded-2xl border border-line bg-paper p-2 ${isDragging ? 'opacity-50' : ''} ${used ? 'opacity-60' : ''}`}>
      <div
        ref={setActivatorNodeRef}
        className="flex cursor-grab items-center gap-2 active:cursor-grabbing"
        aria-label={`Drag ${entry.title} onto the pipeline`}
        data-drag-handle="palette"
        style={{ touchAction: 'none' }}
        {...listeners}
        {...attributes}
      >
        <span className="grid h-11 w-8 shrink-0 place-items-center rounded-lg text-muted">
          <GripIcon />
        </span>
        <span className="min-w-0">
          <span className="block font-mono text-xs text-ink">{entry.taskId}</span>
          <span className="block truncate text-xs text-muted">{entry.blurb}</span>
        </span>
      </div>
      <button type="button" className="mt-2 min-h-10 w-full rounded-full border border-line text-sm hover:border-accent disabled:opacity-50" onClick={onAdd} disabled={used}>
        {used ? 'On the canvas' : 'Add'}
      </button>
    </li>
  );
}

function TaskRow({
  task,
  status,
  summary,
  selected,
  first,
  last,
  onSelect,
  onMove,
  onRemove,
}: {
  task: PipelineTask;
  status: NodeStatus;
  summary?: string;
  selected: boolean;
  first: boolean;
  last: boolean;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const entry = catalogEntry(task.kind);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const tone =
    status === 'success' ? 'border-highlight bg-highlight-soft' : status === 'running' ? 'border-accent bg-accent-soft' : 'border-line bg-paper';
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-2xl border px-3 py-3 ${tone} ${isDragging ? 'z-10 opacity-80 shadow' : ''}`}
      data-task={task.kind}
      data-status={status}
      data-summary={summary ?? ''}
    >
      <div className="flex items-start gap-2">
        <div
          ref={setActivatorNodeRef}
          className="flex min-w-0 flex-1 cursor-grab items-start gap-2 active:cursor-grabbing"
          aria-label={`Drag to reorder ${entry.title}`}
          data-drag-handle="task"
          style={{ touchAction: 'none' }}
          {...listeners}
          {...attributes}
        >
          <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted">
            <GripIcon />
          </span>
          <span className="min-w-0 pt-1">
            <span className="flex items-center gap-2">
              <StatusDot status={status} />
              <span className="font-mono text-[11px] tracking-wide text-muted uppercase">{status === 'idle' ? 'waiting' : status}</span>
            </span>
            <span className="mt-1 block font-mono text-sm text-ink">{entry.taskId}</span>
            <span className="block text-sm text-muted">{summary ?? describeSettings(task)}</span>
          </span>
        </div>
        <button type="button" className="min-h-11 shrink-0 rounded-full border border-line bg-card px-3 text-sm" onClick={onSelect} aria-expanded={selected} onPointerDown={(event) => event.stopPropagation()}>
          {selected ? 'Close' : 'Edit'}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="min-h-10 rounded-full border border-line bg-card px-3 text-sm disabled:opacity-40" onClick={() => onMove(-1)} disabled={first} aria-label={`Move ${entry.title} up`}>
          Up
        </button>
        <button type="button" className="min-h-10 rounded-full border border-line bg-card px-3 text-sm disabled:opacity-40" onClick={() => onMove(1)} disabled={last} aria-label={`Move ${entry.title} down`}>
          Down
        </button>
        <button type="button" className="min-h-10 rounded-full border border-line bg-card px-3 text-sm" onClick={onRemove} aria-label={`Remove ${entry.title}`}>
          Remove
        </button>
      </div>
    </div>
  );
}

function TaskPanel({
  task,
  output,
  stale,
  onChange,
}: {
  task: PipelineTask;
  output?: TaskOutput;
  stale: boolean;
  onChange: (next: PipelineTask) => void;
}) {
  const entry = catalogEntry(task.kind);
  return (
    <section className="mt-4 rounded-2xl border border-line bg-paper p-4" aria-label={`${entry.title} settings`}>
      <h4 className="font-serif text-xl">{entry.title}</h4>
      <p className="mt-1 text-sm text-muted">{entry.blurb}. Changes apply to the next run.</p>
      <div className="mt-3">
        <SettingsForm task={task} onChange={onChange} />
      </div>
      <div className="mt-4 border-t border-line pt-3">
        <h5 className="font-mono text-[11px] tracking-wide text-muted uppercase">Output</h5>
        {output ? (
          <div data-output={task.kind}>
            <p className="mt-2 text-sm text-ink">
              {output.summary} <span className="text-muted">· {formatMs(output.durationMs)}</span>
            </p>
            {output.rows.length === 0 ? (
              <p className="mt-2 text-sm text-muted">This step kept no rows.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {output.rows.map((row, index) => (
                  <li key={`${row.title}-${index}`} className="rounded-xl border border-line bg-card px-3 py-2 text-sm">
                    <span className="font-mono text-xs text-accent">{row.title}</span>
                    <span className="mt-1 block leading-6 text-muted">{row.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-muted">
            {stale ? 'The last run no longer matches this canvas.' : 'Run the pipeline to see what this task produced. The rows are samples from that run, not a script.'}
          </p>
        )}
      </div>
    </section>
  );
}

function SettingsForm({ task, onChange }: { task: PipelineTask; onChange: (next: PipelineTask) => void }) {
  if (task.kind === 'extract' || task.kind === 'filter') {
    const kinds: SourceKind[] = ['notes', 'projects', 'primer'];
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm text-muted">Sources</legend>
        {kinds.map((kind) => (
          <label key={kind} className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={task.settings[kind]}
              onChange={(event) => onChange({ ...task, settings: { ...task.settings, [kind]: event.target.checked } })}
            />
            {kind === 'notes' ? 'Site notes' : kind === 'projects' ? 'Projects' : 'Ask Astro primer'}
          </label>
        ))}
        {task.kind === 'filter' && (
          <label className="mt-2 block text-sm">
            Tag
            <select
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-ink"
              value={task.settings.tag}
              onChange={(event) => onChange({ ...task, settings: { ...task.settings, tag: event.target.value as TagFilter } })}
            >
              <option value="any">Any tag</option>
              <option value="ai">ai</option>
              <option value="data">data</option>
              <option value="robotics">robotics</option>
            </select>
          </label>
        )}
      </fieldset>
    );
  }

  if (task.kind === 'clean') {
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm text-muted">What counts as a duplicate</legend>
        {(
          [
            ['exact', 'Exact text'],
            ['similar', 'Near-duplicate vocabulary'],
          ] as const
        ).map(([mode, label]) => (
          <label key={mode} className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="radio"
              name="clean-mode"
              checked={task.settings.mode === mode}
              onChange={() => onChange({ ...task, settings: { mode } })}
            />
            {label}
          </label>
        ))}
      </fieldset>
    );
  }

  if (task.kind === 'chunk') {
    return (
      <div className="space-y-3">
        <label className="block text-sm">
          Chunk size, {task.settings.size} characters
          <input
            type="range"
            min={100}
            max={800}
            step={20}
            value={task.settings.size}
            onChange={(event) => onChange({ ...task, settings: { ...task.settings, size: Number(event.target.value) } })}
          />
        </label>
        <label className="block text-sm">
          Overlap, {task.settings.overlap} characters
          <input
            type="range"
            min={0}
            max={200}
            step={10}
            value={task.settings.overlap}
            onChange={(event) => onChange({ ...task, settings: { ...task.settings, overlap: Number(event.target.value) } })}
          />
        </label>
      </div>
    );
  }

  if (task.kind === 'score') {
    return (
      <div className="space-y-3">
        <fieldset className="space-y-2">
          <legend className="text-sm text-muted">Ranker</legend>
          {(
            [
              ['bm25', 'BM25, with a penalty for long chunks'],
              ['keyword', 'Keyword count, no length penalty'],
            ] as const
          ).map(([method, label]) => (
            <label key={method} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="radio"
                name="score-method"
                checked={task.settings.method === method}
                onChange={() => onChange({ ...task, settings: { ...task.settings, method: method as RankMethod } })}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <label className="block text-sm">
          Keep the top {task.settings.topK}
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={task.settings.topK}
            onChange={(event) => onChange({ ...task, settings: { ...task.settings, topK: Number(event.target.value) } })}
          />
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent"
            checked={task.settings.useTitle}
            onChange={(event) => onChange({ ...task, settings: { ...task.settings, useTitle: event.target.checked } })}
          />
          Count words in the title
        </label>
      </div>
    );
  }

  return (
    <p className="text-sm leading-6 text-muted">
      The index freezes whatever the earlier tasks left. Ask Astro would upsert vectors into Weaviate. This page keeps the passages in memory for the question box.
    </p>
  );
}

function Answer({ answer }: { answer: Reply }) {
  const cited = answer.quotes
    .map((quote) => answer.hits.find((hit) => hit.passage.id === quote.passageId)?.passage)
    .filter((passage): passage is Hit['passage'] => Boolean(passage))
    .filter((passage, index, list) => list.findIndex((item) => item.id === passage.id) === index);

  return (
    <div className="mt-5" data-answer="true" aria-live="polite">
      <h4 className="font-serif text-xl">{answer.confident ? 'Copied from the chunks' : 'No sentence to copy'}</h4>
      {answer.confident ? (
        <div className="mt-3 rounded-2xl border border-line bg-paper p-4">
          {answer.quotes.map((quote) => (
            <p key={quote.text} className="mt-2 text-sm leading-6 first:mt-0">
              {quote.text}
            </p>
          ))}
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
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-muted">
          Nothing scored high enough to quote. Try another question, or turn a source back on and run again.
        </p>
      )}
      {answer.hits.length > 0 && (
        <div className="mt-4">
          <h4 className="font-serif text-xl">Retrieved</h4>
          <ol className="mt-3 space-y-3">
            {answer.hits.map((hit, index) => {
              const width = Math.max(8, Math.round((hit.score / answer.hits[0].score) * 100));
              return (
                <li key={hit.passage.id} className="rounded-2xl border border-line bg-paper p-4" data-hit={hit.passage.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-mono text-xs text-muted">
                      {index + 1}. {hit.passage.source}
                    </p>
                    <p className="font-mono text-xs text-muted">score {hit.score.toFixed(2)}</p>
                  </div>
                  <p className="mt-1 text-sm">
                    <a className="underline decoration-line underline-offset-4 hover:text-accent" href={hit.passage.href}>
                      {hit.passage.title}
                    </a>
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
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
  );
}

function Compare({ query, history }: { query: string; history: FinishedRun[] }) {
  const rows = useMemo(
    () =>
      history.map((run) => ({
        run,
        answer: reply(query, run.passages, run.scoring),
      })),
    [history, query],
  );
  return (
    <section className="mt-5 rounded-2xl border border-line bg-paper p-4" data-compare="true">
      <h4 className="font-serif text-xl">Same question, each run</h4>
      <p className="mt-1 text-sm leading-6 text-muted">
        The question is scored again on every saved index. Chunk size, sources, and the ranker are why the scores move.
      </p>
      <ul className="mt-3 space-y-3">
        {rows.map(({ run, answer }) => (
          <li key={run.number} className="rounded-xl border border-line bg-card px-3 py-3 text-sm">
            <p className="font-mono text-xs text-muted">
              Run {run.number} · {run.label} · {run.passages.length} passages
            </p>
            {answer.hits[0] ? (
              <p className="mt-1 leading-6">
                {answer.hits[0].passage.title} · score {answer.hits[0].score.toFixed(2)}
                {answer.hits[1] ? ` · next ${answer.hits[1].score.toFixed(2)}` : ''}
              </p>
            ) : (
              <p className="mt-1 text-muted">No passage matched.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
