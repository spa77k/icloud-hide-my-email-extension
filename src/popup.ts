import { labelFromTab, sanitizeLabel } from "./lib/label";
import type { JobState, PopupRequest, PopupResponse } from "./lib/protocol";

const IDLE_MESSAGE =
  "「作成してコピー」を押すと、iCloud+の画面を裏で準備して作成します。このタブは切り替わりません。初回はAppleのサインインが必要です。";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

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
    siteHint.textContent = `この作成のラベル: ${next.label}`;
  }

  const working =
    next.status === "preparing" || next.status === "ready" || next.status === "creating";
  createButton.disabled = working || next.status === "uncertain";
  labelInput.disabled = working;

  switch (next.status) {
    case "idle":
      createButton.textContent = "作成してコピー";
      setStatus(IDLE_MESSAGE);
      break;
    case "preparing":
      createButton.textContent = "処理中…";
      setStatus(next.message || "iCloudの画面を準備しています…");
      break;
    case "ready":
      createButton.textContent = "処理中…";
      setStatus(next.message || "アドレスを作成しています…");
      break;
    case "creating":
      createButton.textContent = "処理中…";
      setStatus(next.message || "アドレスを作成しています…", "warning");
      break;
    case "awaiting_login":
      createButton.textContent = "サインイン後に作成";
      setStatus(next.message, "warning");
      break;
    case "success":
      createButton.textContent = "もう1つ作成";
      setStatus(next.message, "success");
      break;
    case "uncertain":
      createButton.textContent = "結果を確認してください";
      setStatus(next.message, "error");
      break;
    case "error":
      createButton.textContent = "もう一度作成";
      setStatus(next.message, "error");
      break;
  }

  const hasAddress = Boolean(next.address);
  result.hidden = !hasAddress;
  if (next.address) {
    address.textContent = next.address;
    copyState.textContent = next.copied ? "コピー済み" : "";
  } else {
    copyState.textContent = "";
  }

  openButton.hidden = !(
    next.status === "awaiting_login" ||
    next.status === "error" ||
    next.status === "uncertain" ||
    next.status === "success"
  );
  openButton.textContent = next.status === "success" ? "iCloudで確認" : "iCloudを開く";

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
  if (autoCopiedJobId === next.jobId) return;
  autoCopiedJobId = next.jobId;

  if (next.copied) {
    copyState.textContent = "コピー済み";
    return;
  }

  const copied = await copyToClipboard(next.address);
  if (copied) {
    copyState.textContent = "コピー済み";
    setStatus("アドレスをクリップボードにコピーしました。", "success");
    await send({ type: "MARK_COPIED" });
  } else {
    setStatus("アドレスを作成しました。「コピー」を押してください。", "warning");
  }
}

async function refresh(): Promise<void> {
  const response = await send({ type: "GET_STATE" });
  if (!response) {
    setStatus("拡張機能の状態を取得できませんでした。ポップアップを開き直してください。", "error");
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
      siteHint.textContent = `現在のタブ: ${suggested}（変更できます）`;
    } else {
      siteHint.textContent = "サイト名を入力してください。";
    }
  } catch {
    siteHint.textContent = "サイト名を入力してください。";
  }

  const response = await send({ type: "GET_STATE" });
  if (response) {
    render(response.state);
  } else {
    setStatus("拡張機能の状態を取得できませんでした。ポップアップを開き直してください。", "error");
  }
}

labelInput.addEventListener("input", () => {
  labelTouched = true;
  if (currentState && currentState.status === "idle") {
    siteHint.textContent = "サイト名は自由に変更できます。";
  }
});

createButton.addEventListener("click", async () => {
  const label = sanitizeLabel(labelInput.value);
  if (!label) {
    setStatus("ラベルを入力してください。現在のサイト名を自動で入れています。", "error");
    labelInput.focus();
    return;
  }
  labelTouched = true;
  createButton.disabled = true;
  labelInput.disabled = true;
  createButton.textContent = "準備中…";
  setStatus("iCloud+の画面を開いています…");

  const response = await send({ type: "START_JOB", label });
  if (!response) {
    setStatus("作成を開始できませんでした。ポップアップを開き直してください。", "error");
    createButton.disabled = false;
    labelInput.disabled = false;
    return;
  }
  render(response.state);
  if (!response.ok) {
    if (response.reason === "review") {
      setStatus(
        "前回の作成結果を確認してから再開してください。重複作成を防ぐため、自動では再試行しません。",
        "error",
      );
      review.scrollIntoView({ block: "nearest" });
    } else if (response.reason === "busy") {
      setStatus("作成処理中です。完了までそのままお待ちください。", "warning");
    }
  }
});

copyButton.addEventListener("click", async () => {
  const value = currentState?.address;
  if (!value) return;
  const copied = await copyToClipboard(value);
  if (copied) {
    copyState.textContent = "コピーしました";
    setStatus("アドレスをクリップボードにコピーしました。", "success");
    await send({ type: "MARK_COPIED" });
  } else {
    setStatus("コピーできませんでした。アドレスを選択してコピーしてください。", "error");
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
