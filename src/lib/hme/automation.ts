import { errorMessage } from "../job";
import type { ErrorCode } from "../protocol";
import {
  allElements,
  clickElement,
  clickableAncestor,
  elementText,
  findLabelInput,
  findByText,
  isDisabled,
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

export function extractEmails(doc: Document): string[] {
  const found = new Set<string>();
  const text = doc.body?.innerText ?? doc.body?.textContent ?? "";
  for (const match of text.matchAll(ADDRESS_PATTERN)) {
    found.add(match[0].replace(/\s+/g, "").toLowerCase());
  }

  for (const element of allElements(doc)) {
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

export function openHmeTile(doc: Document): boolean {
  const title = findByText(doc, ["メールを非公開", /hide my email/i], { maxTextLength: 40 });
  if (!title) return false;
  clickElement(clickableAncestor(title));
  return true;
}

export function findCreateButton(doc: Document): HTMLElement | null {
  return findByText(doc, ["メールアドレスを作成", /create email address/i], {
    interactiveOnly: true,
    maxTextLength: 50,
  });
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

    const fresh = extractEmails(doc).filter((address) => !before.has(address));
    if (fresh.length > 0) {
      const address = fresh[0]!;
      const copied = await copyText(address);
      return { kind: "success", address, copied };
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
