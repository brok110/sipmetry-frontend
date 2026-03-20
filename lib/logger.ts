export const log = __DEV__ ? console.log : () => {};
export const warn = __DEV__ ? console.warn : () => {};
export const error = console.error;
