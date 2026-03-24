// ---------------------------------------------------------------------------
// logger.ts — Minimal structured logger.
//
// Outputs timestamped, levelled lines to stdout/stderr.
// Replace with a proper library (pino, winston) if log volume grows.
// ---------------------------------------------------------------------------

type Level = 'debug' | 'info' | 'warn' | 'error';

function ts(): string {
  return new Date().toISOString();
}

function format(level: Level, msg: string, extra?: unknown): string {
  const suffix =
    extra !== undefined ? ` ${JSON.stringify(extra, null, 0)}` : '';
  return `[${ts()}] [${level.toUpperCase().padEnd(5)}] ${msg}${suffix}`;
}

export const logger = {
  debug(msg: string, extra?: unknown): void {
    if (process.env['LOG_LEVEL'] === 'debug') {
      process.stdout.write(format('debug', msg, extra) + '\n');
    }
  },
  info(msg: string, extra?: unknown): void {
    process.stdout.write(format('info', msg, extra) + '\n');
  },
  warn(msg: string, extra?: unknown): void {
    process.stderr.write(format('warn', msg, extra) + '\n');
  },
  error(msg: string, extra?: unknown): void {
    process.stderr.write(format('error', msg, extra) + '\n');
  },
};
