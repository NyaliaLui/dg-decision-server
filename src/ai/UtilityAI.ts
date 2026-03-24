// ---------------------------------------------------------------------------
// UtilityAI.ts — Fast, zero-latency action scorer.
//
// For each barbarian, scores every legal action on a [0, 1] scale using
// only the current game state snapshot. Runs synchronously in the 100 ms
// decision tick — no I/O, no async, no allocations beyond a small array.
//
// Score design philosophy:
//  • Raw scores reflect "how much value this action provides right now".
//  • Role modifiers amplify or suppress scores to enforce squad coordination.
//  • Strategy modifiers shift the overall aggression level.
//  • The highest-scoring legal action wins; no random tie-breaking.
// ---------------------------------------------------------------------------

import type { BarbarianDecision } from '../types/decisions';
import type {
  BarbarianState,
  GameState,
  PlayerState,
} from '../types/gameState';
import type { BarbarianRole, SquadStrategy } from '../types/actions';
import type { CoordinationLayer } from '../core/CoordinationLayer';

// Game-derived constants (kept in sync with client constants.ts).
const ATTACK_RANGE = 1.5; // meters — hand collider reach
const KICK_RANGE = 2.0; // meters — kick is slightly longer range
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
  constructor(private readonly coordination: CoordinationLayer) {}

  /**
   * Returns the single best action for this barbarian given its role,
   * the current squad strategy, and the full game state.
   */
  score(
    barb: BarbarianState,
    state: GameState,
    role: BarbarianRole,
    strategy: SquadStrategy,
  ): Omit<BarbarianDecision, 'barbarianId' | 'strategyTag'> {
    const { player, environment } = state;
    const now = Date.now();
    const d = barb.distanceToPlayer;
    const facingPlayer =
      Math.sign(player.position.x - barb.position.x) || barb.facingDirection;

    // Whether the player has committed past their cancel window.
    const playerCommitted =
      player.isAttacking &&
      player.attackStartedAt !== null &&
      now - player.attackStartedAt > CANCEL_WINDOW_MS;

    // Whether the player is in a recovery state (attack just ended or landing).
    const playerJustAttacked =
      player.isAttacking &&
      player.attackStartedAt !== null &&
      now - player.attackStartedAt > 200;

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
      this.scoreKick(
        d,
        player,
        playerJustAttacked,
        facingPlayer,
        aggressionMult,
      ),
      this.scoreChase(
        d,
        barb,
        player,
        role,
        facingPlayer,
        aggressionMult,
        environment,
        state,
      ),
      this.scoreFlank(d, barb, player, role, state),
      this.scoreJump(d, player, facingPlayer),
      this.scoreBlock(d, player, playerCommitted, barb, role),
      this.scoreDuck(d, player),
      this.scoreRetreat(d, barb, player, role, strategy),
      this.scoreIdle(),
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

  private scoreKick(
    d: number,
    player: PlayerState,
    playerJustAttacked: boolean,
    facingPlayer: number,
    aggressionMult: number,
  ): ScoredAction {
    let score = 0;
    let reasoning = '';

    if (d < KICK_RANGE && d >= ATTACK_RANGE * 0.8 && playerJustAttacked) {
      // Medium range, player is in attack recovery — kick reaches.
      score = 0.78 * aggressionMult;
      reasoning = 'player recovering from attack, kick reaches';
    } else if (d < KICK_RANGE && !player.isAttacking) {
      score = 0.5 * aggressionMult;
      reasoning = 'in kick range, player not attacking';
    }

    return {
      action: 'KICK',
      score,
      direction: facingPlayer,
      durationMs: 320,
      reasoning,
    };
  }

  private scoreChase(
    d: number,
    barb: BarbarianState,
    player: PlayerState,
    role: BarbarianRole,
    facingPlayer: number,
    aggressionMult: number,
    environment: GameState['environment'],
    state: GameState,
  ): ScoredAction {
    let score = 0;
    let reasoning = '';

    // SUPPORT should not chase aggressively.
    const roleMult = role === 'SUPPORT' ? 0.3 : role === 'BAITER' ? 0.4 : 1.0;

    if (d > ATTACK_RANGE) {
      // Urgency increases with distance.
      const urgency = Math.min(d / CHASE_MAX, 1.0);
      score = (0.65 + urgency * 0.2) * aggressionMult * roleMult;
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

  private scoreFlank(
    d: number,
    barb: BarbarianState,
    player: PlayerState,
    role: BarbarianRole,
    state: GameState,
  ): ScoredAction {
    if (role !== 'FLANKER') {
      return {
        action: 'FLANK',
        score: 0,
        direction: barb.facingDirection,
        durationMs: 0,
        reasoning: 'not flanker role',
      };
    }

    const flankX = this.coordination.getFlankTargetX(
      barb,
      player,
      state.environment.worldBounds,
    );
    const reached = this.coordination.isFlankPositionReached(barb, flankX);

    if (reached) {
      // In flank position — switch to attack if in range, else just stay.
      return {
        action: 'FLANK',
        score: 0,
        direction: barb.facingDirection,
        durationMs: 0,
        reasoning: 'flank position reached',
      };
    }

    const flankDir = this.coordination.getFlankDirection(barb, flankX);
    return {
      action: 'FLANK',
      score: 0.85, // high priority while FLANKER role and not in position
      direction: flankDir,
      durationMs: 600,
      reasoning: `flanking to blind side — target x: ${flankX.toFixed(1)}`,
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

  private scoreBlock(
    d: number,
    player: PlayerState,
    playerCommitted: boolean,
    barb: BarbarianState,
    role: BarbarianRole,
  ): ScoredAction {
    // Only block if player is actively attacking and has NOT yet committed
    // (i.e., barbarian can still react in time).
    if (!player.isAttacking || playerCommitted || d > 2.5) {
      return {
        action: 'LEFT_BLOCK',
        score: 0,
        direction: barb.facingDirection,
        durationMs: 0,
        reasoning: '',
      };
    }

    // Low-HP barbarians block more readily.
    const hpMult = barb.hp === 1 ? 1.4 : barb.hp === 2 ? 1.1 : 1.0;
    // SUPPORT barbarians are defensive.
    const roleMult = role === 'SUPPORT' ? 1.2 : 1.0;
    const score = Math.min(0.85 * hpMult * roleMult, 1.0);

    // Pick block direction based on player's facing (which side the sword sweeps from).
    const blockAction =
      player.facingDirection === 1 ? 'RIGHT_BLOCK' : 'LEFT_BLOCK';

    return {
      action: blockAction,
      score,
      direction: barb.facingDirection,
      durationMs: 320,
      reasoning: `blocking ${blockAction === 'RIGHT_BLOCK' ? 'right' : 'left'} — hp=${barb.hp}`,
    };
  }

  private scoreDuck(d: number, player: PlayerState): ScoredAction {
    // Duck only makes sense against a special attack (horizontal sweep).
    const specialIncoming = player.attackType === 'special' && d < 3.5;
    const score = specialIncoming ? 0.88 : 0;

    return {
      action: 'DUCK',
      score,
      direction: 1, // direction irrelevant when ducking
      durationMs: 500,
      reasoning: specialIncoming ? 'special attack incoming — duck' : '',
    };
  }

  private scoreRetreat(
    d: number,
    barb: BarbarianState,
    player: PlayerState,
    role: BarbarianRole,
    strategy: SquadStrategy,
  ): ScoredAction {
    // Retreat when critically wounded and strategy allows it.
    // AGGRESSIVE and OVERWHELM strategies never retreat.
    if (
      barb.hp > 1 ||
      strategy === 'AGGRESSIVE' ||
      strategy === 'OVERWHELM' ||
      role === 'ATTACKER'
    ) {
      return {
        action: 'RETREAT',
        score: 0,
        direction: barb.facingDirection,
        durationMs: 0,
        reasoning: '',
      };
    }

    const retreatDir = -(
      Math.sign(player.position.x - barb.position.x) || 1
    ) as -1 | 1;
    return {
      action: 'RETREAT',
      score: 0.68,
      direction: retreatDir,
      durationMs: 800,
      reasoning: 'HP critical — retreating',
    };
  }

  private scoreIdle(): ScoredAction {
    return {
      action: 'IDLE',
      score: 0.05, // always available as a safe fallback
      direction: 1,
      durationMs: 200,
      reasoning: 'baseline idle',
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
    case 'COORDINATED':
      return 1.0;
    case 'BAIT_HEAVY':
      return 0.85; // slightly less direct aggression — bait AI handles pressure
    case 'DEFENSIVE':
      return 0.7;
    default:
      return 1.0;
  }
}
