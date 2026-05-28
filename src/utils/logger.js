import process from 'node:process';

const levels = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
let currentLevel = levels.info;

export function setLevel(level) {
  currentLevel = levels[level] ?? levels.info;
}

export const logger = {
  debug: (...args) => currentLevel <= levels.debug && console.error('[debug]', ...args),
  info:  (...args) => currentLevel <= levels.info  && console.error('[info]',  ...args),
  warn:  (...args) => currentLevel <= levels.warn  && console.error('[warn]',  ...args),
  error: (...args) => currentLevel <= levels.error && console.error('[error]', ...args),
};

export default logger;
