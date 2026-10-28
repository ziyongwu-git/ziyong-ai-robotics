/**
 * Numbers for a generated cover.
 *
 * When a note or project has no `cover` in its frontmatter, CoverArt.astro
 * draws an inline SVG from this layout. The same title always gets the same
 * picture. Colors stay in the SVG as CSS variables, so the drawing follows
 * light and dark mode.
 *
 * Tags pick the layers:
 * - ai: a small neural net
 * - robotics: a two-link arm and reach rings
 * - data: streams and a row of bars
 * A note with more than one tag shows each of those layers.
 * An unknown tag still gets a drawing, so a future tag is never a blank box.
 */

export type Point = { x: number; y: number };

export type CoverNode = Point & { r: number; live: boolean };

export type CoverEdge = { x1: number; y1: number; x2: number; y2: number };

export type CoverBar = { x: number; y: number; h: number };

export type CoverModel = {
  showNet: boolean;
  showArm: boolean;
  showData: boolean;
  nodes: CoverNode[];
  edges: CoverEdge[];
  streams: string[];
  bars: CoverBar[];
  rings: { cx: number; cy: number; r: number }[];
  upper: { x1: number; y1: number; x2: number; y2: number };
  lower: { x1: number; y1: number; x2: number; y2: number };
  ghostUpper: { x1: number; y1: number; x2: number; y2: number };
  ghostLower: { x1: number; y1: number; x2: number; y2: number };
  shoulder: Point;
  elbow: Point;
  hand: Point;
  ghostElbow: Point;
  ghostHand: Point;
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** A stable 0..1 value. `salt` picks a different number from the same title. */
function unit(hash: number, salt: number): number {
  const mixed = Math.imul(hash ^ Math.imul(salt + 1, 0x45d9f3b), 0x9e3779b1);
  return ((mixed >>> 0) % 10000) / 10000;
}

function between(hash: number, salt: number, min: number, max: number): number {
  return min + unit(hash, salt) * (max - min);
}

function polar(origin: Point, length: number, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: Math.round((origin.x + length * Math.cos(radians)) * 10) / 10,
    y: Math.round((origin.y + length * Math.sin(radians)) * 10) / 10,
  };
}

function column(hash: number, salt: number, x: number, count: number, top: number, bottom: number): CoverNode[] {
  const nodes: CoverNode[] = [];
  const step = count === 1 ? 0 : (bottom - top) / (count - 1);
  const liveIndex = Math.floor(unit(hash, salt) * count);
  for (let index = 0; index < count; index += 1) {
    nodes.push({
      x,
      y: Math.round(top + step * index),
      r: index === liveIndex ? 7 : 5,
      live: index === liveIndex,
    });
  }
  return nodes;
}

export function coverModel(title: string, tags: readonly string[]): CoverModel {
  const hash = hashString(`${title}|${tags.join(',')}`);
  const showNet = tags.includes('ai');
  const showArm = tags.includes('robotics');
  const showData = tags.includes('data');
  const known = showNet || showArm || showData;
  const net = showNet || !known;
  const arm = showArm || !known;
  const data = showData || !known;

  const netOnLeft = arm || data;
  const layerX = netOnLeft ? [78, 188, 298] : [150, 320, 490];
  const inputCount = unit(hash, 1) > 0.5 ? 4 : 3;
  const hiddenCount = unit(hash, 2) > 0.45 ? 5 : 4;
  const outputCount = unit(hash, 3) > 0.55 ? 3 : 2;
  const inputs = column(hash, 4, layerX[0], inputCount, 150, 300);
  const hidden = column(hash, 5, layerX[1], hiddenCount, 132, 318);
  const outputs = column(hash, 6, layerX[2], outputCount, 168, 286);
  const nodes = [...inputs, ...hidden, ...outputs];

  const edges: CoverEdge[] = [];
  const connect = (from: CoverNode[], to: CoverNode[]) => {
    for (const start of from) {
      for (const end of to) {
        edges.push({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
      }
    }
  };
  connect(inputs, hidden);
  connect(hidden, outputs);

  const shoulder: Point = arm && (net || data) ? { x: 470, y: 250 } : { x: 230, y: 230 };
  const upperLength = arm && (net || data) ? 108 : 150;
  const lowerLength = arm && (net || data) ? 86 : 124;
  const shoulderAngle = between(hash, 7, -118, -68);
  const elbowBend = between(hash, 8, 28, 78);
  const elbow = polar(shoulder, upperLength, shoulderAngle);
  const hand = polar(elbow, lowerLength, shoulderAngle + elbowBend);
  // A second, fainter pose so an arm-only cover is not a single stroke on a blank field.
  const ghostAngle = shoulderAngle + 24;
  const ghostBend = Math.max(16, elbowBend - 20);
  const ghostElbow = polar(shoulder, upperLength, ghostAngle);
  const ghostHand = polar(ghostElbow, lowerLength, ghostAngle + ghostBend);

  const streamCount = 3;
  const streams: string[] = [];
  for (let index = 0; index < streamCount; index += 1) {
    const y = data && (net || arm) ? 48 + index * 28 : 90 + index * 52;
    const bend = between(hash, 10 + index, -36, 36);
    streams.push(`M -20 ${y} C 140 ${y + bend}, 280 ${y - bend}, 460 ${y + bend / 2} S 620 ${y - bend}, 680 ${y}`);
  }

  const bars: CoverBar[] = [];
  const barCount = 7;
  // The arm occupies the right side, so the bars sit on the left when both show.
  const barOrigin = arm ? 36 : 392;
  for (let index = 0; index < barCount; index += 1) {
    const h = between(hash, 20 + index, 26, 88);
    bars.push({
      x: barOrigin + index * 28,
      y: 332 - h,
      h,
    });
  }

  const reach = upperLength + lowerLength;
  const rings = [
    { cx: shoulder.x, cy: shoulder.y, r: Math.round(reach * 0.42) },
    { cx: shoulder.x, cy: shoulder.y, r: Math.round(Math.abs(upperLength - lowerLength) + 18) },
  ];

  return {
    showNet: net,
    showArm: arm,
    showData: data,
    nodes,
    edges,
    streams,
    bars,
    rings,
    upper: { x1: shoulder.x, y1: shoulder.y, x2: elbow.x, y2: elbow.y },
    lower: { x1: elbow.x, y1: elbow.y, x2: hand.x, y2: hand.y },
    ghostUpper: { x1: shoulder.x, y1: shoulder.y, x2: ghostElbow.x, y2: ghostElbow.y },
    ghostLower: { x1: ghostElbow.x, y1: ghostElbow.y, x2: ghostHand.x, y2: ghostHand.y },
    shoulder,
    elbow,
    hand,
    ghostElbow,
    ghostHand,
  };
}
