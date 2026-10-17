import { shouldAutoCopy } from "./lib/job";
import { labelFromTab, sanitizeLabel } from "./lib/label";
import type { JobState, PopupRequest, PopupResponse } from "./lib/protocol";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function translate(key: string, substitutions?: string | string[]): string {
  try {
    return chrome.i18n.getMessage(key, substitutions) || key;
  } catch {
    return key;
  }
}

function uiLanguageTag(): string {
  let language = "en";
  try {
    language = chrome.i18n.getUILanguage().toLowerCase();
  } catch {
    // 取得できない場合は英語のままにする。
  }
  if (language.startsWith("ja")) return "ja";
  if (language.startsWith("zh")) return "zh-CN";
  if (language.startsWith("ko")) return "ko";
  return "en";
}

function applyStaticTranslations(): void {
  document.documentElement.lang = uiLanguageTag();
  document.title = translate("popupTitle");

  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset.i18n;
    if (key) element.textContent = translate(key);
  }
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n-placeholder]")) {
    const key = element.dataset.i18nPlaceholder;
    if (key) element.setAttribute("placeholder", translate(key));
  }
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n-aria-label]")) {
    const key = element.dataset.i18nAriaLabel;
    if (key) element.setAttribute("aria-label", translate(key));
  }
}

applyStaticTranslations();

const labelInput = $<HTMLInputElement>("label");
const siteHint = $<HTMLParagraphElement>("site-hint");
const createButton = $<HTMLButtonElement>("create");
const status = $<HTMLParagraphElement>("status");
const result = $<HTMLElement>("result");
const address = $<HTMLElement>("address");
const copyButton = $<HTMLButtonElement>("copy");
const copyState = $<HTMLSpanElement>("copy-state");
const openButton = $<HTMLButtonElement>("open");
const review = $<HTMLElement>("review");
const reviewCheck = $<HTMLInputElement>("review-check");
const reviewButton = $<HTMLButtonElement>("review-button");

let currentState: JobState | null = null;
let labelTouched = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let autoCopiedJobId: string | null = null;

function setStatus(text: string, tone: "info" | "success" | "warning" | "error" = "info"): void {
  status.textContent = text;
  status.dataset.tone = tone;
}

function errorText(code: JobState["errorCode"]): string {
  switch (code) {
    case "AUTH_REQUIRED":
      return translate("errAuthRequired");
    case "SESSION_EXPIRED":
      return translate("errSessionExpired");
    case "NETWORK":
      return translate("errNetwork");
    case "NO_ICLOUD_PLUS":
      return translate("errNoIcloudPlus");
    case "UI_NOT_FOUND":
      return translate("errUiNotFound");
    case "CREATE_FAILED":
      return translate("errCreateFailed");
    case "TIMEOUT":
      return translate("errTimeout");
    case "RESULT_UNKNOWN":
      return translate("errResultUnknown");
    default:
      return translate("statusError");
  }
}

function statusView(next: JobState): { text: string; tone: "info" | "success" | "warning" | "error" } {
  switch (next.status) {
    case "idle":
      return { text: translate("statusIdle"), tone: "info" };
    case "preparing":
      return { text: translate("statusPreparing"), tone: "info" };
    case "ready":
      return { text: translate("statusReady"), tone: "info" };
    case "creating":
      return { text: translate("statusCreating"), tone: "warning" };
    case "awaiting_login":
      return {
        text:
          next.errorCode === "SESSION_EXPIRED"
            ? translate("errSessionExpired")
            : translate("errAuthRequired"),
        tone: "warning",
      };
    case "success":
      return {
        text: next.copied ? translate("statusSuccessCopied") : translate("statusSuccess"),
        tone: "success",
      };
    case "uncertain":
      return { text: translate("statusUncertain"), tone: "error" };
    case "error":
      return { text: errorText(next.errorCode), tone: "error" };
  }
}

function setCopiedMarker(copied: boolean): void {
  copyState.dataset.copied = copied ? "true" : "false";
}

async function send(request: PopupRequest): Promise<PopupResponse | null> {
  try {
    return (await chrome.runtime.sendMessage(request)) as PopupResponse;
  } catch {
    return null;
  }
}

function stopPolling(): void {
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function schedulePolling(): void {
  stopPolling();
  if (!currentState) return;
  if (currentState.status === "preparing" || currentState.status === "ready" || currentState.status === "creating") {
    pollTimer = setTimeout(() => {
      void refresh();
    }, 650);
  }
}

function render(next: JobState): void {
  currentState = next;

  if (
    !labelTouched &&
    next.label &&
    (next.status === "preparing" ||
      next.status === "ready" ||
      next.status === "creating" ||
      next.status === "awaiting_login" ||
      next.status === "uncertain")
  ) {
    labelInput.value = next.label;
  }
  if (
    next.label &&
    next.status !== "idle" &&
    next.status !== "success" &&
    next.status !== "error"
  ) {
    siteHint.textContent = translate("siteHintThisJob", next.label);
  }

  const working =
    next.status === "preparing" || next.status === "ready" || next.status === "creating";
  createButton.disabled = working || next.status === "uncertain";
  labelInput.disabled = working;

  const view = statusView(next);
  setStatus(view.text, view.tone);

  switch (next.status) {
    case "idle":
      createButton.textContent = translate("createAndCopy");
      break;
    case "preparing":
    case "ready":
    case "creating":
      createButton.textContent = translate("buttonProcessing");
      break;
    case "awaiting_login":
      createButton.textContent = translate("buttonSignIn");
      break;
    case "success":
      createButton.textContent = translate("buttonAnother");
      break;
    case "uncertain":
      createButton.textContent = translate("buttonReview");
      break;
    case "error":
      createButton.textContent = translate("buttonRetry");
      break;
  }

  // 作成を確認できた結果（verified）だけを表示・コピー対象にする。
  const hasAddress = Boolean(next.address) && next.verified;
  result.hidden = !hasAddress;
  copyButton.disabled = !hasAddress;
  if (hasAddress) {
    address.textContent = next.address!;
    copyState.textContent = next.copied ? translate("copyStateCopied") : "";
  } else {
    copyState.textContent = "";
  }
  setCopiedMarker(Boolean(hasAddress && next.copied));

  openButton.hidden = !(
    next.status === "awaiting_login" ||
    next.status === "error" ||
    next.status === "uncertain" ||
    next.status === "success"
  );
  openButton.textContent =
    next.status === "success" ? translate("openIcloudCheck") : translate("openIcloud");

  review.hidden = next.status !== "uncertain";
  if (next.status !== "uncertain") {
    reviewCheck.checked = false;
    reviewButton.disabled = true;
  } else {
    reviewButton.disabled = !reviewCheck.checked;
  }

  schedulePolling();
  void maybeAutoCopy(next);
}

/**
 * 作成成功後にポップアップ側でコピーする。
 * バックグラウンドのiCloudタブではClipboard APIが使えないことがあるため、
 * フォーカスされているポップアップでコピーし、成功したら状態に記録する。
 */
async function maybeAutoCopy(next: JobState): Promise<void> {
  if (next.status !== "success" || !next.address) return;
  if (next.copied) {
    copyState.textContent = translate("copyStateCopied");
    setCopiedMarker(true);
    return;
  }
  // 新しい取得ロジックで作成を確認できた結果だけを自動コピーする。
  // 修正前の結果（verifiedでない）は開き直しても自動コピーしない。
  if (!shouldAutoCopy(next)) return;
  if (autoCopiedJobId === next.jobId) return;
  autoCopiedJobId = next.jobId;

  const jobId = next.jobId;
  const address = next.address;
  const copied = await copyToClipboard(address);
  // コピー中に別のジョブ結果へ変わっていたら、古い結果で表示を書き換えない。
  if (!currentState || currentState.jobId !== jobId || currentState.address !== address) return;
  if (copied) {
    copyState.textContent = translate("copyStateCopied");
    setCopiedMarker(true);
    setStatus(translate("statusCopied"), "success");
    await send({ type: "MARK_COPIED", jobId, address });
  } else {
    setStatus(translate("statusCreatedManual"), "warning");
  }
}

async function refresh(): Promise<void> {
  const response = await send({ type: "GET_STATE" });
  if (!response) {
    setStatus(translate("statusStateUnavailable"), "error");
    return;
  }
  render(response.state);
  if (
    currentState?.status === "preparing" ||
    currentState?.status === "ready" ||
    currentState?.status === "creating"
  ) {
    schedulePolling();
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
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

async function initialize(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    const suggested = labelFromTab(tab?.url, tab?.title);
    if (suggested) {
      labelInput.value = suggested;
      siteHint.textContent = translate("siteHintCurrent", suggested);
    } else {
      siteHint.textContent = translate("siteHintEmpty");
    }
  } catch {
    siteHint.textContent = translate("siteHintEmpty");
  }

  const response = await send({ type: "GET_STATE" });
  if (response) {
    render(response.state);
  } else {
    setStatus(translate("statusStateUnavailable"), "error");
  }
}

labelInput.addEventListener("input", () => {
  labelTouched = true;
  if (currentState && currentState.status === "idle") {
    siteHint.textContent = translate("siteHintEditable");
  }
});

createButton.addEventListener("click", async () => {
  const label = sanitizeLabel(labelInput.value);
  if (!label) {
    setStatus(translate("errorNoLabel"), "error");
    labelInput.focus();
    return;
  }
  labelTouched = true;
  createButton.disabled = true;
  labelInput.disabled = true;
  createButton.textContent = translate("buttonPreparing");
  setStatus(translate("statusOpening"));

  const response = await send({ type: "START_JOB", label });
  if (!response) {
    setStatus(translate("errorStartFailed"), "error");
    createButton.disabled = false;
    labelInput.disabled = false;
    return;
  }
  render(response.state);
  if (!response.ok) {
    if (response.reason === "review") {
      setStatus(translate("errorReviewNeeded"), "error");
      review.scrollIntoView({ block: "nearest" });
    } else if (response.reason === "busy") {
      setStatus(translate("errorBusy"), "warning");
    }
  }
});

copyButton.addEventListener("click", async () => {
  const state = currentState;
  const value = state?.address;
  // 作成を確認できていない結果はコピーしない（古い誤取得結果の再コピー防止）。
  if (!state || !value || !state.verified) return;
  const copied = await copyToClipboard(value);
  if (!currentState || currentState.jobId !== state.jobId || currentState.address !== value) return;
  if (copied) {
    copyState.textContent = translate("copyStateCopiedNow");
    setCopiedMarker(true);
    setStatus(translate("statusCopied"), "success");
    await send({ type: "MARK_COPIED", jobId: state.jobId, address: value });
  } else {
    setStatus(translate("statusCopyFailed"), "error");
  }
});

openButton.addEventListener("click", () => {
  void send({ type: "OPEN_ICLOUD" });
});

reviewCheck.addEventListener("change", () => {
  reviewButton.disabled = !reviewCheck.checked;
});

reviewButton.addEventListener("click", async () => {
  const response = await send({ type: "ACK_REVIEW" });
  if (response) {
    labelTouched = false;
    render(response.state);
  }
});

window.addEventListener("focus", () => {
  void refresh();
});

void initialize();
