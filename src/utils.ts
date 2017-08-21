export function parseJSONwithStringFallback(str: string) {
  let result;

  try {
    result = JSON.parse(str);
  } catch (err) {
    result = str;
  }

  return result;
}
