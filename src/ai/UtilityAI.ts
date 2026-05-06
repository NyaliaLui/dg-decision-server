// ---------------------------------------------------------------------------
// UtilityAI.ts — Fast, zero-latency action scorer.
//
// For each barbarian, scores every legal action on a [0, 1] scale using
// only the current game state snapshot. Runs synchronously in the 100 ms
// decision tick — no I/O, no async, no allocations beyond a small array.
//
// Score design philosophy:
//  • Raw scores reflect "how much value this action provides right now".
//  • Strategy modifiers shift the overall aggression level.
//  • The highest-scoring legal action wins; no random tie-breaking.
// ---------------------------------------------------------------------------

import type { BarbarianDecision } from '../types/decisions';
import type {
  BarbarianState,
  GameState,
  PlayerState,
} from '../types/gameState';
import type { SquadStrategy } from '../types/actions';

// Game-derived constants (kept in sync with client constants.ts).
const ATTACK_RANGE = 1.0; // meters — hand collider reach

const CHASE_MAX = 12.0; // meters — beyond this, urgency is maximum
const CANCEL_WINDOW_MS = 150; // ms — earliest a player attack can be punished

interface ScoredAction {
  action: BarbarianDecision['action'];
  score: number;
  direction: number;
  durationMs: number;
  reasoning: string;
}

export class UtilityAI {
  /**
   * Returns the single best action for this barbarian given the current squad
   * strategy and the full game state.
   */
  score(
    barb: BarbarianState,
    state: GameState,
    strategy: SquadStrategy,
  ): Omit<BarbarianDecision, 'barbarianId' | 'strategyTag'> {
    const { player } = state;
    const now = Date.now();
    const d = barb.distanceToPlayer;
    const facingPlayer =
      Math.sign(player.position.x - barb.position.x) || barb.facingDirection;

    // Whether the player has committed past their cancel window.
    const playerCommitted =
      player.isAttacking &&
      player.attackStartedAt !== null &&
      now - player.attackStartedAt > CANCEL_WINDOW_MS;

    // Strategy-level aggression multiplier.
    const aggressionMult = strategyAggressionMultiplier(strategy);

    const candidates: ScoredAction[] = [
      this.scoreAttack(
        d,
        player,
        playerCommitted,
        facingPlayer,
        aggressionMult,
      ),
      this.scoreChase(
        d,
        facingPlayer,
        aggressionMult,
      ),
      this.scoreJump(d, player, facingPlayer),
    ];

    // Pick highest score.
    const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));

    return {
      action: best.action,
      direction: best.direction,
      durationMs: best.durationMs,
      reasoning: best.reasoning,
    };
  }

  // ---------------------------------------------------------------------------
  // Individual action scorers
  // ---------------------------------------------------------------------------

  private scoreAttack(
    d: number,
    player: PlayerState,
    playerCommitted: boolean,
    facingPlayer: number,
    aggressionMult: number,
  ): ScoredAction {
    let score = 0;
    let reasoning = '';

    if (d < ATTACK_RANGE) {
      if (!player.isAttacking) {
        // Player is idle or moving — clean opening.
        score = 0.95 * aggressionMult;
        reasoning = 'player idle, in range — clean attack';
      } else if (playerCommitted) {
        // Player past cancel window — counter-attack.
        score = 0.9 * aggressionMult;
        reasoning = 'player committed to attack — counter';
      } else {
        // Player is attacking but can still cancel — risky to attack.
        score = 0.15;
        reasoning = 'player attacking but not committed — risky';
      }
    }

    return {
      action: 'ATTACK',
      score,
      direction: facingPlayer,
      durationMs: 320,
      reasoning,
    };
  }

  private scoreChase(
    d: number,
    facingPlayer: number,
    aggressionMult: number,
  ): ScoredAction {
    let score = 0;
    let reasoning = '';

    if (d > ATTACK_RANGE) {
      // Urgency increases with distance.
      const urgency = Math.min(d / CHASE_MAX, 1.0);
      score = (0.65 + urgency * 0.2) * aggressionMult;
      reasoning = `closing gap — ${d.toFixed(1)} m away`;
    }

    return {
      action: 'CHASE',
      score,
      direction: facingPlayer,
      durationMs: 500,
      reasoning,
    };
  }

  private scoreJump(
    d: number,
    player: PlayerState,
    facingPlayer: number,
  ): ScoredAction {
    const playerStationary =
      Math.abs(player.velocity.x) < 0.2 && Math.abs(player.velocity.z) < 0.2;

    let score = 0;
    let reasoning = '';

    // Surprise jump: medium distance, player stationary, not attacking.
    if (
      d > ATTACK_RANGE &&
      d < 4.5 &&
      playerStationary &&
      !player.isAttacking
    ) {
      score = 0.55;
      reasoning = 'player stationary — surprise jump';
    }

    return {
      action: 'JUMP',
      score,
      direction: facingPlayer,
      durationMs: 1000,
      reasoning,
    };
  }
}

// ---------------------------------------------------------------------------
// Strategy aggression multiplier
// ---------------------------------------------------------------------------

function strategyAggressionMultiplier(strategy: SquadStrategy): number {
  switch (strategy) {
    case 'AGGRESSIVE':
    case 'OVERWHELM':
      return 1.2;
    case 'RUSH':
      return 1.3;
    case 'COORDINATED':
      return 1.0;
    case 'DEFENSIVE':
      return 0.7;
    default:
      return 1.0;
  }
}
