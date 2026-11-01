import { useEffect, useId, useReducer, useRef, useState } from 'react';
import {
  BLOCK_FILL,
  FLOW_MAX,
  PRESETS,
  GRASP,
  blend,
  blockById,
  eventFraction,
  initialDemo,
  pointAlong,
  reduce,
  scene,
  type BlockId,
  type DemoState,
  type Waypoint,
} from './tabletop';

/**
 * Interactive picture of a vision-language-action loop.
 *
 * Astro only ships this file because the project page renders
 * <TabletopVla client:load />. The decisions live in tabletop.ts.
 * This file asks "what should be on screen right now?"
 *
 * `not-prose` opts out of the article typography, which would restyle the
 * buttons inside the write-up.
 *
 * Motion: Play walks see → think → flow → move on a timer, and the move
 * itself is a short animation. If the browser prefers reduced motion, Play
 * stays off and Step jumps the gripper to the end of each chunk.
 */

const PHASE_LABEL: Record<DemoState['phase'], string> = {
  ready: 'Ready',
  see: 'See',
  think: 'Think',
  flow: 'Flow',
  act: 'Move',
  finished: 'Done',
};

const STAGES = [
  { id: 'see', label: 'See' },
  { id: 'think', label: 'Think' },
  { id: 'flow', label: 'Flow' },
  { id: 'act', label: 'Move' },
] as const;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  return reduced;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function pointsOf(path: Waypoint[]): string {
  return path.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
}

function choiceClass(on: boolean): string {
  return `min-h-11 rounded-full px-3 py-2 text-sm ${on ? 'bg-ink text-paper' : 'border border-line bg-paper text-ink'}`;
}

export default function TabletopVla() {
  const markerId = useId().replace(/:/g, '');
  const dotsId = `${markerId}-dots`;
  const [state, dispatch] = useReducer(reduce, undefined, initialDemo);
  const [actT, setActT] = useState(0);
  const seenAct = useRef(state.actId);
  const reduced = useReducedMotion();

  // A new move should start at the hand, not on the last frame of the previous one.
  if (state.phase === 'act' && seenAct.current !== state.actId) {
    seenAct.current = state.actId;
    setActT(0);
  }

  useEffect(() => {
    if (reduced && state.playing) dispatch({ type: 'pause' });
  }, [reduced, state.playing]);

  useEffect(() => {
    if (!state.playing || reduced) return;
    if (state.phase === 'act' || state.phase === 'ready' || state.phase === 'finished') return;
    const delay = state.phase === 'think' ? 1200 : state.phase === 'see' ? 340 : 260;
    const id = window.setTimeout(() => dispatch({ type: 'tick', reduced }), delay);
    return () => window.clearTimeout(id);
  }, [state.playing, state.phase, state.seenCount, state.flowFrame, state.sentence, reduced]);

  useEffect(() => {
    if (state.phase !== 'act') return;
    if (reduced) {
      dispatch({ type: 'commit' });
      return;
    }
    let frame = 0;
    let start = 0;
    const duration = 1100;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / duration);
      setActT(t);
      if (t < 1) frame = window.requestAnimationFrame(tick);
      else dispatch({ type: 'commit' });
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [state.phase, state.actId, reduced]);

  const moving = state.phase === 'act' && state.clean.length > 0;
  const frame = moving ? state.flowSteps : state.flowFrame;
  const shown = state.clean.length > 0 ? blend(state.noisy, state.clean, frame) : [];
  const pose = gripperPose(state, shown, moving ? ease(actT) : 0);

  const stage = state.phase === 'ready' || state.phase === 'finished' ? null : state.phase;
  const flowHint =
    state.flowSteps >= 4
      ? 'Four or more steps land on the block.'
      : 'Fewer than four steps stop early, and the gripper can miss.';

  const aria = describe(state);

  return (
    <div className="not-prose rounded-2xl border border-line bg-card p-4 text-ink sm:p-6" data-phase={state.phase}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-2xl">Tabletop loop</h3>
        <p className="rounded-full bg-accent-soft px-3 py-1 text-sm">{PHASE_LABEL[state.phase]}</p>
      </div>

      <ol className="mt-4 flex flex-wrap gap-2" aria-label="Stages of the loop">
        {STAGES.map((item) => {
          const on = item.id === stage;
          return (
            <li
              key={item.id}
              aria-current={on ? 'step' : undefined}
              className={`rounded-full px-3 py-1 font-mono text-xs tracking-wide uppercase ${
                on ? 'bg-ink text-paper' : 'border border-line text-muted'
              }`}
            >
              {item.label}
            </li>
          );
        })}
      </ol>

      <svg
        viewBox={`0 0 ${scene.view.w} ${scene.view.h}`}
        className="mt-4 h-auto w-full"
        role="img"
        aria-label={aria}
      >
        <defs>
          <pattern id={dotsId} width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="var(--line)" />
          </pattern>
        </defs>
        <rect
          x={scene.table.x}
          y={scene.table.y}
          width={scene.table.w}
          height={scene.table.h}
          rx="22"
          fill="var(--accent-soft)"
        />
        <rect
          x={scene.table.x}
          y={scene.table.y}
          width={scene.table.w}
          height={scene.table.h}
          rx="22"
          fill={`url(#${dotsId})`}
        />
        <rect
          x={scene.tray.x}
          y={scene.tray.y}
          width={scene.tray.w}
          height={scene.tray.h}
          rx="16"
          fill="var(--card)"
          stroke="var(--highlight)"
          strokeWidth="2"
          strokeDasharray="5 4"
        />
        <text
          x={scene.tray.x + scene.tray.w / 2}
          y={scene.tray.y + 20}
          textAnchor="middle"
          fill="var(--highlight)"
          fontSize="12"
          fontFamily="IBM Plex Mono, ui-monospace, monospace"
        >
          tray
        </text>
        <circle cx={scene.home.x} cy={scene.home.y} r="16" fill="none" stroke="var(--line)" strokeWidth="2" />

        {state.noisy.length > 0 && (
          <polyline
            points={pointsOf(state.noisy)}
            fill="none"
            stroke="var(--muted)"
            strokeWidth="1.5"
            strokeDasharray="2 5"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={Math.max(0.15, 1 - frame / FLOW_MAX)}
          />
        )}
        {state.clean.length > 0 && (
          <polyline
            points={pointsOf(state.clean)}
            fill="none"
            stroke="var(--highlight)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.85"
          />
        )}
        {shown.length > 0 && (
          <polyline
            points={pointsOf(shown)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {shown.map((point, index) => {
          const clean = state.clean[index];
          if (!clean || index === 0) return null;
          const dx = clean.x - point.x;
          const dy = clean.y - point.y;
          const length = Math.hypot(dx, dy);
          if (length < 8) return null;
          const scale = Math.min(18, length) / length;
          return (
            <line
              key={`arrow-${index}`}
              x1={point.x}
              y1={point.y}
              x2={point.x + dx * scale}
              y2={point.y + dy * scale}
              stroke="var(--highlight)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}

        {state.skill?.type === 'pick' && <Target x={blockById(state.table, state.skill.block).x} y={blockById(state.table, state.skill.block).y} />}
        {state.skill?.type === 'place' && <Target x={state.skill.x} y={state.skill.y} />}

        {state.phase === 'see' && !reduced && state.seenCount > 0 && (
          <line
            x1={state.tokens[state.seenCount - 1]?.x ?? 0}
            y1={scene.table.y + 8}
            x2={state.tokens[state.seenCount - 1]?.x ?? 0}
            y2={scene.table.y + scene.table.h - 8}
            stroke="var(--accent)"
            strokeDasharray="3 5"
          />
        )}

        {[...state.table.blocks]
          .filter((item) => item.id !== pose.hide)
          .sort((a, b) => a.z - b.z || a.y - b.y)
          .map((item) => (
            <Block key={item.id} id={item.id} x={item.x} y={item.y} />
          ))}
        {pose.ghost && <Block id={pose.ghost.id} x={pose.ghost.x} y={pose.ghost.y} />}
        <Gripper x={pose.x} y={pose.y} open={pose.open} />
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>Dashed: the noisy start.</span>
        <span>Thin: the geometric answer.</span>
        <span>Thick: where the flow has pulled the path.</span>
      </div>

      <div className="mt-4">
        <p className="font-mono text-xs tracking-wide text-muted uppercase">Seen tokens</p>
        {state.tokens.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Tokens show up here when the toy looks at the table.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {state.tokens.map((token, index) => (
              <li
                key={token.id}
                className={`rounded-full px-3 py-1 font-mono text-xs ${
                  index < state.seenCount ? 'bg-accent-soft text-ink' : 'border border-dashed border-line text-muted'
                }`}
              >
                {index < state.seenCount ? token.label : '…'}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4" aria-live="polite">
        <p className="font-mono text-xs tracking-wide text-muted uppercase">Plan</p>
        <p className="mt-1 font-serif text-xl leading-snug">{state.sentence}</p>
        {state.note ? <p className="mt-1 text-sm text-muted">{state.note}</p> : null}
      </div>

      <form
        className="mt-5 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          dispatch({ type: 'run', reduced });
        }}
      >
        <label htmlFor={`${markerId}-instruction`} className="sr-only">
          Instruction
        </label>
        <input
          id={`${markerId}-instruction`}
          value={state.text}
          onChange={(event) => dispatch({ type: 'text', text: event.target.value })}
          placeholder="Put the red block in the tray"
          className="min-h-11 w-full rounded-full border border-line bg-paper px-4 text-sm text-ink"
        />
        <button type="submit" className="btn btn-solid min-h-11 shrink-0">
          Run
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={choiceClass(state.text === preset.text)}
            aria-pressed={state.text === preset.text}
            onClick={() => dispatch({ type: 'run', reduced, text: preset.text })}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
          <label htmlFor={`${markerId}-steps`}>Flow steps</label>
          <span className="font-mono text-muted tabular-nums">
            {state.phase === 'flow' ? `${state.flowFrame} / ${state.flowSteps}` : state.flowSteps}
          </span>
        </div>
        <input
          id={`${markerId}-steps`}
          type="range"
          min={1}
          max={FLOW_MAX}
          step={1}
          value={state.flowSteps}
          disabled={state.phase === 'act'}
          onChange={(event) => dispatch({ type: 'steps', steps: Number(event.target.value) })}
        />
        <p className="mt-1 text-sm text-muted">{flowHint} Each step walks the straight-line velocity toward the answer.</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-solid min-h-11 disabled:opacity-40"
          disabled={reduced}
          onClick={() => dispatch(state.playing ? { type: 'pause' } : { type: 'play', reduced })}
        >
          {state.playing ? 'Pause' : 'Play the loop'}
        </button>
        <button
          type="button"
          className="btn btn-line min-h-11 disabled:opacity-40"
          disabled={state.phase === 'act' || state.phase === 'finished'}
          onClick={() => dispatch({ type: 'step', reduced })}
        >
          Step
        </button>
        <button type="button" className="btn btn-line min-h-11" onClick={() => dispatch({ type: 'shuffle' })}>
          Shuffle
        </button>
        <button type="button" className="btn btn-line min-h-11" onClick={() => dispatch({ type: 'reset' })}>
          Reset
        </button>
      </div>

      {reduced ? (
        <p className="mt-3 text-sm text-muted">
          Play is off because this browser prefers reduced motion. Step still walks the loop, and the gripper jumps
          to the end of each move.
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Play runs the whole loop. Step walks one beat: the next token, the plan, one flow step, or the move.
        </p>
      )}
      <p className="mt-2 text-sm text-muted">
        No network and no model. The sentences come from a few grammar rules, and the path is geometry. A real
        vision-language-action model would have learned both from data.
      </p>
    </div>
  );
}

function describe(state: DemoState): string {
  const layout = state.table.blocks.map((item) => `${item.id} ${whereWord(item)}`).join(', ');
  return `Top-down table. ${layout}. Phase: ${PHASE_LABEL[state.phase]}. ${state.sentence}`;
}

function whereWord(item: { inTray: boolean; on: BlockId | null; x: number }): string {
  if (item.on) return `on ${item.on}`;
  if (item.inTray) return 'in the tray';
  if (item.x < 230) return 'on the left';
  if (item.x < 420) return 'near the middle';
  return 'on the right';
}

type Pose = {
  x: number;
  y: number;
  open: boolean;
  /** Block currently in the fingers. Hidden from the table so it is not drawn twice. */
  hide: BlockId | null;
  ghost: { id: BlockId; x: number; y: number } | null;
};

function gripperPose(state: DemoState, shown: Waypoint[], t: number): Pose {
  const hand = state.table.gripper;
  if (state.phase !== 'act' || shown.length === 0 || !state.skill) {
    return {
      x: hand.x,
      y: hand.y,
      open: hand.open,
      hide: hand.holding,
      ghost: hand.holding ? { id: hand.holding, x: hand.x, y: hand.y } : null,
    };
  }

  const point = pointAlong(shown, t);
  const releaseAt = eventFraction(shown);
  const arrived = t >= releaseAt - 0.001;

  if (state.skill.type === 'pick') {
    const target = blockById(state.table, state.skill.block);
    const end = shown[shown.length - 1];
    const hit = Math.hypot(end.x - target.x, end.y - target.y) <= GRASP;
    const carrying = arrived && hit;
    return {
      x: point.x,
      y: point.y,
      open: !arrived,
      hide: carrying ? state.skill.block : null,
      ghost: carrying ? { id: state.skill.block, x: point.x, y: point.y } : null,
    };
  }

  const held = hand.holding;
  if (!held) return { x: point.x, y: point.y, open: true, hide: null, ghost: null };
  const drop = pointAlong(shown, releaseAt);
  if (!arrived) {
    return {
      x: point.x,
      y: point.y,
      open: false,
      hide: held,
      ghost: { id: held, x: point.x, y: point.y },
    };
  }
  return {
    x: point.x,
    y: point.y,
    open: true,
    hide: held,
    ghost: { id: held, x: drop.x, y: drop.y },
  };
}

function Target(props: { x: number; y: number }) {
  const half = scene.block / 2 + 6;
  return (
    <rect
      x={props.x - half}
      y={props.y - half}
      width={half * 2}
      height={half * 2}
      rx="10"
      fill="none"
      stroke="var(--accent)"
      strokeDasharray="4 3"
    />
  );
}

function Block(props: { id: BlockId; x: number; y: number }) {
  const half = scene.block / 2;
  const letter = props.id.slice(0, 1).toUpperCase();
  return (
    <g>
      <rect
        x={props.x - half}
        y={props.y - half}
        width={scene.block}
        height={scene.block}
        rx="8"
        fill={BLOCK_FILL[props.id]}
      />
      <text
        x={props.x}
        y={props.y + 5}
        textAnchor="middle"
        fill="#fffdf8"
        fontSize="16"
        fontFamily="IBM Plex Mono, ui-monospace, monospace"
      >
        {letter}
      </text>
    </g>
  );
}

function Gripper(props: { x: number; y: number; open: boolean }) {
  const spread = props.open ? 16 : 8;
  return (
    <g>
      <line
        x1={props.x - spread}
        y1={props.y - 26}
        x2={props.x - 7}
        y2={props.y - 4}
        stroke="var(--ink)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <line
        x1={props.x + spread}
        y1={props.y - 26}
        x2={props.x + 7}
        y2={props.y - 4}
        stroke="var(--ink)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx={props.x} cy={props.y - 30} r="7" fill="var(--card)" stroke="var(--ink)" strokeWidth="2.5" />
    </g>
  );
}
