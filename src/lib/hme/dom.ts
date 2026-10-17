export type TextMatcher = string | RegExp;

const MAX_ELEMENTS = 20000;
const NON_TEXT_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "HTML", "BODY"]);

export function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function elementText(element: Element): string {
  const parts: string[] = [];
  const aria = element.getAttribute("aria-label");
  if (aria) parts.push(aria);
  const title = element.getAttribute("title");
  if (title) parts.push(title);
  const placeholder = element.getAttribute("placeholder");
  if (placeholder) parts.push(placeholder);
  if (element instanceof HTMLInputElement) {
    if (element.value) parts.push(element.value);
    if (element.alt) parts.push(element.alt);
  }
  const text = (element as HTMLElement).innerText ?? element.textContent ?? "";
  if (text) parts.push(text);
  return normalizeText(parts.join(" "));
}

export function allElements(doc: Document): HTMLElement[] {
  const result: HTMLElement[] = [];
  const visit = (root: Document | ShadowRoot): void => {
    const nodes = root.querySelectorAll<HTMLElement>("*");
    for (const element of nodes) {
      if (result.length >= MAX_ELEMENTS) return;
      result.push(element);
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  visit(doc);
  return result;
}

export function isVisible(element: Element): boolean {
  let current: Element | null = element;
  for (let depth = 0; current && depth < 8; depth += 1) {
    if (current.hasAttribute("hidden") || current.getAttribute("aria-hidden") === "true") return false;
    if (current instanceof HTMLElement) {
      const style = current.style;
      if (style.display === "none" || style.visibility === "hidden") return false;
      const computed = current.ownerDocument.defaultView?.getComputedStyle(current);
      if (computed?.display === "none" || computed?.visibility === "hidden") return false;
    }
    const parent: Element | null = current.parentElement;
    if (parent) {
      current = parent;
    } else {
      const root = current.getRootNode();
      current = root instanceof ShadowRoot ? root.host : null;
    }
  }
  return true;
}

export function isInteractive(element: Element): boolean {
  if (element.matches("button, a[href], input, select, textarea, summary, [role='button'], [role='link'], [role='menuitem'], [role='tab']")) {
    return true;
  }
  if (element.hasAttribute("tabindex")) return true;
  const tag = element.tagName.toLowerCase();
  return tag.startsWith("ui-") || tag.startsWith("sp-");
}

export function interactiveDescendants(container: Element): HTMLElement[] {
  const result: HTMLElement[] = [];
  if (isInteractive(container)) result.push(container as HTMLElement);
  const visit = (root: Element | ShadowRoot): void => {
    for (const element of root.querySelectorAll<HTMLElement>("*")) {
      if (isInteractive(element)) result.push(element);
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  visit(container);
  return result;
}

export function clickableAncestor(element: Element): Element {
  let current: Element | null = element;
  for (let depth = 0; current && depth < 8; depth += 1) {
    if (isInteractive(current)) return current;
    current = current.parentElement;
  }
  return element;
}

function matchScore(text: string, matcher: TextMatcher): number | null {
  if (typeof matcher === "string") {
    const needle = normalizeText(matcher);
    if (!needle) return null;
    if (text === needle) return 0;
    if (text.startsWith(needle)) return 1;
    if (text.includes(needle)) return 2;
    return null;
  }
  return matcher.test(text) ? 3 : null;
}

export interface FindOptions {
  maxTextLength?: number;
  interactiveOnly?: boolean;
}

export function findAllByText(doc: Document, matchers: TextMatcher[], options: FindOptions = {}): HTMLElement[] {
  const maxTextLength = options.maxTextLength ?? 220;
  const matches: Array<{ element: HTMLElement; score: number; textLength: number }> = [];

  for (const element of allElements(doc)) {
    if (NON_TEXT_TAGS.has(element.tagName)) continue;
    const text = elementText(element);
    if (!text || text.length > maxTextLength) continue;
    if (!isVisible(element)) continue;

    let score: number | null = null;
    for (const matcher of matchers) {
      const candidate = matchScore(text, matcher);
      if (candidate !== null && (score === null || candidate < score)) score = candidate;
    }
    if (score === null) continue;

    const clickable = clickableAncestor(element);
    if (options.interactiveOnly && !isInteractive(clickable)) continue;
    if (isInteractive(clickable)) score -= 0.25;
    matches.push({ element, score, textLength: text.length });
  }

  matches.sort((a, b) => a.score - b.score || a.textLength - b.textLength);
  return matches.map((match) => match.element);
}

export function findByText(doc: Document, matchers: TextMatcher[], options: FindOptions = {}): HTMLElement | null {
  return findAllByText(doc, matchers, options)[0] ?? null;
}

export function isDisabled(element: Element): boolean {
  let current: Element | null = element;
  for (let depth = 0; current && depth < 6; depth += 1) {
    if (current.matches("[disabled], [aria-disabled='true']")) return true;
    if (current instanceof HTMLButtonElement && current.disabled) return true;
    if (current instanceof HTMLInputElement && current.disabled) return true;
    current = current.parentElement;
  }
  return false;
}

export function clickElement(element: Element): void {
  const clickable = clickableAncestor(element);
  const inner =
    clickable.shadowRoot?.querySelector<HTMLElement>("button, [role='button'], a[href]") ??
    clickable.querySelector<HTMLElement>(":scope > button, :scope > [role='button'], :scope > a[href]");
  const target = inner ?? clickable;

  try {
    (target as HTMLElement).scrollIntoView?.({ block: "center" });
  } catch {
    // スクロールできない環境でもクリックは試す。
  }

  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
  }
  (target as HTMLElement).click();
}

export function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

export function findTextInput(doc: Document): HTMLInputElement | HTMLTextAreaElement | null {
  const candidates: Array<HTMLInputElement | HTMLTextAreaElement> = [];
  for (const element of allElements(doc)) {
    if (element instanceof HTMLTextAreaElement) {
      if (!isVisible(element) || element.disabled) continue;
      candidates.push(element);
      continue;
    }
    if (!(element instanceof HTMLInputElement)) continue;
    if (!isVisible(element) || element.disabled) continue;
    const type = (element.type || "text").toLowerCase();
    if (type === "search" || type === "email" || type === "password" || type === "hidden") continue;
    if (type !== "text" && type !== "") continue;
    const hint = `${element.placeholder} ${element.getAttribute("aria-label") ?? ""}`;
    if (/検索|search/i.test(hint)) continue;
    candidates.push(element);
  }
  return candidates[0] ?? null;
}

export function findLabelInput(doc: Document): HTMLInputElement | HTMLTextAreaElement | null {
  const label = findByText(doc, ["ラベル", /^label$/i], { maxTextLength: 40 });
  if (label) {
    let current: Element | null = label;
    for (let depth = 0; current && depth < 5; depth += 1) {
      const input = current.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        "input:not([type='hidden']):not([type='search']), textarea",
      );
      if (input && isVisible(input) && !input.disabled) return input;
      current = current.parentElement;
    }
  }
  return findTextInput(doc);
}
