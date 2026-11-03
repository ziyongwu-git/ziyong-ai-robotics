/**
 * Re-run the tabletop rules without a browser.
 *
 *   node --experimental-strip-types scripts/check-tabletop.ts
 *
 * The widget on /demos/see-think-move is a drawing of this same file.
 * If a sentence here fails, the demo will fail the same way.
 */
import {
  FLOW_MAX,
  GRASP,
  blend,
  blockById,
  curve,
  readGoal,
  scatter,
  settle,
  startingTable,
  type Block,
  type BlockId,
} from '../src/components/demos/tabletop.ts';

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) return;
  throw new Error(`${name} failed${detail ? `: ${detail}` : ''}`);
}

function byId(blocks: Block[], id: BlockId): Block {
  const found = blocks.find((item) => item.id === id);
  if (!found) throw new Error(`Missing ${id}`);
  return found;
}

const tray = settle('Put the red block in the tray', FLOW_MAX);
check('red reaches the tray', byId(tray.table.blocks, 'red').inTray, tray.sentence);
check('blue stays out', !byId(tray.table.blocks, 'blue').inTray);
check('green stays out', !byId(tray.table.blocks, 'green').inTray);
check('tray run finishes', tray.phase === 'finished');

const stack = settle('Stack the blue block on the red one', FLOW_MAX);
check('blue sits on red', byId(stack.table.blocks, 'blue').on === 'red', stack.sentence);
check('stack run finishes', stack.phase === 'finished');

const cleared = settle('Clear the table', FLOW_MAX);
check(
  'every block is in the tray',
  cleared.table.blocks.every((item) => item.inTray),
  cleared.sentence,
);

const missed = settle('Put the red block in the tray', 2);
check('a short budget does not deliver red', !byId(missed.table.blocks, 'red').inTray, missed.sentence);
check('a short budget explains the miss', /flow steps/i.test(missed.sentence), missed.sentence);

const unknown = settle('bake a cake', FLOW_MAX);
check('an unknown sentence does not move the table', unknown.phase === 'finished');
check(
  'the blocks stayed put',
  unknown.table.blocks.every((item, index) => {
    const start = startingTable().blocks[index];
    return item.x === start.x && item.y === start.y;
  }),
);

const stackedFirst = startingTable();
const red = blockById(stackedFirst, 'red');
const blue = blockById(stackedFirst, 'blue');
blue.x = red.x - 14;
blue.y = red.y - 18;
blue.on = 'red';
blue.z = 1;
const unstacked = settle('Put the red block in the tray', FLOW_MAX, stackedFirst);
check('red still reaches the tray when blue is on it', byId(unstacked.table.blocks, 'red').inTray, unstacked.sentence);
check('blue is no longer on red', byId(unstacked.table.blocks, 'blue').on !== 'red');

const heard = readGoal('put the red block on the blue block');
check('on-phrase is a stack', heard.kind === 'stack' && heard.top === 'red' && heard.base === 'blue');

const clean = curve({ x: 100, y: 100 }, { x: 300, y: 180 }, 'close');
const noisy = scatter(clean, 4);
const full = blend(noisy, clean, FLOW_MAX);
const early = blend(noisy, clean, 2);
const endGap = (path: typeof full) => {
  const last = path.length - 1;
  return Math.hypot(path[last].x - clean[last].x, path[last].y - clean[last].y);
};
check('a full budget lands on the curve', endGap(full) < 0.001);
check('an early stop stays outside the grasp', endGap(early) > GRASP);

console.log('tabletop checks passed');
