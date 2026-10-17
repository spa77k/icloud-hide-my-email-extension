"use strict";
(() => {
  // src/lib/job.ts
  function shouldAutoCopy(state) {
    return state.status === "success" && !!state.address && !state.copied && state.verified;
  }

  // src/lib/label.ts
  function sanitizeLabel(value) {
    return value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  }
  function labelFromTab(url, title) {
    if (url)
      try {
        let parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
        let host = parsed.hostname.replace(/^www\./i, "");
        return !host || host.endsWith("icloud.com") ? "" : sanitizeLabel(host);
      } catch {
        return "";
      }
    if (title) {
      let cleaned = sanitizeLabel(
        title.replace(/\s*[|｜\-–—]\s*(公式サイト|公式|ホームページ|Home|Official Site).*$/i, "").replace(/\s*[|｜]\s*.*$/, "")
      );
      if (cleaned) return cleaned;
    }
    return "";
  }

  // src/popup.ts
  var $ = (id) => document.getElementById(id);
  function translate(key, substitutions) {
    try {
      return chrome.i18n.getMessage(key, substitutions) || key;
    } catch {
      return key;
    }
  }
  function uiLanguageTag() {
    let language = "en";
    try {
      language = chrome.i18n.getUILanguage().toLowerCase();
    } catch {
    }
    return language.startsWith("ja") ? "ja" : language.startsWith("zh") ? "zh-CN" : language.startsWith("ko") ? "ko" : "en";
  }
  function applyStaticTranslations() {
    document.documentElement.lang = uiLanguageTag(), document.title = translate("popupTitle");
    for (let element of document.querySelectorAll("[data-i18n]")) {
      let key = element.dataset.i18n;
      key && (element.textContent = translate(key));
    }
    for (let element of document.querySelectorAll("[data-i18n-placeholder]")) {
      let key = element.dataset.i18nPlaceholder;
      key && element.setAttribute("placeholder", translate(key));
    }
    for (let element of document.querySelectorAll("[data-i18n-aria-label]")) {
      let key = element.dataset.i18nAriaLabel;
      key && element.setAttribute("aria-label", translate(key));
    }
  }
  applyStaticTranslations();
  var labelInput = $("label"), siteHint = $("site-hint"), createButton = $("create"), status = $("status"), result = $("result"), address = $("address"), copyButton = $("copy"), copyState = $("copy-state"), openButton = $("open"), review = $("review"), reviewCheck = $("review-check"), reviewButton = $("review-button"), currentState = null, labelTouched = !1, pollTimer = null, autoCopiedJobId = null;
  function setStatus(text, tone = "info") {
    status.textContent = text, status.dataset.tone = tone;
  }
  function errorText(code) {
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
  function statusView(next) {
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
          text: next.errorCode === "SESSION_EXPIRED" ? translate("errSessionExpired") : translate("errAuthRequired"),
          tone: "warning"
        };
      case "success":
        return {
          text: next.copied ? translate("statusSuccessCopied") : translate("statusSuccess"),
          tone: "success"
        };
      case "uncertain":
        return { text: translate("statusUncertain"), tone: "error" };
      case "error":
        return { text: errorText(next.errorCode), tone: "error" };
    }
  }
  function setCopiedMarker(copied) {
    copyState.dataset.copied = copied ? "true" : "false";
  }
  async function send(request) {
    try {
      return await chrome.runtime.sendMessage(request);
    } catch {
      return null;
    }
  }
  function stopPolling() {
    pollTimer !== null && (clearTimeout(pollTimer), pollTimer = null);
  }
  function schedulePolling() {
    stopPolling(), currentState && (currentState.status === "preparing" || currentState.status === "ready" || currentState.status === "creating") && (pollTimer = setTimeout(() => {
      refresh();
    }, 650));
  }
  function render(next) {
    currentState = next, !labelTouched && next.label && (next.status === "preparing" || next.status === "ready" || next.status === "creating" || next.status === "awaiting_login" || next.status === "uncertain") && (labelInput.value = next.label), next.label && next.status !== "idle" && next.status !== "success" && next.status !== "error" && (siteHint.textContent = translate("siteHintThisJob", next.label));
    let working = next.status === "preparing" || next.status === "ready" || next.status === "creating";
    createButton.disabled = working || next.status === "uncertain", labelInput.disabled = working;
    let view = statusView(next);
    switch (setStatus(view.text, view.tone), next.status) {
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
    let hasAddress = !!next.address && next.verified;
    result.hidden = !hasAddress, copyButton.disabled = !hasAddress, hasAddress ? (address.textContent = next.address, copyState.textContent = next.copied ? translate("copyStateCopied") : "") : copyState.textContent = "", setCopiedMarker(!!(hasAddress && next.copied)), openButton.hidden = !(next.status === "awaiting_login" || next.status === "error" || next.status === "uncertain" || next.status === "success"), openButton.textContent = next.status === "success" ? translate("openIcloudCheck") : translate("openIcloud"), review.hidden = next.status !== "uncertain", next.status !== "uncertain" ? (reviewCheck.checked = !1, reviewButton.disabled = !0) : reviewButton.disabled = !reviewCheck.checked, schedulePolling(), maybeAutoCopy(next);
  }
  async function maybeAutoCopy(next) {
    if (next.status !== "success" || !next.address) return;
    if (next.copied) {
      copyState.textContent = translate("copyStateCopied"), setCopiedMarker(!0);
      return;
    }
    if (!shouldAutoCopy(next) || autoCopiedJobId === next.jobId) return;
    autoCopiedJobId = next.jobId;
    let jobId = next.jobId, address2 = next.address, copied = await copyToClipboard(address2);
    !currentState || currentState.jobId !== jobId || currentState.address !== address2 || (copied ? (copyState.textContent = translate("copyStateCopied"), setCopiedMarker(!0), setStatus(translate("statusCopied"), "success"), await send({ type: "MARK_COPIED", jobId, address: address2 })) : setStatus(translate("statusCreatedManual"), "warning"));
  }
  async function refresh() {
    let response = await send({ type: "GET_STATE" });
    if (!response) {
      setStatus(translate("statusStateUnavailable"), "error");
      return;
    }
    render(response.state), (currentState?.status === "preparing" || currentState?.status === "ready" || currentState?.status === "creating") && schedulePolling();
  }
  async function copyToClipboard(text) {
    try {
      return await navigator.clipboard.writeText(text), !0;
    } catch {
    }
    try {
      let area = document.createElement("textarea");
      area.value = text, area.setAttribute("readonly", ""), area.style.position = "fixed", area.style.opacity = "0", document.body.appendChild(area), area.select();
      let copied = document.execCommand("copy");
      return area.remove(), copied;
    } catch {
      return !1;
    }
  }
  async function initialize() {
    try {
      let tab = (await chrome.tabs.query({ active: !0, currentWindow: !0 }))[0], suggested = labelFromTab(tab?.url, tab?.title);
      suggested ? (labelInput.value = suggested, siteHint.textContent = translate("siteHintCurrent", suggested)) : siteHint.textContent = translate("siteHintEmpty");
    } catch {
      siteHint.textContent = translate("siteHintEmpty");
    }
    let response = await send({ type: "GET_STATE" });
    response ? render(response.state) : setStatus(translate("statusStateUnavailable"), "error");
  }
  labelInput.addEventListener("input", () => {
    labelTouched = !0, currentState && currentState.status === "idle" && (siteHint.textContent = translate("siteHintEditable"));
  });
  createButton.addEventListener("click", async () => {
    let label = sanitizeLabel(labelInput.value);
    if (!label) {
      setStatus(translate("errorNoLabel"), "error"), labelInput.focus();
      return;
    }
    labelTouched = !0, createButton.disabled = !0, labelInput.disabled = !0, createButton.textContent = translate("buttonPreparing"), setStatus(translate("statusOpening"));
    let response = await send({ type: "START_JOB", label });
    if (!response) {
      setStatus(translate("errorStartFailed"), "error"), createButton.disabled = !1, labelInput.disabled = !1;
      return;
    }
    render(response.state), response.ok || (response.reason === "review" ? (setStatus(translate("errorReviewNeeded"), "error"), review.scrollIntoView({ block: "nearest" })) : response.reason === "busy" && setStatus(translate("errorBusy"), "warning"));
  });
  copyButton.addEventListener("click", async () => {
    let state = currentState, value = state?.address;
    if (!state || !value || !state.verified) return;
    let copied = await copyToClipboard(value);
    !currentState || currentState.jobId !== state.jobId || currentState.address !== value || (copied ? (copyState.textContent = translate("copyStateCopiedNow"), setCopiedMarker(!0), setStatus(translate("statusCopied"), "success"), await send({ type: "MARK_COPIED", jobId: state.jobId, address: value })) : setStatus(translate("statusCopyFailed"), "error"));
  });
  openButton.addEventListener("click", () => {
    send({ type: "OPEN_ICLOUD" });
  });
  reviewCheck.addEventListener("change", () => {
    reviewButton.disabled = !reviewCheck.checked;
  });
  reviewButton.addEventListener("click", async () => {
    let response = await send({ type: "ACK_REVIEW" });
    response && (labelTouched = !1, render(response.state));
  });
  window.addEventListener("focus", () => {
    refresh();
  });
  initialize();
})();
