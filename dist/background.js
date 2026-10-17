"use strict";
(() => {
  // src/lib/protocol.ts
  var ICLOUD_PLUS_URL = "https://www.icloud.com/icloudplus", ICLOUD_MATCH_PATTERN = "https://www.icloud.com/*", ICLOUD_ORIGIN = "https://www.icloud.com";
  function idleState(now = Date.now()) {
    return {
      jobId: "",
      status: "idle",
      label: "",
      message: "",
      address: null,
      copied: !1,
      verified: !1,
      createAttempted: !1,
      tabId: null,
      frameId: null,
      startedAt: 0,
      updatedAt: now,
      errorCode: null
    };
  }
  function isActiveStatus(status) {
    return status === "preparing" || status === "ready" || status === "creating";
  }
  function startBlockReason(state2) {
    return state2.status === "uncertain" ? "review" : isActiveStatus(state2.status) ? "busy" : null;
  }

  // src/lib/job.ts
  var STATUS_MESSAGES = {
    preparing: "iCloud+\u306E\u300C\u30E1\u30FC\u30EB\u3092\u975E\u516C\u958B\u300D\u753B\u9762\u3092\u6E96\u5099\u3057\u3066\u3044\u307E\u3059\u2026",
    awaiting_login: "Apple\u306E\u30B5\u30A4\u30F3\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002iCloud\u3092\u958B\u3044\u3066\u30B5\u30A4\u30F3\u30A4\u30F3\u3057\u3066\u304B\u3089\u3001\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002",
    ready: "\u30E9\u30D9\u30EB\u3092\u5165\u529B\u3057\u307E\u3057\u305F\u3002\u30A2\u30C9\u30EC\u30B9\u3092\u4F5C\u6210\u3057\u3066\u3044\u307E\u3059\u2026",
    creating: "\u30A2\u30C9\u30EC\u30B9\u3092\u4F5C\u6210\u3057\u3066\u3044\u307E\u3059\u2026\uFF08\u4E8C\u91CD\u4F5C\u6210\u3092\u9632\u3050\u305F\u3081\u3001\u305D\u306E\u307E\u307E\u304A\u5F85\u3061\u304F\u3060\u3055\u3044\uFF09",
    success: "\u30A2\u30C9\u30EC\u30B9\u3092\u4F5C\u6210\u3057\u307E\u3057\u305F\u3002",
    error: "\u4F5C\u6210\u3092\u5B8C\u4E86\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002",
    uncertain: "\u4F5C\u6210\u7D50\u679C\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002iCloud\u3067\u7D50\u679C\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
  }, EMAIL_PATTERN = /^[^\s@]+@(?:icloud\.com|privaterelay\.appleid\.com)$/i;
  function isEmail(value) {
    return EMAIL_PATTERN.test(value);
  }
  function errorMessage(code) {
    switch (code) {
      case "AUTH_REQUIRED":
        return "Apple\u306E\u30B5\u30A4\u30F3\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002iCloud\u3092\u958B\u3044\u3066\u30B5\u30A4\u30F3\u30A4\u30F3\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
      case "SESSION_EXPIRED":
        return "iCloud\u306E\u30BB\u30C3\u30B7\u30E7\u30F3\u304C\u5207\u308C\u307E\u3057\u305F\u3002iCloud\u3092\u958B\u3044\u3066\u30B5\u30A4\u30F3\u30A4\u30F3\u3057\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
      case "NETWORK":
        return "\u901A\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u63A5\u7D9A\u3092\u78BA\u8A8D\u3057\u3066\u304B\u3089\u3001\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002";
      case "NO_ICLOUD_PLUS":
        return "\u300C\u30E1\u30FC\u30EB\u3092\u975E\u516C\u958B\u300D\u3092\u958B\u3051\u307E\u305B\u3093\u3067\u3057\u305F\u3002iCloud+\u306E\u52A0\u5165\u72B6\u6CC1\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
      case "UI_NOT_FOUND":
        return "iCloud+\u306E\u753B\u9762\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u753B\u9762\u304C\u5909\u308F\u3063\u305F\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059\u3002iCloud\u3067\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
      case "CREATE_FAILED":
        return "\u30A2\u30C9\u30EC\u30B9\u3092\u4F5C\u6210\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002iCloud\u306E\u753B\u9762\u3067\u5185\u5BB9\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
      case "TIMEOUT":
        return "iCloud\u306E\u5FDC\u7B54\u3092\u5F85\u3061\u304D\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002iCloud\u3092\u958B\u3044\u3066\u72B6\u614B\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
      case "RESULT_UNKNOWN":
        return "\u4F5C\u6210\u7D50\u679C\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002iCloud\u3067\u7D50\u679C\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
    }
  }
  function newJobState(jobId, label, now = Date.now()) {
    return {
      jobId,
      status: "preparing",
      label,
      message: STATUS_MESSAGES.preparing,
      address: null,
      copied: !1,
      verified: !1,
      createAttempted: !1,
      tabId: null,
      frameId: null,
      startedAt: now,
      updatedAt: now,
      errorCode: null
    };
  }
  function restoreState(raw, now = Date.now()) {
    if (!raw || typeof raw != "object") return idleState(now);
    let value = raw;
    if (typeof value.jobId != "string") return idleState(now);
    let restored = {
      jobId: value.jobId,
      status: value.status ?? "idle",
      label: typeof value.label == "string" ? value.label : "",
      message: typeof value.message == "string" ? value.message : "",
      address: typeof value.address == "string" && isEmail(value.address) ? value.address : null,
      copied: value.copied === !0,
      verified: value.verified === !0,
      createAttempted: value.createAttempted === !0,
      tabId: typeof value.tabId == "number" ? value.tabId : null,
      frameId: typeof value.frameId == "number" ? value.frameId : null,
      startedAt: typeof value.startedAt == "number" ? value.startedAt : 0,
      updatedAt: typeof value.updatedAt == "number" ? value.updatedAt : now,
      errorCode: value.errorCode ?? null
    };
    return restored.status === "creating" ? {
      ...restored,
      status: "uncertain",
      message: STATUS_MESSAGES.uncertain,
      createAttempted: !0,
      errorCode: "RESULT_UNKNOWN",
      updatedAt: now
    } : restored.createAttempted && restored.status !== "success" ? {
      ...restored,
      status: "uncertain",
      message: STATUS_MESSAGES.uncertain,
      errorCode: restored.errorCode ?? "RESULT_UNKNOWN",
      updatedAt: now
    } : restored.status === "preparing" || restored.status === "ready" ? {
      ...restored,
      status: "error",
      message: "\u524D\u56DE\u306E\u6E96\u5099\u306F\u4E2D\u65AD\u3055\u308C\u307E\u3057\u305F\u3002\u3082\u3046\u4E00\u5EA6\u300C\u4F5C\u6210\u3057\u3066\u30B3\u30D4\u30FC\u300D\u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      createAttempted: !1,
      frameId: null,
      errorCode: "TIMEOUT",
      updatedAt: now
    } : restored.status === "success" && !restored.verified ? {
      ...restored,
      status: "uncertain",
      address: null,
      copied: !1,
      message: STATUS_MESSAGES.uncertain,
      errorCode: "RESULT_UNKNOWN",
      updatedAt: now
    } : restored.status === "success" && !restored.address ? {
      ...restored,
      copied: !1
    } : restored;
  }
  function applyContentEvent(state2, event, meta) {
    if (!state2.jobId || state2.jobId !== event.jobId || state2.tabId !== null && state2.tabId !== meta.tabId) return state2;
    let now = meta.now ?? Date.now(), base = {
      ...state2,
      tabId: meta.tabId,
      updatedAt: now
    };
    switch (event.phase) {
      case "preparing":
        return state2.status === "preparing" ? { ...base, message: "iCloud\u306E\u753B\u9762\u3092\u8AAD\u307F\u8FBC\u3093\u3067\u3044\u307E\u3059\u2026" } : state2;
      case "opened_hme":
        return state2.status === "preparing" ? { ...base, message: "\u300C\u30E1\u30FC\u30EB\u3092\u975E\u516C\u958B\u300D\u753B\u9762\u3092\u958B\u3044\u3066\u3044\u307E\u3059\u2026" } : state2;
      case "prepared":
        return state2.status !== "preparing" || state2.createAttempted ? state2 : {
          ...base,
          status: "ready",
          frameId: meta.frameId,
          message: STATUS_MESSAGES.ready
        };
      case "auth_required": {
        if (state2.createAttempted)
          return {
            ...base,
            status: "uncertain",
            message: STATUS_MESSAGES.uncertain,
            errorCode: "RESULT_UNKNOWN"
          };
        let code = event.code === "SESSION_EXPIRED" ? "SESSION_EXPIRED" : "AUTH_REQUIRED";
        return {
          ...base,
          status: "awaiting_login",
          message: errorMessage(code),
          errorCode: code
        };
      }
      case "create_clicked":
        return state2.status !== "creating" && state2.status !== "ready" ? state2 : {
          ...base,
          status: "creating",
          createAttempted: !0,
          message: STATUS_MESSAGES.creating
        };
      case "created": {
        if (!state2.createAttempted) return state2;
        let address = typeof event.address == "string" && isEmail(event.address) ? event.address : null;
        return !address || event.verified !== !0 ? {
          ...base,
          status: "uncertain",
          address: null,
          copied: !1,
          message: STATUS_MESSAGES.uncertain,
          errorCode: "RESULT_UNKNOWN"
        } : {
          ...base,
          status: "success",
          address,
          copied: event.copied === !0,
          verified: !0,
          message: event.copied ? "\u30A2\u30C9\u30EC\u30B9\u3092\u4F5C\u6210\u3057\u3001\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F\u3002" : "\u30A2\u30C9\u30EC\u30B9\u3092\u4F5C\u6210\u3057\u307E\u3057\u305F\u3002\u300C\u30B3\u30D4\u30FC\u300D\u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
          errorCode: null
        };
      }
      case "create_failed":
        return event.clicked === !1 && !state2.createAttempted ? {
          ...base,
          status: "error",
          message: errorMessage(event.code ?? "UI_NOT_FOUND"),
          errorCode: event.code ?? "UI_NOT_FOUND"
        } : {
          ...base,
          status: "uncertain",
          message: STATUS_MESSAGES.uncertain,
          errorCode: "RESULT_UNKNOWN"
        };
      case "network_error":
        return state2.createAttempted ? {
          ...base,
          status: "uncertain",
          message: STATUS_MESSAGES.uncertain,
          errorCode: "RESULT_UNKNOWN"
        } : {
          ...base,
          status: "error",
          message: errorMessage("NETWORK"),
          errorCode: "NETWORK"
        };
      case "ui_not_found":
        return state2.createAttempted ? {
          ...base,
          status: "uncertain",
          message: STATUS_MESSAGES.uncertain,
          errorCode: "RESULT_UNKNOWN"
        } : {
          ...base,
          status: "error",
          message: errorMessage("UI_NOT_FOUND"),
          errorCode: "UI_NOT_FOUND"
        };
      case "no_icloud_plus":
        return {
          ...base,
          status: "error",
          message: errorMessage("NO_ICLOUD_PLUS"),
          errorCode: "NO_ICLOUD_PLUS"
        };
    }
  }
  function failBeforeCreate(state2, code, now = Date.now()) {
    return {
      ...state2,
      status: "error",
      createAttempted: !1,
      frameId: null,
      message: errorMessage(code),
      errorCode: code,
      updatedAt: now
    };
  }
  function markUncertain(state2, now = Date.now()) {
    return {
      ...state2,
      status: "uncertain",
      message: STATUS_MESSAGES.uncertain,
      errorCode: "RESULT_UNKNOWN",
      updatedAt: now
    };
  }
  function markCopied(state2, jobId, address, now = Date.now()) {
    return state2.status !== "success" || !state2.address || state2.copied || state2.jobId !== jobId || state2.address !== address ? state2 : {
      ...state2,
      copied: !0,
      message: "\u30A2\u30C9\u30EC\u30B9\u3092\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F\u3002",
      updatedAt: now
    };
  }
  function shouldReloadForPrepare(state2, jobId, response, alreadyReloaded) {
    return !(alreadyReloaded || response !== void 0 || state2.jobId !== jobId || state2.status !== "preparing" || state2.createAttempted);
  }
  function acknowledgeReview(state2, now = Date.now()) {
    return state2.status !== "uncertain" ? state2 : {
      ...state2,
      status: "error",
      createAttempted: !1,
      frameId: null,
      message: "\u78BA\u8A8D\u6E08\u307F\u306B\u3057\u307E\u3057\u305F\u3002\u5FC5\u8981\u306A\u3089\u3001\u3082\u3046\u4E00\u5EA6\u300C\u4F5C\u6210\u3057\u3066\u30B3\u30D4\u30FC\u300D\u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      errorCode: null,
      updatedAt: now
    };
  }

  // src/lib/label.ts
  function sanitizeLabel(value) {
    return value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  // src/background.ts
  var STORAGE_KEY = "hmeJobState", PREPARE_TIMEOUT_MS = 3e4, PREPARE_INTERVAL_MS = 700, CREATE_WAIT_MS = 45e3, state = idleState(), initPromise = null, writeChain = Promise.resolve();
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function updateBadge() {
    let text = "", color = "#0071e3";
    state.status === "preparing" || state.status === "ready" || state.status === "creating" ? text = "\u2026" : state.status === "success" ? (text = "\u2713", color = "#1f8f3a") : (state.status === "error" || state.status === "uncertain" || state.status === "awaiting_login") && (text = "!", color = "#c0392b"), chrome.action.setBadgeText({ text }).catch(() => {
    }), chrome.action.setBadgeBackgroundColor({ color }).catch(() => {
    });
  }
  function persist() {
    let snapshot = state;
    writeChain = writeChain.then(() => chrome.storage.session.set({ [STORAGE_KEY]: snapshot })).then(() => {
    }).catch(() => {
    });
  }
  function commit(next) {
    state = next, updateBadge(), persist();
  }
  function ensureInit() {
    return initPromise || (initPromise = (async () => {
      try {
        let stored = await chrome.storage.session.get(STORAGE_KEY);
        state = restoreState(stored[STORAGE_KEY]);
      } catch {
        state = idleState();
      }
      updateBadge();
    })()), initPromise;
  }
  function isAllowedContentSender(sender) {
    return sender.tab?.id === void 0 || sender.frameId === void 0 || !sender.url ? !1 : sender.url.startsWith(`${ICLOUD_ORIGIN}/`);
  }
  async function findIcloudTab() {
    try {
      return (await chrome.tabs.query({ url: ICLOUD_MATCH_PATTERN })).filter((tab) => tab.id !== void 0).sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0] ?? null;
    } catch {
      return null;
    }
  }
  async function focusTab(tabId) {
    try {
      let tab = await chrome.tabs.get(tabId);
      return await chrome.tabs.update(tabId, { active: !0 }), tab.windowId !== void 0 && await chrome.windows.update(tab.windowId, { focused: !0 }), !0;
    } catch {
      return !1;
    }
  }
  async function openIcloudTab() {
    let existing = await findIcloudTab();
    if (existing?.id !== void 0) {
      let tabId = existing.id;
      return existing.url?.startsWith(ICLOUD_PLUS_URL) || await chrome.tabs.update(tabId, { url: ICLOUD_PLUS_URL }), tabId;
    }
    let created = await chrome.tabs.create({ url: ICLOUD_PLUS_URL, active: !1 });
    if (created.id === void 0) throw new Error("iCloud tab could not be created");
    return created.id;
  }
  function waitForTabComplete(tabId, timeoutMs) {
    return new Promise((resolve) => {
      let settled = !1, finish = () => {
        settled || (settled = !0, chrome.tabs.onUpdated.removeListener(listener), clearTimeout(timer), resolve());
      }, listener = (updatedTabId, info) => {
        updatedTabId === tabId && info.status === "complete" && finish();
      };
      chrome.tabs.onUpdated.addListener(listener), chrome.tabs.get(tabId).then((tab) => {
        tab.status === "complete" && finish();
      }).catch(() => finish());
      let timer = setTimeout(finish, timeoutMs);
    });
  }
  async function sendToTab(tabId, message, frameId, timeoutMs = 1e4) {
    let timer;
    try {
      let request = frameId === void 0 ? chrome.tabs.sendMessage(tabId, message) : chrome.tabs.sendMessage(tabId, message, { frameId });
      return await Promise.race([
        request,
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(void 0), timeoutMs);
        })
      ]);
    } catch {
      return;
    } finally {
      timer && clearTimeout(timer);
    }
  }
  async function launchCreate(jobId) {
    let initialStatus = state.status;
    if (state.jobId !== jobId || initialStatus !== "ready" || state.createAttempted) return;
    let tabId = state.tabId, frameId = state.frameId;
    if (tabId === null || frameId === null) {
      commit(failBeforeCreate(state, "UI_NOT_FOUND"));
      return;
    }
    commit({
      ...state,
      status: "creating",
      createAttempted: !0,
      message: STATUS_MESSAGES.creating,
      errorCode: null
    });
    let response = await sendToTab(tabId, { type: "CREATE", jobId, label: state.label }, frameId, CREATE_WAIT_MS);
    if (!response) {
      state.status !== "success" && commit(markUncertain(state));
      return;
    }
    if (response.clicked === !1) {
      commit(failBeforeCreate(state, "CREATE_FAILED"));
      return;
    }
    let deadline = Date.now() + CREATE_WAIT_MS;
    for (; Date.now() < deadline; ) {
      let currentStatus = state.status;
      if (state.jobId !== jobId || currentStatus === "success" || currentStatus === "error" || currentStatus === "uncertain") return;
      await sleep(300);
    }
    state.status === "creating" && commit(markUncertain(state));
  }
  async function runJob(jobId) {
    let tabId;
    try {
      tabId = await openIcloudTab();
    } catch {
      state.jobId === jobId && commit(failBeforeCreate(state, "NETWORK"));
      return;
    }
    if (state.jobId !== jobId || (commit({ ...state, tabId, message: STATUS_MESSAGES.preparing }), await waitForTabComplete(tabId, 15e3), state.jobId !== jobId)) return;
    let deadline = Date.now() + PREPARE_TIMEOUT_MS, reloaded = !1;
    for (; Date.now() < deadline; ) {
      if (state.jobId !== jobId) return;
      if (state.status === "ready") {
        await launchCreate(jobId);
        return;
      }
      if (state.status === "awaiting_login" || state.status === "error" || state.status === "uncertain" || state.status === "success")
        return;
      let response = await sendToTab(tabId, { type: "PREPARE", jobId, label: state.label }, void 0, 8e3), currentStatus = state.status;
      if (state.jobId !== jobId) return;
      if (currentStatus === "ready") {
        await launchCreate(jobId);
        return;
      }
      if (currentStatus !== "preparing" || state.createAttempted)
        return;
      if (shouldReloadForPrepare(state, jobId, response, reloaded)) {
        reloaded = !0;
        try {
          await chrome.tabs.reload(tabId);
        } catch {
        }
        await waitForTabComplete(tabId, 15e3);
        continue;
      }
      await sleep(PREPARE_INTERVAL_MS);
    }
    state.jobId === jobId && !state.createAttempted && commit({
      ...state,
      status: "awaiting_login",
      message: "iCloud\u306E\u753B\u9762\u3092\u958B\u3051\u307E\u305B\u3093\u3067\u3057\u305F\u3002Apple\u306E\u30B5\u30A4\u30F3\u30A4\u30F3\u304C\u5FC5\u8981\u304B\u3001\u901A\u4FE1\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002iCloud\u3092\u958B\u3044\u3066\u72B6\u614B\u3092\u78BA\u8A8D\u3067\u304D\u307E\u3059\u3002",
      errorCode: "AUTH_REQUIRED",
      updatedAt: Date.now()
    });
  }
  async function handleContentEvent(message, sender) {
    if (!isAllowedContentSender(sender)) return;
    let tabId = sender.tab?.id, frameId = sender.frameId;
    if (tabId === void 0 || frameId === void 0) return;
    let next = applyContentEvent(state, message, { tabId, frameId });
    next !== state && (commit(next), next.status === "ready" && await launchCreate(next.jobId));
  }
  async function handlePopupMessage(message) {
    switch (message.type) {
      case "GET_STATE":
        return { ok: !0, state };
      case "START_JOB": {
        let label = sanitizeLabel(message.label);
        if (!label) return { ok: !1, state };
        let blocked = startBlockReason(state);
        if (blocked) return { ok: !1, state, reason: blocked };
        let jobId = crypto.randomUUID();
        return commit(newJobState(jobId, label)), runJob(jobId), { ok: !0, state };
      }
      case "OPEN_ICLOUD": {
        if (state.tabId !== null && await focusTab(state.tabId))
          return { ok: !0, state };
        try {
          let tab = await chrome.tabs.create({ url: ICLOUD_PLUS_URL, active: !0 });
          tab.id !== void 0 && commit({ ...state, tabId: tab.id });
        } catch {
        }
        return { ok: !0, state };
      }
      case "MARK_COPIED":
        return commit(markCopied(state, message.jobId, message.address)), { ok: !0, state };
      case "ACK_REVIEW":
        return commit(acknowledgeReview(state)), { ok: !0, state };
    }
  }
  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => ((async () => {
      if (await ensureInit(), message?.type === "JOB_EVENT") {
        await handleContentEvent(message, sender), sendResponse({ ok: !0 });
        return;
      }
      sendResponse(await handlePopupMessage(message));
    })().catch(() => {
      sendResponse({ ok: !1, state });
    }), !0)
  );
  ensureInit();
})();
