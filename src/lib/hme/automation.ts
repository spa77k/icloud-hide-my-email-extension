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

const EXACT_ADDRESS_PATTERN = /^[a-z0-9._%+-]+@(?:icloud\.com|privaterelay\.appleid\.com)$/i;
const EXCLUDED_LOCAL_PARTS = new Set(["support", "privacy", "apple", "noreply", "no-reply"]);

export interface AutomationOptions {
  timeoutMs?: number;
  pollMs?: number;
  onClick?: () => void;
  label?: string;
}

export type PrepareOutcome =
  | { kind: "ready" }
  | { kind: "auth_required"; code: "AUTH_REQUIRED" | "SESSION_EXPIRED" }
  | { kind: "opening" }
  | { kind: "none" };

export type CreateOutcome =
  | { kind: "success"; address: string; copied: boolean; verified: boolean }
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

/**
 * 要素自身のテキストが完全に1つのアドレスであるときだけ返す。
 * 転送先の説明（「... （主要メールアドレス）」など）や、複数の文言を含む
 * コンテナは対象外。input/textarea/メモ欄の値も見ない。
 */
function exactAddressOf(element: Element): string | null {
  if (element.matches("input, textarea, select, option, script, style")) return null;
  const text = normalizeText((element as HTMLElement).innerText ?? element.textContent ?? "");
  if (!EXACT_ADDRESS_PATTERN.test(text)) return null;
  const local = text.split("@")[0]?.toLowerCase() ?? "";
  if (EXCLUDED_LOCAL_PARTS.has(local)) return null;
  return text.toLowerCase();
}

function exactAddressElementsWithin(root: Element): HTMLElement[] {
  const doc = root.ownerDocument ?? document;
  const matches: HTMLElement[] = [];
  for (const element of allElements(doc)) {
    if (element !== root && !root.contains(element)) continue;
    if (!isVisible(element)) continue;
    if (!exactAddressOf(element)) continue;
    matches.push(element);
  }
  // 見出しとアドレスが連結した親要素を拾わないよう、子孫にも完全一致アドレスが
  // ある要素は除外して、いちばん内側のアドレス表示だけを残す。
  return matches.filter((element) => !matches.some((other) => other !== element && element.contains(other)));
}

const ITEM_LABEL_SELECTOR = "h1, h2, h3, h4, h5, h6, [role='heading']";
const CREATE_HEADING_MATCHERS = [
  "新しいメールアドレスを追加",
  /add a new email address/i,
  /new email address/i,
  /set up a new email address/i,
];

function commonAncestor(elements: Element[]): Element | null {
  if (elements.length === 0) return null;
  let current: Element | null = elements[0]!;
  while (current) {
    if (elements.every((element) => current!.contains(element))) return current;
    current = parentAcrossShadow(current);
  }
  return null;
}

/**
 * 転送先・ラジオグループなど、作成候補ではない領域の境界を集める。
 * 見出し「転送先」に対応するセクションは、ラジオを含む最も近い先祖とする。
 */
function collectExcludedSubtrees(doc: Document): Element[] {
  const excluded: Element[] = [];
  for (const element of allElements(doc)) {
    if (element.matches("[role='radiogroup'], fieldset")) excluded.push(element);
    if (element instanceof HTMLInputElement && element.type === "radio") {
      const label = element.closest("label");
      if (label) excluded.push(label);
    }
  }

  const transferHeading = findByText(doc, ["転送先", /forwarding/i, /forwarded to/i], { maxTextLength: 40 });
  if (transferHeading) {
    // 見出し「転送先」を含むセクションを構造で除外する。radioが無く、転送先が
    // 一覧項目（li/article/button）の形でも、そのセクションごと除外する。
    const section = transferHeading.closest("section, fieldset, [role='group'], [role='radiogroup'], ul");
    if (section) {
      excluded.push(section);
    } else {
      let current: Element | null = transferHeading;
      for (let depth = 0; current && depth < 8; depth += 1) {
        if (current.querySelector("input[type='radio']")) {
          excluded.push(current);
          break;
        }
        current = parentAcrossShadow(current);
      }
    }
  }
  return excluded;
}

function isWithinExcluded(element: Element, excluded: Element[]): boolean {
  return excluded.some((root) => root === element || root.contains(element));
}

function findCreateHeading(doc: Document): HTMLElement | null {
  return findByText(doc, CREATE_HEADING_MATCHERS, { maxTextLength: 80 });
}

/**
 * 作成画面の範囲。作成見出し・ラベル欄・確定ボタンの最も近い共通の先祖に限定し、
 * body/htmlまで広がる場合は特定不能として null を返す。
 */
function findCreateScreen(doc: Document, button: Element): Element | null {
  const labelInput = findHmeLabelInput(doc);
  const heading = findCreateHeading(doc);
  const anchors = [labelInput, heading, button].filter((element): element is Element => Boolean(element));
  if (anchors.length < 2) return null;
  const screen = commonAncestor(anchors);
  if (!screen || screen === doc.body || screen === doc.documentElement) return null;
  return screen;
}

/**
 * 作成画面内の候補アドレス。転送先・ラジオ・既存一覧などの除外領域を除いたうえで、
 * 完全一致するアドレス表示がちょうど1つのときだけ返す。複数・無しは特定不能。
 */
function candidateAddressFromScreen(screen: Element, excluded: Element[]): string | null {
  const addresses = new Set<string>();
  for (const element of exactAddressElementsWithin(screen)) {
    if (isWithinExcluded(element, excluded)) continue;
    const address = exactAddressOf(element);
    if (address) addresses.add(address);
  }
  return addresses.size === 1 ? [...addresses][0]! : null;
}

/**
 * 一覧項目の見出し（ラベル）。実DOMではbutton内のh2など。
 * アドレスだけの項目や見出しの無い項目はラベル無しとして null。
 */
function itemLabelOf(element: Element): string | null {
  for (const heading of element.querySelectorAll<HTMLElement>(ITEM_LABEL_SELECTOR)) {
    if (!isVisible(heading)) continue;
    const text = normalizeText((heading as HTMLElement).innerText ?? heading.textContent ?? "");
    if (text && !EXACT_ADDRESS_PATTERN.test(text)) return text;
  }
  for (const candidate of element.querySelectorAll<HTMLElement>("[class*='heading'], [class*='label']")) {
    if (!isVisible(candidate)) continue;
    const text = normalizeText((candidate as HTMLElement).innerText ?? candidate.textContent ?? "");
    if (text && !EXACT_ADDRESS_PATTERN.test(text)) return text;
  }
  return null;
}

function labelsMatch(itemLabel: string, expected: string): boolean {
  const normalizedExpected = normalizeText(expected);
  return normalizedExpected.length > 0 && normalizeText(itemLabel) === normalizedExpected;
}

export interface AddressListItem {
  element: HTMLElement;
  address: string;
  label: string;
  text: string;
}

/**
 * HMEの作成済み一覧の項目。見出し（ラベル）と、ちょうど1つのアドレスを持つ
 * button/li/article/listitemに限定し、転送先・ラジオ・作成フォーム内は除外する。
 * 親子で同じ項目を二重に数えないよう、内側の実項目だけを残す。
 */
export function findAddressItems(doc: Document): AddressListItem[] {
  const excluded = collectExcludedSubtrees(doc);
  const items: AddressListItem[] = [];
  for (const element of allElements(doc)) {
    if (!element.matches("button, li, article, [role='listitem']")) continue;
    if (!isVisible(element)) continue;
    if (isWithinExcluded(element, excluded)) continue;
    if (element.closest("input, textarea, select")) continue;
    const label = itemLabelOf(element);
    if (!label) continue;
    const addresses = new Set<string>();
    for (const child of exactAddressElementsWithin(element)) {
      if (isWithinExcluded(child, excluded)) continue;
      const address = exactAddressOf(child);
      if (address) addresses.add(address);
    }
    if (addresses.size !== 1) continue;
    const text = normalizeText((element as HTMLElement).innerText ?? element.textContent ?? "");
    items.push({ element, address: [...addresses][0]!, label, text });
  }
  const innermost = items.filter(
    (item) => !items.some((other) => other !== item && item.element.contains(other.element)),
  );
  const seen = new Set<string>();
  return innermost.filter((item) => {
    const key = `${item.address}|${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
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
 * 作成フォームのラベル欄。iCloudの作成画面の input[name="hme-label"] を優先する。
 */
function findHmeLabelInput(doc: Document): HTMLInputElement | HTMLTextAreaElement | null {
  for (const element of allElements(doc)) {
    if (element instanceof HTMLInputElement && element.name === "hme-label" && isVisible(element) && !element.disabled) {
      return element;
    }
  }
  return findLabelInput(doc);
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

  const excluded = collectExcludedSubtrees(doc);
  const form = findCreateScreen(doc, clickableButton);
  const candidateAddress = form ? candidateAddressFromScreen(form, excluded) : null;
  if (!candidateAddress) {
    // 候補を特定できないまま確定すると、転送先やアカウントのメールを結果として
    // 返す恐れがある。確定せず、未確認として止める。
    return { kind: "failed", clicked: false, code: "RESULT_UNKNOWN", message: errorMessage("RESULT_UNKNOWN") };
  }

  const normalizedLabel = normalizeText(options.label ?? findHmeLabelInput(doc)?.value ?? "");
  const beforeAddresses = new Set(findAddressItems(doc).map((item) => item.address));
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
      const items = findAddressItems(doc);
      const candidateMatches = items.filter(
        (item) => item.address === candidateAddress && labelsMatch(item.label, normalizedLabel),
      );
      if (candidateMatches.length === 1 && !beforeAddresses.has(candidateMatches[0]!.address)) {
        // 作成前の候補と同じアドレスで、今回のラベル見出しを持つ新しい一覧項目がある。
        return { kind: "success", address: candidateMatches[0]!.address, copied: false, verified: true };
      }
      if (candidateMatches.length === 0 && normalizedLabel.length > 0) {
        // 候補が確定時に変わった場合でも、今回のラベル見出しを持つ新しい項目が
        // ちょうど1つだけなら、その作成結果を採用する。
        const newLabelItems = items.filter(
          (item) => labelsMatch(item.label, normalizedLabel) && !beforeAddresses.has(item.address),
        );
        if (newLabelItems.length === 1) {
          return { kind: "success", address: newLabelItems[0]!.address, copied: false, verified: true };
        }
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
