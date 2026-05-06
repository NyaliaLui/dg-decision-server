// RushStrategySM.ts — Always-active chase-and-attack sequence.
// StoneFists geometry: hand z=0.75 + collider radius=0.16 = 0.91m reach; 1.2m with buffer.
import type { BarbarianDecision } from '../types/decisions';
import type { BarbarianState, PlayerState } from '../types/gameState';

const RUSH_ATTACK_RANGE = 1.2;

type RushState = 'CHASING' | 'ATTACKING';

export class RushStrategySM {
  private state: RushState = 'CHASING';

  tick(barb: BarbarianState, player: PlayerState): Omit<BarbarianDecision, 'barbarianId'> {
    const d = barb.distanceToPlayer;
    const facingPlayer = Math.sign(player.position.x - barb.position.x) || barb.facingDirection;

    if (d <= RUSH_ATTACK_RANGE) {
      this.state = 'ATTACKING';
      return { action: 'ATTACK', direction: facingPlayer, durationMs: 320, strategyTag: 'rush-sm', reasoning: 'in range — attacking' };
    }

    this.state = 'CHASING';
    return { action: 'CHASE', direction: facingPlayer, durationMs: 500, strategyTag: 'rush-sm', reasoning: `closing gap — ${d.toFixed(1)} m` };
  }

  forceReset(): void {
    this.state = 'CHASING';
  }
}
