/**
 * Search and DAG replay for the "Ask the notebook" project.
 *
 * Ask Astro (Astronomer's open-source assistant) uses Airflow DAGs to
 * fetch documents, split them, embed the chunks, and load Weaviate.
 * A separate API then retrieves those chunks and asks a model to write.
 *
 * This file is a small, honest stand-in that runs in the browser:
 *
 *   extract → split → score terms → write an index
 *   then BM25 retrieval, and sentences copied from the winning passages
 *
 * There is no embedding model and no generated prose. The score step
 * counts words. BM25 is a classic ranking formula (term frequency,
 * inverted document frequency, and a penalty for long passages).
 * The React file next to this one only draws.
 *
 * Re-run the rules without a browser:
 *   node --experimental-strip-types scripts/check-notebook.ts
 */

export type Passage = {
  id: string;
  title: string;
  /** A path on this site, or a full https URL. */
  href: string;
  /** One line under the title, so the source is obvious. */
  source: string;
  text: string;
  /** True when the visitor pressed "Keep this answer" in this tab. */
  kept?: boolean;
};

export type TaskId =
  | 'extract_notes'
  | 'extract_projects'
  | 'extract_primer'
  | 'split_chunks'
  | 'score_terms'
  | 'write_index';

export type TaskStatus = 'waiting' | 'running' | 'success';

export type Task = {
  id: TaskId;
  /** Airflow-style task_id, shown in the graph. */
  taskId: string;
  /** Plain-language name under the task_id. */
  title: string;
  /** Which row of the graph this task sits on. */
  group: 'extract' | 'split' | 'score' | 'index';
  upstream: readonly TaskId[];
  /** Log lines revealed while the task is running. A script, not a worker. */
  logs: readonly string[];
};

export type LogLine = {
  taskId: TaskId;
  text: string;
};

export type Frame = {
  status: Record<TaskId, TaskStatus>;
  lines: readonly LogLine[];
};

/**
 * The index shipped with the page.
 *
 * Each passage is short on purpose. BM25 works better on a focused
 * paragraph than on a whole article, and a cited sentence stays checkable.
 * The primer passages are paraphrases of public docs, not new claims
 * about anyone's job. The note and project passages follow those pages.
 */
export const PASSAGES: readonly Passage[] = [
  {
    id: 'rag-plain',
    title: 'Retrieval, then writing',
    href: 'https://proceedings.neurips.cc/paper/2020/hash/6b493230205f780e1bc26945df7481e5-Abstract.html',
    source: 'Primer · Lewis et al., NeurIPS 2020',
    text: 'Retrieval-augmented generation, RAG, searches a set of documents before a language model writes. The documents are the grounding, and the reply can cite them. Lewis and colleagues described that pattern in a 2020 NeurIPS paper. Ask Astro is one public RAG application, aimed at questions about Apache Airflow.',
  },
  {
    id: 'ask-astro-what',
    title: 'What Ask Astro is',
    href: 'https://github.com/astronomer/ask-astro',
    source: 'Primer · Ask Astro repository',
    text: 'Ask Astro is an open-source question-answering application built by Astronomer. It answers questions about Apache Airflow and Astronomer. The repository calls it a reference implementation of Andreessen Horowitz\'s LLM application architecture. The parts are Airflow DAGs that retrieve and embed documents, an API that turns a prompt into a reply, feedback DAGs, a Slack bot, and a web UI.',
  },
  {
    id: 'ingest-steps',
    title: 'Ingest, chunk, embed, load',
    href: 'https://github.com/astronomer/ask-astro/blob/main/airflow/dags/ingestion/ask-astro-load.py',
    source: 'Primer · Ask Astro repository',
    text: 'Ask Astro uses Airflow DAGs to ingest a source, split the text into chunks, embed those chunks, and write the vectors to Weaviate. LangChain splitters handle Markdown, reStructuredText, and Python. OpenAI\'s embedding model produces each vector. The DAG ask-astro-load-bulk saves the extracted documents as parquet on its first run, so a later run can try a new chunk size or a new vector database without downloading every source again.',
  },
  {
    id: 'sources-list',
    title: 'Ingest sources',
    href: 'https://github.com/astronomer/ask-astro',
    source: 'Primer · Ask Astro README',
    text: 'The Ask Astro README lists the ingest sources as the Apache Airflow docs, Astronomer docs, the Astronomer blog, the Astronomer Registry, Apache Airflow GitHub pull requests, OpenLineage GitHub, OpenLineage docs, and the Stack Overflow data dump. A source usually has its own DAG, and the bulk load can run them together.',
  },
  {
    id: 'query-chain',
    title: 'What happens at question time',
    href: 'https://github.com/astronomer/ask-astro',
    source: 'Primer · Ask Astro README',
    text: 'At question time Ask Astro does not search with the raw sentence alone. A model writes two differently worded versions of the prompt. The original and those two are embedded, and Weaviate returns up to 100 documents for each. A Cohere reranker keeps 8 documents from that pool of up to 300. A gpt-3.5-turbo check drops documents that are not relevant. The README says the final answer is a gpt-4o call over the question plus the remaining sources.',
  },
  {
    id: 'feedback-loop',
    title: 'Answers that get written back',
    href: 'https://www.astronomer.io/blog/ask-astro-open-source-llm-application-apache-airflow/',
    source: 'Primer · Ask Astro introduction',
    text: 'Feedback DAGs take two ratings. A person can mark an answer correct or incorrect. A model scores helpfulness, publicness, and on-topicness. If the person says the answer is correct and the model calls it helpful, public, and on topic, Ask Astro writes that question and answer back into Weaviate. A later prompt can retrieve the pair as a source. The README also says a good example can be shown on the Ask Astro homepage.',
  },
  {
    id: 'airflow-dag',
    title: 'What the DAG is for',
    href: 'https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dags.html',
    source: 'Primer · Airflow docs, DAGs',
    text: 'A DAG in Apache Airflow is a directed acyclic graph of tasks. An edge means the downstream task waits until the upstream task has succeeded. In Ask Astro the scheduler runs ingest and feedback. The question-answering API is a separate service. Airflow does not invent the sentence a visitor reads. It delivers documents to the database that sentence is grounded on.',
  },
  {
    id: 'common-ai',
    title: 'A model call as an Airflow task',
    href: 'https://airflow.apache.org/docs/apache-airflow-providers-common-ai/stable/operators/llm.html',
    source: 'Primer · Common AI provider docs',
    text: 'The provider apache-airflow-providers-common-ai adds LLMOperator and the task.llm decorator. The decorated function returns a prompt, and the task sends that prompt through a connection to a model vendor. The provider documentation says it needs Airflow 2.11 or newer, and some extras, including skills, need Airflow 3. This is a different pattern from Ask Astro\'s ingest DAGs. Here the model call itself is the task, with a log and retries.',
  },
  {
    id: 'this-page',
    title: 'How this page answers',
    href: '/projects/ask-the-notebook#how-i-built-it',
    source: 'This page',
    text: 'This page answers with BM25 in the browser. It scores the question, copies sentences from the winning passages, and names each source. There is no language model. The animated graph is a replay, and pressing Run fetches nothing. Keep this answer remembers a pair only until the tab is refreshed.',
  },
  {
    id: 'attention-note',
    title: 'Notes on attention',
    href: '/learning/sample-attention-notes',
    source: 'Learning log · sample note',
    text: 'The learning note on attention says attention is a weighted sum. Each output is a mix of the values, and the weights come from how well a query matches each key. The core step is often written as softmax of Q times K transpose, divided by the square root of d, times V. The note is marked sample. It shows the format of a learning-log post.',
  },
  {
    id: 'arm-note',
    title: 'Planar robot arms',
    href: '/learning/sample-planar-robot-arms',
    source: 'Learning log · sample note',
    text: 'A two-link arm lives on a flat plane and can reach a ring of points. Inside the inner ring it cannot fold tightly enough. Outside the outer ring it cannot stretch far enough. Forward kinematics turns joint angles into a hand position. Inverse kinematics names a point and solves for the angles. The learning note on planar robot arms is a sample, and it points at the two-link arm project.',
  },
  {
    id: 'see-think',
    title: 'See, think, move',
    href: '/projects/see-think-move',
    source: 'Projects',
    text: 'See, think, move is a toy picture of a vision-language-action loop. A real model of that kind takes a camera image and a sentence and returns a short burst of motion. The widget on that page is not trained and makes no server call. It shows the blocks, a sentence of what to do next, and a path that starts noisy and is pulled toward a clean curve.',
  },
  {
    id: 'sample-arm-project',
    title: 'Two-link robot arm',
    href: '/projects/sample-two-link-arm',
    source: 'Projects · sample',
    text: 'The sample project Two-link robot arm is the pattern for a project page on this site. The words are Markdown. The sliders are a React island loaded with client:load. The project status is sample, so the page shows a placeholder banner. The planar robot arms note points at the same demo.',
  },
  {
    id: 'dataswarm',
    title: 'Airflow-style orchestration',
    href: '/about',
    source: 'About · skills',
    text: 'The About page lists Airflow-style orchestration (Meta Dataswarm) under cloud and platforms. That line is why this demo is drawn as tasks with dependencies. This site is not a Dataswarm deployment.',
  },
];

/** Questions shown as chips. Each one has a passage that can answer it. */
export const SUGGESTIONS: readonly string[] = [
  'What is Ask Astro?',
  'Where do the vectors go?',
  'What does feedback write back?',
  'What is attention?',
  'How far can a two-link arm reach?',
  'How does this page answer?',
];

export const TASKS: readonly Task[] = [
  {
    id: 'extract_notes',
    taskId: 'extract_notes',
    title: 'Learning log',
    group: 'extract',
    upstream: [],
    logs: [
      'read src/content/learning/sample-attention-notes.md',
      'read src/content/learning/sample-planar-robot-arms.md',
    ],
  },
  {
    id: 'extract_projects',
    taskId: 'extract_projects',
    title: 'Project pages',
    group: 'extract',
    upstream: [],
    logs: [
      'read src/content/projects/see-think-move.mdx',
      'read src/content/projects/sample-two-link-arm.mdx',
    ],
  },
  {
    id: 'extract_primer',
    taskId: 'extract_primer',
    title: 'Ask Astro primer',
    group: 'extract',
    upstream: [],
    logs: ['read the primer on RAG, Ask Astro, and Airflow'],
  },
  {
    id: 'split_chunks',
    taskId: 'split_chunks',
    title: 'One idea per passage',
    group: 'split',
    upstream: ['extract_notes', 'extract_projects', 'extract_primer'],
    logs: [
      'split on headings, the way a text splitter would',
      `kept ${PASSAGES.length} short passages, each easy to cite`,
    ],
  },
  {
    id: 'score_terms',
    taskId: 'score_terms',
    title: 'Term weights, not vectors',
    group: 'score',
    upstream: ['split_chunks'],
    logs: [
      'count words for BM25',
      'Ask Astro would call an embedding model here',
    ],
  },
  {
    id: 'write_index',
    taskId: 'write_index',
    title: 'Bundle into the page',
    group: 'index',
    upstream: ['score_terms'],
    logs: [
      'the passages ship inside this page\'s JavaScript',
      'Ask Astro would upsert vectors into Weaviate',
    ],
  },
];

export const GROUPS: readonly { id: Task['group']; label: string; taskIds: readonly TaskId[] }[] = [
  {
    id: 'extract',
    label: 'These three run together',
    taskIds: ['extract_notes', 'extract_projects', 'extract_primer'],
  },
  { id: 'split', label: 'Then, after all three succeed', taskIds: ['split_chunks'] },
  { id: 'score', label: 'Then', taskIds: ['score_terms'] },
  { id: 'index', label: 'Then', taskIds: ['write_index'] },
];

const STOP = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'of', 'to', 'and', 'or', 'for', 'in', 'on',
  'with', 'what', 'how', 'does', 'do', 'did', 'this', 'that', 'it', 'its', 'be', 'by', 'as',
  'at', 'from', 'into', 'about', 'if', 'you', 'your', 'we', 'can', 'not', 'no', 'where',
  'when', 'who', 'which', 'go', 'than', 'then', 'so', 'but',
]);

/** BM25 knobs. k1 saturates repeated words. b penalizes long passages. */
const K1 = 1.2;
const B = 0.75;

/**
 * Extra hits for each word in the title. The title is the passage's name,
 * so a question that echoes it should beat a longer passage that only
 * mentions the words in passing. Those extra hits do not increase the
 * length penalty.
 */
const TITLE_HITS = 4;

/**
 * A top passage below this score is not quoted.
 * High enough that "bake a cake" stays silent, low enough that a real
 * question about one passage still quotes it. scripts/check-notebook.ts
 * locks both sides.
 */
export const QUOTE_MIN = 1.15;

export type Hit = {
  passage: Passage;
  score: number;
  /** Query terms that actually occur in the passage. */
  matched: string[];
};

export type Quote = {
  text: string;
  passageId: string;
};

export type Reply = {
  query: string;
  hits: Hit[];
  quotes: Quote[];
  confident: boolean;
};

type BuiltIndex = {
  passages: readonly Passage[];
  /** Term counts per passage, in the same order. */
  freqs: Map<string, number>[];
  lengths: number[];
  df: Map<string, number>;
  avgLen: number;
};

/**
 * Lowercase words. Digits stay, so "4o" from gpt-4o survives.
 * A trailing s is dropped on longer words so "writes" matches "write"
 * and "vectors" matches "vector". This is not a real stemmer.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOP.has(word))
    .map(softenPlural);
}

function softenPlural(word: string): string {
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function buildIndex(passages: readonly Passage[]): BuiltIndex {
  const freqs: Map<string, number>[] = [];
  const lengths: number[] = [];
  const df = new Map<string, number>();

  for (const passage of passages) {
    const counts = new Map<string, number>();
    const words = tokenize(passage.text);
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
    // Title words count, but the length stays the body length.
    for (const word of tokenize(passage.title)) counts.set(word, (counts.get(word) ?? 0) + TITLE_HITS);
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

function scorePassage(index: BuiltIndex, position: number, queryTerms: readonly string[]): number {
  const counts = index.freqs[position];
  const length = index.lengths[position];
  const total = index.passages.length;
  let score = 0;

  for (const term of queryTerms) {
    const freq = counts.get(term) ?? 0;
    if (freq === 0) continue;
    const docFreq = index.df.get(term) ?? 0;
    const weight = idf(total, docFreq);
    const denom = freq + K1 * (1 - B + B * (length / index.avgLen));
    score += weight * ((freq * (K1 + 1)) / denom);
  }

  return score;
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function sentenceScore(sentence: string, queryTerms: readonly string[], weights: Map<string, number>): number {
  const seen = new Set(tokenize(sentence));
  let score = 0;
  for (const term of queryTerms) {
    if (seen.has(term)) score += weights.get(term) ?? 0;
  }
  return score;
}

/**
 * Rank passages for a question and, when the top score is strong enough,
 * copy one or two sentences out of them. The sentences are not rewritten.
 */
export function reply(query: string, passages: readonly Passage[] = PASSAGES): Reply {
  const trimmed = query.trim();
  const queryTerms = [...new Set(tokenize(trimmed))];
  if (trimmed.length === 0 || queryTerms.length === 0) {
    return { query: trimmed, hits: [], quotes: [], confident: false };
  }

  const index = buildIndex(passages);
  const weights = new Map(queryTerms.map((term) => [term, idf(passages.length, index.df.get(term) ?? 0)]));

  const ranked = passages
    .map((passage, position) => {
      const matched = queryTerms.filter((term) => index.freqs[position].has(term));
      return { passage, score: scorePassage(index, position, queryTerms), matched };
    })
    .filter((hit) => hit.score > 0 && hit.matched.length > 0)
    .sort((a, b) => b.score - a.score || a.passage.id.localeCompare(b.passage.id));

  const hits = ranked.slice(0, 3);
  const confident = hits.length > 0 && hits[0].score >= QUOTE_MIN;
  if (!confident) return { query: trimmed, hits, quotes: [], confident: false };

  const quotes: Quote[] = [];
  const covered = new Set<string>();
  const topScore = hits[0].score;

  for (const hit of hits.slice(0, 2)) {
    // A second passage has to be nearly as strong, or it drags in a side topic.
    if (quotes.length > 0 && hit.score < topScore * 0.75) continue;

    let bestText = '';
    let best = 0;
    let bestNew = 0;
    for (const sentence of sentencesOf(hit.passage.text)) {
      const seen = new Set(tokenize(sentence));
      const score = sentenceScore(sentence, queryTerms, weights);
      const fresh = queryTerms.filter((term) => seen.has(term) && !covered.has(term)).length;
      if (score > best || (score === best && fresh > bestNew)) {
        best = score;
        bestNew = fresh;
        bestText = sentence;
      }
    }
    // A second sentence has to add a query term the first one missed.
    if (!bestText || best === 0) continue;
    if (quotes.length > 0 && bestNew === 0) continue;
    quotes.push({ text: bestText, passageId: hit.passage.id });
    for (const term of tokenize(bestText)) {
      if (queryTerms.includes(term)) covered.add(term);
    }
  }

  return { query: trimmed, hits, quotes, confident: quotes.length > 0 };
}

/** A passage built from a kept answer. It lives in memory until refresh. */
export function keptPassage(question: string, quotes: readonly Quote[], id: string): Passage {
  const answer = quotes.map((quote) => quote.text).join(' ');
  return {
    id,
    title: 'Kept in this tab',
    href: '/projects/ask-the-notebook#demo',
    source: 'This browser tab only',
    text: `Saved question: ${question} Saved answer: ${answer}`,
    kept: true,
  };
}

export function waitingStatus(): Record<TaskId, TaskStatus> {
  return {
    extract_notes: 'waiting',
    extract_projects: 'waiting',
    extract_primer: 'waiting',
    split_chunks: 'waiting',
    score_terms: 'waiting',
    write_index: 'waiting',
  };
}

/**
 * The replay, one frame per beat.
 *
 * Extracts share a frame because nothing is upstream of them, which is
 * the Airflow picture of parallel tasks. split_chunks cannot appear as
 * running until those three are success. The last frame is the whole
 * graph in success, with a closing log line.
 */
export function replayFrames(): Frame[] {
  const status = waitingStatus();
  const frames: Frame[] = [];
  const finished = new Set<TaskId>();

  while (finished.size < TASKS.length) {
    const ready = TASKS.filter(
      (task) => status[task.id] === 'waiting' && task.upstream.every((id) => finished.has(id)),
    );
    if (ready.length === 0) {
      throw new Error('notebook_load is stuck. An upstream task never succeeds.');
    }

    const running: Record<TaskId, TaskStatus> = { ...status };
    for (const task of ready) running[task.id] = 'running';
    frames.push({
      status: running,
      lines: ready.flatMap((task) => task.logs.map((text) => ({ taskId: task.id, text }))),
    });

    for (const task of ready) {
      status[task.id] = 'success';
      finished.add(task.id);
    }
  }

  frames.push({
    status: { ...status },
    lines: [{ taskId: 'write_index', text: 'index ready' }],
  });
  return frames;
}

export const REPLAY_FRAMES: readonly Frame[] = replayFrames();

export function taskById(id: TaskId): Task {
  const found = TASKS.find((task) => task.id === id);
  if (!found) throw new Error(`Unknown task ${id}`);
  return found;
}
