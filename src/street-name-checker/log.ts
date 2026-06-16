const PREFIX = "[CH Names]";

export const log = {
  info: (...args: unknown[]): void => console.log(PREFIX, ...args),
  warn: (...args: unknown[]): void => console.warn(PREFIX, ...args),
  error: (...args: unknown[]): void => console.error(PREFIX, ...args),
};
