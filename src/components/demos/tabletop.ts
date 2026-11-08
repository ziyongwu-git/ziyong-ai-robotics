/**
 * Toy vision-language-action loop for a three-block table.
 *
 * A real VLA (the 2025 robot models discussed on the project page) takes a
 * camera image and a sentence, then outputs a short chunk of motion. This
 * file is a readable stand-in for that loop. Nothing here is learned.
 *
 *   see   — name each block from its coordinates (a stand-in for vision tokens)
 *   think — pick the next subtask in plain language (a handful of rules)
 *   flow  — pull a noisy path toward a geometric curve, one step at a time
 *   move  — follow whatever path those steps produced, and maybe miss
 *
 * The flow step is the picture of flow matching used by π0.5 and by GR00T N1's
 * action module. In the simple version of that method, a point at time t is
 *
 *   noisy + t * (clean − noisy)
 *
 * and the velocity is the straight line (clean − noisy). A trained model has
 * to learn that velocity from demonstrations. Here the clean path is known,
 * because it is just geometry, so the velocity is handed to us. Stopping
 * before t = 1 leaves the gripper short of the block on purpose.
 *
 * The React file next to this one only draws. The rules live here so they
 * can be re-run without a browser: `node --experimental-strip-types scripts/check-tabletop.ts`.
 */

export type BlockId = 'red' | 'blue' | 'green';

export type Block = {
  id: BlockId;
  /** Center of the block, in diagram pixels. */
  x: number;
  y: number;
  /** 0 on the table, 1 or more if stacked on another block. */
  z: number;
  /** The block directly underneath, when this one is stacked. */
  on: BlockId | null;
  inTray: boolean;
};

export type Gripper = {
  x: number;
  y: number;
  open: boolean;
  holding: BlockId | null;
};

export type Table = {
  blocks: Block[];
  gripper: Gripper;
};

export type Point = { x: number; y: number };

export type Waypoint = Point & { event?: 'close' | 'open' };

/** Fixed colors for the blocks. Letters in the drawing are the second cue. */
export const BLOCK_FILL: Record<BlockId, string> = {
  red: '#c4492c',
  blue: '#2c5fb5',
  green: '#1c7d68',
};

export const BLOCK_IDS: BlockId[] = ['red', 'blue', 'green'];

/**
 * Diagram geometry. The React view uses these same numbers, so a block the
 * planner aims at is the block the picture draws.
 */
export const scene = {
  view: { w: 640, h: 400 },
  table: { x: 32, y: 36, w: 576, h: 320 },
  tray: { x: 456, y: 108, w: 146, h: 200 },
  home: { x: 104, y: 108 },
  block: 42,
};

const SLOTS: Point[] = [
  { x: 158, y: 168 },
  { x: 158, y: 276 },
  { x: 292, y: 168 },
  { x: 292, y: 276 },
  { x: 400, y: 222 },
];

const TRAY_SLOTS: Point[] = [
  { x: 492, y: 162 },
  { x: 566, y: 162 },
  { x: 529, y: 246 },
];

/** How far a stacked block is drawn from the one it sits on. */
const STACK = { x: -14, y: -18 };

/**
 * A block "occupies" a slot inside this radius. Slot spacing is wider than
 * two radii, so one block cannot block two slots.
 */
const OCCUPY = 36;

/** How many integration steps a full flow uses. The slider stops early. */
export const FLOW_MAX = 6;

/**
 * Last-waypoint noise, in pixels. After `k` steps the leftover gap is
 * `NOISE_END * (1 − k / FLOW_MAX)`. Thresholds below are inside that gap
 * for k ≥ 4 and outside it for k ≤ 3, so the slider has a real miss.
 */
const NOISE_END = 72;
/** Close enough, in pixels, for a grasp or a placement to count. */
export const GRASP = 30;
const PLACE = 34;

export const PRESETS = [
  { id: 'tray', label: 'Red into the tray', text: 'Put the red block in the tray' },
  { id: 'stack', label: 'Stack blue on red', text: 'Stack the blue block on the red one' },
  { id: 'clear', label: 'Clear the table', text: 'Clear the table' },
] as const;

export type Goal =
  | { kind: 'tray'; color: BlockId }
  | { kind: 'stack'; top: BlockId; base: BlockId }
  | { kind: 'clear' }
  | { kind: 'unknown'; note: string };

export type SeeToken = { id: string; label: string; x: number; y: number };

export type PickSkill = { type: 'pick'; block: BlockId; sentence: string };
export type PlaceSkill = {
  type: 'place';
  block: BlockId;
  x: number;
  y: number;
  onto: BlockId | null;
  inTray: boolean;
  sentence: string;
};
export type MotionSkill = PickSkill | PlaceSkill;
export type Skill = MotionSkill | { type: 'done'; sentence: string } | { type: 'stuck'; sentence: string };

export type Phase = 'ready' | 'see' | 'think' | 'flow' | 'act' | 'finished';

export type DemoState = {
  table: Table;
  text: string;
  goal: Goal | null;
  phase: Phase;
  playing: boolean;
  flowSteps: number;
  seenCount: number;
  tokens: SeeToken[];
  sentence: string;
  note: string;
  skill: MotionSkill | null;
  clean: Waypoint[];
  noisy: Waypoint[];
  flowFrame: number;
  noiseSeed: number;
  misses: number;
  cycles: number;
  actId: number;
  /** Plain-language lines that stay after the picture moves on. */
  journal: string[];
};

/** A spot on the open table, away from the red block's start and outside the tray. */
export const RED_ASIDE = { x: 400, y: 292 };

export type DemoAction =
  | { type: 'text'; text: string }
  | { type: 'steps'; steps: number }
  | { type: 'play'; reduced: boolean }
  | { type: 'run'; reduced: boolean; text?: string }
  | { type: 'pause' }
  | { type: 'step'; reduced: boolean }
  | { type: 'tick'; reduced: boolean }
  | { type: 'commit' }
  | { type: 'shuffle' }
  | { type: 'reset' }
  | { type: 'moveBlock'; id: BlockId; x: number; y: number; record?: boolean }
  | { type: 'finishNow' };

export function startingTable(): Table {
  return {
    blocks: [
      blockAt('red', SLOTS[0]),
      blockAt('blue', SLOTS[2]),
      blockAt('green', SLOTS[1]),
    ],
    gripper: { ...scene.home, open: true, holding: null },
  };
}

export function initialDemo(): DemoState {
  return {
    table: startingTable(),
    text: PRESETS[0].text,
    goal: null,
    phase: 'ready',
    playing: false,
    flowSteps: FLOW_MAX,
    seenCount: 0,
    tokens: [],
    sentence: 'Pick an instruction. The toy will look, plan, and then move.',
    note: '',
    skill: null,
    clean: [],
    noisy: [],
    flowFrame: 0,
    noiseSeed: 1,
    misses: 0,
    cycles: 0,
    actId: 0,
    journal: [],
  };
}

function blockAt(id: BlockId, point: Point): Block {
  return { id, x: point.x, y: point.y, z: 0, on: null, inTray: false };
}

export function blockById(table: Table, id: BlockId): Block {
  const found = table.blocks.find((item) => item.id === id);
  if (!found) throw new Error(`Missing the ${id} block.`);
  return found;
}

function cloneTable(table: Table): Table {
  return {
    gripper: { ...table.gripper },
    blocks: table.blocks.map((item) => ({ ...item })),
  };
}

/**
 * Put a block at a point on the table. Clears a stack, because a dragged
 * block is no longer sitting on the one underneath. `inTray` follows the point.
 */
export function placeBlock(table: Table, id: BlockId, x: number, y: number): Table {
  const next = cloneTable(table);
  const item = blockById(next, id);
  const half = scene.block / 2;
  item.x = clamp(x, scene.table.x + half + 4, scene.table.x + scene.table.w - half - 4);
  item.y = clamp(y, scene.table.y + half + 4, scene.table.y + scene.table.h - half - 4);
  item.on = null;
  item.z = 0;
  item.inTray = insideTray(item.x, item.y);
  return next;
}

function remember(journal: string[], line: string): string[] {
  const text = line.trim();
  if (!text || journal[journal.length - 1] === text) return journal;
  return [...journal, text].slice(-8);
}

/** Tiny deterministic generator so a replay with the same seed matches. */
function makeRandom(seed: number): () => number {
  let value = seed >>> 0 || 1;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Read a short instruction. The vocabulary is intentionally tiny: three
 * colors, the tray, and stacking one block on another.
 */
export function readGoal(raw: string): Goal {
  const text = raw
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    return { kind: 'unknown', note: 'Type a short instruction, or tap one of the examples.' };
  }

  const order = colorOrder(text);
  const wantsTray = /\b(tray|bin|box)\b/.test(text);
  const wantsClear = /\b(all|every|each)\b/.test(text) || /\b(clear|tidy|clean)\b/.test(text);
  const wantsStack = /\b(stack|onto)\b/.test(text) || (order.length >= 2 && /\bon\b/.test(text) && !wantsTray);

  if (wantsClear && (wantsTray || /\b(clear|tidy|clean)\b/.test(text) || order.length === 0)) {
    return { kind: 'clear' };
  }

  if (wantsStack) {
    if (order.length >= 2 && order[0] !== order[1]) {
      return { kind: 'stack', top: order[0], base: order[1] };
    }
    return {
      kind: 'unknown',
      note: 'Say which block goes on which, for example “stack blue on red.” A block cannot sit on itself.',
    };
  }

  if (wantsTray && order.length === 1) {
    return { kind: 'tray', color: order[0] };
  }

  if (wantsTray && order.length > 1) {
    return { kind: 'unknown', note: 'Name one block for the tray, or say “clear the table” to move all three.' };
  }

  if (order.length === 0) {
    return {
      kind: 'unknown',
      note: 'I only know the red, blue, and green blocks, the tray, and stacking one block on another.',
    };
  }

  return {
    kind: 'unknown',
    note: `I heard ${order.join(' and ')}, but not a task I know. Try “put the red block in the tray” or “stack blue on red.”`,
  };
}

function colorOrder(text: string): BlockId[] {
  return BLOCK_IDS.map((id) => ({ id, at: text.indexOf(id) }))
    .filter((item) => item.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((item) => item.id);
}

export function seeTokens(table: Table): SeeToken[] {
  const blocks = [...table.blocks].sort((a, b) => a.x - b.x || a.y - b.y);
  const tokens: SeeToken[] = blocks.map((item) => ({
    id: item.id,
    label: `${item.id} · ${where(item)}`,
    x: item.x,
    y: item.y,
  }));
  const held = table.gripper.holding;
  tokens.push({
    id: 'hand',
    label: held ? `hand · holding ${held}` : 'hand · open',
    x: table.gripper.x,
    y: table.gripper.y,
  });
  return tokens;
}

function where(item: Block): string {
  if (item.on) return `on ${item.on}`;
  if (item.inTray || insideTray(item.x, item.y)) return 'in the tray';
  if (item.x < 230) return 'on the left';
  if (item.x < 420) return 'near the middle';
  return 'on the right';
}

export function insideTray(x: number, y: number): boolean {
  const tray = scene.tray;
  return x >= tray.x && x <= tray.x + tray.w && y >= tray.y && y <= tray.y + tray.h;
}

/**
 * The next thing the toy will do, given the table and the instruction.
 * One skill at a time: pick, or place, then look again. That is the "chunk"
 * the real systems replan after.
 */
export function nextSkill(table: Table, goal: Goal, missed: boolean): Skill {
  if (goal.kind === 'unknown') return { type: 'stuck', sentence: goal.note };

  const held = table.gripper.holding;
  if (held) return placeHeld(table, goal, held, missed);

  if (goal.kind === 'clear') {
    const outside = table.blocks.filter((item) => !item.inTray);
    if (outside.length === 0) {
      return { type: 'done', sentence: 'The table is clear. All three blocks are in the tray.' };
    }
    const choice = topmostFree(outside);
    return pick(choice.id, missed, `Next I'll pick up the ${choice.id} block and carry it to the tray.`);
  }

  if (goal.kind === 'tray') {
    const target = blockById(table, goal.color);
    if (target.inTray) {
      return { type: 'done', sentence: `The ${goal.color} block is already in the tray.` };
    }
    const top = chainTop(table, goal.color);
    if (top !== goal.color) {
      return pick(top, missed, `The ${top} block is on ${goal.color}. I'll move it off first.`);
    }
    return pick(
      goal.color,
      missed,
      `The ${goal.color} block is ${where(target)}. I'll pick it up and carry it to the tray.`,
    );
  }

  const topBlock = blockById(table, goal.top);
  if (topBlock.on === goal.base) {
    return { type: 'done', sentence: `The ${goal.top} block is already on the ${goal.base} one.` };
  }
  const aboveTop = chainTop(table, goal.top);
  if (aboveTop !== goal.top) {
    return pick(aboveTop, missed, `The ${aboveTop} block is on ${goal.top}. I'll move it off before I can pick ${goal.top} up.`);
  }
  const aboveBase = chainTop(table, goal.base);
  if (aboveBase !== goal.base && aboveBase !== goal.top) {
    return pick(aboveBase, missed, `The ${aboveBase} block is on ${goal.base}. I'll set it aside, then stack.`);
  }
  return pick(goal.top, missed, `I'll pick up the ${goal.top} block and set it on the ${goal.base} one.`);
}

function pick(block: BlockId, missed: boolean, sentence: string): PickSkill {
  return { type: 'pick', block, sentence: missed ? `The last move missed. ${sentence}` : sentence };
}

function placeHeld(table: Table, goal: Goal, held: BlockId, missed: boolean): Skill {
  if (goal.kind === 'clear' || (goal.kind === 'tray' && held === goal.color)) {
    const slot = freePoint(table, TRAY_SLOTS);
    if (!slot) return { type: 'stuck', sentence: 'The tray has no open spot.' };
    return {
      type: 'place',
      block: held,
      x: slot.x,
      y: slot.y,
      onto: null,
      inTray: true,
      sentence: sentence(missed, `Carrying the ${held} block into the tray.`),
    };
  }

  if (goal.kind === 'stack' && held === goal.top) {
    const base = blockById(table, goal.base);
    return {
      type: 'place',
      block: held,
      x: base.x + STACK.x,
      y: base.y + STACK.y,
      onto: goal.base,
      inTray: base.inTray,
      sentence: sentence(missed, `Setting the ${held} block on the ${goal.base} one.`),
    };
  }

  const slot = freePoint(table, SLOTS);
  if (!slot) return { type: 'stuck', sentence: 'There is no open spot on the table to set this block down.' };
  return {
    type: 'place',
    block: held,
    x: slot.x,
    y: slot.y,
    onto: null,
    inTray: false,
    sentence: sentence(missed, `I'll set the ${held} block down on an open part of the table.`),
  };
}

function sentence(missed: boolean, text: string): string {
  return missed ? `The last move missed. ${text}` : text;
}

/** Among blocks that nothing else is sitting on, take the leftmost. */
function topmostFree(blocks: Block[]): Block {
  const tops = blocks.filter((item) => !blocks.some((other) => other.on === item.id));
  const pool = tops.length > 0 ? tops : blocks;
  return [...pool].sort((a, b) => a.x - b.x || a.y - b.y)[0];
}

/** Walk up a stack. One level is the usual case; the loop is there so two levels still work. */
function chainTop(table: Table, id: BlockId): BlockId {
  let current = id;
  const seen = new Set<BlockId>();
  while (!seen.has(current)) {
    seen.add(current);
    const above = table.blocks.find((item) => item.on === current);
    if (!above) return current;
    current = above.id;
  }
  return current;
}

function freePoint(table: Table, spots: Point[]): Point | null {
  return spots.find((spot) => !taken(table, spot.x, spot.y)) ?? null;
}

function taken(table: Table, x: number, y: number): boolean {
  return table.blocks.some((item) => {
    if (item.id === table.gripper.holding) return false;
    return Math.hypot(item.x - x, item.y - y) < OCCUPY;
  });
}

/**
 * A curve from the hand to a target, then a short lift.
 * The open/close event stays on the target. The extra point is where the
 * hand rests, so it does not sit on top of the block after letting go.
 * Picks do not lift: the hand is supposed to be holding the block.
 */
export function placeCurve(from: Point, to: Point): Waypoint[] {
  const points = curve(from, to, 'open');
  const last = points[points.length - 1];
  points.push({
    x: last.x,
    y: Math.max(scene.table.y + 28, last.y - 52),
  });
  return points;
}

/** Fraction along the path (0 to 1) where the hand opens or closes. */
export function eventFraction(path: Waypoint[]): number {
  const index = path.findIndex((point) => point.event);
  if (index <= 0) return 1;
  let total = 0;
  const spans: number[] = [];
  for (let cursor = 1; cursor < path.length; cursor += 1) {
    const span = Math.hypot(path[cursor].x - path[cursor - 1].x, path[cursor].y - path[cursor - 1].y);
    spans.push(span);
    total += span;
  }
  if (total === 0) return 1;
  let walked = 0;
  for (let cursor = 0; cursor < index; cursor += 1) walked += spans[cursor] ?? 0;
  return walked / total;
}

/** A quadratic curve from the hand to the target. The last point is the grasp or the release. */
export function curve(from: Point, to: Point, event: 'close' | 'open'): Waypoint[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const bend = Math.min(64, length * 0.35);
  const control = {
    x: (from.x + to.x) / 2 - (dy / length) * bend,
    y: (from.y + to.y) / 2 + (dx / length) * bend,
  };
  const count = 8;
  const points: Waypoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    const stay = 1 - t;
    points.push({
      x: stay * stay * from.x + 2 * stay * t * control.x + t * t * to.x,
      y: stay * stay * from.y + 2 * stay * t * control.y + t * t * to.y,
      event: index === count - 1 ? event : undefined,
    });
  }
  return points;
}

/**
 * Noise around a clean path. The hand (index 0) stays put: the toy "knows"
 * where its gripper is. The grasp or release point is pushed a fixed distance
 * toward the middle of the table, so fewer flow steps miss by a known amount.
 */
export function scatter(clean: Waypoint[], seed: number): Waypoint[] {
  const random = makeRandom(seed);
  const eventIndex = Math.max(0, clean.findIndex((point) => point.event));
  const event = clean[eventIndex];
  const nudgedEvent = inward(event, NOISE_END, seed + eventIndex);
  const eventDx = nudgedEvent.x - event.x;
  const eventDy = nudgedEvent.y - event.y;

  return clean.map((point, index) => {
    if (index === 0) return { ...point };
    // The grasp/release point carries a fixed amount of noise, so a short
    // budget misses by a known distance. A later rest point keeps that same
    // offset and stays above the hand.
    if (index === eventIndex) return { ...point, x: nudgedEvent.x, y: nudgedEvent.y };
    if (index > eventIndex) return { ...point, x: point.x + eventDx, y: point.y + eventDy };
    const angle = random() * Math.PI * 2;
    const radius = 30 + random() * 50;
    return {
      ...point,
      x: clamp(point.x + Math.cos(angle) * radius, 56, 590),
      y: clamp(point.y + Math.sin(angle) * radius, 64, 340),
    };
  });
}

function inward(origin: Point, radius: number, seed: number): Point {
  const center = { x: 300, y: 200 };
  let vx = center.x - origin.x;
  let vy = center.y - origin.y;
  const length = Math.hypot(vx, vy) || 1;
  vx /= length;
  vy /= length;
  const wobble = ((seed % 17) / 16 - 0.5) * 0.7;
  const cos = Math.cos(wobble);
  const sin = Math.sin(wobble);
  return {
    x: origin.x + (vx * cos - vy * sin) * radius,
    y: origin.y + (vx * sin + vy * cos) * radius,
  };
}

/** One Euler step of the straight-line flow, repeated `frame` times out of FLOW_MAX. */
export function blend(noisy: Waypoint[], clean: Waypoint[], frame: number): Waypoint[] {
  const t = clamp(frame / FLOW_MAX, 0, 1);
  return clean.map((point, index) => {
    const from = noisy[index] ?? point;
    return {
      x: from.x + (point.x - from.x) * t,
      y: from.y + (point.y - from.y) * t,
      event: point.event,
    };
  });
}

export function pointAlong(path: Waypoint[], t: number): Point {
  if (path.length === 0) return { ...scene.home };
  if (path.length === 1) return path[0];
  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    const span = Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);
    lengths.push(span);
    total += span;
  }
  let left = clamp(t, 0, 1) * total;
  for (let index = 0; index < lengths.length; index += 1) {
    const span = lengths[index];
    if (left <= span || index === lengths.length - 1) {
      const u = span === 0 ? 1 : left / span;
      return {
        x: path[index].x + (path[index + 1].x - path[index].x) * u,
        y: path[index].y + (path[index + 1].y - path[index].y) * u,
      };
    }
    left -= span;
  }
  return path[path.length - 1];
}

export type MotionResult = {
  table: Table;
  miss: boolean;
  note: string;
};

/** Apply the path the flow actually produced. Close enough counts as a catch. */
export function applyMotion(table: Table, skill: MotionSkill, followed: Waypoint[]): MotionResult {
  const release = followed.find((point) => point.event) ?? followed[followed.length - 1];
  const rest = followed[followed.length - 1] ?? { x: table.gripper.x, y: table.gripper.y };
  const next = cloneTable(table);
  next.gripper.x = rest.x;
  next.gripper.y = rest.y;

  if (skill.type === 'pick') {
    const item = blockById(next, skill.block);
    const gap = Math.hypot(release.x - item.x, release.y - item.y);
    next.gripper.open = true;
    next.gripper.holding = null;
    if (gap <= GRASP) {
      item.on = null;
      item.z = 0;
      item.inTray = false;
      item.x = release.x;
      item.y = release.y;
      next.gripper.open = false;
      next.gripper.holding = item.id;
      return { table: next, miss: false, note: `Closed on the ${item.id} block.` };
    }
    return {
      table: next,
      miss: true,
      note: `The gripper closed ${Math.round(gap)}px from the ${skill.block} block and caught air.`,
    };
  }

  const held = table.gripper.holding;
  next.gripper.open = true;
  next.gripper.holding = null;
  if (!held) return { table: next, miss: true, note: 'The gripper was empty, so there was nothing to set down.' };

  const item = blockById(next, held);
  const gap = Math.hypot(release.x - skill.x, release.y - skill.y);
  if (gap <= PLACE) {
    item.x = skill.x;
    item.y = skill.y;
    item.on = skill.onto;
    item.z = skill.onto ? blockById(next, skill.onto).z + 1 : 0;
    item.inTray = skill.inTray;
    return { table: next, miss: false, note: `Let go of the ${held} block.` };
  }

  item.x = release.x;
  item.y = release.y;
  item.on = null;
  item.z = 0;
  item.inTray = insideTray(release.x, release.y);
  return {
    table: next,
    miss: true,
    note: `Let go ${Math.round(gap)}px short of the spot. The ${held} block stayed where the hand opened.`,
  };
}

export function shuffledTable(seed: number): Table {
  const random = makeRandom(seed);
  const slots = [...SLOTS];
  for (let index = slots.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const saved = slots[index];
    slots[index] = slots[swap];
    slots[swap] = saved;
  }
  return {
    blocks: BLOCK_IDS.map((id, index) => blockAt(id, slots[index])),
    gripper: { ...scene.home, open: true, holding: null },
  };
}

function finish(state: DemoState, sentence: string): DemoState {
  return {
    ...state,
    phase: 'finished',
    playing: false,
    sentence,
    skill: null,
    clean: [],
    noisy: [],
    flowFrame: 0,
    journal: remember(state.journal, sentence),
  };
}

function startRun(state: DemoState, playing: boolean, revealAll: boolean): DemoState {
  const goal = readGoal(state.text);
  const cleared: DemoState = {
    ...state,
    goal,
    misses: 0,
    cycles: 0,
    skill: null,
    clean: [],
    noisy: [],
    flowFrame: 0,
    note: '',
    playing: false,
  };
  if (goal.kind === 'unknown') {
    return finish(cleared, goal.note);
  }
  const tokens = seeTokens(state.table);
  return {
    ...cleared,
    phase: 'see',
    playing,
    tokens,
    // Reduced motion shows every token at once. Otherwise they arrive one by one.
    seenCount: revealAll ? tokens.length : 1,
    sentence: 'Reading the table before choosing a motion.',
  };
}

function enterThink(state: DemoState): DemoState {
  if (!state.goal || state.goal.kind === 'unknown') {
    return finish(state, 'I do not know that instruction.');
  }
  const skill = nextSkill(state.table, state.goal, state.misses > 0);
  if (skill.type === 'done' || skill.type === 'stuck') return finish(state, skill.sentence);
  return { ...state, phase: 'think', skill, sentence: skill.sentence };
}

function beginFlow(state: DemoState): DemoState {
  if (!state.skill) return state;
  if (state.cycles >= 12) {
    return finish(state, 'I stopped this run so a missed grasp cannot loop forever. Raise Flow steps and try again.');
  }
  const skill = state.skill;
  const target =
    skill.type === 'pick' ? blockById(state.table, skill.block) : { x: skill.x, y: skill.y };
  const clean =
    skill.type === 'pick' ? curve(state.table.gripper, target, 'close') : placeCurve(state.table.gripper, target);
  const noiseSeed = state.noiseSeed + 1;
  return {
    ...state,
    phase: 'flow',
    clean,
    noisy: scatter(clean, noiseSeed),
    flowFrame: 0,
    noiseSeed,
    cycles: state.cycles + 1,
  };
}

function commitAct(state: DemoState): DemoState {
  if (!state.skill || state.clean.length === 0) return state;
  const followed = blend(state.noisy, state.clean, state.flowSteps);
  const result = applyMotion(state.table, state.skill, followed);
  const misses = result.miss ? state.misses + 1 : 0;
  const tokens = seeTokens(result.table);
  const next: DemoState = {
    ...state,
    table: result.table,
    misses,
    note: result.note,
    skill: null,
    clean: [],
    noisy: [],
    flowFrame: 0,
    tokens,
    seenCount: 1,
    phase: 'see',
    sentence: 'Looking again.',
    journal: remember(state.journal, result.note),
  };
  if (misses >= 3) {
    return finish(
      next,
      'Three tries missed. The path is still too close to the noise. Move Flow steps to 4 or more and run it again.',
    );
  }
  return next;
}

function beat(state: DemoState, kind: 'tick' | 'step', reduced: boolean): DemoState {
  if (state.phase === 'ready') return startRun(state, kind === 'tick', reduced);
  if (state.phase === 'finished') return state;

  if (state.phase === 'see') {
    if (state.seenCount < state.tokens.length) {
      if (reduced) return { ...state, seenCount: state.tokens.length };
      return { ...state, seenCount: state.seenCount + 1 };
    }
    return enterThink(state);
  }

  if (state.phase === 'think') return beginFlow(state);

  if (state.phase === 'flow') {
    if (reduced && state.flowFrame < state.flowSteps) {
      return { ...state, flowFrame: state.flowSteps };
    }
    if (state.flowFrame < state.flowSteps) {
      return { ...state, flowFrame: state.flowFrame + 1 };
    }
    if (reduced) return commitAct(state);
    return { ...state, phase: 'act', actId: state.actId + 1 };
  }

  if (state.phase === 'act') {
    if (kind === 'step' || reduced) return commitAct(state);
    return state;
  }

  return state;
}

export function reduce(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'text':
      return { ...state, text: action.text };
    case 'steps':
      return { ...state, flowSteps: clamp(Math.round(action.steps), 1, FLOW_MAX) };
    case 'pause':
      return { ...state, playing: false };
    case 'play': {
      if (state.phase === 'ready' || state.phase === 'finished') {
        return startRun(state, !action.reduced, action.reduced);
      }
      if (action.reduced) return state;
      return { ...state, playing: true };
    }
    case 'run': {
      const withText = action.text !== undefined ? { ...state, text: action.text } : state;
      return startRun(withText, !action.reduced, action.reduced);
    }
    case 'step':
      return beat({ ...state, playing: false }, 'step', action.reduced);
    case 'tick':
      return beat(state, 'tick', action.reduced);
    case 'commit':
      return state.phase === 'act' ? commitAct(state) : state;
    case 'shuffle': {
      const noiseSeed = state.noiseSeed + 1;
      return {
        ...initialDemo(),
        text: state.text,
        flowSteps: state.flowSteps,
        noiseSeed,
        table: shuffledTable(noiseSeed),
        sentence: 'Shuffled. The same instruction now has to read a new table.',
        journal: ['Shuffled. The blocks changed places. The instruction did not.'],
      };
    }
    case 'reset':
      return {
        ...initialDemo(),
        text: state.text,
        flowSteps: state.flowSteps,
        noiseSeed: state.noiseSeed,
      };
    case 'moveBlock':
      return moveBlock(state, action.id, action.x, action.y, action.record === true);
    case 'finishNow':
      return finishNow(state);
    default:
      return state;
  }
}

/** Walk the whole instruction without timers. Used when motion is reduced. */
function finishNow(state: DemoState): DemoState {
  const done = settle(state.text, state.flowSteps, state.table);
  const journal = [...state.journal];
  for (const line of done.journal) {
    if (journal[journal.length - 1] !== line) journal.push(line);
  }
  return {
    ...done,
    text: state.text,
    flowSteps: state.flowSteps,
    journal: journal.slice(-8),
  };
}

function moveBlock(state: DemoState, id: BlockId, x: number, y: number, record: boolean): DemoState {
  if (state.playing || (state.phase !== 'ready' && state.phase !== 'finished')) return state;
  if (state.table.gripper.holding) return state;
  const table = placeBlock(state.table, id, x, y);
  const item = blockById(table, id);
  const where = item.inTray ? 'That spot is inside the tray.' : 'That spot is on the open table.';
  const line = `${item.id} block moved to ${Math.round(item.x)}, ${Math.round(item.y)}. ${where}`;
  return {
    ...state,
    table,
    phase: 'ready',
    playing: false,
    goal: null,
    skill: null,
    clean: [],
    noisy: [],
    tokens: [],
    seenCount: 0,
    flowFrame: 0,
    note: '',
    sentence: `The ${item.id} block is in a new place. Run the instruction. The tokens should name this spot, and the path should aim here.`,
    journal: record ? remember(state.journal, line) : state.journal,
  };
}

/** Walk a run the way the Step button does. Used by the check script. */
export function settle(text: string, flowSteps: number, table?: Table): DemoState {
  let state: DemoState = { ...initialDemo(), text, flowSteps, table: table ?? startingTable() };
  state = reduce(state, { type: 'step', reduced: true });
  for (let guard = 0; guard < 80 && state.phase !== 'finished'; guard += 1) {
    state = reduce(state, { type: 'step', reduced: true });
  }
  return state;
}
