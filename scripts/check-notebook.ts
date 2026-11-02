/**
 * Re-run the notebook search and the DAG replay without a browser.
 *
 *   node --experimental-strip-types scripts/check-notebook.ts
 *
 * The widget on /projects/ask-the-notebook draws this same file.
 * If a question here lands on the wrong passage, the demo will too.
 */
import {
  PASSAGES,
  QUOTE_MIN,
  REPLAY_FRAMES,
  keptPassage,
  reply,
  replayFrames,
  tokenize,
} from '../src/components/demos/notebook.ts';

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) return;
  throw new Error(`${name} failed${detail ? `: ${detail}` : ''}`);
}

function top(query: string) {
  const result = reply(query);
  const id = result.hits[0]?.passage.id ?? '(none)';
  const quote = result.quotes.map((item) => item.text).join(' ');
  return { result, id, quote };
}

const astro = top('What is Ask Astro?');
check('Ask Astro lands on the definition', astro.id === 'ask-astro-what', astro.id);
check('Ask Astro is quoted', astro.result.confident && /astronomer/i.test(astro.quote), astro.quote);

const vectors = top('Where do the vectors go?');
check('vectors land on ingest', vectors.id === 'ingest-steps', vectors.id);
check('Weaviate is quoted', /weaviate/i.test(vectors.quote), vectors.quote);

const feedback = top('What does feedback write back?');
check('feedback lands on the feedback passage', feedback.id === 'feedback-loop', feedback.id);
check('write-back mentions Weaviate', /weaviate/i.test(feedback.quote), feedback.quote);

const attention = top('What is attention?');
check('attention lands on the note', attention.id === 'attention-note', attention.id);
check('attention quotes the weighted sum', /weighted sum/i.test(attention.quote), attention.quote);

const reach = top('How far can a two-link arm reach?');
check('reach lands on the arm note', reach.id === 'arm-note', reach.id);
check('reach quotes the ring', /ring/i.test(reach.quote), reach.quote);

const page = top('How does this page answer?');
check('this page lands on its own passage', page.id === 'this-page', page.id);
check('this page quotes BM25', /bm25/i.test(page.quote), page.quote);

const dag = top('What is a DAG in Airflow?');
check('DAG lands on the Airflow passage', dag.id === 'airflow-dag', dag.id);

const cohere = top('What does the Cohere reranker keep?');
check('Cohere lands on the query chain', cohere.id === 'query-chain', cohere.id);

const decorator = top('What is the task.llm decorator?');
check('task.llm lands on the provider passage', decorator.id === 'common-ai', decorator.id);

const sources = top('What sources does Ask Astro ingest?');
check('sources land on the source list', sources.id === 'sources-list', sources.id);
check('sources quote names a real source', /stack overflow/i.test(sources.quote), sources.quote);

const dataswarm = top('What is Dataswarm?');
check('Dataswarm lands on the skills passage', dataswarm.id === 'dataswarm', dataswarm.id);

const cake = reply('bake a cake');
check('an unknown question is not quoted', !cake.confident && cake.quotes.length === 0);

const blank = reply('   ');
check('a blank question does nothing', !blank.confident && blank.hits.length === 0);

const stops = reply('what is the');
check('a question with only stopwords does nothing', !stops.confident && stops.hits.length === 0);

const saved = keptPassage('How do I fold a xylophone-note?', [{ text: 'You do not.', passageId: 'x' }], 'saved-1');
const found = reply('xylophone-note', [...PASSAGES, saved]);
check('a kept answer is searchable in this tab', found.confident && found.hits[0]?.passage.id === 'saved-1', found.hits[0]?.passage.id);

const frames = replayFrames();
check('replay is stable', JSON.stringify(frames) === JSON.stringify(REPLAY_FRAMES));
check('first frame runs the three extracts', frames[0].status.extract_notes === 'running' && frames[0].status.extract_projects === 'running' && frames[0].status.extract_primer === 'running');
check('split waits for the extracts', frames[0].status.split_chunks === 'waiting');
check('split runs only once extracts succeeded', frames[1].status.extract_notes === 'success' && frames[1].status.split_chunks === 'running');
check('the last frame is all success', Object.values(frames[frames.length - 1].status).every((status) => status === 'success'));
check('score does not run before split succeeds', frames.every((frame) => frame.status.score_terms !== 'running' || frame.status.split_chunks === 'success'));
check('the quote threshold is the one the tests assume', QUOTE_MIN === 1.15);
check('tokens drop stopwords and keep 4o', tokenize('What is gpt-4o?').join(',') === 'gpt,4o');
check('a trailing s is softened', tokenize('writes vectors').join(',') === 'write,vector');

console.log(`notebook checks passed (${PASSAGES.length} passages, ${frames.length} frames)`);
