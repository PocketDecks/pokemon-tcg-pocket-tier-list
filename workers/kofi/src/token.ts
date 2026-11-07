export const tokensMatch = (expected: string, received: string): boolean => {
  if (expected.length === 0) return false;
  const length = Math.max(expected.length, received.length);
  let difference = expected.length ^ received.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (expected.charCodeAt(index) || 0) ^ (received.charCodeAt(index) || 0);
  }
  return difference === 0;
};
