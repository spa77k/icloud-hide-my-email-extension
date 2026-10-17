import { errorMessage } from "../job";
import type { ErrorCode } from "../protocol";
import {
  allElements,
  clickElement,
  clickableAncestor,
  elementText,
  findAllByText,
  findLabelInput,
  findByText,
  interactiveDescendants,
  isDisabled,
  isInteractive,
  isVisible,
  normalizeText,
  setInputValue,
} from "./dom";

const ADDRESS_PATTERN = /[a-z0-9._%+-]+\s*@\s*(?:icloud\.com|privaterelay\.appleid\.com)/gi;
const EXCLUDED_LOCAL_PARTS = new Set(["support", "privacy", "apple", "noreply", "no-reply"]);

export interface AutomationOptions {
  timeoutMs?: number;
  pollMs?: number;
  onClick?: () => void;
}

export type PrepareOutcome =
  | { kind: "ready" }
  | { kind: "auth_required"; code: "AUTH_REQUIRED" | "SESSION_EXPIRED" }
  | { kind: "opening" }
  | { kind: "none" };

export type CreateOutcome =
  | { kind: "success"; address: string; copied: boolean }
  | { kind: "failed"; clicked: boolean; code: ErrorCode; message: string };

export class AutomationError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message = errorMessage(code),
  ) {
    super(message);
    this.name = "AutomationError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(check: () => T | null | undefined | false, timeoutMs: number, pollMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await sleep(pollMs);
  }
  throw new AutomationError("UI_NOT_FOUND");
}

function parentAcrossShadow(element: Element): Element | null {
  const parent = element.parentElement;
  if (parent) return parent;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

export function extractEmails(doc: Document, scope?: Element): string[] {
  const found = new Set<string>();
  const textRoot: Element | null = scope ?? doc.body;
  const text = (textRoot as HTMLElement | null)?.innerText ?? textRoot?.textContent ?? "";
  for (const match of text.matchAll(ADDRESS_PATTERN)) {
    found.add(match[0].replace(/\s+/g, "").toLowerCase());
  }

  for (const element of allElements(doc)) {
    if (scope && !scope.contains(element)) continue;
    if (!isVisible(element)) continue;
    if (element instanceof HTMLAnchorElement && element.href.startsWith("mailto:")) {
      const address = decodeURIComponent(element.href.slice("mailto:".length)).split("?")[0] ?? "";
      if (ADDRESS_PATTERN.test(address)) found.add(address.trim().toLowerCase());
      ADDRESS_PATTERN.lastIndex = 0;
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (ADDRESS_PATTERN.test(element.value)) found.add(element.value.trim().toLowerCase());
      ADDRESS_PATTERN.lastIndex = 0;
    }
  }

  return [...found].filter((address) => {
    const local = address.split("@")[0] ?? "";
    return !EXCLUDED_LOCAL_PARTS.has(local);
  });
}

export function hasHmeControls(doc: Document): boolean {
  if (findCreateButton(doc)) return true;
  if (
    findByText(doc, ["新しいメールアドレスを設定", /set up a new email address/i], {
      maxTextLength: 80,
    })
  ) {
    return true;
  }
  if (
    findByText(doc, [/件の有効なメールアドレス/, /active email address/i, /有効なメールアドレス/], {
      maxTextLength: 80,
    })
  ) {
    return true;
  }
  const title = findByText(doc, ["メールを非公開", /hide my email/i], { maxTextLength: 40 });
  return Boolean(title && findLabelInput(doc));
}

export function detectAuth(doc: Document): "AUTH_REQUIRED" | "SESSION_EXPIRED" | null {
  for (const element of allElements(doc)) {
    if (element instanceof HTMLInputElement && element.type === "password" && isVisible(element)) {
      return "SESSION_EXPIRED";
    }
  }

  const signIn = findByText(doc, ["サインイン", /sign in/i], {
    interactiveOnly: true,
    maxTextLength: 40,
  });
  return signIn ? "AUTH_REQUIRED" : null;
}

export interface CardControl {
  element: HTMLElement;
  disabled: boolean;
}

function isCardContainer(element: Element, titleText: string): boolean {
  const className = typeof element.className === "string" ? element.className : "";
  if (/tile|card/i.test(className)) return true;
  if (element.getAttribute("role") === "listitem") return true;
  const needle = normalizeText(titleText);
  const aria = element.getAttribute("aria-label");
  return Boolean(needle && aria && normalizeText(aria).includes(needle));
}

/**
 * 見出しから、そのカードの境界になる最も近い先祖を探す。
 * カードの外にある別カードや全体ナビの操作要素には広げない。
 */
export function findCardBoundary(titleElement: Element, titleText = "", maxDepth = 8): Element | null {
  let current: Element | null = titleElement;
  for (let depth = 0; current && depth < maxDepth; depth += 1) {
    if (isCardContainer(current, titleText)) return current;
    current = parentAcrossShadow(current);
  }
  return null;
}

/**
 * カード境界の中で、専用のaria-labelボタンや操作要素を探す。
 * 見つからなければ null を返し、カードの外へは探索を広げない。
 */
export function findCardControl(card: Element, titleText = ""): CardControl | null {
  const candidates = interactiveDescendants(card).filter((element) => isVisible(element));
  if (candidates.length === 0) return null;
  const needle = normalizeText(titleText);
  const preferred =
    candidates.find((element) => needle.length > 0 && elementText(element).includes(needle)) ??
    candidates.find((element) => element.hasAttribute("aria-haspopup")) ??
    candidates[0]!;
  return { element: preferred, disabled: isDisabled(preferred) };
}

export function openHmeTile(doc: Document): boolean {
  const title = findByText(doc, ["メールを非公開", /hide my email/i], { maxTextLength: 40 });
  if (!title) return false;

  const titleText = elementText(title);
  const card = findCardBoundary(title, titleText);
  if (card) {
    const control = findCardControl(card, titleText);
    if (!control || control.disabled) return false;
    clickElement(control.element);
    return true;
  }

  const ancestor = clickableAncestor(title);
  if (!isInteractive(ancestor) || isDisabled(ancestor)) return false;
  clickElement(ancestor);
  return true;
}

const CREATE_LABELS = ["メールアドレスを作成", /^create email address$/i] as const;

/**
 * 確定ボタンとして扱える要素か。
 * `ui-panel` のような広い `ui-*` 祖先を操作要素とみなさないため、
 * button / submit系input / role="button" / `*-button` のカスタム要素に限定する。
 */
function isButtonLike(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag === "button") return true;
  if (tag === "input") {
    const type = (element.getAttribute("type") ?? "text").toLowerCase();
    return type === "submit" || type === "button";
  }
  if (element.getAttribute("role") === "button") return true;
  return tag.endsWith("-button");
}

function matchesCreateLabel(element: Element): boolean {
  const texts = [
    normalizeText(elementText(element)),
    normalizeText((element as HTMLElement).innerText ?? element.textContent ?? ""),
  ];
  return texts.some((text) =>
    CREATE_LABELS.some((label) => (typeof label === "string" ? text === normalizeText(label) : label.test(text))),
  );
}

/**
 * 一致した要素から、実際の確定ボタンそのものを返す。
 * ボタン内のspan文言の場合だけボタン祖先までさかのぼり、
 * 非interactiveな親divから広い `ui-*` 祖先へ乗り換えることはしない。
 */
function findButtonElement(element: Element, maxDepth = 4): HTMLElement | null {
  let current: Element | null = element;
  for (let depth = 0; current && depth < maxDepth; depth += 1) {
    if (isButtonLike(current)) return current as HTMLElement;
    current = parentAcrossShadow(current);
  }
  return null;
}

/**
 * 確定ボタンを完全一致で探し、実際の確定ボタン要素そのものを返す。
 * 部分一致の見出し・説明や、`ui-panel` などの広い祖先で別ボタンに
 * 置き換わらないようにする。
 */
export function findCreateButton(doc: Document): HTMLElement | null {
  const candidates = findAllByText(doc, ["メールアドレスを作成", /create email address/i], {
    maxTextLength: 50,
  });
  for (const element of candidates) {
    if (!matchesCreateLabel(element)) continue;
    const button = findButtonElement(element);
    if (button) return button;
  }
  return null;
}

/**
 * 確定ボタンから、そのフォーム（ダイアログ等）の境界を探す。
 * 候補アドレスの取得と「フォームが閉じたか」の判定に使う。
 * ダイアログの印が無い場合は、ラベル入力を含む最も近い先祖を使う。
 */
function findFormContainer(button: Element): Element | null {
  let current: Element | null = button;
  let withInput: Element | null = null;
  for (let depth = 0; current && depth < 12; depth += 1) {
    const role = current.getAttribute("role");
    const tag = current.tagName.toLowerCase();
    const className = typeof current.className === "string" ? current.className : "";
    if (
      role === "dialog" ||
      current.getAttribute("aria-modal") === "true" ||
      tag === "dialog" ||
      tag === "form" ||
      /dialog|sheet|modal/i.test(className)
    ) {
      return current;
    }
    if (!withInput && current.querySelector("input:not([type='hidden']), textarea")) {
      withInput = current;
    }
    current = parentAcrossShadow(current);
  }
  return withInput;
}

/**
 * 作成フォームがまだ開いているか。
 * 確定ボタンが残っていれば開いている扱い。フォーム境界がDOMから外れたか
 * 非表示になっていれば閉じた扱いにする。境界が取れない場合はラベル欄で判断する。
 */
function isCreateFormOpen(doc: Document, form: Element | null): boolean {
  if (findCreateButton(doc)) return true;
  if (form) {
    if (!form.isConnected || !isVisible(form)) return false;
    return Boolean(findLabelInput(doc));
  }
  return Boolean(findLabelInput(doc));
}

function findOpenAddressButton(doc: Document): HTMLElement | null {
  const newAddress = findByText(doc, ["新しいメールアドレスを設定", /set up a new email address/i], {
    interactiveOnly: true,
    maxTextLength: 80,
  });
  if (newAddress) return newAddress;

  const countHeading = findByText(
    doc,
    [/件の有効なメールアドレス/, /active email address/i, /有効なメールアドレス/],
    { maxTextLength: 80 },
  );
  if (countHeading) {
    let current: Element | null = countHeading;
    for (let depth = 0; current && depth < 4; depth += 1) {
      const controls = current.querySelectorAll<HTMLElement>(
        "button, [role='button'], ui-button, a[href], [tabindex]",
      );
      for (const control of controls) {
        if (!isVisible(control) || isDisabled(control)) continue;
        const text = elementText(control);
        if (text === "+" || text === "＋" || /追加|add|new|作成|create/i.test(text)) return control;
      }
      for (const control of controls) {
        if (!isVisible(control) || isDisabled(control)) continue;
        return control;
      }
      current = parentAcrossShadow(current);
    }
  }

  return findByText(doc, [/メールアドレスを追加/, /新しいメールアドレス/, /add email address/i, /new email address/i], {
    interactiveOnly: true,
    maxTextLength: 80,
  });
}

function fillLabel(doc: Document, label: string, options: Required<Pick<AutomationOptions, "timeoutMs" | "pollMs">>): Promise<void> {
  return waitFor(
    () => {
      const input = findLabelInput(doc);
      if (!input) return null;
      const value = label.slice(0, input.maxLength > 0 ? input.maxLength : label.length);
      setInputValue(input, value);
      return input;
    },
    options.timeoutMs,
    options.pollMs,
  ).then(async (input) => {
    await sleep(60);
    if (normalizeText(input.value) !== normalizeText(label.slice(0, input.maxLength > 0 ? input.maxLength : label.length))) {
      const value = label.slice(0, input.maxLength > 0 ? input.maxLength : label.length);
      setInputValue(input, value);
      await sleep(120);
    }
    if (!normalizeText(input.value)) {
      throw new AutomationError("UI_NOT_FOUND");
    }
  });
}

async function prepareInsideHme(
  doc: Document,
  label: string,
  options: Required<Pick<AutomationOptions, "timeoutMs" | "pollMs">>,
): Promise<PrepareOutcome> {
  if (findCreateButton(doc) && findLabelInput(doc)) {
    await fillLabel(doc, label, options);
    return { kind: "ready" };
  }

  const opener = findOpenAddressButton(doc);
  if (!opener) throw new AutomationError("UI_NOT_FOUND");
  if (isDisabled(opener)) throw new AutomationError("UI_NOT_FOUND");
  clickElement(opener);

  await waitFor(() => findCreateButton(doc), options.timeoutMs, options.pollMs);
  await fillLabel(doc, label, options);
  return { kind: "ready" };
}

export async function prepareAddress(
  doc: Document,
  label: string,
  options: AutomationOptions & { isTopFrame: boolean; tileAlreadyClicked?: boolean } = { isTopFrame: false },
): Promise<PrepareOutcome> {
  if (navigator.onLine === false) throw new AutomationError("NETWORK");

  if (hasHmeControls(doc)) {
    return prepareInsideHme(doc, label, {
      timeoutMs: options.timeoutMs ?? 12000,
      pollMs: options.pollMs ?? 120,
    });
  }

  const auth = detectAuth(doc);
  if (auth) return { kind: "auth_required", code: auth };

  if (options.isTopFrame && !options.tileAlreadyClicked && openHmeTile(doc)) {
    return { kind: "opening" };
  }

  return { kind: "none" };
}

function findCreationError(doc: Document): string | null {
  const errorKeywords =
    /失敗|エラー|問題|できません|やり直|無効|上限|error|failed|couldn't|could not|unable|try again/i;
  const successKeywords = /作成しました|created successfully|作成済み/i;

  for (const element of allElements(doc)) {
    if (!isVisible(element)) continue;
    const role = element.getAttribute("role");
    const className = typeof element.className === "string" ? element.className : "";
    const looksLikeAlert =
      role === "alert" || element.matches("[aria-live='assertive'], [class*='error'], [class*='Error']");
    if (!looksLikeAlert) continue;
    const text = elementText(element);
    if (!text || text.length > 300) continue;
    if (successKeywords.test(text)) continue;
    if (errorKeywords.test(text)) return text;
  }
  return null;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard APIが使えない場合は、選択とexecCommandで試す。
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

export async function createAddress(doc: Document, options: AutomationOptions = {}): Promise<CreateOutcome> {
  if (navigator.onLine === false) throw new AutomationError("NETWORK");

  const button = findCreateButton(doc);
  if (!button) {
    return { kind: "failed", clicked: false, code: "UI_NOT_FOUND", message: errorMessage("UI_NOT_FOUND") };
  }

  let clickableButton = button;
  if (isDisabled(button)) {
    const enabled = await waitFor(
      () => {
        const candidate = findCreateButton(doc);
        return candidate && !isDisabled(candidate) ? candidate : null;
      },
      1500,
      100,
    ).catch(() => null);
    if (!enabled) {
      return { kind: "failed", clicked: false, code: "CREATE_FAILED", message: errorMessage("CREATE_FAILED") };
    }
    clickableButton = enabled;
  }

  const before = new Set(extractEmails(doc));
  const form = findFormContainer(clickableButton);
  const candidate = form ? extractEmails(doc, form) : [];
  options.onClick?.();
  try {
    clickElement(clickableButton);
  } catch {
    return { kind: "failed", clicked: false, code: "CREATE_FAILED", message: errorMessage("CREATE_FAILED") };
  }

  const timeoutMs = options.timeoutMs ?? 35000;
  const pollMs = options.pollMs ?? 250;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const createdError = findCreationError(doc);
    if (createdError) {
      return {
        kind: "failed",
        clicked: true,
        code: "CREATE_FAILED",
        message: errorMessage("CREATE_FAILED"),
      };
    }

    // フォームが開いている間に出たアドレスは候補の生成・再生成の可能性がある。
    // 確定前に成功扱いしないため、フォームが閉じてからだけ成功を判定する。
    if (!isCreateFormOpen(doc, form)) {
      const current = extractEmails(doc);
      const confirmed = candidate.find((address) => current.includes(address));
      if (confirmed) {
        const copied = await copyText(confirmed);
        return { kind: "success", address: confirmed, copied };
      }
      const fresh = current.filter((address) => !before.has(address));
      if (fresh.length > 0) {
        const address = fresh[0]!;
        const copied = await copyText(address);
        return { kind: "success", address, copied };
      }
    }
    await sleep(pollMs);
  }

  return {
    kind: "failed",
    clicked: true,
    code: "RESULT_UNKNOWN",
    message: errorMessage("RESULT_UNKNOWN"),
  };
}
