type Level = 'info' | 'warn' | 'error'

function emit(level: Level, ns: string, msg: string, extra?: unknown): void {
  const line = `[${level.toUpperCase()}] ${new Date().toISOString()} ${ns}: ${msg}`
  if (level === 'error') {
    console.error(line, extra ?? '')
  } else {
    console.log(line, extra ?? '')
  }
}

export function makeLogger(ns: string) {
  return {
    info: (msg: string, extra?: unknown) => emit('info', ns, msg, extra),
    warn: (msg: string, extra?: unknown) => emit('warn', ns, msg, extra),
    error: (msg: string, extra?: unknown) => emit('error', ns, msg, extra),
  }
}
