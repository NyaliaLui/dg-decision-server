// ---------------------------------------------------------------------------
// gameState.ts — Game world data structures shared across all server modules.
// ---------------------------------------------------------------------------

import type { BarbarianAction, BarbarianRole } from './actions';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export type AttackType = 'normal' | 'crouch' | 'special' | null;

export interface PlayerState {
  id: string;
  position: Vector3;
  velocity: Vector3;
  hp: number;
  maxHp: number;
  /** -1 = facing left (−X), 1 = facing right (+X) */
  facingDirection: number;
  isAttacking: boolean;
  attackType: AttackType;
  /** Unix ms timestamp when the current attack animation started. Null when idle. */
  attackStartedAt: number | null;
  isJumping: boolean;
  isCrouching: boolean;
}

// ---------------------------------------------------------------------------
// Barbarian — as received from the client (no server-computed fields)
// ---------------------------------------------------------------------------

export interface ClientBarbarianState {
  id: string;
  position: Vector3;
  velocity: Vector3;
  hp: number;
  maxHp: number;
  /** -1 = facing left (−X), 1 = facing right (+X) */
  facingDirection: number;
  isGrounded: boolean;
  currentAction: BarbarianAction;
}

// ---------------------------------------------------------------------------
// Barbarian — after server enrichment (derived spatial fields added)
// ---------------------------------------------------------------------------

export interface BarbarianState extends ClientBarbarianState {
  /** Euclidean distance on the XZ plane to the player. */
  distanceToPlayer: number;
  /**
   * Angle (radians) from the barbarian's facing direction to the player.
   * 0 = directly ahead, ±π = directly behind.
   */
  angleToPlayer: number;
  /**
   * True when the player's facing direction points within a ±90° cone toward
   * this barbarian — meaning the player can see this barbarian.
   */
  isInPlayerFOV: boolean;
  /** Assigned each tick by CoordinationLayer. Null until first assignment. */
  role: BarbarianRole | null;
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface EnvironmentState {
  worldBounds: WorldBounds;
  /** Y coordinate of the ground surface. Characters rest at groundY + body offset. */
  groundY: number;
}

// ---------------------------------------------------------------------------
// Full world snapshot (one server tick)
// ---------------------------------------------------------------------------

export interface GameState {
  /** Monotonically increasing counter, echoed back in DecisionsMessage. */
  tickId: number;
  /** Unix ms timestamp from the client when this snapshot was captured. */
  timestamp: number;
  player: PlayerState;
  barbarians: BarbarianState[];
  environment: EnvironmentState;
}

/**
 * Ring buffer of the last N game states kept by GameStateManager.
 * Gives the AI modules a short history window for pattern analysis.
 */
export type GameStateHistory = GameState[];

// ---------------------------------------------------------------------------
// Claude AI supplemental insights stored on GameStateManager
// ---------------------------------------------------------------------------

export interface ClaudeInsights {
  /** Whether Claude currently wants a BAITER to be active. */
  claudeSuggestsBait: boolean;
  /** Short reasoning string for debug logging. */
  reasoning: string;
  /** Unix ms timestamp when this insight was generated. */
  generatedAt: number;
}
