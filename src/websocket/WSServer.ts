// ---------------------------------------------------------------------------
// WSServer.ts — WebSocket server wrapper.
//
// Responsibilities:
//  • Accept a single game client connection (one browser tab = one game).
//  • Route raw JSON messages to MessageHandler.
//  • Expose broadcast() so the decision loop can push messages back.
//  • Log connect / disconnect / errors with timestamps.
// ---------------------------------------------------------------------------

import { WebSocketServer, WebSocket } from 'ws';
import type { ServerMessage } from '../types/decisions';
import type { GameStateManager } from '../core/GameStateManager';
import type { RespawnManager } from '../respawn/RespawnManager';
import { MessageHandler } from './MessageHandler';
import { logger } from '../utils/logger';

export class WSServer {
  private readonly wss: WebSocketServer;
  private readonly handler: MessageHandler;
  /** We only support one active game client at a time. */
  private activeClient: WebSocket | null = null;

  constructor(port: number, gsm: GameStateManager, respawn: RespawnManager) {
    this.handler = new MessageHandler(gsm, respawn);

    this.wss = new WebSocketServer({ port });
    this.wss.on('listening', () => {
      logger.info(`WSServer listening on ws://localhost:${port}`);
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientAddr = req.socket.remoteAddress ?? 'unknown';
      logger.info(`Client connected: ${clientAddr}`);

      // Disconnect any pre-existing client gracefully before accepting new one.
      if (
        this.activeClient &&
        this.activeClient.readyState === WebSocket.OPEN
      ) {
        logger.warn('Replacing existing client connection.');
        this.activeClient.close(1001, 'Replaced by new connection');
      }
      this.activeClient = ws;

      ws.on('message', (raw: Buffer) => {
        try {
          const text = raw.toString('utf8');
          const msg = JSON.parse(text);
          this.handler.handle(msg);
        } catch (err) {
          logger.error('Failed to parse client message', err);
        }
      });

      ws.on('close', (code, reason) => {
        logger.info(
          `Client disconnected — code: ${code}, reason: ${reason.toString()}`,
        );
        if (this.activeClient === ws) {
          this.activeClient = null;
        }
      });

      ws.on('error', (err) => {
        logger.error('WebSocket client error', err);
      });
    });

    this.wss.on('error', (err) => {
      logger.error('WebSocketServer error', err);
    });
  }

  /**
   * Send a message to the active game client.
   * Silently drops the message if no client is connected or socket is not open.
   */
  broadcast(message: ServerMessage): void {
    if (!this.activeClient || this.activeClient.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      this.activeClient.send(JSON.stringify(message));
    } catch (err) {
      logger.error('Failed to send message to client', err);
    }
  }

  /** True when a game client is actively connected. */
  get hasClient(): boolean {
    return (
      this.activeClient !== null &&
      this.activeClient.readyState === WebSocket.OPEN
    );
  }

  close(): void {
    this.wss.close();
  }
}
