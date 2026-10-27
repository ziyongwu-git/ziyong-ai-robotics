import { useId, useState } from 'react';
import { solveArm, UPPER_LINK, LOWER_LINK, type Elbow } from './kinematics';

/**
 * Interactive two-link arm.
 *
 * This is a React island. Astro sends it to the browser only because the
 * MDX page renders <RobotArm client:load />. Without client:load the sliders
 * would be a still picture.
 *
 * `not-prose` on the outer element opts out of the article typography styles.
 * Those styles are strong enough to restyle buttons inside a demo.
 *
 * The math lives in kinematics.ts so this file can stay about the drawing.
 */

const VIEW = { size: 480, origin: 240 };

const PRESETS = [
  { id: 'reachable', label: 'Reachable', x: 130, y: 90 },
  { id: 'far', label: 'Too far', x: 170, y: 160 },
  { id: 'close', label: 'Too close', x: 12, y: 8 },
] as const;

function toScreen(x: number, y: number) {
  return { x: VIEW.origin + x, y: VIEW.origin - y };
}

function formatDegrees(radians: number): string {
  const degrees = (radians * 180) / Math.PI;
  const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return wrapped.toFixed(1);
}

function formatUnits(value: number): string {
  return value.toFixed(1);
}

function Slider(props: {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <label htmlFor={props.id}>{props.label}</label>
        <span className="font-mono text-muted tabular-nums">{props.value}</span>
      </div>
      <input
        id={props.id}
        type="range"
        min={props.min}
        max={props.max}
        step={1}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </div>
  );
}

export default function RobotArm() {
  const baseId = useId();
  const [targetX, setTargetX] = useState(130);
  const [targetY, setTargetY] = useState(90);
  const [elbow, setElbow] = useState<Elbow>('a');

  const pose = solveArm(targetX, targetY, elbow);
  const base = toScreen(0, 0);
  const joint = toScreen(pose.jointX, pose.jointY);
  const hand = toScreen(pose.endX, pose.endY);
  const target = toScreen(targetX, targetY);
  const shoulder = formatDegrees(pose.theta1);
  const elbowDegrees = formatDegrees(pose.theta2);

  const choiceClass = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-sm ${on ? 'bg-ink text-paper' : 'border border-line bg-paper text-ink'}`;

  return (
    <div className="not-prose rounded-2xl border border-line bg-card p-4 text-ink sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-2xl">Two-link arm</h3>
        <p
          className={`rounded-full px-3 py-1 text-sm ${pose.reachable ? 'bg-highlight-soft' : 'bg-accent-soft'}`}
        >
          {pose.reachable ? 'Inside reach' : 'Outside reach'}
        </p>
      </div>

      <svg
        viewBox={`0 0 ${VIEW.size} ${VIEW.size}`}
        className="mx-auto mt-4 h-auto w-full max-w-[520px]"
        role="img"
        aria-label={`Two-link arm. Shoulder ${shoulder} degrees, elbow ${elbowDegrees} degrees. ${
          pose.reachable ? 'The hand is on the target.' : 'The target is outside the reach rings.'
        }`}
      >
        <line x1="40" y1={VIEW.origin} x2="440" y2={VIEW.origin} stroke="var(--line)" />
        <line x1={VIEW.origin} y1="40" x2={VIEW.origin} y2="440" stroke="var(--line)" />
        <circle
          cx={VIEW.origin}
          cy={VIEW.origin}
          r={pose.maxReach}
          fill="none"
          stroke="var(--line)"
          strokeDasharray="4 7"
        />
        <circle
          cx={VIEW.origin}
          cy={VIEW.origin}
          r={pose.minReach}
          fill="none"
          stroke="var(--line)"
          strokeDasharray="3 5"
        />
        {!pose.reachable && (
          <line
            x1={hand.x}
            y1={hand.y}
            x2={target.x}
            y2={target.y}
            stroke="var(--accent)"
            strokeDasharray="4 4"
          />
        )}
        <line
          x1={base.x}
          y1={base.y}
          x2={joint.x}
          y2={joint.y}
          stroke="var(--ink)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <line
          x1={joint.x}
          y1={joint.y}
          x2={hand.x}
          y2={hand.y}
          stroke="var(--accent)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <circle cx={base.x} cy={base.y} r="7" fill="var(--ink)" />
        <circle cx={joint.x} cy={joint.y} r="6" fill="var(--card)" stroke="var(--ink)" strokeWidth="3" />
        <circle cx={hand.x} cy={hand.y} r="6" fill="var(--highlight)" />
        <g stroke="var(--accent)" strokeWidth="2">
          <circle cx={target.x} cy={target.y} r="9" fill="none" />
          <line x1={target.x - 14} y1={target.y} x2={target.x + 14} y2={target.y} />
          <line x1={target.x} y1={target.y - 14} x2={target.x} y2={target.y + 14} />
        </g>
        <text x="424" y="232" fill="var(--muted)" fontSize="13">
          x
        </text>
        <text x="248" y="52" fill="var(--muted)" fontSize="13">
          y
        </text>
      </svg>
      <p className="mt-2 text-sm text-muted">
        Dashed circles are the closest and farthest the hand can reach. Link lengths are {UPPER_LINK} and{' '}
        {LOWER_LINK} diagram units. The crosshair is the target.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Slider id={`${baseId}-x`} label="Target X" min={-180} max={180} value={targetX} onChange={setTargetX} />
        <Slider id={`${baseId}-y`} label="Target Y" min={-180} max={180} value={targetY} onChange={setTargetY} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={choiceClass(targetX === preset.x && targetY === preset.y)}
            onClick={() => {
              setTargetX(preset.x);
              setTargetY(preset.y);
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <p className="font-mono text-xs tracking-wide text-muted uppercase">Elbow bend</p>
        <p className="mt-1 text-sm text-muted">Most targets inside the rings can be reached two ways.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={choiceClass(elbow === 'a')} aria-pressed={elbow === 'a'} onClick={() => setElbow('a')}>
            Bend A
          </button>
          <button type="button" className={choiceClass(elbow === 'b')} aria-pressed={elbow === 'b'} onClick={() => setElbow('b')}>
            Bend B
          </button>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6">
        {pose.reachable
          ? 'The hand is on the target. Switch bends to see the other elbow solution.'
          : 'No pair of link lengths can touch that point. The arm stops on the nearest ring, and the dashed line is the gap.'}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-paper px-3 py-2">
          <dt className="font-mono text-xs tracking-wide text-muted uppercase">Shoulder</dt>
          <dd className="mt-1 font-mono text-lg tabular-nums">{shoulder}°</dd>
        </div>
        <div className="rounded-xl bg-paper px-3 py-2">
          <dt className="font-mono text-xs tracking-wide text-muted uppercase">Elbow</dt>
          <dd className="mt-1 font-mono text-lg tabular-nums">{elbowDegrees}°</dd>
        </div>
        <div className="rounded-xl bg-paper px-3 py-2">
          <dt className="font-mono text-xs tracking-wide text-muted uppercase">Distance</dt>
          <dd className="mt-1 font-mono text-lg tabular-nums">{formatUnits(pose.requestedReach)}</dd>
        </div>
        <div className="rounded-xl bg-paper px-3 py-2">
          <dt className="font-mono text-xs tracking-wide text-muted uppercase">Gap</dt>
          <dd className="mt-1 font-mono text-lg tabular-nums">{formatUnits(pose.gap)}</dd>
        </div>
      </dl>
    </div>
  );
}
