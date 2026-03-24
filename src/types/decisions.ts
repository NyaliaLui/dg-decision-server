// ---------------------------------------------------------------------------
// decisions.ts — Message protocol types for the WebSocket channel.
// ---------------------------------------------------------------------------

import type { BarbarianAction, BarbarianRole } from './actions';
import type {
  ClientBarbarianState,
  EnvironmentState,
  PlayerState,
  Vector3,
} from './gameState';

// ---------------------------------------------------------------------------
// Server → Client messages
// ---------------------------------------------------------------------------

/**
 * One decision per live Barbarian, emitted every 100 ms tick.
 */
export interface BarbarianDecision {
  barbarianId: string;
  action: BarbarianAction;
  /** Movement direction: -1 = left (−X), 1 = right (+X). */
  direction: number;
  /**
   * Suggested duration in milliseconds the client should hold this action
   * before requesting a new decision. The client may cut it short if a new
   * DECISIONS message arrives before the timer fires.
   */
  durationMs: number;
  /**
   * Which AI layer produced this decision. Used for debug overlays.
   * 'utility' | 'bait-sm' | 'punish-sm' | 'claude-override'
   */
  strategyTag: string;
  /** Human-readable explanation (debug only, stripped in production). */
  reasoning?: string;
}

/**
 * Sent once per respawning Barbarian when the delay timer has elapsed.
 * The client creates a fresh Barbarian component at spawnPosition and
 * begins playing the CHASE animation immediately so the barbarian
 * naturally walks into the arena.
 */
export interface SpawnInstruction {
  /** Fresh ID for the new Barbarian instance. */
  barbarianId: string;
  /** World position at the edge of the arena (just outside visible bounds). */
  spawnPosition: Vector3;
  /** The direction the barbarian should walk when it enters (-1 | 1). */
  entryDirection: number;
  /** Informational: how many ms elapsed between death and this spawn event. */
  delayMs: number;
}

export interface DecisionsMessage {
  type: 'DECISIONS';
  /** Echoed tickId from the triggering GAME_STATE message. */
  tickId: number;
  decisions: BarbarianDecision[];
  /** Map of barbarianId → newly assigned role (only included when roles changed). */
  roleUpdates: Record<string, BarbarianRole>;
}

export interface SpawnMessage {
  type: 'SPAWN';
  spawn: SpawnInstruction;
}

// ---------------------------------------------------------------------------
// Client → Server messages
// ---------------------------------------------------------------------------

/**
 * Full game state snapshot sent by the client every ~100 ms.
 * Server enriches this and runs the decision pipeline.
 */
export interface GameStateMessage {
  type: 'GAME_STATE';
  tickId: number;
  timestamp: number;
  player: PlayerState;
  /** Client-side barbarian states without server-derived spatial fields. */
  barbarians: ClientBarbarianState[];
  environment: EnvironmentState;
}

/**
 * Sent immediately when a Barbarian's HP reaches 0, before the component
 * is removed. The server uses this to start the respawn countdown.
 */
export interface BarbarianDiedMessage {
  type: 'BARBARIAN_DIED';
  barbarianId: string;
  timestamp: number;
  /** Number of barbarians still alive AFTER this one was removed. */
  aliveCount: number;
}

// ---------------------------------------------------------------------------
// Union type for all incoming client messages
// ---------------------------------------------------------------------------

export type ClientMessage = GameStateMessage | BarbarianDiedMessage;

// ---------------------------------------------------------------------------
// Union type for all outgoing server messages
// ---------------------------------------------------------------------------

export type ServerMessage = DecisionsMessage | SpawnMessage;
