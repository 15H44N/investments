import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, ViteDevServer } from 'vite'

type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

interface ForwardedLogEntry {
  level: ConsoleLevel
  timestamp: string
  href: string
  args: unknown[]
}

interface ConsoleForwardPluginOptions {
  enabled?: boolean
  endpoint?: string
  levels?: ConsoleLevel[]
}

const DEFAULT_ENDPOINT = '/api/debug/client-logs'
const DEFAULT_LEVELS: ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug']

function serializeClientScript(endpoint: string, levels: ConsoleLevel[]): string {
  return `
(() => {
  const endpoint = ${JSON.stringify(endpoint)};
  const levels = ${JSON.stringify(levels)};
  const isLocalTerminalSession =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  const originalConsole = {};
  const queue = [];
  let flushTimer = null;

  function serialize(value) {
    if (value instanceof Error) {
      return {
        __type: 'error',
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    if (typeof value === 'undefined') {
      return { __type: 'undefined' };
    }

    if (typeof value === 'bigint') {
      return { __type: 'bigint', value: value.toString() };
    }

    if (value && typeof value === 'object') {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_error) {
        return String(value);
      }
    }

    return value;
  }

  function flushQueue() {
    flushTimer = null;

    if (!isLocalTerminalSession || queue.length === 0) {
      return;
    }

    const payload = queue.splice(0, queue.length);
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Never break the app if forwarding fails.
    });
  }

  function scheduleFlush() {
    if (flushTimer !== null) {
      return;
    }

    flushTimer = window.setTimeout(flushQueue, 50);
  }

  levels.forEach((level) => {
    originalConsole[level] = console[level].bind(console);
    console[level] = (...args) => {
      originalConsole[level](...args);
      queue.push({
        level,
        timestamp: new Date().toISOString(),
        href: window.location.href,
        args: args.map(serialize),
      });
      scheduleFlush();
    };
  });

  window.addEventListener('beforeunload', flushQueue);
})();
  `.trim()
}

function formatArg(arg: unknown): string {
  if (arg && typeof arg === 'object' && '__type' in (arg as Record<string, unknown>)) {
    const typed = arg as Record<string, unknown>
    if (typed.__type === 'error') {
      return `${typed.name ?? 'Error'}: ${typed.message ?? 'Unknown error'}`
    }
    if (typed.__type === 'undefined') {
      return 'undefined'
    }
    if (typed.__type === 'bigint') {
      return `${typed.value ?? ''}n`
    }
  }

  if (typeof arg === 'string') {
    return arg
  }

  try {
    return JSON.stringify(arg)
  } catch (_error) {
    return String(arg)
  }
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString('utf8')
}

async function handleForwardedLogs(
  req: IncomingMessage,
  res: ServerResponse,
  server: ViteDevServer,
): Promise<void> {
  try {
    const body = await readRequestBody(req)
    const parsed = JSON.parse(body) as ForwardedLogEntry[] | ForwardedLogEntry
    const entries = Array.isArray(parsed) ? parsed : [parsed]

    for (const entry of entries) {
      const prefix = `[browser:${entry.level}] ${entry.href}`
      const message = `${prefix} ${entry.args.map(formatArg).join(' ')}`

      if (entry.level === 'warn') {
        server.config.logger.warn(message)
        continue
      }

      if (entry.level === 'error') {
        server.config.logger.error(message)
        continue
      }

      server.config.logger.info(message)
    }

    res.statusCode = 204
    res.end()
  } catch (error) {
    server.config.logger.error(`[browser:error] Failed to parse forwarded logs: ${String(error)}`)
    res.statusCode = 400
    res.end()
  }
}

export function consoleForwardPlugin(options: ConsoleForwardPluginOptions = {}): Plugin {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT
  const enabled = options.enabled ?? true
  const levels = options.levels ?? DEFAULT_LEVELS

  return {
    name: 'local-console-forward-plugin',
    transformIndexHtml(html) {
      if (!enabled) {
        return html
      }

      const script = `<script type="module">${serializeClientScript(endpoint, levels)}</script>`
      return html.includes('</head>')
        ? html.replace('</head>', `${script}\n</head>`)
        : `${script}\n${html}`
    },
    configureServer(server) {
      if (!enabled) {
        return
      }

      server.middlewares.use(endpoint, async (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }

        await handleForwardedLogs(req, res, server)
      })
    },
    configurePreviewServer(server) {
      if (!enabled) {
        return
      }

      server.middlewares.use(endpoint, async (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }

        await handleForwardedLogs(req, res, server)
      })
    },
  }
}
