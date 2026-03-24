// ---------------------------------------------------------------------------
// GameStateManager.ts — Canonical world model for the decision server.
//
// Responsibilities:
//  • Accept raw client snapshots and enrich them with server-computed
//    spatial fields (distance, angle, FOV membership).
//  • Maintain a 30-frame ring buffer of recent states (≈ 3 s at 100 ms ticks).
//  • Expose query helpers used by AI modules:
//      - getPlayerAttackPattern()  → 'aggressive' | 'reactive' | 'unknown'
//      - getPlayerHPTrend()        → 'falling' | 'stable' | 'rising'
//  • Store and serve the squad strategy + Claude insights.
// ---------------------------------------------------------------------------

import type { GameStateMessage } from '../types/decisions';
import type {
  BarbarianState,
  ClientBarbarianState,
  ClaudeInsights,
  GameState,
  GameStateHistory,
  PlayerState,
  Vector3,
} from '../types/gameState';
import type { BarbarianRole, SquadStrategy } from '../types/actions';
import { logger } from '../utils/logger';

/** Maximum number of historical snapshots retained in the ring buffer. */
const HISTORY_MAX = 30;

/**
 * Player is "aggressively attacking" when more than half of the recent
 * history frames contain an isAttacking=true player state.
 */
const AGGRESSION_THRESHOLD = 0.5;

export class GameStateManager {
  private current: GameState | null = null;
  private history: GameStateHistory = [];

  private squadStrategy: SquadStrategy = 'COORDINATED';
  private claudeInsights: ClaudeInsights | null = null;

  // Cache the previous role map so we can diff it for roleUpdates in decisions.
  private lastRoleMap: Record<string, BarbarianRole> = {};

  // ---------------------------------------------------------------------------
  // Update from client message
  // ---------------------------------------------------------------------------

  update(msg: GameStateMessage): void {
    const enriched = this.enrich(msg);
    this.pushHistory(enriched);
    this.current = enriched;
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  getCurrentState(): GameState | null {
    return this.current;
  }

  getHistory(): GameStateHistory {
    return this.history;
  }

  getSquadStrategy(): SquadStrategy {
    return this.squadStrategy;
  }

  setSquadStrategy(strategy: SquadStrategy): void {
    if (strategy !== this.squadStrategy) {
      logger.info(
        `Squad strategy changed: ${this.squadStrategy} → ${strategy}`,
      );
    }
    this.squadStrategy = strategy;
  }

  getClaudeInsights(): ClaudeInsights | null {
    return this.claudeInsights;
  }

  setClaudeInsights(insights: ClaudeInsights): void {
    this.claudeInsights = insights;
  }

  getLastRoleMap(): Record<string, BarbarianRole> {
    return this.lastRoleMap;
  }

  setLastRoleMap(roles: Record<string, BarbarianRole>): void {
    this.lastRoleMap = roles;
  }

  // ---------------------------------------------------------------------------
  // AI query helpers
  // ---------------------------------------------------------------------------

  /**
   * Analyse how often the player was attacking in the recent history window.
   * Returns 'aggressive' when the player attacks more than AGGRESSION_THRESHOLD
   * of frames, 'reactive' when rarely, 'unknown' when history is too short.
   */
  getPlayerAttackPattern(): 'aggressive' | 'reactive' | 'unknown' {
    if (this.history.length < 5) return 'unknown';

    const window = this.history.slice(-20); // last ~2 s
    const attackingFrames = window.filter((s) => s.player.isAttacking).length;
    const ratio = attackingFrames / window.length;

    if (ratio > AGGRESSION_THRESHOLD) return 'aggressive';
    return 'reactive';
  }

  /**
   * Returns the direction of player HP change over the recent window.
   * Useful for Claude to judge urgency.
   */
  getPlayerHPTrend(): 'falling' | 'stable' | 'rising' {
    if (this.history.length < 3) return 'stable';

    const oldest = this.history[0].player.hp;
    const latest = this.current!.player.hp;
    const delta = latest - oldest;

    if (delta < -5) return 'falling';
    if (delta > 5) return 'rising';
    return 'stable';
  }

  /**
   * Average number of live barbarians across the full history window.
   * Gives Claude context on whether reinforcements are urgently needed.
   */
  getAverageBarbariansAlive(): number {
    if (this.history.length === 0) return 0;
    const total = this.history.reduce((s, gs) => s + gs.barbarians.length, 0);
    return total / this.history.length;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Enrich a raw client message into a full GameState by:
   *  1. Computing spatial fields for each barbarian (distance, angle, FOV).
   *  2. Preserving the last known role assignment from lastRoleMap.
   */
  private enrich(msg: GameStateMessage): GameState {
    const player = msg.player;

    const barbarians: BarbarianState[] = msg.barbarians.map((raw) =>
      this.enrichBarbarian(raw, player),
    );

    return {
      tickId: msg.tickId,
      timestamp: msg.timestamp,
      player,
      barbarians,
      environment: msg.environment,
    };
  }

  private enrichBarbarian(
    raw: ClientBarbarianState,
    player: PlayerState,
  ): BarbarianState {
    const distanceToPlayer = xzDistance(raw.position, player.position);
    const angleToPlayer = xzAngleToTarget(
      raw.position,
      raw.facingDirection,
      player.position,
    );
    const isInPlayerFOV = isWithinFOV(raw.position, player);
    const role = this.lastRoleMap[raw.id] ?? null;

    return {
      ...raw,
      distanceToPlayer,
      angleToPlayer,
      isInPlayerFOV,
      role,
    };
  }

  private pushHistory(state: GameState): void {
    this.history.push(state);
    if (this.history.length > HISTORY_MAX) {
      this.history.shift(); // drop oldest entry
    }
  }
}

// ---------------------------------------------------------------------------
// Spatial geometry helpers
// ---------------------------------------------------------------------------

/** Euclidean distance on the XZ plane (ignores Y / height). */
function xzDistance(a: Vector3, b: Vector3): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Angle (radians) from the barbarian's current facing direction to the player.
 *  0   = player is directly ahead of the barbarian.
 *  ±π  = player is directly behind the barbarian.
 * Positive = player is clockwise from facing direction.
 */
function xzAngleToTarget(
  from: Vector3,
  facingDir: number,
  to: Vector3,
): number {
  // Vector from barbarian to player
  const dx = to.x - from.x;
  const dz = to.z - from.z;

  // Barbarian facing vector (+X = 1, −X = −1, Z component = 0)
  const fx = facingDir;
  const fz = 0;

  // Signed angle via atan2 of cross/dot products in 2D
  const cross = fx * dz - fz * dx; // z-component of the cross product
  const dot = fx * dx + fz * dz;
  return Math.atan2(cross, dot);
}

/**
 * Returns true when the barbarian is within the player's forward hemisphere
 * (within ±90° of the player's facing direction).
 */
function isWithinFOV(barbPos: Vector3, player: PlayerState): boolean {
  const dx = barbPos.x - player.position.x;
  // Player faces ±X. Dot product with facing direction is just dx * facingDir.
  return dx * player.facingDirection > 0;
}
