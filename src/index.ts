// ---------------------------------------------------------------------------
// index.ts — MCP Barbarian Decision Server entry point.
//
// Start:  npm run dev          (ts-node-dev, auto-restarts on file change)
//         npm run build && npm start  (compiled JS, production)
//
// Paste your Anthropic API key directly into CLAUDE_API_KEY below.
// ---------------------------------------------------------------------------

import 'dotenv/config';
import { WSServer } from './websocket/WSServer';
import { GameStateManager } from './core/GameStateManager';
import { DecisionOrchestrator } from './core/DecisionOrchestrator';
import { ClaudeAI } from './ai/ClaudeAI';
import { RespawnManager } from './respawn/RespawnManager';
import { logger } from './utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration — set CLAUDE_API_KEY in server/.env
// ─────────────────────────────────────────────────────────────────────────────

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY!;

/** WebSocket port the game client connects to. */
const WS_PORT = 8765;

/** How often the decision loop runs (ms). Lower = more responsive AI. */
const DECISION_TICK_MS = 100;

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

function main(): void {
  logger.info('─'.repeat(60));
  logger.info('MCP Barbarian Decision Server starting...');
  logger.info(`  WS port     : ${WS_PORT}`);
  logger.info(`  Tick rate   : ${DECISION_TICK_MS} ms`);
  logger.info(`  Claude model: claude-opus-4-6`);
  logger.info('─'.repeat(60));

  // Core modules
  const gsm = new GameStateManager();
  const orchestrator = new DecisionOrchestrator();
  const claude = new ClaudeAI(CLAUDE_API_KEY);
  const respawn = new RespawnManager();

  // WebSocket server — starts accepting connections immediately.
  const wss = new WSServer(WS_PORT, gsm, respawn);

  // ── Main decision loop ────────────────────────────────────────────────────
  const loopHandle = setInterval(() => {
    // No client connected or no state yet — skip this tick.
    if (!wss.hasClient) return;

    const state = gsm.getCurrentState();
    if (!state) return;

    // 1. Fire Claude async call if the 2 s interval has elapsed.
    //    Non-blocking — the promise is not awaited.
    claude.maybeRun(gsm);

    // 2. Run the synchronous decision pipeline (~0 ms).
    const decisionsMsg = orchestrator.run(gsm);
    if (decisionsMsg) {
      wss.broadcast(decisionsMsg);
    }

    // 3. Check respawn queue and emit any ready SPAWN messages.
    const spawns = respawn.tick(state.environment, state.player.position);
    for (const spawnMsg of spawns) {
      wss.broadcast(spawnMsg);
    }
  }, DECISION_TICK_MS);

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  function shutdown(signal: string): void {
    logger.info(`Received ${signal} — shutting down...`);
    clearInterval(loopHandle);
    wss.close();
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  logger.info('Server ready. Waiting for game client...');
}

main();
