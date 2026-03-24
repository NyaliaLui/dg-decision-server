// ---------------------------------------------------------------------------
// MessageHandler.ts — Routes raw parsed JSON from the client to the correct
// server module and validates message structure before processing.
// ---------------------------------------------------------------------------

import type {
  ClientMessage,
  GameStateMessage,
  BarbarianDiedMessage,
} from '../types/decisions';
import type { GameStateManager } from '../core/GameStateManager';
import type { RespawnManager } from '../respawn/RespawnManager';
import { logger } from '../utils/logger';

export class MessageHandler {
  constructor(
    private readonly gsm: GameStateManager,
    private readonly respawn: RespawnManager,
  ) {}

  handle(raw: unknown): void {
    if (!isClientMessage(raw)) {
      logger.warn('Received unknown message type', raw);
      return;
    }

    switch (raw.type) {
      case 'GAME_STATE':
        this.handleGameState(raw);
        break;
      case 'BARBARIAN_DIED':
        this.handleBarbarianDied(raw);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  private handleGameState(msg: GameStateMessage): void {
    // GameStateManager enriches the barbarian states with spatial fields
    // (distanceToPlayer, angleToPlayer, isInPlayerFOV) then stores it.
    this.gsm.update(msg);
  }

  private handleBarbarianDied(msg: BarbarianDiedMessage): void {
    logger.info(
      `Barbarian died: ${msg.barbarianId} — ${msg.aliveCount} still alive`,
    );
    this.respawn.onBarbarianDied(msg.barbarianId, msg.aliveCount);
  }
}

// ---------------------------------------------------------------------------
// Type guard — narrow `unknown` to a known client message union.
// ---------------------------------------------------------------------------

function isClientMessage(v: unknown): v is ClientMessage {
  if (typeof v !== 'object' || v === null) return false;
  const type = (v as Record<string, unknown>)['type'];
  return type === 'GAME_STATE' || type === 'BARBARIAN_DIED';
}
