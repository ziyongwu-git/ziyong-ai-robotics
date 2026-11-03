import { createContext, useContext, useEffect, useMemo, useState, type DragEvent } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { layoutGraph } from './dagLayout';
import {
  SUGGESTIONS,
  TASK_CATALOG,
  catalogEntry,
  connectionProblem,
  describeSettings,
  freshId,
  makeEdge,
  makeNode,
  notesGraph,
  parallelExtractGraph,
  reply,
  runGraph,
  dualScoreGraph,
  validateGraph,
  type DagRun,
  type GraphIssue,
  type NotebookGraph,
  type RankMethod,
  type Reply,
  type ScoreSettings,
  type SourceKind,
  type StepResult,
  type TagFilter,
  type TaskKind,
  type TaskNode,
} from './notebook';

/**
 * DAG canvas for Ask the notebook.
 *
 * React Flow is imported only by this island, so the rest of the site
 * does not download it. The ranking and the run live in notebook.ts.
 * This file draws nodes, edges, and the results panel.
 *
 * On a narrow screen the canvas becomes a list with Connect and Add menus.
 * Those menus are also in the side panel, so a keyboard can build the graph
 * without dragging.
 *
 * `not-prose` opts out of the article typography. Reduced motion skips the
 * wave timer and shows every state at once. Task colors are Airflow's
 * graph-view colors (queued gray, running lime, success green, failed red,
 * skipped pink). They stay those hues in both themes so the states read
 * the way an Airflow graph reads.
 */

type AirflowState = 'idle' | 'queued' | 'running' | 'success' | 'failed' | 'skipped';

type TaskData = {
  task: TaskNode;
  state: AirflowState;
  badge: string;
  flagged: boolean;
};

type Finished = Extract<DagRun, { ok: true }> & { number: number };

const Issues = createContext<GraphIssue[]>([]);
const RunView = createContext<{ stateOf: (id: string) => AirflowState; badgeOf: (id: string) => string }>({
  stateOf: () => 'idle',
  badgeOf: () => '',
});

const STATE_CLASS: Record<AirflowState, string> = {
  idle: 'bg-line text-ink',
  queued: 'bg-[#808080] text-white',
  running: 'bg-[#32cd32] text-[#14210d]',
  success: 'bg-[#1f7a32] text-white',
  failed: 'bg-[#c62828] text-white',
  skipped: 'bg-[#ff69b4] text-[#1c1915]',
};

const nodeTypes = { task: TaskFlowNode };

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

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  return narrow;
}

function useDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => setDark(root.classList.contains('dark'));
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function formatMs(ms: number): string {
  if (ms < 1) return '<1 ms';
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  return `${Math.round(ms)} ms`;
}

function toGraph(nodes: Node<TaskData>[], edges: Edge[]): NotebookGraph {
  return {
    nodes: nodes.map((node) => node.data.task),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
  };
}

function flowFromGraph(graph: NotebookGraph): { nodes: Node<TaskData>[]; edges: Edge[] } {
  const positions = layoutGraph(graph);
  return {
    nodes: graph.nodes.map((task) => ({
      id: task.id,
      type: 'task',
      position: positions[task.id] ?? { x: 0, y: 0 },
      data: { task, state: 'idle', badge: '', flagged: false },
    })),
    edges: graph.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, type: 'smoothstep' })),
  };
}

export default function AskNotebook() {
  return (
    <ReactFlowProvider>
      <NotebookCanvas />
    </ReactFlowProvider>
  );
}

function NotebookCanvas() {
  const reduced = useReducedMotion();
  const narrow = useNarrow();
  const dark = useDark();
  const flow = useReactFlow();
  const initial = flowFromGraph(parallelExtractGraph());
  const [nodes, setNodes] = useState<Node<TaskData>[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [ranSignature, setRanSignature] = useState<string | null>(null);
  const [wave, setWave] = useState(-2);
  const [playing, setPlaying] = useState(false);
  const [history, setHistory] = useState<Finished[]>([]);
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState<Reply | null>(null);

  const graph = useMemo(() => toGraph(nodes, edges), [nodes, edges]);
  const issues = useMemo(() => validateGraph(graph), [graph]);
  const errors = issues.filter((issue) => issue.level === 'error');
  const signature = JSON.stringify({
    nodes: graph.nodes,
    edges: graph.edges.map((edge) => [edge.source, edge.target]),
  });
  const fresh = Boolean(finished && ranSignature === signature);
  const done = Boolean(fresh && finished && wave >= finished.levels.length);
  const flaggedNodes = new Set(issues.flatMap((issue) => issue.nodeIds));
  const flaggedEdges = new Set(issues.filter((issue) => issue.level === 'error').flatMap((issue) => issue.edgeIds));

  function stateOf(id: string): AirflowState {
    if (!finished || !fresh) return 'idle';
    const step = finished.steps.find((item) => item.id === id);
    if (!step) return 'idle';
    if (step.state === 'skipped') return 'skipped';
    if (step.state === 'failed') return 'failed';
    const level = finished.levels.findIndex((group) => group.includes(id));
    if (level < 0) return 'idle';
    if (wave < 0) return 'queued';
    if (wave >= finished.levels.length) return 'success';
    if (level < wave) return 'success';
    if (level === wave) return 'running';
    return 'queued';
  }

  function badgeOf(id: string): string {
    if (!finished || !fresh || wave < finished.levels.length) return '';
    return finished.steps.find((step) => step.id === id)?.badge ?? '';
  }

  useEffect(() => {
    if (!playing || !finished) return;
    if (reduced || wave >= finished.levels.length) {
      setWave(finished.levels.length);
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setWave((current) => current + 1), 750);
    return () => window.clearTimeout(id);
  }, [playing, wave, reduced, finished]);

  function loadGraph(next: NotebookGraph) {
    const built = flowFromGraph(next);
    setNodes(built.nodes);
    setEdges(built.edges);
    setSelectedId(null);
    setBanner(null);
    window.setTimeout(() => flow.fitView({ padding: 0.28, duration: reduced ? 0 : 300 }), 30);
  }

  function tidy() {
    const positions = layoutGraph(graph);
    setNodes((current) => current.map((node) => ({ ...node, position: positions[node.id] ?? node.position })));
    window.setTimeout(() => flow.fitView({ padding: 0.28, duration: reduced ? 0 : 300 }), 30);
  }

  function addKind(kind: TaskKind, position?: { x: number; y: number }) {
    const id = freshId(kind, nodes.map((node) => node.id));
    const settings = kind === 'extract' ? { notes: true, projects: false, primer: false } : undefined;
    const task = makeNode(id, kind, settings);
    setNodes((current) => [
      ...current,
      {
        id,
        type: 'task',
        position: position ?? { x: 80 + current.length * 24, y: 80 },
        data: { task, state: 'idle', badge: '', flagged: false },
      },
    ]);
    setSelectedId(id);
  }

  function connect(source: string, target: string) {
    const problem = connectionProblem(graph, source, target);
    if (problem) {
      setBanner(problem);
      return;
    }
    setEdges((current) => [...current, { id: `${source}->${target}`, source, target, type: 'smoothstep' }]);
    setBanner(null);
  }

  function onConnect(connection: Connection) {
    if (!connection.source || !connection.target) return;
    connect(connection.source, connection.target);
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    const kind = event.dataTransfer.getData('application/notebook-task') as TaskKind;
    if (!kind) return;
    addKind(kind, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }

  function patchTask(id: string, task: TaskNode) {
    setNodes((current) => current.map((node) => (node.id === id ? { ...node, data: { ...node.data, task } } : node)));
  }

  function removeNode(id: string) {
    setNodes((current) => current.filter((node) => node.id !== id));
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function run() {
    const result = runGraph(graph);
    if (!result.ok) {
      setBanner(result.issues[0]?.message ?? 'This DAG cannot run.');
      return;
    }
    const stored: Finished = { ...result, number: (history[0]?.number ?? 0) + 1 };
    setFinished(stored);
    setRanSignature(signature);
    setAsked(null);
    setHistory((items) => [stored, ...items].slice(0, 4));
    setBanner(null);
    if (reduced) {
      setWave(stored.levels.length);
      setPlaying(false);
      return;
    }
    setWave(-1);
    setPlaying(true);
  }

  function ask(text: string) {
    const next = text.trim();
    if (!finished || !done || next.length === 0) return;
    const scoring = finished.scorers[0]?.settings ?? { method: 'bm25' as const, topK: 3, useTitle: true };
    setQuery(next);
    setAsked(reply(next, finished.passages, scoring));
  }

  const viewNodes = nodes.map((node) => ({
    ...node,
    data: { ...node.data, state: stateOf(node.id), badge: badgeOf(node.id), flagged: flaggedNodes.has(node.id) },
  }));
  const viewEdges = edges.map((edge) => ({
    ...edge,
    animated: stateOf(edge.target) === 'running' && !reduced,
    style: flaggedEdges.has(edge.id) ? { stroke: '#c62828', strokeWidth: 2.5 } : { stroke: 'var(--muted)', strokeWidth: 1.6 },
  }));

  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  const selectedStep = fresh && done ? finished?.steps.find((step) => step.id === selectedId) : undefined;

  return (
    <Issues.Provider value={issues}>
      <RunView.Provider value={{ stateOf, badgeOf }}>
        <div className="notebook-flow not-prose rounded-2xl border border-line bg-card p-4 text-ink sm:p-6" data-demo="ask-notebook" data-ready={done ? 'true' : 'false'}>
          <style>{`
            .notebook-flow .react-flow__attribution { display: none; }
            .notebook-flow .react-flow__controls-button { background: var(--card); color: var(--ink); border-bottom-color: var(--line); fill: var(--ink); }
            .notebook-flow .react-flow__edge-path { stroke: var(--muted); }
            .notebook-flow .react-flow { background: var(--paper); }
            .notebook-flow .react-flow__handle { width: 16px; height: 16px; }
          `}</style>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-serif text-2xl">Ask the notebook</h3>
            <p className={`rounded-full px-3 py-1 text-sm ${done ? 'bg-highlight-soft' : playing ? 'bg-accent-soft' : 'border border-line text-muted'}`}>
              {done ? 'Indexed' : playing ? 'Running' : 'Editing'}
            </p>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted">
            Draw the DAG in this browser. No model is called. Sentences in an answer are copied from the chunks the index kept. Task colors match Airflow’s graph view. The times are real compute time. The waves are the playback.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded-full border border-line bg-paper px-3 text-sm" onClick={() => loadGraph(parallelExtractGraph())}>
              Reset
            </button>
            <button type="button" className="min-h-11 rounded-full border border-line bg-paper px-3 text-sm" onClick={() => loadGraph(dualScoreGraph())}>
              Two scorers
            </button>
            <button type="button" className="min-h-11 rounded-full border border-line bg-paper px-3 text-sm" onClick={() => loadGraph(notesGraph())}>
              Notes only
            </button>
            <button type="button" className="min-h-11 rounded-full border border-line bg-paper px-3 text-sm" onClick={tidy}>
              Tidy
            </button>
          </div>

          <p className="mt-4 font-mono text-[11px] tracking-wide text-muted uppercase">Palette</p>
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TASK_CATALOG.map((item) => (
              <li key={item.kind} className="rounded-2xl border border-line bg-paper p-2">
                <div
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/notebook-task', item.kind);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  className="cursor-grab"
                >
                  <p className="font-mono text-xs">{item.taskId}</p>
                  <p className="text-xs text-muted">{item.blurb}</p>
                </div>
                <button type="button" className="mt-2 min-h-10 w-full rounded-full border border-line text-sm" onClick={() => addKind(item.kind)}>
                  Add
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-5 text-muted">
            Drag a task onto the canvas, then drag from the right handle to the next task’s left handle. On a phone, or with a keyboard, use Add and the Connect menu.
          </p>

          {narrow ? (
            <ListView
              nodes={nodes}
              edges={edges}
              onSelect={setSelectedId}
              selectedId={selectedId}
              onConnect={connect}
              onRemove={removeNode}
              onAddAfter={(source, kind) => {
                const id = freshId(kind, nodes.map((node) => node.id));
                const task = makeNode(id, kind);
                const sourceNode = nodes.find((node) => node.id === source);
                setNodes((current) => [
                  ...current,
                  {
                    id,
                    type: 'task',
                    position: { x: (sourceNode?.position.x ?? 0) + 260, y: sourceNode?.position.y ?? 40 },
                    data: { task, state: 'idle', badge: '', flagged: false },
                  },
                ]);
                connect(source, id);
                setSelectedId(id);
              }}
            />
          ) : (
            <div className="mt-3 h-[560px] overflow-hidden rounded-2xl border border-line" data-canvas="flow">
              <ReactFlow
                nodes={viewNodes}
                edges={viewEdges}
                nodeTypes={nodeTypes}
                onNodesChange={(changes) => setNodes((current) => applyNodeChanges(changes, current))}
                onEdgesChange={(changes) => setEdges((current) => applyEdgeChanges(changes, current))}
                onConnect={onConnect}
                onNodeClick={(_, node) => setSelectedId(node.id)}
                onPaneClick={() => setSelectedId(null)}
                onDrop={onDrop}
                onDragOver={onDragOver}
                colorMode={dark ? 'dark' : 'light'}
                fitView
                connectionRadius={40}
                zoomOnPinch
                zoomOnScroll
                proOptions={{ hideAttribution: true }}
                deleteKeyCode={['Backspace', 'Delete']}
              >
                <Background />
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>
          )}

          {(errors[0] || banner) && (
            <p className="mt-3 rounded-2xl bg-accent-soft px-3 py-3 text-sm leading-6" role="alert">
              This DAG will not run. {banner ?? errors[0]?.message}
            </p>
          )}
          {!errors.length && !banner && (
            <p className="mt-3 text-sm text-muted">The graph is a DAG. An index is downstream of an extract.</p>
          )}

          <div className="mt-3">
            <button type="button" className="min-h-11 rounded-full bg-ink px-4 text-sm text-paper disabled:opacity-60" onClick={run} disabled={errors.length > 0 || playing}>
              {playing ? 'Running' : finished ? 'Run again' : 'Run the DAG'}
            </button>
            {reduced && <p className="mt-2 text-sm text-muted">Motion is reduced, so Run shows every state at once.</p>}
          </div>
          <p className="sr-only" aria-live="polite">
            {errors[0]?.message ?? (done ? 'DAG finished.' : playing ? 'DAG running.' : '')}
          </p>

          {fresh && done && finished && <Timeline run={finished} />}
          {fresh && done && finished && (
            <section className="mt-4 rounded-2xl border border-highlight bg-highlight-soft p-4" data-summary="run">
              <h4 className="font-serif text-xl">Run {finished.number}</h4>
              <p className="mt-1 text-sm leading-6">
                Finished in {formatMs(finished.totalMs)}. {finished.levels.length} wave{finished.levels.length === 1 ? '' : 's'}. {finished.label}. {finished.passages.length} passages indexed.
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {finished.steps.map((step) => (
                  <li key={step.id}>
                    <span className="font-mono text-xs text-muted">{step.id}</span> {step.badge}
                    <span className="text-muted"> · {formatMs(step.durationMs)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {finished && !fresh && (
            <p className="mt-3 text-sm text-muted" role="status">
              The graph changed after run {finished.number}. Answers below still use that index until you run again.
            </p>
          )}

          {selected && (
            <NodePanel
              task={selected.data.task}
              step={selectedStep}
              nodes={nodes}
              query={asked?.query ?? ''}
              scorers={fresh && done && finished ? finished.scorers : []}
              onChange={(task) => patchTask(selected.id, task)}
              onConnect={(target) => connect(selected.id, target)}
              onRemove={() => removeNode(selected.id)}
              onAddAfter={(kind) => {
                const id = freshId(kind, nodes.map((node) => node.id));
                const task = makeNode(id, kind);
                setNodes((current) => [
                  ...current,
                  {
                    id,
                    type: 'task',
                    position: { x: selected.position.x + 260, y: selected.position.y },
                    data: { task, state: 'idle', badge: '', flagged: false },
                  },
                ]);
                connect(selected.id, id);
              }}
            />
          )}

          <form
            className="mt-6 border-t border-line pt-5"
            onSubmit={(event) => {
              event.preventDefault();
              ask(query);
            }}
          >
            <label htmlFor="ask-notebook-q" className="font-serif text-xl">
              Ask a question
            </label>
            <p id="ask-notebook-hint" className="mt-1 text-sm leading-6 text-muted">
              {done ? 'Search uses the index from the last finished run.' : 'Run a valid DAG first. The question box waits so it cannot search an index you have not built.'}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                id="ask-notebook-q"
                value={query}
                disabled={!done}
                aria-describedby="ask-notebook-hint"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="What is Ask Astro?"
                className="min-h-11 w-full rounded-full border border-line bg-paper px-4 text-sm disabled:opacity-60"
              />
              <button type="submit" disabled={!done || query.trim().length === 0} className="min-h-11 shrink-0 rounded-full bg-ink px-4 text-sm text-paper disabled:opacity-60">
                Search the index
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" disabled={!done} onClick={() => ask(suggestion)} className="min-h-11 rounded-full border border-line bg-paper px-3 text-left text-sm disabled:opacity-60">
                  {suggestion}
                </button>
              ))}
            </div>
          </form>

          {asked && <AnswerCard answer={asked} />}
          {asked && fresh && finished && finished.scorers.length > 1 && (
            <SideBySide query={asked.query} scorers={finished.scorers} passagesFor={(id) => finished.steps.find((step) => step.id === id)?.passages ?? []} />
          )}
          {asked && history.length >= 2 && <Compare query={asked.query} history={history} />}
        </div>
      </RunView.Provider>
    </Issues.Provider>
  );
}

function TaskFlowNode({ data, id }: NodeProps<Node<TaskData>>) {
  const issues = useContext(Issues);
  const view = useContext(RunView);
  const entry = catalogEntry(data.task.kind);
  const state = view.stateOf(id);
  const badge = view.badgeOf(id) || describeSettings(data.task);
  const flagged = issues.some((issue) => issue.level === 'error' && issue.nodeIds.includes(id));
  return (
    <div
      className={`w-[210px] rounded-2xl border bg-card px-3 py-2 text-ink shadow-sm ${flagged ? 'border-[#c62828]' : 'border-line'}`}
      data-task={data.task.kind}
      data-node={id}
      data-status={state}
    >
      {data.task.kind !== 'extract' && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase ${STATE_CLASS[state]}`}>{state}</span>
        {badge && <span className="truncate font-mono text-[10px] text-muted">{badge}</span>}
      </div>
      <p className="mt-1 font-mono text-xs">{entry.taskId}</p>
      <p className="text-xs text-muted">{entry.title}</p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ListView({
  nodes,
  edges,
  selectedId,
  onSelect,
  onConnect,
  onRemove,
  onAddAfter,
}: {
  nodes: Node<TaskData>[];
  edges: Edge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onConnect: (source: string, target: string) => void;
  onRemove: (id: string) => void;
  onAddAfter: (source: string, kind: TaskKind) => void;
}) {
  const view = useContext(RunView);
  return (
    <ol className="mt-3 space-y-2" data-canvas="list">
      {nodes.map((node) => (
        <li key={node.id} className={`rounded-2xl border bg-paper p-3 ${node.id === selectedId ? 'border-accent' : 'border-line'}`} data-task={node.data.task.kind} data-node={node.id} data-status={view.stateOf(node.id)}>
          <button type="button" className="w-full text-left" onClick={() => onSelect(node.id)}>
            <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${STATE_CLASS[view.stateOf(node.id)]}`}>{view.stateOf(node.id)}</span>
            <span className="mt-1 block font-mono text-sm">{node.id}</span>
            <span className="block text-sm text-muted">{view.badgeOf(node.id) || describeSettings(node.data.task)}</span>
          </button>
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="text-xs text-muted">
              Connect to
              <select className="mt-1 min-h-11 rounded-xl border border-line bg-card px-2 text-sm text-ink" value="" onChange={(event) => event.target.value && onConnect(node.id, event.target.value)}>
                <option value="">Choose a task</option>
                {nodes.filter((other) => other.id !== node.id).map((other) => (
                  <option key={other.id} value={other.id}>{other.id}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Add after
              <select className="mt-1 min-h-11 rounded-xl border border-line bg-card px-2 text-sm text-ink" value="" onChange={(event) => event.target.value && onAddAfter(node.id, event.target.value as TaskKind)}>
                <option value="">Choose a kind</option>
                {TASK_CATALOG.map((item) => (
                  <option key={item.kind} value={item.kind}>{item.title}</option>
                ))}
              </select>
            </label>
            <button type="button" className="min-h-11 self-end rounded-full border border-line px-3 text-sm" onClick={() => onRemove(node.id)}>
              Delete
            </button>
          </div>
          {edges.some((edge) => edge.source === node.id) && (
            <p className="mt-2 text-xs text-muted">Out: {edges.filter((edge) => edge.source === node.id).map((edge) => edge.target).join(', ')}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

function Timeline({ run }: { run: Finished }) {
  const max = Math.max(...run.timeline.map((bar) => bar.startMs + Math.max(bar.durationMs, 0.4)), 1);
  return (
    <section className="mt-4 rounded-2xl border border-line bg-paper p-4" data-timeline="run">
      <h4 className="font-serif text-xl">Run timeline</h4>
      <p className="mt-1 text-sm text-muted">Tasks in one wave start together. The label is the real time. Short bars are stretched just enough to see.</p>
      <ol className="mt-3 space-y-2">
        {run.timeline.map((bar) => {
          const left = (bar.startMs / max) * 100;
          const width = Math.max(8, (Math.max(bar.durationMs, 0.4) / max) * 100);
          return (
            <li key={bar.id} className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2 text-xs">
              <span className="truncate font-mono text-muted">{bar.id}</span>
              <span className="relative h-3 rounded-full bg-line">
                <span className="absolute top-0 h-3 rounded-full bg-[#1f7a32]" style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} />
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function NodePanel({
  task,
  step,
  nodes,
  query,
  scorers,
  onChange,
  onConnect,
  onRemove,
  onAddAfter,
}: {
  task: TaskNode;
  step?: StepResult;
  nodes: Node<TaskData>[];
  query: string;
  scorers: { id: string; settings: ScoreSettings }[];
  onChange: (task: TaskNode) => void;
  onConnect: (target: string) => void;
  onRemove: () => void;
  onAddAfter: (kind: TaskKind) => void;
}) {
  const entry = catalogEntry(task.kind);
  return (
    <section className="mt-4 rounded-2xl border border-line bg-paper p-4" data-panel={task.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-serif text-xl">{entry.title}</h4>
        <button type="button" className="min-h-10 rounded-full border border-line px-3 text-sm" onClick={onRemove}>Delete</button>
      </div>
      <p className="mt-1 text-sm text-muted">{describeSettings(task)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="text-xs text-muted">
          Connect to
          <select className="mt-1 block min-h-11 rounded-xl border border-line bg-card px-2 text-sm text-ink" value="" onChange={(event) => event.target.value && onConnect(event.target.value)}>
            <option value="">Choose a task</option>
            {nodes.filter((node) => node.id !== task.id).map((node) => (
              <option key={node.id} value={node.id}>{node.id}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Add after
          <select className="mt-1 block min-h-11 rounded-xl border border-line bg-card px-2 text-sm text-ink" value="" onChange={(event) => event.target.value && onAddAfter(event.target.value as TaskKind)}>
            <option value="">Choose a kind</option>
            {TASK_CATALOG.map((item) => (
              <option key={item.kind} value={item.kind}>{item.title}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4">
        <SettingsForm task={task} onChange={onChange} />
      </div>
      <div className="mt-4 border-t border-line pt-3" data-output={task.kind}>
        {step && step.state !== 'skipped' ? <StepBody step={step} query={query} scorers={scorers} passagesOf={() => step.passages} /> : (
          <p className="text-sm leading-6 text-muted">{step?.sentence ?? 'Run the DAG to see what this task did. A finished task always leaves a count, examples, and a time.'}</p>
        )}
      </div>
    </section>
  );
}

function SettingsForm({ task, onChange }: { task: TaskNode; onChange: (task: TaskNode) => void }) {
  if (task.kind === 'extract' || task.kind === 'filter') {
    const kinds: SourceKind[] = ['notes', 'projects', 'primer'];
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm text-muted">Sources</legend>
        {kinds.map((kind) => (
          <label key={kind} className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={task.settings[kind]}
              onChange={(event) => onChange({ ...task, settings: { ...task.settings, [kind]: event.target.checked } })}
            />
            {kind === 'notes' ? 'Site notes' : kind === 'projects' ? 'Demos' : 'Ask Astro primer'}
          </label>
        ))}
        {task.kind === 'filter' && (
          <label className="block text-sm">
            Tag
            <select className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-3" value={task.settings.tag} onChange={(event) => onChange({ ...task, settings: { ...task.settings, tag: event.target.value as TagFilter } })}>
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
        <legend className="text-sm text-muted">Duplicates</legend>
        {(['exact', 'similar'] as const).map((mode) => (
          <label key={mode} className="flex min-h-11 items-center gap-3 text-sm">
            <input type="radio" name={`clean-${task.id}`} checked={task.settings.mode === mode} onChange={() => onChange({ ...task, settings: { mode } })} />
            {mode === 'exact' ? 'Exact text' : 'Near-duplicate vocabulary'}
          </label>
        ))}
      </fieldset>
    );
  }
  if (task.kind === 'chunk') {
    return (
      <div className="space-y-3 text-sm">
        <label className="block">
          Chunk size, {task.settings.size} characters
          <input type="range" min={100} max={800} step={20} value={task.settings.size} onChange={(event) => onChange({ ...task, settings: { ...task.settings, size: Number(event.target.value) } })} />
        </label>
        <label className="block">
          Overlap, {task.settings.overlap} characters
          <input type="range" min={0} max={200} step={10} value={task.settings.overlap} onChange={(event) => onChange({ ...task, settings: { ...task.settings, overlap: Number(event.target.value) } })} />
        </label>
      </div>
    );
  }
  if (task.kind === 'score') {
    return (
      <div className="space-y-3 text-sm">
        <fieldset className="space-y-2">
          <legend className="text-muted">Ranker</legend>
          {(['bm25', 'keyword'] as const).map((method) => (
            <label key={method} className="flex min-h-11 items-center gap-3">
              <input type="radio" name={`score-${task.id}`} checked={task.settings.method === method} onChange={() => onChange({ ...task, settings: { ...task.settings, method: method as RankMethod } })} />
              {method === 'bm25' ? 'BM25, shorter passages score higher' : 'Keyword count, no length penalty'}
            </label>
          ))}
        </fieldset>
        <label className="block">
          Keep the top {task.settings.topK}
          <input type="range" min={1} max={5} step={1} value={task.settings.topK} onChange={(event) => onChange({ ...task, settings: { ...task.settings, topK: Number(event.target.value) } })} />
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={task.settings.useTitle} onChange={(event) => onChange({ ...task, settings: { ...task.settings, useTitle: event.target.checked } })} />
          Count words in the title
        </label>
      </div>
    );
  }
  return <p className="text-sm leading-6 text-muted">The index freezes the passages from every scorer that points here. Ask Astro would upsert vectors into Weaviate. This page keeps term counts in memory.</p>;
}

function StepBody({
  step,
  query,
  scorers,
  passagesOf,
}: {
  step: StepResult;
  query: string;
  scorers: { id: string; settings: ScoreSettings }[];
  passagesOf: (id: string) => import('./notebook').Passage[];
}) {
  const detail = step.detail;
  return (
    <div>
      <p className="text-sm leading-6">{step.sentence}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{step.why}</p>
      <p className="mt-2 font-mono text-xs text-muted">
        in {step.inputCount} → out {step.outputCount} · {formatMs(step.durationMs)}{step.unit ? ` · ${step.unit}` : ''}
      </p>
      {detail.kind === 'extract' && (
        <ul className="mt-3 space-y-2">
          {detail.examples.map((example) => (
            <li key={example.title} className="rounded-xl border border-line bg-card px-3 py-2 text-sm">
              <span className="font-medium">{example.title}</span>
              <span className="mt-1 block text-xs text-muted">{example.source}</span>
              <span className="mt-1 block leading-6 text-muted">{example.snippet}</span>
            </li>
          ))}
        </ul>
      )}
      {detail.kind === 'clean' && (
        <div className="mt-3 space-y-2 text-sm">
          {detail.dropped.length === 0 && <p className="text-muted">Nothing was dropped. The rows were already distinct.</p>}
          {detail.dropped.map((item) => (
            <p key={item.title} className="rounded-xl border border-line bg-card px-3 py-2">
              Dropped {item.title}. {item.reason}
            </p>
          ))}
          {detail.kept.map((item) => (
            <p key={item.title} className="text-muted">Kept {item.title}. {item.snippet}</p>
          ))}
        </div>
      )}
      {detail.kind === 'chunk' && (
        <div className="mt-3">
          <Histogram bars={detail.histogram} />
          <ul className="mt-3 space-y-2">
            {detail.examples.map((example, index) => (
              <li key={`${example.title}-${index}`} className="rounded-xl border border-line bg-card px-3 py-2 text-sm leading-6">
                <span className="font-mono text-xs text-muted">{example.title} · {example.chars} chars</span>
                <span className="mt-1 block">
                  {example.head && <mark className="rounded bg-accent-soft px-0.5">{example.head}</mark>}
                  {example.body}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">The highlighted prefix is the overlap carried in from the previous window.</p>
        </div>
      )}
      {detail.kind === 'filter' && (
        <div className="mt-3 space-y-2 text-sm">
          {detail.kept.map((item) => <p key={`k-${item.title}`} className="text-muted">Kept {item.title}. {item.reason}</p>)}
          {detail.dropped.map((item) => <p key={`d-${item.title}`}>Dropped {item.title}. {item.reason}</p>)}
          {detail.kept.length === 0 && detail.dropped.length === 0 && <p className="text-muted">The filter received no rows.</p>}
        </div>
      )}
      {detail.kind === 'score' && step.scoring && (
        <ScoreList query={query} passages={step.passages} scoring={step.scoring} />
      )}
      {detail.kind === 'score' && scorers.length > 1 && (
        <SideBySide query={query} scorers={scorers} passagesFor={passagesOf} />
      )}
      {detail.kind === 'index' && (
        <div className="mt-3 text-sm">
          <p>{detail.termCount} distinct terms.</p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {detail.postings.map((posting) => (
              <li key={posting.term}>{posting.term} → {posting.ids.join(', ') || 'none'}</li>
            ))}
          </ul>
        </div>
      )}
      {detail.kind === 'skipped' && <p className="mt-2 text-sm">{detail.reason}</p>}
    </div>
  );
}

function Histogram({ bars }: { bars: { label: string; count: number }[] }) {
  const max = Math.max(...bars.map((bar) => bar.count), 1);
  return (
    <div className="flex items-end gap-2" data-histogram="chunks">
      {bars.map((bar) => (
        <div key={bar.label} className="flex-1 text-center">
          <div className="mx-auto w-full rounded-t bg-accent" style={{ height: `${Math.max(4, (bar.count / max) * 56)}px` }} />
          <p className="mt-1 font-mono text-[10px] text-muted">{bar.label}</p>
          <p className="font-mono text-[10px]">{bar.count}</p>
        </div>
      ))}
    </div>
  );
}

function ScoreList({ query, passages, scoring }: { query: string; passages: import('./notebook').Passage[]; scoring: ScoreSettings }) {
  if (!query.trim()) {
    return <p className="mt-3 text-sm text-muted">Ask a question to see the top {scoring.topK} for {scoring.method}. The {passages.length} passages are already scored as an index. Nothing was dropped.</p>;
  }
  const answer = reply(query, passages, scoring);
  return (
    <ol className="mt-3 space-y-2">
      {answer.hits.map((hit) => (
        <li key={hit.passage.id} className="rounded-xl border border-line bg-card px-3 py-2 text-sm" data-score={scoring.method}>
          <span className="flex justify-between gap-2 font-mono text-xs text-muted">
            <span>{hit.passage.title}</span>
            <span>{hit.score.toFixed(2)}</span>
          </span>
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-line">
            <span className="block h-full bg-accent" style={{ width: `${Math.max(8, (hit.score / (answer.hits[0]?.score || 1)) * 100)}%` }} />
          </span>
          <span className="mt-1 block leading-6 text-muted">{hit.passage.text.slice(0, 180)}</span>
        </li>
      ))}
      {answer.hits.length === 0 && <li className="text-sm text-muted">No passage matched that question.</li>}
    </ol>
  );
}

function SideBySide({
  query,
  scorers,
  passagesFor,
}: {
  query: string;
  scorers: { id: string; settings: ScoreSettings }[];
  passagesFor: (id: string) => import('./notebook').Passage[];
}) {
  if (!query.trim()) return null;
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2" data-compare="scorers">
      {scorers.map((scorer) => {
        const answer = reply(query, passagesFor(scorer.id), scorer.settings);
        return (
          <div key={scorer.id} className="rounded-xl border border-line bg-card p-3 text-sm">
            <p className="font-mono text-xs text-muted">{scorer.settings.method}</p>
            <p className="mt-1">{answer.hits[0] ? `${answer.hits[0].passage.title} · ${answer.hits[0].score.toFixed(2)}` : 'No match'}</p>
          </div>
        );
      })}
    </div>
  );
}

function AnswerCard({ answer }: { answer: Reply }) {
  return (
    <section className="mt-5" data-answer="true" aria-live="polite">
      <h4 className="font-serif text-xl">{answer.confident ? 'Cited answer' : 'No sentence to copy'}</h4>
      {answer.confident ? (
        <div className="mt-3 rounded-2xl border border-line bg-paper p-4 text-sm leading-6">
          {answer.quotes.map((quote) => <p key={quote.text} className="mt-2 first:mt-0">{quote.text}</p>)}
          <ul className="mt-3 flex flex-wrap gap-2">
            {answer.hits.slice(0, 3).map((hit) => (
              <li key={hit.passage.id}>
                <a className="text-accent underline decoration-line underline-offset-4" href={hit.passage.href}>{hit.passage.title}</a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Nothing scored high enough to quote. The index only holds what the DAG kept.</p>
      )}
      {answer.hits.length > 0 && (
        <ol className="mt-3 space-y-2">
          {answer.hits.map((hit, index) => (
            <li key={hit.passage.id} className="rounded-xl border border-line bg-paper px-3 py-2 text-sm" data-hit={hit.passage.id}>
              <span className="font-mono text-xs text-muted">{index + 1}. score {hit.score.toFixed(2)} · {hit.passage.source}</span>
              <span className="mt-1 block">{hit.passage.title}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Compare({ query, history }: { query: string; history: Finished[] }) {
  return (
    <section className="mt-5 rounded-2xl border border-line bg-paper p-4" data-compare="runs">
      <h4 className="font-serif text-xl">Same question, each run</h4>
      <ul className="mt-3 space-y-2 text-sm">
        {history.map((run) => {
          const scoring = run.scorers[0]?.settings ?? { method: 'bm25' as const, topK: 3, useTitle: true };
          const answer = reply(query, run.passages, scoring);
          return (
            <li key={run.number} className="rounded-xl border border-line bg-card px-3 py-2">
              <p className="font-mono text-xs text-muted">Run {run.number} · {run.label} · {run.passages.length} passages</p>
              <p className="mt-1">{answer.hits[0] ? `${answer.hits[0].passage.title} · ${answer.hits[0].score.toFixed(2)}` : 'No match'}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
