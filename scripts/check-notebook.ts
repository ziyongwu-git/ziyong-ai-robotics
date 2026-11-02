/**
 * Re-run the pipeline and the search without a browser.
 *
 *   node --experimental-strip-types scripts/check-notebook.ts
 *
 * The widget on /projects/ask-the-notebook draws this same file.
 * If a question here lands on the wrong passage, the demo will too.
 */
import {
  DOCUMENTS,
  KEYWORD_MIN,
  QUOTE_MIN,
  createTask,
  defaultPipeline,
  notesPipeline,
  reply,
  runPipeline,
  tinyPipeline,
  tokenize,
  validatePipeline,
  type PipelineTask,
} from '../src/components/demos/notebook.ts';

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) return;
  throw new Error(`${name} failed${detail ? `: ${detail}` : ''}`);
}

function mustRun(tasks: PipelineTask[]) {
  const result = runPipeline(tasks);
  if (!result.ok) throw new Error(`pipeline refused: ${result.reason}`);
  return result;
}

function ask(tasks: PipelineTask[], query: string) {
  const result = mustRun(tasks);
  const answer = reply(query, result.passages, result.scoring);
  const quote = answer.quotes.map((item) => item.text).join(' ');
  const top = answer.hits[0];
  return { result, answer, quote, top };
}

const standard = ask(defaultPipeline(), 'What is Ask Astro?');
check('Ask Astro is quoted', standard.answer.confident && /astronomer/i.test(standard.quote), standard.quote);
check('Ask Astro chunk comes from that document', standard.top?.passage.id.startsWith('doc-ask-astro') === true, standard.top?.passage.id);

const vectors = ask(defaultPipeline(), 'Where do the vectors go?');
check('vectors quote Weaviate', /weaviate/i.test(vectors.quote), vectors.quote);
check('vectors come from the ingest document', vectors.top?.passage.id.startsWith('doc-ingest') === true, vectors.top?.passage.id);

const attention = ask(defaultPipeline(), 'What is attention?');
check('attention quotes the weighted sum', /weighted sum/i.test(attention.quote), attention.quote);

const reach = ask(defaultPipeline(), 'How far can a two-link arm reach?');
check('reach quotes the ring', /ring/i.test(reach.quote), reach.quote);

const page = ask(defaultPipeline(), 'How does this page answer?');
check('this page quotes BM25', /bm25/i.test(page.quote), page.quote);

const cake = ask(defaultPipeline(), 'bake a cake');
check('an unknown question is not quoted', !cake.answer.confident && cake.answer.quotes.length === 0);

const blank = reply('   ', standard.result.passages, standard.result.scoring);
check('a blank question does nothing', !blank.confident && blank.hits.length === 0);

const notes = ask(notesPipeline(), 'Where do the vectors go?');
check('notes only does not quote Weaviate', !/weaviate/i.test(notes.quote), notes.quote);
const notesAttention = ask(notesPipeline(), 'What is attention?');
check('notes only still finds attention', /weighted sum/i.test(notesAttention.quote), notesAttention.quote);
check('notes only uses the keyword ranker', notes.result.scoring.method === 'keyword');

const small = ask(tinyPipeline(), 'Where do the vectors go?');
const wideChunk = createTask('chunk');
if (wideChunk.kind !== 'chunk') throw new Error('chunk');
wideChunk.settings = { size: 900, overlap: 0 };
const wide = ask([createTask('extract'), wideChunk, createTask('score'), createTask('index')], 'Where do the vectors go?');
check('tiny chunks are more numerous than one big window', small.result.passages.length > wide.result.passages.length);
check(
  'chunk size changes the retrieved text or its score',
  small.top?.passage.text !== wide.top?.passage.text || small.top?.score !== wide.top?.score,
  `${small.top?.score} vs ${wide.top?.score}`,
);
check('both chunk sizes still cite Weaviate', /weaviate/i.test(small.quote) && /weaviate/i.test(wide.quote));

const top1 = createTask('score');
if (top1.kind !== 'score') throw new Error('score');
top1.settings = { method: 'bm25', topK: 1, useTitle: true };
const onlyOne = ask([createTask('extract'), createTask('chunk'), top1, createTask('index')], 'What is Ask Astro?');
check('top-k 1 returns a single hit', onlyOne.answer.hits.length === 1, String(onlyOne.answer.hits.length));

const robotics = defaultPipeline().map((task) => {
  if (task.kind !== 'filter') return task;
  return { ...task, settings: { ...task.settings, tag: 'robotics' as const } };
});
const armOnly = ask(robotics, 'How far can a two-link arm reach?');
const hidden = ask(robotics, 'What is attention?');
check('a robotics filter still quotes the arm', /ring/i.test(armOnly.quote), armOnly.quote);
check('a robotics filter hides the attention note', !hidden.answer.confident);

const overlap = createTask('chunk');
const clean = createTask('clean');
if (overlap.kind !== 'chunk' || clean.kind !== 'clean') throw new Error('dedupe tasks');
overlap.settings = { size: 180, overlap: 150 };
clean.settings = { mode: 'similar' };
const messy = mustRun([createTask('extract'), overlap, createTask('index')]);
const tidied = mustRun([createTask('extract'), overlap, clean, createTask('index')]);
const removed = tidied.outputs.find((output) => output.kind === 'clean');
check('high overlap produces fewer chunks after clean', tidied.passages.length < messy.passages.length);
check('clean reports how many it removed', Boolean(removed && /removed [1-9]/.test(removed.summary)), removed?.summary);

const indexed = mustRun(defaultPipeline());
const indexOut = indexed.outputs.find((output) => output.kind === 'index');
const chunkOut = indexed.outputs.find((output) => output.kind === 'chunk');
const extractOut = indexed.outputs.find((output) => output.kind === 'extract');
check('extract names a doc count', /docs extracted/.test(extractOut?.summary ?? ''), extractOut?.summary);
check('chunk names an average length', /chunks, avg \d+ chars/.test(chunkOut?.summary ?? ''), chunkOut?.summary);
check('index names passages and terms', /index: \d+ passages, \d+ terms/.test(indexOut?.summary ?? ''), indexOut?.summary);
check('every task records a duration', indexed.outputs.every((output) => output.durationMs >= 0 && output.rows.length > 0));
check('sample rows are short', indexed.outputs.every((output) => output.rows.every((row) => row.detail.length < 200)));

check('chunk before extract is refused', /extract/i.test(validatePipeline([createTask('chunk'), createTask('extract'), createTask('index')]) ?? ''));
check('a missing index is refused', /index/i.test(validatePipeline([createTask('extract'), createTask('chunk')]) ?? ''));
check('the default pipeline is valid', validatePipeline(defaultPipeline()) === null);
check('an empty canvas is refused', validatePipeline([]) !== null);

const off = createTask('extract');
if (off.kind !== 'extract') throw new Error('extract');
off.settings = { notes: false, projects: false, primer: false };
check('extract with no sources is refused', /source/i.test(validatePipeline([off, createTask('index')]) ?? ''));

check('quote thresholds stay the ones the tests assume', QUOTE_MIN === 1.15 && KEYWORD_MIN === 0.9);
check('tokens keep 4o and soften a plural', tokenize('What is gpt-4o? writes').join(',') === 'gpt,4o,write');
check('the library has every source kind', ['notes', 'projects', 'primer'].every((kind) => DOCUMENTS.some((document) => document.kind === kind)));

console.log(
  `notebook checks passed (${DOCUMENTS.length} docs, default index ${indexed.passages.length} passages, ${indexed.termCount} terms)`,
);
