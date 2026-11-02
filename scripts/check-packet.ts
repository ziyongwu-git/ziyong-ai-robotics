/**
 * Re-run the packet rules without a browser.
 *
 *   node --experimental-strip-types scripts/check-packet.ts
 *
 * The widget on the note and on /projects/follow-the-packet draws this file.
 */
import {
  CLINICS,
  DEFAULT_DESCRIPTION,
  PRESETS,
  buildHops,
  matchClinics,
  parseQuestion,
  renderAnswer,
  routeQuestion,
} from '../src/components/demos/packet.ts';

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) return;
  throw new Error(`${name} failed${detail ? `: ${detail}` : ''}`);
}

const seattle = parseQuestion(PRESETS[0]);
check('seattle is pediatrics', seattle.specialty === 'pediatrics' && seattle.city === 'Seattle', JSON.stringify(seattle));
const seattleHits = matchClinics(seattle);
check('one seattle pediatric clinic', seattleHits.length === 1 && seattleHits[0].clinician === 'Amira Solano');
check('answer quotes the directory', renderAnswer(seattle, seattleHits).includes('Harbor & Pine Pediatrics'));
check('answer does not invent', !renderAnswer(seattle, seattleHits).includes('Coffey'));

const empty = parseQuestion('A cardiologist in Tucson?');
check('tucson cardiology is understood', empty.understood && empty.specialty === 'cardiology' && empty.city === 'Tucson');
check('tucson cardiology misses', matchClinics(empty).length === 0);
check('empty answer refuses to invent', /no clinic/i.test(renderAnswer(empty, [])));

const madison = parseQuestion('A dermatologist in Madison?');
check('madison dermatology', matchClinics(madison).length === 1 && matchClinics(madison)[0].name.startsWith('Lake Effect'));

const vague = parseQuestion('What does my plan cover?');
check('plan question is not a clinic lookup', !vague.understood);

const both = parseQuestion('pediatrician or dermatologist in Seattle');
check('the word or is not the state Oregon', both.state === 'WA' && both.city === 'Seattle');

const oregon = parseQuestion('a pediatrician in Oregon');
check('oregon is a state lookup', oregon.state === 'OR' && oregon.city === null && oregon.specialty === 'pediatrics');
check('oregon pediatric clinic is Willamette', matchClinics(oregon).some((clinic) => clinic.city === 'Portland'));

const hops = buildHops(PRESETS[0], DEFAULT_DESCRIPTION, false);
check('blocking path has ten hops', hops.length === 10, String(hops.length));
const send = hops.find((hop) => hop.id === 'send');
check('blocking method is SendMessage', JSON.stringify(send?.body).includes('"SendMessage"'));
check('blocking method is not the old name', !JSON.stringify(send?.body).includes('message/send'));
const done = hops.find((hop) => hop.id === 'completed');
check('blocking result is completed', JSON.stringify(done?.body).includes('TASK_STATE_COMPLETED'));
check('artifact has text and no kind tag', JSON.stringify(done?.body).includes('"text"') && !JSON.stringify(done?.body).includes('"kind"'));
const mcp = hops.find((hop) => hop.id === 'mcp');
check('mcp method is tools/call', JSON.stringify(mcp?.body).includes('"tools/call"'));
const tool = hops.find((hop) => hop.id === 'tool-result');
check('mcp resultType is complete', JSON.stringify(tool?.body).includes('"resultType":"complete"'));
check('card path is named', hops[0].preface.includes('/.well-known/agent-card.json'));
check('version header is named', hops[1].preface.includes('A2A-Version: 1.0'));

const stream = buildHops(PRESETS[0], DEFAULT_DESCRIPTION, true);
check('streaming method', JSON.stringify(stream.find((hop) => hop.id === 'send')?.body).includes('SendStreamingMessage'));
check('streaming working is an event', String(stream.find((hop) => hop.id === 'working')?.preface).includes('Server-Sent'));
check(
  'streaming card advertises streaming',
  JSON.stringify(stream[0].body).includes('"streaming":true'),
);
check(
  'blocking card hides streaming',
  JSON.stringify(hops[0].body).includes('"streaming":false'),
);

const paused = buildHops('hello there', DEFAULT_DESCRIPTION, false);
check('unknown question pauses', paused.some((hop) => hop.id === 'input-required'));
check('unknown question does not call the tool', !paused.some((hop) => hop.id === 'mcp'));
check('paused state name', JSON.stringify(paused.at(-1)?.body).includes('TASK_STATE_INPUT_REQUIRED'));

const routed = routeQuestion(PRESETS[0], DEFAULT_DESCRIPTION);
check('default description routes to the finder', routed.winnerId === 'finder', routed.reason);
const vagueCard = routeQuestion(PRESETS[0], 'A helpful assistant.');
check('vague description routes nowhere', vagueCard.winnerId === null, vagueCard.reason);
const plan = routeQuestion('What does my plan cover?', DEFAULT_DESCRIPTION);
check('plan question routes to the plan reader', plan.winnerId === 'plan', plan.reason);
const stolen = routeQuestion('What does my plan cover?', 'Explains what a health plan covers for a caller.');
check('a rewritten card can steal a plan question', stolen.winnerId === 'finder', stolen.reason);

check('eight fictional clinics', CLINICS.length === 8);

console.log('packet checks passed');
