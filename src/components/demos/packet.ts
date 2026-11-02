/**
 * Scripted clinic directory for the "Follow the packet" toy.
 *
 * Nothing here calls a model or a network. The same fictional clinics
 * are copied in examples/a2a-mcp-doctor-finder/clinics.py so the note
 * and the Python example tell one story. Names and cities are invented.
 */

export interface Clinic {
  name: string;
  clinician: string;
  specialty: string;
  city: string;
  state: string;
  accepting: boolean;
}

export const CLINICS: Clinic[] = [
  {
    name: 'Harbor & Pine Pediatrics',
    clinician: 'Amira Solano',
    specialty: 'pediatrics',
    city: 'Seattle',
    state: 'WA',
    accepting: true,
  },
  {
    name: 'Rainier Family Medicine',
    clinician: 'Jonah Peck',
    specialty: 'family medicine',
    city: 'Seattle',
    state: 'WA',
    accepting: true,
  },
  {
    name: 'Cedar Current Cardiology',
    clinician: 'Naomi Berg',
    specialty: 'cardiology',
    city: 'Tacoma',
    state: 'WA',
    accepting: true,
  },
  {
    name: 'Willamette Children\'s Clinic',
    clinician: 'Priya Raman',
    specialty: 'pediatrics',
    city: 'Portland',
    state: 'OR',
    accepting: false,
  },
  {
    name: 'Lake Effect Dermatology',
    clinician: 'Elena Voss',
    specialty: 'dermatology',
    city: 'Madison',
    state: 'WI',
    accepting: true,
  },
  {
    name: 'Mesa Sunrise Orthopedics',
    clinician: 'Luis Ortega',
    specialty: 'orthopedics',
    city: 'Tucson',
    state: 'AZ',
    accepting: true,
  },
  {
    name: 'Fremont Mind Clinic',
    clinician: 'Hana Ito',
    specialty: 'psychiatry',
    city: 'Seattle',
    state: 'WA',
    accepting: true,
  },
  {
    name: 'Bayou Hearing',
    clinician: 'Camille Broussard',
    specialty: 'audiology',
    city: 'Lafayette',
    state: 'LA',
    accepting: true,
  },
];

export const PRESETS = [
  'Is there a pediatrician in Seattle?',
  'A dermatologist in Madison?',
  'Family medicine in Seattle',
  'A cardiologist in Tucson?',
  'What does my plan cover?',
] as const;

export const DEFAULT_DESCRIPTION =
  'Finds a clinic by city and specialty, including a pediatrician or a dermatologist, and only reports names the directory returns.';

export const PLAN_DESCRIPTION =
  'Explains what a health plan covers, in plain language, from a document the caller provides.';

export const STUDY_DESCRIPTION =
  'Summarizes published studies on a condition or a treatment. It does not recommend a doctor.';

const SPECIALTY_PATTERNS: { id: string; pattern: RegExp }[] = [
  { id: 'pediatrics', pattern: /pediatric|paediatric|pediatrics/i },
  { id: 'family medicine', pattern: /family medicine|family doctor|general practice/i },
  { id: 'cardiology', pattern: /cardiolog|heart doctor/i },
  { id: 'dermatology', pattern: /dermatolog|skin doctor/i },
  { id: 'orthopedics', pattern: /orthoped/i },
  { id: 'psychiatry', pattern: /psychiatr/i },
  { id: 'audiology', pattern: /audiolog|hearing/i },
];

const CITY_PATTERNS: { city: string; state: string; pattern: RegExp }[] = [
  { city: 'Seattle', state: 'WA', pattern: /\bseattle\b/i },
  { city: 'Tacoma', state: 'WA', pattern: /\btacoma\b/i },
  { city: 'Portland', state: 'OR', pattern: /\bportland\b/i },
  { city: 'Madison', state: 'WI', pattern: /\bmadison\b/i },
  { city: 'Tucson', state: 'AZ', pattern: /\btucson\b/i },
  { city: 'Lafayette', state: 'LA', pattern: /\blafayette\b/i },
];

const STATE_PATTERNS: { state: string; name: RegExp; abbrev: RegExp }[] = [
  { state: 'WA', name: /\bwashington\b/i, abbrev: /\bWA\b/ },
  { state: 'OR', name: /\boregon\b/i, abbrev: /\bOR\b/ },
  { state: 'WI', name: /\bwisconsin\b/i, abbrev: /\bWI\b/ },
  { state: 'AZ', name: /\barizona\b/i, abbrev: /\bAZ\b/ },
  { state: 'LA', name: /\blouisiana\b/i, abbrev: /\bLA\b/ },
];

export interface ParsedQuestion {
  city: string | null;
  state: string | null;
  specialty: string | null;
  understood: boolean;
}

export function parseQuestion(text: string): ParsedQuestion {
  const cityHit = CITY_PATTERNS.find((item) => item.pattern.test(text));
  const specialtyHit = SPECIALTY_PATTERNS.find((item) => item.pattern.test(text));
  const stateHit = cityHit
    ? null
    : STATE_PATTERNS.find((item) => item.name.test(text) || item.abbrev.test(text));
  const city = cityHit?.city ?? null;
  const state = cityHit?.state ?? stateHit?.state ?? null;
  const specialty = specialtyHit?.id ?? null;
  return {
    city,
    state,
    specialty,
    understood: Boolean(city || state || specialty),
  };
}

export function matchClinics(parsed: ParsedQuestion): Clinic[] {
  if (!parsed.understood) return [];
  return CLINICS.filter((clinic) => {
    if (parsed.city && clinic.city !== parsed.city) return false;
    if (!parsed.city && parsed.state && clinic.state !== parsed.state) return false;
    if (parsed.specialty && clinic.specialty !== parsed.specialty) return false;
    return true;
  });
}

export function renderAnswer(parsed: ParsedQuestion, clinics: Clinic[]): string {
  if (!parsed.understood) {
    return 'I need a city or a specialty from the directory. I will not guess a name.';
  }
  if (clinics.length === 0) {
    const where = [parsed.specialty, parsed.city, parsed.state].filter(Boolean).join(', ');
    return `The directory has no clinic for ${where}. I am not adding a name that was not in the tool result.`;
  }
  const lines = clinics.map((clinic) => {
    const accepting = clinic.accepting ? 'accepting new patients' : 'not accepting new patients';
    return `${clinic.name} (${clinic.clinician}, ${clinic.specialty}, ${clinic.city}, ${clinic.state}, ${accepting})`;
  });
  return `From the directory: ${lines.join('; ')}.`;
}

export interface RouteScore {
  id: 'finder' | 'plan' | 'study';
  name: string;
  score: number;
}

export interface RouteDecision {
  scores: RouteScore[];
  winnerId: RouteScore['id'] | null;
  reason: string;
}

function hintsFor(question: string): string[] {
  const hints = new Set<string>();
  const parsed = parseQuestion(question);
  if (parsed.specialty === 'pediatrics') hints.add('pediatrician').add('clinic');
  if (parsed.specialty === 'dermatology') hints.add('dermatologist').add('clinic');
  if (parsed.specialty === 'cardiology') hints.add('cardiologist').add('clinic');
  if (parsed.specialty === 'family medicine') hints.add('family').add('clinic');
  if (parsed.specialty === 'psychiatry') hints.add('psychiatrist').add('clinic');
  if (parsed.specialty === 'audiology') hints.add('hearing').add('clinic');
  if (parsed.specialty === 'orthopedics') hints.add('orthopedic').add('clinic');
  if (parsed.city || parsed.state) hints.add('city');
  if (parsed.understood) hints.add('clinic').add('directory');
  if (/plan|insurance|cover/i.test(question)) hints.add('plan').add('covers');
  if (/study|studies|research|published|paper/i.test(question)) hints.add('studies').add('published');
  return [...hints];
}

function scoreText(hints: string[], description: string): number {
  const haystack = description.toLowerCase();
  return hints.reduce((total, hint) => (haystack.includes(hint) ? total + 1 : total), 0);
}

/** Toy overlap between the question and each card's description. Not a model. */
export function routeQuestion(question: string, finderDescription: string): RouteDecision {
  const hints = hintsFor(question);
  const scores: RouteScore[] = [
    { id: 'finder', name: 'Clinic finder', score: scoreText(hints, finderDescription) },
    { id: 'plan', name: 'Plan reader', score: scoreText(hints, PLAN_DESCRIPTION) },
    { id: 'study', name: 'Study reader', score: scoreText(hints, STUDY_DESCRIPTION) },
  ];
  const best = Math.max(...scores.map((item) => item.score));
  if (best === 0) {
    return {
      scores,
      winnerId: null,
      reason: 'No card description overlaps this question, so the orchestrator does not hand it off.',
    };
  }
  const leaders = scores.filter((item) => item.score === best);
  const winner = leaders[0];
  const tie =
    leaders.length > 1
      ? ` ${leaders.map((item) => item.name).join(' and ')} tie. The list is ordered, so ${winner.name} is picked.`
      : '';
  return {
    scores,
    winnerId: winner.id,
    reason: `${winner.name} scores ${best}, the highest overlap with the question.${tie}`,
  };
}

export const STATIONS = [
  { id: 'client', label: 'Client' },
  { id: 'card', label: 'Card' },
  { id: 'server', label: 'A2A' },
  { id: 'agent', label: 'Agent' },
  { id: 'tool', label: 'MCP' },
] as const;

export interface Hop {
  id: string;
  title: string;
  plain: string;
  station: number;
  preface: string;
  body: unknown;
}

function stamp(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function toolArgs(parsed: ParsedQuestion): Record<string, string> {
  const args: Record<string, string> = {};
  if (parsed.city) args.city = parsed.city;
  else if (parsed.state) args.state = parsed.state;
  if (parsed.specialty) args.specialty = parsed.specialty;
  return args;
}

function agentCard(description: string, streaming: boolean) {
  return {
    name: 'Clinic Finder',
    description,
    supportedInterfaces: [
      {
        url: 'http://127.0.0.1:8765/',
        protocolBinding: 'JSONRPC',
        protocolVersion: '1.0',
      },
    ],
    version: '1.0.0',
    capabilities: {
      streaming,
      pushNotifications: false,
    },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [
      {
        id: 'find_clinics',
        name: 'Find clinics',
        description: 'Look up a fictional clinic by city or specialty.',
        tags: ['clinic', 'directory'],
        examples: ['Is there a pediatrician in Seattle?'],
      },
    ],
  };
}

function message(id: string, question: string) {
  return {
    role: 'ROLE_USER',
    parts: [{ text: question }],
    messageId: `msg-${id}`,
  };
}

function sse(id: string, result: unknown) {
  return { jsonrpc: '2.0', id: '1', result };
}

export function buildHops(question: string, description: string, streaming: boolean): Hop[] {
  const parsed = parseQuestion(question);
  const clinics = matchClinics(parsed);
  const answer = renderAnswer(parsed, clinics);
  const id = stamp(`${question}|${description}|${streaming ? 's' : 'b'}`);
  const taskId = `task-${id}`;
  const contextId = `ctx-${id}`;
  const method = streaming ? 'SendStreamingMessage' : 'SendMessage';
  const accept = streaming ? 'text/event-stream' : 'application/json';
  const held = streaming
    ? 'One Server-Sent Event. Content-Type: text/event-stream. On the wire the object below is a single data: line.'
    : 'Not sent as its own response. SendMessage holds the HTTP call open until the task is terminal. This is the state the server is holding.';
  const args = toolArgs(parsed);
  const toolText = JSON.stringify(clinics);

  const cardHop: Hop = {
    id: 'card',
    title: 'Fetch the Agent Card',
    plain: 'The client reads a JSON card before it sends any question. The card says who the agent is, which transport to use, and whether streaming is offered.',
    station: 1,
    preface: 'GET /.well-known/agent-card.json',
    body: agentCard(description, streaming),
  };

  const sendHop: Hop = {
    id: 'send',
    title: streaming ? 'SendStreamingMessage' : 'SendMessage',
    plain: streaming
      ? 'The client sends the question with the streaming method and asks for an event stream. The header A2A-Version: 1.0 selects the 1.0 shapes. A missing header is read as 0.3 by the Python SDK I tried.'
      : 'The client sends one JSON-RPC call and waits. SendMessage is the 1.0 name. The server will answer once, with the finished task, unless the caller sets returnImmediately.',
    station: 2,
    preface: `POST /\nA2A-Version: 1.0\nContent-Type: application/json\nAccept: ${accept}`,
    body: {
      jsonrpc: '2.0',
      id: '1',
      method,
      params: { message: message(id, question) },
    },
  };

  const submitted: Hop = {
    id: 'submitted',
    title: 'Task submitted',
    plain: 'The server opens a task, copies the user message into its history, and marks it submitted. The task id and the context id are the server\'s, not the client\'s.',
    station: 2,
    preface: held,
    body: streaming
      ? sse(id, {
          task: {
            id: taskId,
            contextId,
            status: { state: 'TASK_STATE_SUBMITTED' },
            history: [{ ...message(id, question), taskId, contextId }],
          },
        })
      : {
          id: taskId,
          contextId,
          status: { state: 'TASK_STATE_SUBMITTED' },
        },
  };

  const working: Hop = {
    id: 'working',
    title: 'Task working',
    plain: 'Working means the agent has the task and has not finished. In the streaming call this is its own event. In the blocking call the client still sees nothing.',
    station: 2,
    preface: held,
    body: streaming
      ? sse(id, {
          statusUpdate: {
            taskId,
            contextId,
            status: { state: 'TASK_STATE_WORKING', timestamp: '2026-11-02T23:19:39.782Z' },
          },
        })
      : { state: 'TASK_STATE_WORKING', timestamp: '2026-11-02T23:19:39.782Z' },
  };

  if (!parsed.understood) {
    const paused: Hop = {
      id: 'input-required',
      title: 'Input required',
      plain: 'The script cannot see a city or a specialty, so it does not call the tool and it does not invent a clinic. The task pauses at input-required. A later message on the same task could continue it.',
      station: 3,
      preface: streaming
        ? 'One Server-Sent Event. The stream closes when the task reaches an interrupted state such as input-required.'
        : 'The blocking call returns here. input-required is an interrupted state, not a success.',
      body: streaming
        ? sse(id, {
            statusUpdate: {
              taskId,
              contextId,
              status: { state: 'TASK_STATE_INPUT_REQUIRED', timestamp: '2026-11-02T23:19:40.100Z' },
            },
          })
        : {
            jsonrpc: '2.0',
            id: '1',
            result: {
              task: {
                id: taskId,
                contextId,
                status: { state: 'TASK_STATE_INPUT_REQUIRED', timestamp: '2026-11-02T23:19:40.100Z' },
                history: [{ ...message(id, question), taskId, contextId }],
              },
            },
          },
    };
    return [cardHop, sendHop, submitted, working, paused];
  }

  const decide: Hop = {
    id: 'decide',
    title: 'The agent calls a tool',
    plain: 'This hop is inside the agent. The scripted stand-in for a model emits one tool call. A real model would do the same kind of thing after reading the tool\'s schema. It is not an A2A method.',
    station: 3,
    preface: 'Inside the agent. LangChain tool call, not on the A2A wire.',
    body: {
      tool_calls: [
        {
          name: 'find_clinics',
          args,
          id: 'call-1',
          type: 'tool_call',
        },
      ],
    },
  };

  const mcp: Hop = {
    id: 'mcp',
    title: 'MCP tools/call',
    plain: 'The agent is now an MCP client. It calls the clinic tool by name and passes the arguments it parsed. The directory never sees the A2A task.',
    station: 4,
    preface: 'MCP JSON-RPC, stdio to the tool process. Spec revision 2026-07-28.',
    body: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'find_clinics', arguments: args },
    },
  };

  const toolResult: Hop = {
    id: 'tool-result',
    title: 'Tool result',
    plain:
      clinics.length === 0
        ? 'The tool returns an empty list. That is a real result. The next sentence is not allowed to fill the gap with a clinic that was not here.'
        : 'The tool returns the matching rows as text inside a content block, with resultType complete. The agent may quote these rows and nothing else.',
    station: 4,
    preface: 'MCP result for that tools/call.',
    body: {
      jsonrpc: '2.0',
      id: 2,
      result: {
        resultType: 'complete',
        content: [{ type: 'text', text: toolText }],
        isError: false,
      },
    },
  };

  const answerHop: Hop = {
    id: 'answer',
    title: 'Answer from the tool',
    plain: 'The script writes the reply by reading the tool JSON. If you compare the sentence to the rows above, every clinic name came from that list.',
    station: 3,
    preface: 'Inside the agent, after the tool message is appended.',
    body: { role: 'assistant', content: answer },
  };

  const artifact: Hop = {
    id: 'artifact',
    title: 'Artifact',
    plain: 'The reply is stored as an artifact named clinic_answer. A part holds the text. Spec 1.0 puts the text directly on the part. There is no kind field.',
    station: 2,
    preface: held,
    body: streaming
      ? sse(id, {
          artifactUpdate: {
            taskId,
            contextId,
            artifact: {
              artifactId: `art-${id}`,
              name: 'clinic_answer',
              parts: [{ text: answer }],
            },
          },
        })
      : {
          artifactId: `art-${id}`,
          name: 'clinic_answer',
          parts: [{ text: answer }],
        },
  };

  const completedBody = {
    jsonrpc: '2.0',
    id: '1',
    result: {
      task: {
        id: taskId,
        contextId,
        status: { state: 'TASK_STATE_COMPLETED', timestamp: '2026-11-02T23:19:41.000Z' },
        artifacts: [
          {
            artifactId: `art-${id}`,
            name: 'clinic_answer',
            parts: [{ text: answer }],
          },
        ],
        history: [{ ...message(id, question), taskId, contextId }],
      },
    },
  };

  const completed: Hop = {
    id: 'completed',
    title: 'Task completed',
    plain: streaming
      ? 'The last event says the task is completed, and the stream closes. The client already saw the artifact on the previous event.'
      : 'This is the only A2A response body. The task is completed and the artifact is already on it. Everything between submit and this object stayed on the server.',
    station: 0,
    preface: streaming
      ? 'Last SSE event. The stream then closes.'
      : 'HTTP 200. One JSON-RPC result for the SendMessage call.',
    body: streaming
      ? sse(id, {
          statusUpdate: {
            taskId,
            contextId,
            status: { state: 'TASK_STATE_COMPLETED', timestamp: '2026-11-02T23:19:41.000Z' },
          },
        })
      : completedBody,
  };

  return [cardHop, sendHop, submitted, working, decide, mcp, toolResult, answerHop, artifact, completed];
}
