"use strict";
(() => {
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
  var IDLE_MESSAGE = "\u300C\u4F5C\u6210\u3057\u3066\u30B3\u30D4\u30FC\u300D\u3092\u62BC\u3059\u3068\u3001iCloud+\u306E\u753B\u9762\u3092\u958B\u3044\u3066\u4F5C\u6210\u3057\u307E\u3059\u3002\u521D\u56DE\u306FApple\u306E\u30B5\u30A4\u30F3\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059\u3002", $ = (id) => document.getElementById(id), labelInput = $("label"), siteHint = $("site-hint"), createButton = $("create"), status = $("status"), result = $("result"), address = $("address"), copyButton = $("copy"), copyState = $("copy-state"), openButton = $("open"), review = $("review"), reviewCheck = $("review-check"), reviewButton = $("review-button"), currentState = null, labelTouched = !1, pollTimer = null;
  function setStatus(text, tone = "info") {
    status.textContent = text, status.dataset.tone = tone;
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
    currentState = next, !labelTouched && next.label && (next.status === "preparing" || next.status === "ready" || next.status === "creating" || next.status === "awaiting_login" || next.status === "uncertain") && (labelInput.value = next.label), next.label && next.status !== "idle" && next.status !== "success" && next.status !== "error" && (siteHint.textContent = `\u3053\u306E\u4F5C\u6210\u306E\u30E9\u30D9\u30EB: ${next.label}`);
    let working = next.status === "preparing" || next.status === "ready" || next.status === "creating";
    switch (createButton.disabled = working || next.status === "uncertain", labelInput.disabled = working, next.status) {
      case "idle":
        createButton.textContent = "\u4F5C\u6210\u3057\u3066\u30B3\u30D4\u30FC", setStatus(IDLE_MESSAGE);
        break;
      case "preparing":
        createButton.textContent = "\u51E6\u7406\u4E2D\u2026", setStatus(next.message || "iCloud\u306E\u753B\u9762\u3092\u6E96\u5099\u3057\u3066\u3044\u307E\u3059\u2026");
        break;
      case "ready":
        createButton.textContent = "\u51E6\u7406\u4E2D\u2026", setStatus(next.message || "\u30A2\u30C9\u30EC\u30B9\u3092\u4F5C\u6210\u3057\u3066\u3044\u307E\u3059\u2026");
        break;
      case "creating":
        createButton.textContent = "\u51E6\u7406\u4E2D\u2026", setStatus(next.message || "\u30A2\u30C9\u30EC\u30B9\u3092\u4F5C\u6210\u3057\u3066\u3044\u307E\u3059\u2026", "warning");
        break;
      case "awaiting_login":
        createButton.textContent = "\u30B5\u30A4\u30F3\u30A4\u30F3\u5F8C\u306B\u4F5C\u6210", setStatus(next.message, "warning");
        break;
      case "success":
        createButton.textContent = "\u3082\u30461\u3064\u4F5C\u6210", setStatus(next.message, "success");
        break;
      case "uncertain":
        createButton.textContent = "\u7D50\u679C\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044", setStatus(next.message, "error");
        break;
      case "error":
        createButton.textContent = "\u3082\u3046\u4E00\u5EA6\u4F5C\u6210", setStatus(next.message, "error");
        break;
    }
    let hasAddress = !!next.address;
    result.hidden = !hasAddress, next.address ? (address.textContent = next.address, copyState.textContent = next.copied ? "\u30B3\u30D4\u30FC\u6E08\u307F" : "") : copyState.textContent = "", openButton.hidden = !(next.status === "awaiting_login" || next.status === "error" || next.status === "uncertain" || next.status === "success"), openButton.textContent = next.status === "success" ? "iCloud\u3067\u78BA\u8A8D" : "iCloud\u3092\u958B\u304F", review.hidden = next.status !== "uncertain", next.status !== "uncertain" ? (reviewCheck.checked = !1, reviewButton.disabled = !0) : reviewButton.disabled = !reviewCheck.checked, schedulePolling();
  }
  async function refresh() {
    let response = await send({ type: "GET_STATE" });
    if (!response) {
      setStatus("\u62E1\u5F35\u6A5F\u80FD\u306E\u72B6\u614B\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30DD\u30C3\u30D7\u30A2\u30C3\u30D7\u3092\u958B\u304D\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "error");
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
      suggested ? (labelInput.value = suggested, siteHint.textContent = `\u73FE\u5728\u306E\u30BF\u30D6: ${suggested}\uFF08\u5909\u66F4\u3067\u304D\u307E\u3059\uFF09`) : siteHint.textContent = "\u30B5\u30A4\u30C8\u540D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
    } catch {
      siteHint.textContent = "\u30B5\u30A4\u30C8\u540D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
    }
    let response = await send({ type: "GET_STATE" });
    response ? render(response.state) : setStatus("\u62E1\u5F35\u6A5F\u80FD\u306E\u72B6\u614B\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30DD\u30C3\u30D7\u30A2\u30C3\u30D7\u3092\u958B\u304D\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "error");
  }
  labelInput.addEventListener("input", () => {
    labelTouched = !0, currentState && currentState.status === "idle" && (siteHint.textContent = "\u30B5\u30A4\u30C8\u540D\u306F\u81EA\u7531\u306B\u5909\u66F4\u3067\u304D\u307E\u3059\u3002");
  });
  createButton.addEventListener("click", async () => {
    let label = sanitizeLabel(labelInput.value);
    if (!label) {
      setStatus("\u30E9\u30D9\u30EB\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u73FE\u5728\u306E\u30B5\u30A4\u30C8\u540D\u3092\u81EA\u52D5\u3067\u5165\u308C\u3066\u3044\u307E\u3059\u3002", "error"), labelInput.focus();
      return;
    }
    labelTouched = !0, createButton.disabled = !0, labelInput.disabled = !0, createButton.textContent = "\u6E96\u5099\u4E2D\u2026", setStatus("iCloud+\u306E\u753B\u9762\u3092\u958B\u3044\u3066\u3044\u307E\u3059\u2026");
    let response = await send({ type: "START_JOB", label });
    if (!response) {
      setStatus("\u4F5C\u6210\u3092\u958B\u59CB\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30DD\u30C3\u30D7\u30A2\u30C3\u30D7\u3092\u958B\u304D\u76F4\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "error"), createButton.disabled = !1, labelInput.disabled = !1;
      return;
    }
    render(response.state), response.ok || (response.reason === "review" ? (setStatus(
      "\u524D\u56DE\u306E\u4F5C\u6210\u7D50\u679C\u3092\u78BA\u8A8D\u3057\u3066\u304B\u3089\u518D\u958B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u91CD\u8907\u4F5C\u6210\u3092\u9632\u3050\u305F\u3081\u3001\u81EA\u52D5\u3067\u306F\u518D\u8A66\u884C\u3057\u307E\u305B\u3093\u3002",
      "error"
    ), review.scrollIntoView({ block: "nearest" })) : response.reason === "busy" && setStatus("\u4F5C\u6210\u51E6\u7406\u4E2D\u3067\u3059\u3002\u5B8C\u4E86\u307E\u3067\u305D\u306E\u307E\u307E\u304A\u5F85\u3061\u304F\u3060\u3055\u3044\u3002", "warning"));
  });
  copyButton.addEventListener("click", async () => {
    let value = currentState?.address;
    if (!value) return;
    await copyToClipboard(value) ? (copyState.textContent = "\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F", setStatus("\u30A2\u30C9\u30EC\u30B9\u3092\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F\u3002", "success")) : setStatus("\u30B3\u30D4\u30FC\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30A2\u30C9\u30EC\u30B9\u3092\u9078\u629E\u3057\u3066\u30B3\u30D4\u30FC\u3057\u3066\u304F\u3060\u3055\u3044\u3002", "error");
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
