// ---------------------------------------------------------------------------
// CoordinationLayer.ts — Squad role assignment.
//
// Called once per decision tick (before RushStrategySM) to assign each live
// barbarian a role. With RushStrategy all barbarians are ATTACKER.
// ---------------------------------------------------------------------------

import type {
  BarbarianState,
  GameState,
} from '../types/gameState';
import type { BarbarianRole, SquadStrategy } from '../types/actions';

export class CoordinationLayer {
  /**
   * Derive a role for every live barbarian given the current world state and
   * the squad strategy set by Claude AI.
   *
   * Returns a map of barbarianId → BarbarianRole.
   * All barbarians are assigned ATTACKER under the RushStrategy.
   */
  assignRoles(
    state: GameState,
    _strategy: SquadStrategy,
  ): Record<string, BarbarianRole> {
    const { barbarians } = state;
    const roles: Record<string, BarbarianRole> = {};

    for (const barb of barbarians) {
      roles[barb.id] = 'ATTACKER';
    }

    return roles;
  }
}
