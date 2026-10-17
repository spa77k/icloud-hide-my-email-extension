import {
  acknowledgeReview,
  applyContentEvent,
  failBeforeCreate,
  markUncertain,
  newJobState,
  restoreState,
  STATUS_MESSAGES,
} from "./lib/job";
import { sanitizeLabel } from "./lib/label";
import {
  ICLOUD_MATCH_PATTERN,
  ICLOUD_ORIGIN,
  ICLOUD_PLUS_URL,
  idleState,
  startBlockReason,
  type ContentCommand,
  type ContentEventMessage,
  type JobState,
  type PopupRequest,
  type PopupResponse,
} from "./lib/protocol";

const STORAGE_KEY = "hmeJobState";
const PREPARE_TIMEOUT_MS = 30000;
const PREPARE_INTERVAL_MS = 700;
const CREATE_WAIT_MS = 45000;

let state: JobState = idleState();
let initPromise: Promise<void> | null = null;
let writeChain: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function updateBadge(): void {
  let text = "";
  let color = "#0071e3";
  if (state.status === "preparing" || state.status === "ready" || state.status === "creating") {
    text = "…";
  } else if (state.status === "success") {
    text = "✓";
    color = "#1f8f3a";
  } else if (state.status === "error" || state.status === "uncertain" || state.status === "awaiting_login") {
    text = "!";
    color = "#c0392b";
  }
  void chrome.action.setBadgeText({ text }).catch(() => {});
  void chrome.action.setBadgeBackgroundColor({ color }).catch(() => {});
}

function persist(): void {
  const snapshot = state;
  writeChain = writeChain
    .then(() => chrome.storage.session.set({ [STORAGE_KEY]: snapshot }))
    .then(() => undefined)
    .catch(() => undefined);
}

function commit(next: JobState): void {
  state = next;
  updateBadge();
  persist();
}

function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const stored = await chrome.storage.session.get(STORAGE_KEY);
        state = restoreState(stored[STORAGE_KEY]);
      } catch {
        state = idleState();
      }
      updateBadge();
    })();
  }
  return initPromise;
}

function isAllowedContentSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.tab?.id === undefined || sender.frameId === undefined) return false;
  if (!sender.url) return false;
  return sender.url.startsWith(`${ICLOUD_ORIGIN}/`);
}

async function findIcloudTab(): Promise<chrome.tabs.Tab | null> {
  try {
    const tabs = await chrome.tabs.query({ url: ICLOUD_MATCH_PATTERN });
    return (
      tabs
        .filter((tab) => tab.id !== undefined)
        .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0] ?? null
    );
  } catch {
    return null;
  }
}

async function focusTab(tabId: number): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.tabs.update(tabId, { active: true });
    if (tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return true;
  } catch {
    // タブが閉じられていても、次の作成時に開き直す。
    return false;
  }
}

async function openIcloudTab(): Promise<number> {
  const existing = await findIcloudTab();
  if (existing?.id !== undefined) {
    const tabId = existing.id;
    if (existing.url?.startsWith(ICLOUD_PLUS_URL)) {
      await chrome.tabs.reload(tabId);
    } else {
      await chrome.tabs.update(tabId, { url: ICLOUD_PLUS_URL, active: true });
    }
    await focusTab(tabId);
    return tabId;
  }

  const created = await chrome.tabs.create({ url: ICLOUD_PLUS_URL, active: true });
  if (created.id === undefined) throw new Error("iCloud tab could not be created");
  return created.id;
}

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (updatedTabId: number, info: { status?: string }): void => {
      if (updatedTabId === tabId && info.status === "complete") finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    void chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === "complete") finish();
      })
      .catch(() => finish());
    const timer = setTimeout(finish, timeoutMs);
  });
}

async function sendToTab(
  tabId: number,
  message: ContentCommand,
  frameId?: number,
  timeoutMs = 10000,
): Promise<{ ok?: boolean; status?: string; clicked?: boolean; code?: string } | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request =
      frameId === undefined
        ? chrome.tabs.sendMessage(tabId, message)
        : chrome.tabs.sendMessage(tabId, message, { frameId });
    return (await Promise.race([
      request,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeoutMs);
      }),
    ])) as { ok?: boolean; status?: string; clicked?: boolean; code?: string } | undefined;
  } catch {
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function launchCreate(jobId: string): Promise<void> {
  const initialStatus = state.status as JobState["status"];
  if (state.jobId !== jobId || initialStatus !== "ready" || state.createAttempted) return;
  const tabId = state.tabId;
  const frameId = state.frameId;
  if (tabId === null || frameId === null) {
    commit(failBeforeCreate(state, "UI_NOT_FOUND"));
    return;
  }

  commit({
    ...state,
    status: "creating",
    createAttempted: true,
    message: STATUS_MESSAGES.creating,
    errorCode: null,
  });

  const response = await sendToTab(tabId, { type: "CREATE", jobId }, frameId, CREATE_WAIT_MS);
  if (!response) {
    if ((state.status as JobState["status"]) !== "success") commit(markUncertain(state));
    return;
  }
  if (response.clicked === false) {
    commit(failBeforeCreate(state, "CREATE_FAILED"));
    return;
  }

  const deadline = Date.now() + CREATE_WAIT_MS;
  while (Date.now() < deadline) {
    const currentStatus = state.status as JobState["status"];
    if (state.jobId !== jobId) return;
    if (currentStatus === "success" || currentStatus === "error" || currentStatus === "uncertain") return;
    await sleep(300);
  }
  if ((state.status as JobState["status"]) === "creating") commit(markUncertain(state));
}

async function runJob(jobId: string): Promise<void> {
  let tabId: number;
  try {
    tabId = await openIcloudTab();
  } catch {
    if (state.jobId === jobId) commit(failBeforeCreate(state, "NETWORK"));
    return;
  }

  if (state.jobId !== jobId) return;
  commit({ ...state, tabId, message: STATUS_MESSAGES.preparing });

  await waitForTabComplete(tabId, 15000);
  if (state.jobId !== jobId) return;

  const deadline = Date.now() + PREPARE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (state.jobId !== jobId) return;
    if (state.status === "ready") {
      await launchCreate(jobId);
      return;
    }
    if (
      state.status === "awaiting_login" ||
      state.status === "error" ||
      state.status === "uncertain" ||
      state.status === "success"
    ) {
      return;
    }
    await sendToTab(tabId, { type: "PREPARE", jobId, label: state.label }, undefined, 8000);
    await sleep(PREPARE_INTERVAL_MS);
  }

  if (state.jobId === jobId && !state.createAttempted) {
    commit({
      ...state,
      status: "awaiting_login",
      message:
        "iCloudの画面を開けませんでした。Appleのサインインが必要か、通信を確認してください。iCloudを開いて状態を確認できます。",
      errorCode: "AUTH_REQUIRED",
      updatedAt: Date.now(),
    });
  }
}

async function handleContentEvent(
  message: ContentEventMessage,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  if (!isAllowedContentSender(sender)) return;
  const tabId = sender.tab?.id;
  const frameId = sender.frameId;
  if (tabId === undefined || frameId === undefined) return;

  const next = applyContentEvent(state, message, { tabId, frameId });
  if (next === state) return;
  commit(next);

  if (next.status === "ready") {
    await launchCreate(next.jobId);
  }
}

async function handlePopupMessage(message: PopupRequest): Promise<PopupResponse> {
  switch (message.type) {
    case "GET_STATE":
      return { ok: true, state };

    case "START_JOB": {
      const label = sanitizeLabel(message.label);
      if (!label) return { ok: false, state };
      const blocked = startBlockReason(state);
      if (blocked) return { ok: false, state, reason: blocked };

      const jobId = crypto.randomUUID();
      commit(newJobState(jobId, label));
      void runJob(jobId);
      return { ok: true, state };
    }

    case "OPEN_ICLOUD": {
      if (state.tabId !== null && (await focusTab(state.tabId))) {
        return { ok: true, state };
      }
      try {
        const tab = await chrome.tabs.create({ url: ICLOUD_PLUS_URL, active: true });
        if (tab.id !== undefined) commit({ ...state, tabId: tab.id });
      } catch {
        // タブを開けなくても状態は変えない。
      }
      return { ok: true, state };
    }

    case "ACK_REVIEW":
      commit(acknowledgeReview(state));
      return { ok: true, state };
  }
}

chrome.runtime.onMessage.addListener(
  (message: PopupRequest | ContentEventMessage, sender, sendResponse: (response?: PopupResponse | { ok: boolean }) => void) => {
    void (async () => {
      await ensureInit();
      if (message?.type === "JOB_EVENT") {
        await handleContentEvent(message, sender);
        sendResponse({ ok: true });
        return;
      }
      sendResponse(await handlePopupMessage(message as PopupRequest));
    })().catch(() => {
      sendResponse({ ok: false, state });
    });
    return true;
  },
);

void ensureInit();
