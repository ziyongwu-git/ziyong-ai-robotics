/**
 * Pipeline and search for the "Ask the notebook" project.
 *
 * Ask Astro loads documents with Airflow, then a separate API retrieves
 * them. This file is the browser version of that shape. A visitor builds
 * the DAG (extract, clean, chunk, filter, score, index). Running it really
 * does those steps on the documents below. Asking a question ranks the
 * chunks that run produced.
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

export type PipelineTask =
  | { id: string; kind: 'extract'; settings: ExtractSettings }
  | { id: string; kind: 'clean'; settings: CleanSettings }
  | { id: string; kind: 'chunk'; settings: ChunkSettings }
  | { id: string; kind: 'filter'; settings: FilterSettings }
  | { id: string; kind: 'score'; settings: ScoreSettings }
  | { id: string; kind: 'index'; settings: Record<string, never> };

export type SampleRow = { title: string; detail: string };

export type TaskOutput = {
  id: string;
  kind: TaskKind;
  summary: string;
  /** Real time spent in the step, not the animation delay. */
  durationMs: number;
  rows: SampleRow[];
};

export type RunResult =
  | {
      ok: true;
      outputs: TaskOutput[];
      passages: Passage[];
      scoring: ScoreSettings;
      termCount: number;
      totalMs: number;
      label: string;
    }
  | { ok: false; reason: string };

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
    href: '/projects/ask-the-notebook#how-i-built-it',
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
    text: 'A two-link arm lives on a flat plane and can reach a ring of points. Inside the inner ring it cannot fold tightly enough. Outside the outer ring it cannot stretch far enough. Forward kinematics turns joint angles into a hand position. Inverse kinematics names a point and solves for the angles. The learning note on planar robot arms is a sample, and it points at the two-link arm project, where the same idea is a slider instead of a paragraph.',
  },
  {
    id: 'doc-dataswarm',
    title: 'Airflow-style orchestration',
    href: '/about',
    source: 'About · skills',
    kind: 'notes',
    tags: ['data'],
    text: 'The About page lists Airflow-style orchestration (Meta Dataswarm) under cloud and platforms. That line is why this demo is a DAG of tasks and dependencies. This site is not a Dataswarm deployment, and it does not run the Ask Astro DAGs. The shared idea is the graph: a task waits for the tasks upstream of it, and a run leaves a log you can open.',
  },
  {
    id: 'doc-see',
    title: 'See, think, move',
    href: '/projects/see-think-move',
    source: 'Projects',
    kind: 'projects',
    tags: ['ai', 'robotics'],
    text: 'See, think, move is a toy picture of a vision-language-action loop. A real model of that kind takes a camera image and a sentence and returns a short burst of motion. The widget on that page is not trained and makes no server call. It shows the blocks, a sentence of what to do next, and a path that starts noisy and is pulled toward a clean curve. The rules live next to the drawing so they can be re-run without a browser.',
  },
  {
    id: 'doc-arm-project',
    title: 'Two-link robot arm',
    href: '/projects/sample-two-link-arm',
    source: 'Projects · sample',
    kind: 'projects',
    tags: ['robotics', 'data'],
    text: 'The sample project Two-link robot arm is the pattern for a project page on this site. The words are Markdown. The sliders are a React island loaded with client:load. The project status is sample, so the page shows a placeholder banner. The planar robot arms note points at the same demo. Moving a slider solves the joint angles for a point you pick.',
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
  { kind: 'extract', taskId: 'extract_sources', title: 'Extract', blurb: 'Notes, projects, primer' },
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

export function createTask(kind: TaskKind): PipelineTask {
  switch (kind) {
    case 'extract':
      return { id: 'extract', kind, settings: { notes: true, projects: true, primer: true } };
    case 'clean':
      return { id: 'clean', kind, settings: { mode: 'similar' } };
    case 'chunk':
      return { id: 'chunk', kind, settings: { size: 240, overlap: 40 } };
    case 'filter':
      return { id: 'filter', kind, settings: { notes: true, projects: true, primer: true, tag: 'any' } };
    case 'score':
      return { id: 'score', kind, settings: { method: 'bm25', topK: 3, useTitle: true } };
    case 'index':
      return { id: 'index', kind, settings: {} };
  }
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

export function describeSettings(task: PipelineTask): string {
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

/**
 * A reason the pipeline should not run, or null when it is runnable.
 * The messages are what the page shows. They name the fix.
 */
export function validatePipeline(tasks: readonly PipelineTask[]): string | null {
  if (tasks.length === 0) {
    return 'The canvas is empty. Add an extract task and an index task, or reset to the default pipeline.';
  }
  const kinds = tasks.map((task) => task.kind);
  if (new Set(kinds).size !== kinds.length) {
    return 'Each task can only appear once. Remove the extra copy.';
  }
  const at = (kind: TaskKind) => kinds.indexOf(kind);
  if (at('extract') === -1) {
    return 'Add an extract task. The later steps need documents to start from.';
  }
  if (at('index') === -1) {
    return 'Add an index task at the end. Without it there is nowhere to search.';
  }
  if (at('index') !== kinds.length - 1) {
    return 'Move the index task to the end. Steps after it never get searched.';
  }
  const names: Record<TaskKind, string> = {
    extract: 'Extract',
    clean: 'Clean',
    chunk: 'Chunk',
    filter: 'Filter',
    score: 'Score',
    index: 'Index',
  };
  for (const kind of ['clean', 'chunk', 'filter', 'score', 'index'] as const) {
    if (at(kind) !== -1 && at(kind) < at('extract')) {
      return `${names[kind]} is before extract. Move extract above it so there is text to work on.`;
    }
  }
  const extract = tasks.find((task) => task.kind === 'extract');
  if (extract && extract.kind === 'extract') {
    const { notes, projects, primer } = extract.settings;
    if (!notes && !projects && !primer) {
      return 'Extract has every source turned off. Turn on notes, projects, or the primer.';
    }
  }
  const filter = tasks.find((task) => task.kind === 'filter');
  if (filter && filter.kind === 'filter') {
    const { notes, projects, primer } = filter.settings;
    if (!notes && !projects && !primer) {
      return 'The filter keeps no sources. Turn at least one back on, or remove the filter.';
    }
  }
  const chunk = tasks.find((task) => task.kind === 'chunk');
  if (chunk && chunk.kind === 'chunk' && chunk.settings.overlap >= chunk.settings.size) {
    return 'Overlap has to be smaller than the chunk size. Otherwise the window never moves forward.';
  }
  return null;
}

export function moveTask(tasks: readonly PipelineTask[], id: string, direction: -1 | 1): PipelineTask[] {
  const index = tasks.findIndex((task) => task.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= tasks.length) return [...tasks];
  const copy = [...tasks];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
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

function chunkPassages(passages: readonly Passage[], settings: ChunkSettings): Passage[] {
  const chunks: Passage[] = [];
  for (const passage of passages) {
    const parts = windows(passage.text, settings.size, settings.overlap);
    parts.forEach((text, index) => {
      chunks.push({
        ...passage,
        id: parts.length === 1 ? passage.id : `${passage.id}#${index + 1}`,
        text,
      });
    });
  }
  return chunks;
}

function tokenOverlap(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0) return 0;
  const other = new Set(right);
  let hit = 0;
  for (const token of new Set(left)) if (other.has(token)) hit += 1;
  return hit / new Set(left).size;
}

function dedupe(passages: readonly Passage[], mode: CleanSettings['mode']): { kept: Passage[]; removed: Passage[] } {
  const kept: Passage[] = [];
  const removed: Passage[] = [];
  const seenExact = new Set<string>();
  for (const passage of passages) {
    const exact = passage.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seenExact.has(exact)) {
      removed.push(passage);
      continue;
    }
    if (mode === 'similar') {
      const tokens = tokenize(passage.text);
      const crowded = kept.some((earlier) => tokenOverlap(tokens, tokenize(earlier.text)) >= SIMILAR);
      if (crowded) {
        removed.push(passage);
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

function topTerms(passages: readonly Passage[], useTitle: boolean, limit = 5): SampleRow[] {
  const index = buildIndex(passages, useTitle);
  return [...index.df.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ title: term, detail: `in ${count} passage${count === 1 ? '' : 's'}` }));
}

function clock<T>(work: () => T): { value: T; durationMs: number } {
  const start = performance.now();
  const value = work();
  return { value, durationMs: performance.now() - start };
}

function runLabel(tasks: readonly PipelineTask[]): string {
  const chunk = tasks.find((task) => task.kind === 'chunk');
  const score = tasks.find((task) => task.kind === 'score');
  const size = chunk && chunk.kind === 'chunk' ? `${chunk.settings.size} char chunks` : 'no chunk task';
  const method = score && score.kind === 'score' ? score.settings.method : 'bm25';
  return `${size} · ${method}`;
}

/**
 * Run the tasks in canvas order. Each step's summary and sample rows
 * come from the documents it actually touched.
 */
export function runPipeline(tasks: readonly PipelineTask[]): RunResult {
  const reason = validatePipeline(tasks);
  if (reason) return { ok: false, reason };

  let passages: Passage[] = [];
  let scoring: ScoreSettings = { ...DEFAULT_SCORE };
  const outputs: TaskOutput[] = [];

  for (const task of tasks) {
    if (task.kind === 'extract') {
      const settings = task.settings;
      const { value, durationMs } = clock(() =>
        DOCUMENTS.filter((document) => allowedKind(settings, document.kind)).map(asPassage),
      );
      passages = value;
      const sources = (['notes', 'projects', 'primer'] as const).filter((key) => settings[key]).length;
      outputs.push({
        id: task.id,
        kind: task.kind,
        durationMs,
        summary: `${sources} source${sources === 1 ? '' : 's'}, ${passages.length} docs extracted`,
        rows: passages.slice(0, 4).map((passage) => ({
          title: passage.title,
          detail: `${passage.text.length} chars · ${passage.source}`,
        })),
      });
      continue;
    }

    if (task.kind === 'chunk') {
      const settings = task.settings;
      const { value, durationMs } = clock(() => chunkPassages(passages, settings));
      const avg = value.length === 0 ? 0 : Math.round(value.reduce((sum, passage) => sum + passage.text.length, 0) / value.length);
      passages = value;
      outputs.push({
        id: task.id,
        kind: task.kind,
        durationMs,
        summary: `${passages.length} chunks, avg ${avg} chars`,
        rows: passages.slice(0, 3).map((passage) => ({ title: passage.title, detail: preview(passage.text) })),
      });
      continue;
    }

    if (task.kind === 'clean') {
      const { value, durationMs } = clock(() => dedupe(passages, task.settings.mode));
      passages = value.kept;
      outputs.push({
        id: task.id,
        kind: task.kind,
        durationMs,
        summary: `removed ${value.removed.length} duplicate${value.removed.length === 1 ? '' : 's'}, ${passages.length} left`,
        rows: (value.removed.length > 0 ? value.removed : passages).slice(0, 3).map((passage) => ({
          title: value.removed.length > 0 ? `dropped · ${passage.title}` : passage.title,
          detail: preview(passage.text),
        })),
      });
      continue;
    }

    if (task.kind === 'filter') {
      const settings = task.settings;
      const before = passages.length;
      const { value, durationMs } = clock(() =>
        passages.filter((passage) => {
          if (!allowedKind(settings, passage.kind)) return false;
          if (settings.tag !== 'any' && !passage.tags.includes(settings.tag)) return false;
          return true;
        }),
      );
      passages = value;
      outputs.push({
        id: task.id,
        kind: task.kind,
        durationMs,
        summary: `kept ${passages.length} of ${before}`,
        rows: passages.slice(0, 3).map((passage) => ({
          title: passage.title,
          detail: `${passage.kind} · ${passage.tags.join(', ')}`,
        })),
      });
      continue;
    }

    if (task.kind === 'score') {
      scoring = { ...task.settings };
      const { value, durationMs } = clock(() => buildIndex(passages, scoring.useTitle));
      outputs.push({
        id: task.id,
        kind: task.kind,
        durationMs,
        summary: `${scoring.method}, top ${scoring.topK}, ${value.df.size} terms`,
        rows: topTerms(passages, scoring.useTitle),
      });
      continue;
    }

    const { value, durationMs } = clock(() => buildIndex(passages, scoring.useTitle));
    outputs.push({
      id: task.id,
      kind: task.kind,
      durationMs,
      summary: `index: ${passages.length} passages, ${value.df.size} terms`,
      rows: passages.slice(0, 4).map((passage) => ({ title: passage.id, detail: passage.title })),
    });
  }

  const termCount = buildIndex(passages, scoring.useTitle).df.size;
  const totalMs = outputs.reduce((sum, output) => sum + output.durationMs, 0);
  return { ok: true, outputs, passages, scoring, termCount, totalMs, label: runLabel(tasks) };
}
