/**
 * Pipeline and search for the "Ask the notebook" project.
 *
 * Ask Astro loads documents with Airflow, then a separate API retrieves
 * them. This file is the browser version of that shape. A visitor draws
 * a DAG: nodes are tasks, edges are dependencies. The run walks that graph
 * in topological order. Tasks in the same wave run together. Asking a
 * question ranks whatever the index task kept.
 *
 * There is no embedding model and no generated prose. BM25 and a plain
 * keyword count are the only rankers. Sentences in an answer are copied
 * out of a chunk.
 *
 * Re-run without a browser:
 *   node --experimental-strip-types scripts/check-notebook.ts
 */

export type SourceKind = 'notes' | 'projects' | 'primer';
export type DocTag = 'ai' | 'data' | 'robotics';
export type TaskKind = 'extract' | 'clean' | 'chunk' | 'filter' | 'score' | 'index';
export type RankMethod = 'bm25' | 'keyword';
export type TagFilter = 'any' | DocTag;

export type Document = {
  id: string;
  title: string;
  href: string;
  /** One line under the title. */
  source: string;
  kind: SourceKind;
  tags: readonly DocTag[];
  text: string;
};

/** A chunk is a document, or a window cut out of one. */
export type Passage = {
  id: string;
  title: string;
  href: string;
  source: string;
  kind: SourceKind;
  tags: readonly DocTag[];
  text: string;
};

export type ExtractSettings = { notes: boolean; projects: boolean; primer: boolean };
export type CleanSettings = { mode: 'exact' | 'similar' };
export type ChunkSettings = { size: number; overlap: number };
export type FilterSettings = { notes: boolean; projects: boolean; primer: boolean; tag: TagFilter };
export type ScoreSettings = { method: RankMethod; topK: number; useTitle: boolean };

/** One task on the canvas. Several tasks may share a kind. The id is unique. */
export type TaskNode =
  | { id: string; kind: 'extract'; settings: ExtractSettings }
  | { id: string; kind: 'clean'; settings: CleanSettings }
  | { id: string; kind: 'chunk'; settings: ChunkSettings }
  | { id: string; kind: 'filter'; settings: FilterSettings }
  | { id: string; kind: 'score'; settings: ScoreSettings }
  | { id: string; kind: 'index'; settings: Record<string, never> };

/** An edge means "target waits until source has succeeded." */
export type TaskEdge = { id: string; source: string; target: string };

export type NotebookGraph = { nodes: TaskNode[]; edges: TaskEdge[] };

/** docs are whole source files. chunks are windows cut from them. */
export type FlowUnit = 'docs' | 'chunks';

export type GraphIssue = {
  level: 'error' | 'warn';
  message: string;
  nodeIds: string[];
  edgeIds: string[];
};

export type DocExample = { title: string; source: string; snippet: string };
export type ReasonExample = { title: string; snippet: string; reason: string };
export type ChunkExample = { title: string; head: string; body: string; chars: number };
export type HistogramBar = { label: string; count: number };
export type Posting = { term: string; ids: string[] };

export type StepDetail =
  | { kind: 'extract'; examples: DocExample[] }
  | { kind: 'clean'; dropped: ReasonExample[]; kept: DocExample[] }
  | { kind: 'chunk'; examples: ChunkExample[]; histogram: HistogramBar[] }
  | { kind: 'filter'; kept: ReasonExample[]; dropped: ReasonExample[] }
  | { kind: 'score'; method: RankMethod; topK: number; passageCount: number }
  | { kind: 'index'; termCount: number; topTerms: { term: string; count: number }[]; postings: Posting[] }
  | { kind: 'skipped'; reason: string };

export type StepResult = {
  id: string;
  kind: TaskKind;
  state: 'success' | 'failed' | 'skipped';
  badge: string;
  /** What the step did, in one sentence. */
  sentence: string;
  /** Why that matters for retrieval. */
  why: string;
  inputCount: number;
  outputCount: number;
  durationMs: number;
  detail: StepDetail;
  passages: Passage[];
  unit: FlowUnit | null;
  scoring?: ScoreSettings;
};

export type TimelineBar = {
  id: string;
  kind: TaskKind;
  level: number;
  startMs: number;
  durationMs: number;
};

export type DagRun =
  | {
      ok: true;
      steps: StepResult[];
      /** Runnable tasks grouped into waves. A wave runs together. */
      levels: string[][];
      timeline: TimelineBar[];
      passages: Passage[];
      scorers: { id: string; settings: ScoreSettings }[];
      label: string;
      totalMs: number;
    }
  | { ok: false; issues: GraphIssue[] };

export type Hit = {
  passage: Passage;
  score: number;
  matched: string[];
};

export type Quote = { text: string; passageId: string };

export type Reply = {
  query: string;
  hits: Hit[];
  quotes: Quote[];
  confident: boolean;
};

/**
 * Source documents. They are longer than one chunk on purpose, so the
 * chunk-size control changes which window a question lands on.
 * Primer text follows the public Ask Astro README and the Airflow docs.
 * Note and project text follows those pages on this site.
 */
export const DOCUMENTS: readonly Document[] = [
  {
    id: 'doc-ask-astro',
    title: 'What Ask Astro is',
    href: 'https://github.com/astronomer/ask-astro',
    source: 'Primer · Ask Astro repository',
    kind: 'primer',
    tags: ['ai', 'data'],
    text: 'Ask Astro is an open-source question-answering application built by Astronomer. It answers questions about Apache Airflow and Astronomer. The repository calls it a reference implementation of Andreessen Horowitz\'s LLM application architecture. The parts are Airflow DAGs that retrieve and embed documents, an API that turns a prompt into a reply, feedback DAGs, a Slack bot, and a web UI. The interesting half for a data pipeline is not the chat box. It is the DAG that keeps the documents current.',
  },
  {
    id: 'doc-rag',
    title: 'Retrieval, then writing',
    href: 'https://proceedings.neurips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html',
    source: 'Primer · Lewis et al., NeurIPS 2020',
    kind: 'primer',
    tags: ['ai'],
    text: 'Retrieval-augmented generation, RAG, searches a set of documents before a language model writes. The documents are the grounding, and the reply can cite them. Lewis and colleagues described that pattern in a 2020 NeurIPS paper. Ask Astro is one public RAG application, aimed at questions about Apache Airflow. If the search is stale, or the chunk is the wrong size, the written answer is grounded on the wrong page. That is why the ingest, the unglamorous half, is the half an orchestrator is good at.',
  },
  {
    id: 'doc-ingest',
    title: 'Ingest, chunk, embed, load',
    href: 'https://github.com/astronomer/ask-astro/blob/main/airflow/dags/ingestion/ask-astro-load.py',
    source: 'Primer · Ask Astro repository',
    kind: 'primer',
    tags: ['ai', 'data'],
    text: 'Ask Astro\'s ingest DAGs write the vectors to Weaviate. They pull a source, split the text into chunks, and embed those chunks before that write. LangChain splitters handle Markdown, reStructuredText, and Python. An OpenAI embedding model produces the numbers that get stored. The bulk DAG ask-astro-load-bulk saves the extracted documents as parquet on its first run, so a later run can try a new chunk size or a different database without downloading every source again. The README lists the ingest sources as the Apache Airflow docs, Astronomer docs, the Astronomer blog, the Astronomer Registry, Apache Airflow GitHub pull requests, OpenLineage GitHub, OpenLineage docs, and the Stack Overflow data dump. A source usually has its own DAG, and the bulk load can run them together. Chunk size is a real choice. A short window cites one fact. A long window mixes several. The ranker treats those two shapes differently.',
  },
  {
    id: 'doc-query',
    title: 'Question time and feedback',
    href: 'https://github.com/astronomer/ask-astro',
    source: 'Primer · Ask Astro README',
    kind: 'primer',
    tags: ['ai'],
    text: 'At question time Ask Astro does not search with the raw sentence alone. A model writes two differently worded versions of the prompt. The original and those two are embedded, and Weaviate returns up to 100 documents for each. A Cohere reranker keeps 8 documents from that pool of up to 300. A gpt-3.5-turbo check drops documents that are not relevant. The README says the final answer is a gpt-4o call over the question plus the remaining sources. Feedback DAGs take two ratings. A person can mark an answer correct or incorrect. A model scores helpfulness, publicness, and on-topicness. If the person says the answer is correct and the model calls it helpful, public, and on topic, Ask Astro writes that question and answer back into Weaviate. A later prompt can retrieve the pair as a source.',
  },
  {
    id: 'doc-dag',
    title: 'What a DAG is for',
    href: 'https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dags.html',
    source: 'Primer · Airflow docs',
    kind: 'primer',
    tags: ['data'],
    text: 'A DAG in Apache Airflow is a directed acyclic graph of tasks. An edge means the downstream task waits until the upstream task has succeeded. In Ask Astro the scheduler runs ingest and feedback. The question-answering API is a separate service. Airflow does not invent the sentence a visitor reads. It delivers documents to the database that sentence is grounded on. A newer provider, apache-airflow-providers-common-ai, adds LLMOperator and the task.llm decorator. The decorated function returns a prompt, and the task sends that prompt through a connection. The provider docs say it needs Airflow 2.11 or newer, and some extras need Airflow 3. That pattern is different from the ingest DAGs. Here the model call itself is the task.',
  },
  {
    id: 'doc-page',
    title: 'How this page answers',
    href: '/demos/ask-the-notebook#how-i-built-it',
    source: 'This page',
    kind: 'primer',
    tags: ['ai', 'data'],
    text: 'This page answers with BM25 in the browser, or with a plain keyword count if you switch the score task. It copies sentences from the winning chunks and names each source. There is no language model. The graph is the pipeline you built, and pressing Run really executes it on the documents shipped with the page. It does not call a server. Changing the chunk size, the ranker, or which sources are extracted changes the passages and the scores. Times on the tasks are how long the browser spent. The lighting-up afterward is only so the steps can be read.',
  },
  {
    id: 'doc-attention',
    title: 'Notes on attention',
    href: '/learning/sample-attention-notes',
    source: 'Learning log · sample note',
    kind: 'notes',
    tags: ['ai', 'data'],
    text: 'The learning note on attention says attention is a weighted sum. Each output is a mix of the values, and the weights come from how well a query matches each key. The core step is often written as softmax of Q times K transpose, divided by the square root of d, times V. The note is marked sample. It shows the format of a learning-log post, including a place for the formula you would actually reuse and an open question about the first small dataset you would plot.',
  },
  {
    id: 'doc-arm',
    title: 'Planar robot arms',
    href: '/learning/sample-planar-robot-arms',
    source: 'Learning log · sample note',
    kind: 'notes',
    tags: ['robotics'],
    text: 'A two-link arm lives on a flat plane and can reach a ring of points. Inside the inner ring it cannot fold tightly enough. Outside the outer ring it cannot stretch far enough. Forward kinematics turns joint angles into a hand position. Inverse kinematics names a point and solves for the angles. The learning note on planar robot arms is a sample, and it points at the two-link arm demo, where the same idea is a slider instead of a paragraph.',
  },
  {
    id: 'doc-graph',
    title: 'The graph on this page',
    href: '/certificates/data-agents',
    source: 'Certificate · Building and Evaluating Data Agents',
    kind: 'notes',
    tags: ['data', 'ai'],
    text: 'Ask the notebook is a small data agent you can redraw. Tasks form a directed graph. An edge means a task waits until the task upstream of it has finished. The score step quotes passages from the notes and the primer. It does not call a language model. The certificate this demo is built on is Building and Evaluating Data Agents, which is about agents that answer from data and about checking those answers.',
  },
  {
    id: 'doc-see',
    title: 'See, think, move',
    href: '/demos/see-think-move',
    source: 'Demos',
    kind: 'projects',
    tags: ['ai', 'robotics'],
    text: 'See, think, move is a toy picture of a vision-language-action loop. A real model of that kind takes a camera image and a sentence and returns a short burst of motion. The widget on that page is not trained and makes no server call. It shows the blocks, a sentence of what to do next, and a path that starts noisy and is pulled toward a clean curve. The rules live next to the drawing so they can be re-run without a browser.',
  },
  {
    id: 'doc-arm-project',
    title: 'Two-link robot arm',
    href: '/demos/sample-two-link-arm',
    source: 'Demos · sample',
    kind: 'projects',
    tags: ['robotics', 'data'],
    text: 'The sample demo Two-link robot arm is the pattern for a demo page on this site. The words are Markdown. The sliders are a React island loaded with client:load. The status is sample, so the page shows a placeholder banner. The planar robot arms note points at the same demo. Moving a slider solves the joint angles for a point you pick.',
  },
];

export const SUGGESTIONS: readonly string[] = [
  'What is Ask Astro?',
  'Where do the vectors go?',
  'What does feedback write back?',
  'What is attention?',
  'How far can a two-link arm reach?',
  'How does this page answer?',
];

export const TASK_CATALOG: readonly { kind: TaskKind; taskId: string; title: string; blurb: string }[] = [
  { kind: 'extract', taskId: 'extract_sources', title: 'Extract', blurb: 'Notes, demos, primer' },
  { kind: 'chunk', taskId: 'split_chunks', title: 'Chunk', blurb: 'Size and overlap' },
  { kind: 'clean', taskId: 'clean_dedupe', title: 'Clean', blurb: 'Drop duplicates' },
  { kind: 'filter', taskId: 'filter_rows', title: 'Filter', blurb: 'Source or tag' },
  { kind: 'score', taskId: 'score_terms', title: 'Score', blurb: 'BM25 or keywords' },
  { kind: 'index', taskId: 'write_index', title: 'Index', blurb: 'Freeze for search' },
];

const STOP = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'of', 'to', 'and', 'or', 'for', 'in', 'on',
  'with', 'what', 'how', 'does', 'do', 'did', 'this', 'that', 'it', 'its', 'be', 'by', 'as',
  'at', 'from', 'into', 'about', 'if', 'you', 'your', 'we', 'can', 'not', 'no', 'where',
  'when', 'who', 'which', 'go', 'than', 'then', 'so', 'but',
]);

const K1 = 1.2;
const B = 0.75;
const TITLE_HITS = 4;

/**
 * Below this BM25 score the page refuses to quote.
 * Keyword scores live on a smaller scale and use KEYWORD_MIN.
 * scripts/check-notebook.ts locks both.
 */
export const QUOTE_MIN = 1.15;
export const KEYWORD_MIN = 0.9;

/** Similar-chunk dedupe. A later chunk is dropped when this much of its vocabulary already sits in a kept chunk. */
const SIMILAR = 0.72;

const DEFAULT_SCORE: ScoreSettings = { method: 'bm25', topK: 3, useTitle: true };

export function catalogEntry(kind: TaskKind) {
  const found = TASK_CATALOG.find((item) => item.kind === kind);
  if (!found) throw new Error(`Unknown task ${kind}`);
  return found;
}

export function makeNode(id: string, kind: TaskKind, settings?: TaskNode['settings']): TaskNode {
  if (kind === 'extract') {
    return { id, kind, settings: (settings as ExtractSettings) ?? { notes: true, projects: true, primer: true } };
  }
  if (kind === 'clean') return { id, kind, settings: (settings as CleanSettings) ?? { mode: 'similar' } };
  if (kind === 'chunk') return { id, kind, settings: (settings as ChunkSettings) ?? { size: 240, overlap: 40 } };
  if (kind === 'filter') {
    return { id, kind, settings: (settings as FilterSettings) ?? { notes: true, projects: true, primer: true, tag: 'any' } };
  }
  if (kind === 'score') {
    return { id, kind, settings: (settings as ScoreSettings) ?? { method: 'bm25', topK: 3, useTitle: true } };
  }
  return { id, kind: 'index', settings: {} };
}

export function makeEdge(source: string, target: string): TaskEdge {
  return { id: `${source}->${target}`, source, target };
}

export function freshId(kind: TaskKind, taken: readonly string[]): string {
  let n = 1;
  while (taken.includes(`${kind}-${n}`)) n += 1;
  return `${kind}-${n}`;
}

/** Three extracts in parallel, then chunk, clean, one BM25 score, and an index. */
export function parallelExtractGraph(): NotebookGraph {
  return {
    nodes: [
      makeNode('ex-notes', 'extract', { notes: true, projects: false, primer: false }),
      makeNode('ex-projects', 'extract', { notes: false, projects: true, primer: false }),
      makeNode('ex-primer', 'extract', { notes: false, projects: false, primer: true }),
      makeNode('chunk-1', 'chunk', { size: 240, overlap: 40 }),
      makeNode('clean-1', 'clean', { mode: 'similar' }),
      makeNode('score-bm25', 'score', { method: 'bm25', topK: 3, useTitle: true }),
      makeNode('index-1', 'index'),
    ],
    edges: [
      makeEdge('ex-notes', 'chunk-1'),
      makeEdge('ex-projects', 'chunk-1'),
      makeEdge('ex-primer', 'chunk-1'),
      makeEdge('chunk-1', 'clean-1'),
      makeEdge('clean-1', 'score-bm25'),
      makeEdge('score-bm25', 'index-1'),
    ],
  };
}

/** One extract, then BM25 and keyword count side by side, both feeding the index. */
export function dualScoreGraph(): NotebookGraph {
  return {
    nodes: [
      makeNode('ex-all', 'extract', { notes: true, projects: true, primer: true }),
      makeNode('chunk-1', 'chunk', { size: 240, overlap: 40 }),
      makeNode('score-bm25', 'score', { method: 'bm25', topK: 3, useTitle: true }),
      makeNode('score-keyword', 'score', { method: 'keyword', topK: 3, useTitle: true }),
      makeNode('index-1', 'index'),
    ],
    edges: [
      makeEdge('ex-all', 'chunk-1'),
      makeEdge('chunk-1', 'score-bm25'),
      makeEdge('chunk-1', 'score-keyword'),
      makeEdge('score-bm25', 'index-1'),
      makeEdge('score-keyword', 'index-1'),
    ],
  };
}

/** Notes only, large chunks, keyword ranker. A contrast to the parallel preset. */
export function notesGraph(): NotebookGraph {
  return {
    nodes: [
      makeNode('ex-notes', 'extract', { notes: true, projects: false, primer: false }),
      makeNode('chunk-1', 'chunk', { size: 700, overlap: 0 }),
      makeNode('score-keyword', 'score', { method: 'keyword', topK: 2, useTitle: false }),
      makeNode('index-1', 'index'),
    ],
    edges: [
      makeEdge('ex-notes', 'chunk-1'),
      makeEdge('chunk-1', 'score-keyword'),
      makeEdge('score-keyword', 'index-1'),
    ],
  };
}

/** The pipeline the page opens with, and the one Reset restores. */
export function defaultPipeline(): PipelineTask[] {
  return [createTask('extract'), createTask('chunk'), createTask('clean'), createTask('filter'), createTask('score'), createTask('index')];
}

/** Learning-log documents only, cut in large pieces, ranked by raw keywords. */
export function notesPipeline(): PipelineTask[] {
  const extract = createTask('extract');
  const chunk = createTask('chunk');
  const score = createTask('score');
  if (extract.kind !== 'extract' || chunk.kind !== 'chunk' || score.kind !== 'score') {
    throw new Error('Preset tasks came back as the wrong kind.');
  }
  extract.settings = { notes: true, projects: false, primer: false };
  chunk.settings = { size: 700, overlap: 0 };
  score.settings = { method: 'keyword', topK: 2, useTitle: false };
  return [extract, chunk, score, createTask('index')];
}

/** Short windows and a wider top-k, so the same question can land on a different slice. */
export function tinyPipeline(): PipelineTask[] {
  const chunk = createTask('chunk');
  const score = createTask('score');
  if (chunk.kind !== 'chunk' || score.kind !== 'score') {
    throw new Error('Preset tasks came back as the wrong kind.');
  }
  chunk.settings = { size: 140, overlap: 20 };
  score.settings = { method: 'bm25', topK: 5, useTitle: true };
  return [createTask('extract'), chunk, score, createTask('index')];
}

export function describeSettings(task: TaskNode): string {
  switch (task.kind) {
    case 'extract': {
      const on = (['notes', 'projects', 'primer'] as const).filter((key) => task.settings[key]);
      return on.length === 0 ? 'no sources' : on.join(', ');
    }
    case 'clean':
      return task.settings.mode === 'exact' ? 'exact text only' : 'near-duplicates';
    case 'chunk':
      return `${task.settings.size} chars, overlap ${task.settings.overlap}`;
    case 'filter': {
      const on = (['notes', 'projects', 'primer'] as const).filter((key) => task.settings[key]);
      const tag = task.settings.tag === 'any' ? 'any tag' : task.settings.tag;
      return `${on.join(', ') || 'no sources'} · ${tag}`;
    }
    case 'score':
      return `${task.settings.method}, top ${task.settings.topK}${task.settings.useTitle ? ', titles count' : ''}`;
    case 'index':
      return 'freeze the passages';
  }
}

const TASK_LABEL: Record<TaskKind, string> = {
  extract: 'Extract',
  clean: 'Clean',
  chunk: 'Chunk',
  filter: 'Filter',
  score: 'Score',
  index: 'Index',
};

function findCycle(graph: NotebookGraph): string[] | null {
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const outgoing = new Map<string, string[]>();
  for (const node of graph.nodes) outgoing.set(node.id, []);
  for (const edge of graph.edges) outgoing.get(edge.source)?.push(edge.target);

  function visit(id: string): string[] | null {
    color.set(id, 1);
    stack.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const mark = color.get(next) ?? 0;
      if (mark === 1) return stack.slice(stack.indexOf(next));
      if (mark === 0) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(id, 2);
    return null;
  }

  for (const node of graph.nodes) {
    if ((color.get(node.id) ?? 0) === 0) {
      const found = visit(node.id);
      if (found) return found;
    }
  }
  return null;
}

function reaches(start: readonly string[], edges: readonly TaskEdge[], direction: 'forward' | 'back'): Set<string> {
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    const from = direction === 'forward' ? edge.source : edge.target;
    const to = direction === 'forward' ? edge.target : edge.source;
    const list = next.get(from) ?? [];
    list.push(to);
    next.set(from, list);
  }
  const seen = new Set<string>(start);
  const queue = [...start];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    for (const hop of next.get(id) ?? []) {
      if (seen.has(hop)) continue;
      seen.add(hop);
      queue.push(hop);
    }
  }
  return seen;
}

/**
 * Problems a visitor can fix before pressing Run.
 * Errors block the run. Warnings mark tasks a run will skip.
 */
export function validateGraph(graph: NotebookGraph): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  if (graph.nodes.length === 0) {
    issues.push({
      level: 'error',
      message: 'The canvas is empty. Drag on an extract task and an index task, or reset to the parallel preset.',
      nodeIds: [],
      edgeIds: [],
    });
    return issues;
  }

  const cycle = findCycle(graph);
  if (cycle) {
    const edgeIds = graph.edges
      .filter((edge, index) => {
        const next = cycle[(cycle.indexOf(edge.source) + 1) % cycle.length];
        return cycle.includes(edge.source) && edge.target === next && index >= 0;
      })
      .map((edge) => edge.id);
    issues.push({
      level: 'error',
      message: `This is a cycle (${cycle.join(' → ')}). A DAG cannot loop. Delete one of those edges.`,
      nodeIds: cycle,
      edgeIds,
    });
  }

  const extracts = graph.nodes.filter((node) => node.kind === 'extract');
  const indexes = graph.nodes.filter((node) => node.kind === 'index');
  if (extracts.length === 0) {
    issues.push({
      level: 'error',
      message: 'Add an extract task. That is the source. Later steps need documents to start from.',
      nodeIds: [],
      edgeIds: [],
    });
  }
  if (indexes.length === 0) {
    issues.push({
      level: 'error',
      message: 'Add an index task, and connect it downstream of the extracts. Without it there is nowhere to search.',
      nodeIds: [],
      edgeIds: [],
    });
  }

  for (const node of extracts) {
    if (node.kind !== 'extract') continue;
    const incoming = graph.edges.filter((edge) => edge.target === node.id);
    if (incoming.length > 0) {
      issues.push({
        level: 'error',
        message: `${node.id} is an extract. It reads the page's own files, so nothing should point into it.`,
        nodeIds: [node.id],
        edgeIds: incoming.map((edge) => edge.id),
      });
    }
    const { notes, projects, primer } = node.settings;
    if (!notes && !projects && !primer) {
      issues.push({
        level: 'error',
        message: `${node.id} has every source turned off. Turn on notes, demos, or the primer.`,
        nodeIds: [node.id],
        edgeIds: [],
      });
    }
  }

  for (const node of graph.nodes) {
    if (node.kind === 'chunk' && node.settings.overlap >= node.settings.size) {
      issues.push({
        level: 'error',
        message: `${node.id}: overlap has to be smaller than the chunk size, or the window never moves forward.`,
        nodeIds: [node.id],
        edgeIds: [],
      });
    }
    if (node.kind === 'filter' && !node.settings.notes && !node.settings.projects && !node.settings.primer) {
      issues.push({
        level: 'error',
        message: `${node.id} keeps no sources. Turn at least one back on, or delete the filter.`,
        nodeIds: [node.id],
        edgeIds: [],
      });
    }
  }

  const fromExtract = reaches(extracts.map((node) => node.id), graph.edges, 'forward');
  const toIndex = reaches(indexes.map((node) => node.id), graph.edges, 'back');
  if (extracts.length > 0 && indexes.length > 0) {
    const linked = indexes.some((node) => fromExtract.has(node.id));
    if (!linked) {
      issues.push({
        level: 'error',
        message: 'No index is downstream of an extract. Drag an edge from the extracts, through chunk and score, into the index.',
        nodeIds: [...extracts.map((node) => node.id), ...indexes.map((node) => node.id)],
        edgeIds: [],
      });
    }
  }

  for (const edge of graph.edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    const sourceUnit = unitOf(source, upstreamUnit(graph, source.id));
    if (target.kind === 'chunk' && sourceUnit === 'chunks') {
      issues.push({
        level: 'error',
        message: `${target.id} needs whole documents, and ${source.id} already emits chunks. Connect the chunk task to an extract or a clean step that still has documents.`,
        nodeIds: [target.id, source.id],
        edgeIds: [edge.id],
      });
    }
    if (target.kind !== 'extract' && sourceUnit === 'bad') {
      issues.push({
        level: 'error',
        message: `${edge.source} → ${edge.target} mixes documents and chunks. A task can take one shape of input.`,
        nodeIds: [edge.source, edge.target],
        edgeIds: [edge.id],
      });
    }
  }

  for (const node of graph.nodes) {
    if (node.kind === 'extract') continue;
    const incoming = graph.edges.filter((edge) => edge.target === node.id);
    if (incoming.length === 0) {
      issues.push({
        level: 'error',
        message: `${TASK_LABEL[node.kind]} (${node.id}) has no input. Drag an edge from an upstream task, or delete it.`,
        nodeIds: [node.id],
        edgeIds: [],
      });
    }
    const onPath = fromExtract.has(node.id) && (indexes.length === 0 || toIndex.has(node.id));
    if (incoming.length > 0 && !onPath && extracts.length > 0 && indexes.length > 0) {
      issues.push({
        level: 'warn',
        message: `${node.id} is not on a path from an extract to an index, so a run will skip it.`,
        nodeIds: [node.id],
        edgeIds: [],
      });
    }
  }

  return issues;
}

/** Whether this edge is allowed. The string is the friendly refusal. */
export function connectionProblem(graph: NotebookGraph, sourceId: string, targetId: string): string | null {
  if (sourceId === targetId) return 'A task cannot connect to itself.';
  if (graph.edges.some((edge) => edge.source === sourceId && edge.target === targetId)) return 'That edge is already there.';
  const trial: NotebookGraph = { nodes: graph.nodes, edges: [...graph.edges, makeEdge(sourceId, targetId)] };
  const created = trial.edges[trial.edges.length - 1];
  const issues = validateGraph(trial).filter((issue) => issue.level === 'error' && (issue.edgeIds.includes(created.id) || issue.nodeIds.includes(targetId)));
  return issues[0]?.message ?? null;
}

function upstreamUnit(graph: NotebookGraph, id: string, seen = new Set<string>()): FlowUnit | 'bad' | 'none' {
  if (seen.has(id)) return 'bad';
  seen.add(id);
  const incoming = graph.edges.filter((edge) => edge.target === id);
  if (incoming.length === 0) return 'none';
  const units = incoming.map((edge) => {
    const source = graph.nodes.find((node) => node.id === edge.source);
    if (!source) return 'bad' as const;
    return unitOf(source, upstreamUnit(graph, source.id, seen));
  });
  if (units.some((unit) => unit === 'bad' || unit === 'none')) return 'bad';
  return units.every((unit) => unit === units[0]) ? units[0] : 'bad';
}

function unitOf(node: TaskNode, input: FlowUnit | 'bad' | 'none'): FlowUnit | 'bad' | 'none' {
  if (node.kind === 'extract') return 'docs';
  if (node.kind === 'chunk') return input === 'docs' ? 'chunks' : 'bad';
  if (input === 'docs' || input === 'chunks') return input;
  return 'bad';
}

/** Lowercase words. A trailing s is dropped so "vectors" matches "vector". */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOP.has(word))
    .map((word) => (word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word));
}

type BuiltIndex = {
  passages: readonly Passage[];
  freqs: Map<string, number>[];
  lengths: number[];
  df: Map<string, number>;
  avgLen: number;
};

export function buildIndex(passages: readonly Passage[], useTitle: boolean): BuiltIndex {
  const freqs: Map<string, number>[] = [];
  const lengths: number[] = [];
  const df = new Map<string, number>();

  for (const passage of passages) {
    const counts = new Map<string, number>();
    const words = tokenize(passage.text);
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
    if (useTitle) {
      for (const word of tokenize(passage.title)) counts.set(word, (counts.get(word) ?? 0) + TITLE_HITS);
    }
    freqs.push(counts);
    lengths.push(Math.max(1, words.length));
    for (const word of counts.keys()) df.set(word, (df.get(word) ?? 0) + 1);
  }

  const avgLen = lengths.reduce((sum, length) => sum + length, 0) / Math.max(1, lengths.length);
  return { passages, freqs, lengths, df, avgLen };
}

function idf(total: number, docFreq: number): number {
  return Math.log(1 + (total - docFreq + 0.5) / (docFreq + 0.5));
}

function bm25(index: BuiltIndex, position: number, queryTerms: readonly string[]): number {
  const counts = index.freqs[position];
  const length = index.lengths[position];
  const total = index.passages.length;
  let score = 0;
  for (const term of queryTerms) {
    const freq = counts.get(term) ?? 0;
    if (freq === 0) continue;
    const weight = idf(total, index.df.get(term) ?? 0);
    const denom = freq + K1 * (1 - B + B * (length / index.avgLen));
    score += weight * ((freq * (K1 + 1)) / denom);
  }
  return score;
}

/** One point per query word that appears, plus a little extra when it is repeated. No length penalty. */
function keywordScore(counts: Map<string, number>, queryTerms: readonly string[]): number {
  let score = 0;
  for (const term of queryTerms) {
    const freq = counts.get(term) ?? 0;
    if (freq > 0) score += 1 + Math.log(freq);
  }
  return score;
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * Rank the passages from a run. `passages` should be that run's index,
 * not the full library, so a filter or a smaller extract changes the answer.
 */
export function reply(
  query: string,
  passages: readonly Passage[],
  scoring: ScoreSettings = DEFAULT_SCORE,
): Reply {
  const trimmed = query.trim();
  const queryTerms = [...new Set(tokenize(trimmed))];
  if (trimmed.length === 0 || queryTerms.length === 0 || passages.length === 0) {
    return { query: trimmed, hits: [], quotes: [], confident: false };
  }

  const index = buildIndex(passages, scoring.useTitle);
  const weights = new Map(
    queryTerms.map((term) => [term, scoring.method === 'keyword' ? 1 : idf(passages.length, index.df.get(term) ?? 0)]),
  );

  const ranked = passages
    .map((passage, position) => {
      const matched = queryTerms.filter((term) => index.freqs[position].has(term));
      const score =
        scoring.method === 'keyword'
          ? keywordScore(index.freqs[position], queryTerms)
          : bm25(index, position, queryTerms);
      return { passage, score, matched };
    })
    .filter((hit) => hit.score > 0 && hit.matched.length > 0)
    .sort((a, b) => b.score - a.score || a.passage.id.localeCompare(b.passage.id));

  const hits = ranked.slice(0, Math.max(1, scoring.topK));
  const minimum = scoring.method === 'keyword' ? KEYWORD_MIN : QUOTE_MIN;
  if (hits.length === 0 || hits[0].score < minimum) {
    return { query: trimmed, hits, quotes: [], confident: false };
  }

  const quotes: Quote[] = [];
  const covered = new Set<string>();
  for (const hit of hits.slice(0, 2)) {
    if (quotes.length > 0 && hit.score < hits[0].score * 0.75) continue;
    let bestText = '';
    let best = 0;
    let bestNew = 0;
    for (const sentence of sentencesOf(hit.passage.text)) {
      const seen = new Set(tokenize(sentence));
      let score = 0;
      let fresh = 0;
      for (const term of queryTerms) {
        if (!seen.has(term)) continue;
        score += weights.get(term) ?? 0;
        if (!covered.has(term)) fresh += 1;
      }
      if (score > best || (score === best && fresh > bestNew)) {
        best = score;
        bestNew = fresh;
        bestText = sentence;
      }
    }
    if (!bestText || best === 0) continue;
    if (quotes.length > 0 && bestNew === 0) continue;
    quotes.push({ text: bestText, passageId: hit.passage.id });
    for (const term of tokenize(bestText)) {
      if (queryTerms.includes(term)) covered.add(term);
    }
  }

  return { query: trimmed, hits, quotes, confident: quotes.length > 0 };
}

function asPassage(document: Document): Passage {
  return {
    id: document.id,
    title: document.title,
    href: document.href,
    source: document.source,
    kind: document.kind,
    tags: document.tags,
    text: document.text.replace(/\s+/g, ' ').trim(),
  };
}

/**
 * Character windows, snapped back to a space so a chunk does not end
 * mid-word. Overlap is how many characters the next window re-reads.
 * This is the readable stand-in for a text splitter.
 */
export function windows(text: string, size: number, overlap: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= size) return [clean];
  const parts: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + size);
    if (end < clean.length) {
      const space = clean.lastIndexOf(' ', end);
      if (space > start + size * 0.55) end = space;
    }
    const slice = clean.slice(start, end).trim();
    if (slice.length > 30) parts.push(slice);
    if (end >= clean.length) break;
    const next = end - overlap;
    start = next > start ? next : end;
  }
  return parts;
}

function tokenOverlap(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0) return 0;
  const other = new Set(right);
  let hit = 0;
  for (const token of new Set(left)) if (other.has(token)) hit += 1;
  return hit / new Set(left).size;
}

function dedupe(
  passages: readonly Passage[],
  mode: CleanSettings['mode'],
): { kept: Passage[]; removed: { passage: Passage; reason: string }[] } {
  const kept: Passage[] = [];
  const removed: { passage: Passage; reason: string }[] = [];
  const seenExact = new Set<string>();
  for (const passage of passages) {
    const exact = passage.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seenExact.has(exact)) {
      removed.push({ passage, reason: 'Same text as an earlier row.' });
      continue;
    }
    if (mode === 'similar') {
      const tokens = tokenize(passage.text);
      const crowded = kept.some((earlier) => tokenOverlap(tokens, tokenize(earlier.text)) >= SIMILAR);
      if (crowded) {
        removed.push({ passage, reason: 'Most of its words already appear in a kept row.' });
        continue;
      }
    }
    seenExact.add(exact);
    kept.push(passage);
  }
  return { kept, removed };
}

function allowedKind(settings: { notes: boolean; projects: boolean; primer: boolean }, kind: SourceKind): boolean {
  if (kind === 'notes') return settings.notes;
  if (kind === 'projects') return settings.projects;
  return settings.primer;
}

function preview(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 140 ? `${clean.slice(0, 137)}...` : clean;
}

function clock<T>(work: () => T): { value: T; durationMs: number } {
  const start = performance.now();
  const value = work();
  return { value, durationMs: performance.now() - start };
}

function mergePassages(lists: Passage[][]): Passage[] {
  const seen = new Set<string>();
  const merged: Passage[] = [];
  for (const list of lists) {
    for (const passage of list) {
      if (seen.has(passage.id)) continue;
      seen.add(passage.id);
      merged.push(passage);
    }
  }
  return merged;
}

function histogram(lengths: readonly number[]): HistogramBar[] {
  const buckets = [
    { label: '0–80', test: (n: number) => n < 80 },
    { label: '80–160', test: (n: number) => n >= 80 && n < 160 },
    { label: '160–240', test: (n: number) => n >= 160 && n < 240 },
    { label: '240–400', test: (n: number) => n >= 240 && n < 400 },
    { label: '400+', test: (n: number) => n >= 400 },
  ];
  return buckets.map((bucket) => ({ label: bucket.label, count: lengths.filter(bucket.test).length }));
}

function runnableIds(graph: NotebookGraph): Set<string> {
  const extracts = graph.nodes.filter((node) => node.kind === 'extract').map((node) => node.id);
  const indexes = graph.nodes.filter((node) => node.kind === 'index').map((node) => node.id);
  const forward = reaches(extracts, graph.edges, 'forward');
  const back = reaches(indexes, graph.edges, 'back');
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (forward.has(node.id) && back.has(node.id)) ids.add(node.id);
  }
  return ids;
}

function waves(graph: NotebookGraph, ids: Set<string>): string[][] {
  const indegree = new Map<string, number>();
  for (const id of ids) indegree.set(id, 0);
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }
  const levels: string[][] = [];
  let ready = [...ids].filter((id) => (indegree.get(id) ?? 0) === 0).sort();
  const seen = new Set<string>();
  while (ready.length > 0) {
    levels.push(ready);
    const next: string[] = [];
    for (const id of ready) {
      seen.add(id);
      for (const edge of graph.edges) {
        if (edge.source !== id || !ids.has(edge.target)) continue;
        const left = (indegree.get(edge.target) ?? 0) - 1;
        indegree.set(edge.target, left);
        if (left === 0) next.push(edge.target);
      }
    }
    ready = next.sort();
  }
  if (seen.size !== ids.size) return [];
  return levels;
}

function skippedStep(node: TaskNode, reason: string): StepResult {
  return {
    id: node.id,
    kind: node.kind,
    state: 'skipped',
    badge: 'skipped',
    sentence: reason,
    why: 'Airflow marks a task skipped when there is nothing for it to do. It is not a silent success.',
    inputCount: 0,
    outputCount: 0,
    durationMs: 0,
    detail: { kind: 'skipped', reason },
    passages: [],
    unit: null,
  };
}

function executeNode(node: TaskNode, input: Passage[]): { step: StepResult } {
  if (node.kind === 'extract') {
    const settings = node.settings;
    const { value, durationMs } = clock(() => DOCUMENTS.filter((document) => allowedKind(settings, document.kind)).map(asPassage));
    const sources = (['notes', 'projects', 'primer'] as const).filter((key) => settings[key]);
    return {
      step: {
        id: node.id,
        kind: node.kind,
        state: 'success',
        badge: `${value.length} docs`,
        sentence: `Read ${value.length} document${value.length === 1 ? '' : 's'} from ${sources.join(', ') || 'no sources'}.`,
        why: 'This is the ingest. Ask Astro’s DAGs pull docs, blogs, and forum posts before anything is embedded. Here the files are the ones already on this page.',
        inputCount: 0,
        outputCount: value.length,
        durationMs,
        passages: value,
        unit: 'docs',
        detail: {
          kind: 'extract',
          examples: value.slice(0, 3).map((passage) => ({ title: passage.title, source: passage.source, snippet: preview(passage.text) })),
        },
      },
    };
  }

  if (node.kind === 'chunk') {
    const settings = node.settings;
    const { value, durationMs } = clock(() => {
      const chunks: { passage: Passage; head: string }[] = [];
      for (const passage of input) {
        const parts = windows(passage.text, settings.size, settings.overlap);
        parts.forEach((text, index) => {
          const head = index === 0 ? '' : text.slice(0, Math.min(settings.overlap, Math.floor(text.length / 3)));
          chunks.push({
            head,
            passage: { ...passage, id: parts.length === 1 ? passage.id : `${passage.id}#${index + 1}`, text },
          });
        });
      }
      return chunks;
    });
    const passages = value.map((item) => item.passage);
    const avg = passages.length === 0 ? 0 : Math.round(passages.reduce((sum, passage) => sum + passage.text.length, 0) / passages.length);
    return {
      step: {
        id: node.id,
        kind: node.kind,
        state: 'success',
        badge: `${passages.length} chunks`,
        sentence: `Cut ${input.length} documents into ${passages.length} windows, average ${avg} characters, overlap ${settings.overlap}.`,
        why: 'Chunk size decides whether a citation is one fact or three topics mixed together. Ask Astro splits Markdown and code for the same reason, then embeds each piece.',
        inputCount: input.length,
        outputCount: passages.length,
        durationMs,
        passages,
        unit: 'chunks',
        detail: {
          kind: 'chunk',
          examples: value.slice(0, 3).map((item) => ({
            title: item.passage.title,
            head: item.head,
            body: item.head ? item.passage.text.slice(item.head.length) : item.passage.text,
            chars: item.passage.text.length,
          })),
          histogram: histogram(passages.map((passage) => passage.text.length)),
        },
      },
    };
  }

  if (node.kind === 'clean') {
    const { value, durationMs } = clock(() => dedupe(input, node.settings.mode));
    return {
      step: {
        id: node.id,
        kind: node.kind,
        state: 'success',
        badge: `removed ${value.removed.length}`,
        sentence: `Dropped ${value.removed.length} duplicate${value.removed.length === 1 ? '' : 's'} and kept ${value.kept.length}.`,
        why: 'Near-duplicate windows crowd the ranker. Ask Astro keeps chunks distinct so a citation points at one place.',
        inputCount: input.length,
        outputCount: value.kept.length,
        durationMs,
        passages: value.kept,
        unit: input.length > 0 && input.some((passage) => passage.id.includes('#')) ? 'chunks' : 'docs',
        detail: {
          kind: 'clean',
          dropped: value.removed.slice(0, 3).map((item) => ({ title: item.passage.title, snippet: preview(item.passage.text), reason: item.reason })),
          kept: value.kept.slice(0, 2).map((passage) => ({ title: passage.title, source: passage.source, snippet: preview(passage.text) })),
        },
      },
    };
  }

  if (node.kind === 'filter') {
    const settings = node.settings;
    const { value, durationMs } = clock(() => {
      const kept: ReasonExample[] = [];
      const dropped: ReasonExample[] = [];
      const passages: Passage[] = [];
      for (const passage of input) {
        if (!allowedKind(settings, passage.kind)) {
          dropped.push({ title: passage.title, snippet: preview(passage.text), reason: `Source “${passage.kind}” is switched off.` });
          continue;
        }
        if (settings.tag !== 'any' && !passage.tags.includes(settings.tag)) {
          dropped.push({ title: passage.title, snippet: preview(passage.text), reason: `Tag is ${passage.tags.join(', ') || 'none'}, not ${settings.tag}.` });
          continue;
        }
        passages.push(passage);
        kept.push({ title: passage.title, snippet: preview(passage.text), reason: `Kept: ${passage.kind}${settings.tag === 'any' ? '' : `, tag ${settings.tag}`}.` });
      }
      return { passages, kept, dropped };
    });
    return {
      step: {
        id: node.id,
        kind: node.kind,
        state: 'success',
        badge: `kept ${value.passages.length}`,
        sentence: `Kept ${value.passages.length} of ${input.length}. Dropped ${value.dropped.length}.`,
        why: 'A filter is a WHERE clause on the corpus. Turn off the primer and a question about Weaviate has nothing left to quote.',
        inputCount: input.length,
        outputCount: value.passages.length,
        durationMs,
        passages: value.passages,
        unit: input.some((passage) => passage.id.includes('#')) ? 'chunks' : 'docs',
        detail: { kind: 'filter', kept: value.kept.slice(0, 3), dropped: value.dropped.slice(0, 3) },
      },
    };
  }

  if (node.kind === 'score') {
    const settings = node.settings;
    const { value, durationMs } = clock(() => buildIndex(input, settings.useTitle));
    return {
      step: {
        id: node.id,
        kind: node.kind,
        state: 'success',
        badge: `${settings.method} · top ${settings.topK}`,
        sentence: `Ranked ${input.length} passages with ${settings.method}. The index still holds all of them. Top ${settings.topK} are what a question will show.`,
        why: settings.method === 'bm25'
          ? 'BM25 is the stand-in for Ask Astro’s vector search: rare words count more, and a long passage is discounted. Ask Astro then reranks. This page stops at the score.'
          : 'A keyword count ignores length. It is here so you can see it disagree with BM25 when both scorers run.',
        inputCount: input.length,
        outputCount: input.length,
        durationMs,
        passages: input,
        unit: input.some((passage) => passage.id.includes('#')) ? 'chunks' : 'docs',
        scoring: { ...settings },
        detail: { kind: 'score', method: settings.method, topK: settings.topK, passageCount: input.length },
      },
    };
  }

  const { value, durationMs } = clock(() => buildIndex(input, true));
  const top = [...value.df.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6);
  const postings: Posting[] = top.slice(0, 4).map(([term]) => ({
    term,
    ids: input.filter((passage) => tokenize(`${passage.title} ${passage.text}`).includes(term)).slice(0, 4).map((passage) => passage.id),
  }));
  return {
    step: {
      id: node.id,
      kind: 'index',
      state: 'success',
      badge: `${value.df.size} terms`,
      sentence: `Froze ${input.length} passages and ${value.df.size} terms in this browser.`,
      why: 'This is the page’s Weaviate. Ask Astro stores a vector per chunk. This index stores which terms occur in which passages, and the question box reads it.',
      inputCount: input.length,
      outputCount: input.length,
      durationMs,
      passages: input,
      unit: input.some((passage) => passage.id.includes('#')) ? 'chunks' : 'docs',
      detail: {
        kind: 'index',
        termCount: value.df.size,
        topTerms: top.map(([term, count]) => ({ term, count })),
        postings,
      },
    },
  };
}

/**
 * Run the DAG. Tasks in one wave start together.
 * The durations are real compute time. The wave is what the timeline draws as overlap.
 */
export function runGraph(graph: NotebookGraph): DagRun {
  const issues = validateGraph(graph).filter((issue) => issue.level === 'error');
  if (issues.length > 0) return { ok: false, issues };

  const live = runnableIds(graph);
  const levels = waves(graph, live);
  const steps: StepResult[] = [];
  const done = new Map<string, StepResult>();

  for (const node of graph.nodes) {
    if (!live.has(node.id)) {
      const step = skippedStep(node, 'Not on a path from an extract to an index.');
      steps.push(step);
      done.set(node.id, step);
    }
  }

  for (const level of levels) {
    for (const id of level) {
      const node = graph.nodes.find((item) => item.id === id);
      if (!node) continue;
      const incoming = graph.edges.filter((edge) => edge.target === id);
      const upstream = incoming.map((edge) => done.get(edge.source)?.passages ?? []);
      const input = node.kind === 'extract' ? [] : mergePassages(upstream);
      const { step } = executeNode(node, input);
      steps.push(step);
      done.set(id, step);
    }
  }

  const indexSteps = steps.filter((step) => step.kind === 'index' && step.state === 'success');
  const passages = mergePassages(indexSteps.map((step) => step.passages));
  const scorers = steps
    .filter((step) => step.kind === 'score' && step.state === 'success' && step.scoring)
    .map((step) => ({ id: step.id, settings: step.scoring as ScoreSettings }));
  const chunk = graph.nodes.find((node) => node.kind === 'chunk' && live.has(node.id));
  const size = chunk && chunk.kind === 'chunk' ? `${chunk.settings.size} char chunks` : 'no chunk task';
  const methods = scorers.map((scorer) => scorer.settings.method).join('+') || 'bm25';

  const endAt = new Map<string, number>();
  const timeline: TimelineBar[] = [];
  levels.forEach((level, levelIndex) => {
    const start = level.reduce((max, id) => {
      const preds = graph.edges.filter((edge) => edge.target === id).map((edge) => endAt.get(edge.source) ?? 0);
      return Math.max(max, ...preds, 0);
    }, 0);
    for (const id of level) {
      const step = done.get(id);
      const durationMs = step?.durationMs ?? 0;
      timeline.push({ id, kind: step?.kind ?? 'index', level: levelIndex, startMs: start, durationMs });
      endAt.set(id, start + durationMs);
    }
  });

  const totalMs = steps.reduce((sum, step) => sum + step.durationMs, 0);
  return { ok: true, steps, levels, timeline, passages, scorers, label: `${size} · ${methods}`, totalMs };
}
