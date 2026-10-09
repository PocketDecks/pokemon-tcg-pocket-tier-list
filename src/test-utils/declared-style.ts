const selectsElement = (rule: CSSRule, element: Element): boolean => {
  if (!("selectorText" in rule)) return false;
  try {
    return element.matches((rule as CSSStyleRule).selectorText);
  } catch {
    return false;
  }
};

export const declaredStyle = (element: Element, property: "height"): string =>
  Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .filter((rule) => selectsElement(rule, element))
    .map((rule) => (rule as CSSStyleRule).style[property])
    .filter(Boolean)
    .pop() ?? "";
