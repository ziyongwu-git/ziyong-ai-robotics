/**
 * Re-run the DAG and the search without a browser.
 *
 *   node --experimental-strip-types scripts/check-notebook.ts
 */
import {
  DOCUMENTS,
  KEYWORD_MIN,
  QUOTE_MIN,
  dualScoreGraph,
  makeEdge,
  notesGraph,
  parallelExtractGraph,
  reply,
  runGraph,
  tokenize,
  validateGraph,
} from '../src/components/demos/notebook.ts';

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) return;
  throw new Error(`${name} failed${detail ? `: ${detail}` : ''}`);
}

function mustRun(graph: ReturnType<typeof parallelExtractGraph>) {
  const result = runGraph(graph);
  if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join(' | '));
  return result;
}

const parallel = parallelExtractGraph();
check('parallel preset is valid', validateGraph(parallel).every((issue) => issue.level !== 'error'));
const ran = mustRun(parallel);
check(
  'three extracts share the first wave',
  ran.levels[0]?.length === 3 && ran.levels[0].every((id) => id.startsWith('ex-')),
  ran.levels[0]?.join(','),
);
const extractSteps = ran.steps.filter((step) => step.kind === 'extract' && step.state === 'success');
const docs = extractSteps.reduce((sum, step) => sum + step.outputCount, 0);
check('parallel extracts cover every document', docs === DOCUMENTS.length, String(docs));
const chunk = ran.steps.find((step) => step.kind === 'chunk');
check('chunk has a histogram and examples', chunk?.detail.kind === 'chunk' && chunk.detail.histogram.some((bar) => bar.count > 0) && chunk.detail.examples.length > 0);
check('chunk badge counts chunks', /^\d+ chunks$/.test(chunk?.badge ?? ''), chunk?.badge);
const clean = ran.steps.find((step) => step.kind === 'clean');
check('clean reports a removal count', clean?.state === 'success' && /removed/.test(clean.badge));
const index = ran.steps.find((step) => step.kind === 'index');
check('index lists postings', index?.detail.kind === 'index' && index.detail.postings.length > 0 && index.detail.termCount > 0);

const answer = reply('What is Ask Astro?', ran.passages, ran.scorers[0]?.settings);
check('Ask Astro is quoted', answer.confident && /astronomer/i.test(answer.quotes.map((quote) => quote.text).join(' ')));
const vectors = reply('Where do the vectors go?', ran.passages, ran.scorers[0]?.settings);
check('vectors quote Weaviate', /weaviate/i.test(vectors.quotes.map((quote) => quote.text).join(' ')));
const cake = reply('bake a cake', ran.passages, ran.scorers[0]?.settings);
check('an unknown question is not quoted', !cake.confident);

const notes = mustRun(notesGraph());
const hidden = reply('Where do the vectors go?', notes.passages, notes.scorers[0]?.settings);
check('notes only does not quote Weaviate', !/weaviate/i.test(hidden.quotes.map((quote) => quote.text).join(' ')));

const dual = mustRun(dualScoreGraph());
check('two scorers run in one wave', dual.levels.some((level) => level.includes('score-bm25') && level.includes('score-keyword')));
const bm = dual.steps.find((step) => step.id === 'score-bm25');
const kw = dual.steps.find((step) => step.id === 'score-keyword');
const bmHits = reply('Where do the vectors go?', bm?.passages ?? [], bm?.scoring);
const kwHits = reply('Where do the vectors go?', kw?.passages ?? [], kw?.scoring);
check('both scorers return a hit', (bmHits.hits[0]?.score ?? 0) > 0 && (kwHits.hits[0]?.score ?? 0) > 0);
check('the two scores are not the same scale by accident', bmHits.hits[0]?.score !== kwHits.hits[0]?.score);

const cycled = {
  nodes: parallel.nodes,
  edges: [...parallel.edges, makeEdge('index-1', 'chunk-1')],
};
const cycleIssue = validateGraph(cycled).find((issue) => /cycle/i.test(issue.message));
check('a cycle is refused and names the nodes', Boolean(cycleIssue && cycleIssue.nodeIds.length > 1));

const dangling = { nodes: parallel.nodes, edges: parallel.edges.filter((edge) => edge.target !== 'chunk-1') };
check('a chunk with no input is an error', validateGraph(dangling).some((issue) => issue.level === 'error' && /chunk/i.test(issue.message)));

const tiny = {
  nodes: parallel.nodes.map((node) => (node.kind === 'chunk' ? { ...node, settings: { size: 140, overlap: 20 } } : node)),
  edges: parallel.edges,
};
const tinyRun = mustRun(tiny);
check('a shorter window changes the chunk count', (tinyRun.steps.find((step) => step.kind === 'chunk')?.outputCount ?? 0) > (chunk?.outputCount ?? 0));

check('quote thresholds stay put', QUOTE_MIN === 1.15 && KEYWORD_MIN === 0.9);
check('tokens keep 4o', tokenize('gpt-4o writes').join(',') === 'gpt,4o,write');
check('timeline bars in one wave share a start', ran.timeline.filter((bar) => bar.level === 0).every((bar, _, all) => bar.startMs === all[0]?.startMs));

console.log(`notebook checks passed (${DOCUMENTS.length} docs, parallel index ${ran.passages.length} passages)`);
