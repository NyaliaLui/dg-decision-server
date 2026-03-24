// ---------------------------------------------------------------------------
// CoordinationLayer.ts — Squad role assignment.
//
// Called once per decision tick (before UtilityAI) to assign each live
// barbarian a role that reflects their position, HP, and the current squad
// strategy set by Claude.
//
// Role rules (applied in priority order):
//  1. Any barbarian at HP=1 AND not the last one alive → SUPPORT (conserve HP).
//  2. The barbarian closest to the player → ATTACKER (primary pressure).
//  3. If strategy is BAIT_HEAVY and a second barbarian has HP>1 → BAITER.
//  4. If strategy is COORDINATED and a second barbarian exists → FLANKER.
//  5. If strategy is AGGRESSIVE or OVERWHELM, 2nd barbarian → ATTACKER too.
//  6. All remaining barbarians → SUPPORT.
// ---------------------------------------------------------------------------

import type {
  BarbarianState,
  GameState,
  PlayerState,
  Vector3,
} from '../types/gameState';
import type { BarbarianRole, SquadStrategy } from '../types/actions';

export class CoordinationLayer {
  /**
   * Derive a role for every live barbarian given the current world state and
   * the squad strategy set by Claude AI.
   *
   * Returns a map of barbarianId → BarbarianRole.
   */
  assignRoles(
    state: GameState,
    strategy: SquadStrategy,
  ): Record<string, BarbarianRole> {
    const { barbarians, player } = state;
    const roles: Record<string, BarbarianRole> = {};

    if (barbarians.length === 0) return roles;

    // Sort ascending by distance to player so index 0 = closest.
    const sorted = [...barbarians].sort(
      (a, b) => a.distanceToPlayer - b.distanceToPlayer,
    );

    // Single barbarian — always ATTACKER unless critically wounded.
    if (sorted.length === 1) {
      roles[sorted[0].id] = sorted[0].hp === 1 ? 'SUPPORT' : 'ATTACKER';
      return roles;
    }

    // ── First pass: mark critically wounded as SUPPORT ──────────────────────
    // Exception: if ALL remaining barbarians are at HP=1, keep the closest as
    // ATTACKER regardless (game must continue).
    const healthyBarbarians = sorted.filter((b) => b.hp > 1);
    const allCritical = healthyBarbarians.length === 0;

    for (const barb of sorted) {
      if (barb.hp === 1 && !allCritical) {
        roles[barb.id] = 'SUPPORT';
      }
    }

    // ── Eligible barbarians (healthy or last resort) ─────────────────────────
    const eligible = sorted.filter((b) => !roles[b.id]);

    if (eligible.length === 0) {
      // Edge case: all are critical — promote the closest as attacker.
      roles[sorted[0].id] = 'ATTACKER';
      return roles;
    }

    // ── Primary (closest eligible) → ATTACKER ───────────────────────────────
    const primary = eligible[0];
    roles[primary.id] = 'ATTACKER';

    // ── Secondary barbarian role varies by strategy ──────────────────────────
    if (eligible.length >= 2) {
      const secondary = eligible[1];

      switch (strategy) {
        case 'BAIT_HEAVY':
          roles[secondary.id] = 'BAITER';
          break;

        case 'COORDINATED':
          roles[secondary.id] = 'FLANKER';
          break;

        case 'AGGRESSIVE':
        case 'OVERWHELM':
          // Everyone attacks.
          roles[secondary.id] = 'ATTACKER';
          break;

        case 'DEFENSIVE':
          // Second barbarian holds back and waits.
          roles[secondary.id] = 'SUPPORT';
          break;

        default:
          roles[secondary.id] = 'FLANKER';
      }
    }

    // ── All remaining → SUPPORT ──────────────────────────────────────────────
    for (const barb of eligible.slice(2)) {
      if (!roles[barb.id]) {
        roles[barb.id] = 'SUPPORT';
      }
    }

    return roles;
  }

  // ---------------------------------------------------------------------------
  // Spatial helpers exposed to UtilityAI / DecisionOrchestrator
  // ---------------------------------------------------------------------------

  /**
   * The ideal target X position for a FLANKER.
   *
   * The flanker should approach from the player's blind side — the direction
   * opposite to where the player is currently facing. We add an offset so the
   * flanker ends up beside (not behind) the player.
   */
  getFlankTargetX(
    barb: BarbarianState,
    player: PlayerState,
    worldBounds: GameState['environment']['worldBounds'],
  ): number {
    // If player faces +X (right), blind side is −X (left), and vice versa.
    const blindSide = -player.facingDirection as -1 | 1;
    const approachOffset = 1.5; // meters to the side of the player

    const targetX = player.position.x + blindSide * approachOffset;

    // Clamp within world boundaries.
    return Math.max(worldBounds.minX, Math.min(worldBounds.maxX, targetX));
  }

  /**
   * The movement direction a FLANKER should take to reach its target position.
   * Returns -1 (move left) or 1 (move right).
   */
  getFlankDirection(barb: BarbarianState, flankTargetX: number): number {
    return barb.position.x < flankTargetX ? 1 : -1;
  }

  /**
   * Returns true when the FLANKER has reached its target position within
   * a tolerance of 0.4 m (roughly one character width).
   */
  isFlankPositionReached(barb: BarbarianState, flankTargetX: number): boolean {
    return Math.abs(barb.position.x - flankTargetX) < 0.4;
  }
}
