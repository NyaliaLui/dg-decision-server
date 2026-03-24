// ---------------------------------------------------------------------------
// ClaudeAI.ts — Async Claude AI integration for high-level squad strategy.
//
// Design:
//  • Runs every STRATEGY_INTERVAL_MS (2 s), self-throttled via timestamp.
//  • Non-blocking: the 100 ms decision loop is never awaited.
//  • On response, updates GameStateManager with the new SquadStrategy and
//    ClaudeInsights. The next decision tick picks these up automatically.
//  • On API error or malformed response, the existing strategy is preserved.
//  • API key is injected at construction — no environment variables needed.
// ---------------------------------------------------------------------------

import Anthropic from '@anthropic-ai/sdk';
import type { GameStateManager } from '../core/GameStateManager';
import type { SquadStrategy } from '../types/actions';
import type { ClaudeInsights } from '../types/gameState';
import {
  buildStrategyPrompt,
  SYSTEM_PROMPT,
  type StrategyPromptContext,
} from './prompts/strategyPrompt';
import { logger } from '../utils/logger';

/** Time between successive Claude API calls (ms). */
const STRATEGY_INTERVAL_MS = 2000;

/** Valid strategy names the model may return. */
const VALID_STRATEGIES = new Set<SquadStrategy>([
  'AGGRESSIVE',
  'COORDINATED',
  'BAIT_HEAVY',
  'DEFENSIVE',
  'OVERWHELM',
]);

interface ClaudeResponse {
  strategy: string;
  claudeSuggestsBait: boolean;
  reasoning: string;
}

export class ClaudeAI {
  private readonly client: Anthropic;
  private lastCallAt = 0;
  private pending = false;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Called every 100 ms from the main decision loop.
   * Fires an async Claude call when the throttle interval has elapsed.
   * Never blocks — the promise is intentionally not awaited by the caller.
   */
  maybeRun(gsm: GameStateManager): void {
    const now = Date.now();
    if (this.pending || now - this.lastCallAt < STRATEGY_INTERVAL_MS) return;

    const state = gsm.getCurrentState();
    if (!state) return;

    this.pending = true;
    this.lastCallAt = now;

    const ctx: StrategyPromptContext = {
      state,
      playerAttackPattern: gsm.getPlayerAttackPattern(),
      playerHPTrend: gsm.getPlayerHPTrend(),
      currentStrategy: gsm.getSquadStrategy(),
    };

    this.callClaude(ctx, gsm).finally(() => {
      this.pending = false;
    });
  }

  // ---------------------------------------------------------------------------
  // Private: API call + parsing
  // ---------------------------------------------------------------------------

  private async callClaude(
    ctx: StrategyPromptContext,
    gsm: GameStateManager,
  ): Promise<void> {
    const userPrompt = buildStrategyPrompt(ctx);

    try {
      const response = await this.client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 128,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        logger.warn('ClaudeAI: response contained no text block');
        return;
      }

      const parsed = this.parseResponse(textBlock.text);
      if (!parsed) return;

      const strategy = this.validateStrategy(parsed.strategy);
      if (!strategy) return;

      const insights: ClaudeInsights = {
        claudeSuggestsBait: Boolean(parsed.claudeSuggestsBait),
        reasoning: parsed.reasoning ?? '',
        generatedAt: Date.now(),
      };

      gsm.setSquadStrategy(strategy);
      gsm.setClaudeInsights(insights);

      logger.info(
        `ClaudeAI → strategy: ${strategy}, bait: ${insights.claudeSuggestsBait} — "${insights.reasoning}"`,
      );
    } catch (err) {
      // Network errors, rate limits, etc. Log and preserve current strategy.
      logger.error('ClaudeAI API call failed', err);
    }
  }

  private parseResponse(text: string): ClaudeResponse | null {
    // The model is instructed to return only JSON, but defensively strip any
    // accidental markdown fences that wrap the object.
    const cleaned = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as ClaudeResponse;
      return parsed;
    } catch {
      logger.warn(
        `ClaudeAI: failed to parse response JSON — raw: "${text.slice(0, 120)}"`,
      );
      return null;
    }
  }

  private validateStrategy(raw: string): SquadStrategy | null {
    const upper = raw?.toUpperCase?.() as SquadStrategy;
    if (VALID_STRATEGIES.has(upper)) return upper;
    logger.warn(`ClaudeAI: unknown strategy value "${raw}" — ignoring`);
    return null;
  }
}
