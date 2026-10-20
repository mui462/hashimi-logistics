import { inspect } from 'node:util';

// Production writes one JSON object per line (easy for log platforms to parse). Development keeps readable text.
// Read from process.env directly so the logger works before the environment has been validated.
const asJson = () => process.env.NODE_ENV === 'production';

function write(level, args) {
  const output = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (asJson()) {
    const message = args.map((item) => (typeof item === 'string' ? item : item instanceof Error ? item.stack ?? item.message : inspect(item, { depth: 3 }))).join(' ');
    output(JSON.stringify({ time: new Date().toISOString(), level, message }));
    return;
  }
  output(new Date().toISOString(), level.toUpperCase(), ...args);
}

export const logger = {
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
};
