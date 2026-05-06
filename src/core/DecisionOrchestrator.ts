// ---------------------------------------------------------------------------
// DecisionOrchestrator.ts — Main per-tick decision pipeline.
//
// Called every 100 ms by the main loop in index.ts.
// Execution order within each tick:
//
//   1. CoordinationLayer  — assign roles to all live barbarians.
//   2. RushStrategySM     — always-active chase-and-attack state machine.
//   3. Role diff          — compute which roles changed since last tick so the
//                           client can update debug overlays without noise.
//   4. Emit DecisionsMessage.
//
// Lifecycle of RushStrategySM instances:
//   • Created lazily when a barbarian is first seen.
//   • Removed when the barbarian disappears from the state (died / despawned).
//   • Force-reset when a barbarian respawns with the same slot but a new id.
// ---------------------------------------------------------------------------

import type { BarbarianDecision, DecisionsMessage } from '../types/decisions';
import type { BarbarianState } from '../types/gameState';
import type { BarbarianRole } from '../types/actions';
import { RushStrategySM } from '../ai/RushStrategySM';
import { UtilityAI } from '../ai/UtilityAI';
import { CoordinationLayer } from './CoordinationLayer';
import { GameStateManager } from './GameStateManager';
import { logger } from '../utils/logger';

export class DecisionOrchestrator {
  private readonly coordination: CoordinationLayer;
  private readonly utility: UtilityAI;

  /** One RushStrategySM per barbarian id, keyed by id. */
  private rushMachines = new Map<string, RushStrategySM>();

  constructor() {
    this.coordination = new CoordinationLayer();
    this.utility = new UtilityAI();
  }

  // ---------------------------------------------------------------------------
  // Public: run one decision tick
  // ---------------------------------------------------------------------------

  run(gsm: GameStateManager): DecisionsMessage | null {
    const state = gsm.getCurrentState();
    if (!state || state.barbarians.length === 0) return null;

    const strategy = gsm.getSquadStrategy();

    // ── 1. Role assignment ──────────────────────────────────────────────────
    const roles = this.coordination.assignRoles(state, strategy);

    // Attach roles to barbarian objects so UtilityAI can read them.
    const barbariansWithRoles: BarbarianState[] = state.barbarians.map((b) => ({
      ...b,
      role: roles[b.id] ?? null,
    }));

    // ── 2. Sync rush machine registry ──────────────────────────────────────
    this.syncRushMachines(barbariansWithRoles.map((b) => b.id));

    // ── 3. Per-barbarian decision ───────────────────────────────────────────
    const decisions: BarbarianDecision[] = [];

    for (const barb of barbariansWithRoles) {
      const rushSM = this.rushMachines.get(barb.id)!;
      const rushDecision = rushSM.tick(barb, state.player);
      decisions.push({ barbarianId: barb.id, ...rushDecision });
    }

    // ── 4. Role diff ────────────────────────────────────────────────────────
    const lastRoles = gsm.getLastRoleMap();
    const roleUpdates: Record<string, BarbarianRole> = {};

    for (const [id, role] of Object.entries(roles)) {
      if (lastRoles[id] !== role) {
        roleUpdates[id] = role;
      }
    }

    if (Object.keys(roleUpdates).length > 0) {
      logger.debug('Role updates:', roleUpdates);
    }

    // Persist roles for next tick's diff.
    gsm.setLastRoleMap(roles);

    // ── 5. Build and return message ─────────────────────────────────────────
    return {
      type: 'DECISIONS',
      tickId: state.tickId,
      decisions,
      roleUpdates,
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Ensure every live barbarian id has a RushStrategySM entry, and remove
   * entries for barbarians that are no longer in the world.
   */
  private syncRushMachines(liveIds: string[]): void {
    const liveSet = new Set(liveIds);

    // Create missing entries.
    for (const id of liveIds) {
      if (!this.rushMachines.has(id)) {
        this.rushMachines.set(id, new RushStrategySM());
      }
    }

    // Remove stale entries.
    for (const id of this.rushMachines.keys()) {
      if (!liveSet.has(id)) {
        this.rushMachines.delete(id);
      }
    }
  }
}
