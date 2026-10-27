/**
 * Inverse kinematics for a two-link arm on a flat plane.
 *
 * The base sits at (0, 0). The upper link and the forearm are straight
 * segments. Given a target point, we ask which joint angles put the hand there.
 *
 * Law of cosines, at the elbow:
 *   cos(theta2) = (x² + y² − L1² − L2²) / (2 · L1 · L2)
 *
 * The shoulder angle points at the target, then backs off by the amount the
 * forearm is folded. Most points inside the reach rings have two answers,
 * one for each way the elbow can bend. `elbow` picks which answer.
 *
 * If the point is closer than |L1 − L2| or farther than L1 + L2, no triangle
 * exists. The arm is drawn fully folded or fully stretched toward the point,
 * and `reachable` is false.
 */

export const UPPER_LINK = 115;
export const LOWER_LINK = 85;
export const MIN_REACH = Math.abs(UPPER_LINK - LOWER_LINK);
export const MAX_REACH = UPPER_LINK + LOWER_LINK;

/** "a" and "b" are the two elbow bends that can share one target. */
export type Elbow = 'a' | 'b';

export interface ArmPose {
  reachable: boolean;
  /** Straight-line distance from the base to the requested target. */
  requestedReach: number;
  minReach: number;
  maxReach: number;
  /** Shoulder angle, in radians, measured from the +x axis. */
  theta1: number;
  /** Elbow angle, in radians. Positive and negative are the two bends. */
  theta2: number;
  jointX: number;
  jointY: number;
  endX: number;
  endY: number;
  /** Distance from the hand to the requested target. Zero when the pose reaches it. */
  gap: number;
}

export function solveArm(targetX: number, targetY: number, elbow: Elbow): ArmPose {
  const requestedReach = Math.hypot(targetX, targetY);
  const reachable = requestedReach <= MAX_REACH + 1e-6 && requestedReach >= MIN_REACH - 1e-6;
  const clampedReach = Math.min(MAX_REACH, Math.max(MIN_REACH, requestedReach));

  // Aim at a point that is always on the reachable ring, so the trig stays valid.
  let aimX: number;
  let aimY: number;
  if (requestedReach === 0) {
    aimX = clampedReach;
    aimY = 0;
  } else {
    const scale = clampedReach / requestedReach;
    aimX = targetX * scale;
    aimY = targetY * scale;
  }

  const cosTheta2 =
    (aimX * aimX + aimY * aimY - UPPER_LINK * UPPER_LINK - LOWER_LINK * LOWER_LINK) /
    (2 * UPPER_LINK * LOWER_LINK);
  const clampedCos = Math.min(1, Math.max(-1, cosTheta2));
  const sinMagnitude = Math.sqrt(Math.max(0, 1 - clampedCos * clampedCos));
  const sinTheta2 = elbow === 'a' ? sinMagnitude : -sinMagnitude;

  const theta2 = Math.atan2(sinTheta2, clampedCos);
  const theta1 =
    Math.atan2(aimY, aimX) - Math.atan2(LOWER_LINK * sinTheta2, UPPER_LINK + LOWER_LINK * clampedCos);

  const jointX = UPPER_LINK * Math.cos(theta1);
  const jointY = UPPER_LINK * Math.sin(theta1);
  const endX = jointX + LOWER_LINK * Math.cos(theta1 + theta2);
  const endY = jointY + LOWER_LINK * Math.sin(theta1 + theta2);
  const rawGap = Math.hypot(endX - targetX, endY - targetY);

  return {
    reachable,
    requestedReach,
    minReach: MIN_REACH,
    maxReach: MAX_REACH,
    theta1,
    theta2,
    jointX,
    jointY,
    endX,
    endY,
    gap: rawGap < 0.5 ? 0 : rawGap,
  };
}
