"use strict";
(() => {
  // src/lib/job.ts
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

  // src/lib/hme/dom.ts
  var NON_TEXT_TAGS = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "HTML", "BODY"]);
  function normalizeText(value) {
    return value.normalize("NFKC").replace(/\s+/g, " ").trim();
  }
  function elementText(element) {
    let parts = [], aria = element.getAttribute("aria-label");
    aria && parts.push(aria);
    let title = element.getAttribute("title");
    title && parts.push(title);
    let placeholder = element.getAttribute("placeholder");
    placeholder && parts.push(placeholder), element instanceof HTMLInputElement && (element.value && parts.push(element.value), element.alt && parts.push(element.alt));
    let text = element.innerText ?? element.textContent ?? "";
    return text && parts.push(text), normalizeText(parts.join(" "));
  }
  function allElements(doc) {
    let result = [], visit = (root) => {
      let nodes = root.querySelectorAll("*");
      for (let element of nodes) {
        if (result.length >= 2e4) return;
        result.push(element), element.shadowRoot && visit(element.shadowRoot);
      }
    };
    return visit(doc), result;
  }
  function isVisible(element) {
    let current = element;
    for (let depth = 0; current && depth < 8; depth += 1) {
      if (current.hasAttribute("hidden") || current.getAttribute("aria-hidden") === "true") return !1;
      if (current instanceof HTMLElement) {
        let style = current.style;
        if (style.display === "none" || style.visibility === "hidden") return !1;
        let computed = current.ownerDocument.defaultView?.getComputedStyle(current);
        if (computed?.display === "none" || computed?.visibility === "hidden") return !1;
      }
      let parent = current.parentElement;
      if (parent)
        current = parent;
      else {
        let root = current.getRootNode();
        current = root instanceof ShadowRoot ? root.host : null;
      }
    }
    return !0;
  }
  function isInteractive(element) {
    if (element.matches("button, a[href], input, select, textarea, summary, [role='button'], [role='link'], [role='menuitem'], [role='tab']") || element.hasAttribute("tabindex")) return !0;
    let tag = element.tagName.toLowerCase();
    return tag.startsWith("ui-") || tag.startsWith("sp-");
  }
  function clickableAncestor(element) {
    let current = element;
    for (let depth = 0; current && depth < 8; depth += 1) {
      if (isInteractive(current)) return current;
      current = current.parentElement;
    }
    return element;
  }
  function matchScore(text, matcher) {
    if (typeof matcher == "string") {
      let needle = normalizeText(matcher);
      return needle ? text === needle ? 0 : text.startsWith(needle) ? 1 : text.includes(needle) ? 2 : null : null;
    }
    return matcher.test(text) ? 3 : null;
  }
  function findAllByText(doc, matchers, options = {}) {
    let maxTextLength = options.maxTextLength ?? 220, matches = [];
    for (let element of allElements(doc)) {
      if (NON_TEXT_TAGS.has(element.tagName)) continue;
      let text = elementText(element);
      if (!text || text.length > maxTextLength || !isVisible(element)) continue;
      let score = null;
      for (let matcher of matchers) {
        let candidate = matchScore(text, matcher);
        candidate !== null && (score === null || candidate < score) && (score = candidate);
      }
      if (score === null) continue;
      let clickable = clickableAncestor(element);
      options.interactiveOnly && !isInteractive(clickable) || (isInteractive(clickable) && (score -= 0.25), matches.push({ element, score, textLength: text.length }));
    }
    return matches.sort((a, b) => a.score - b.score || a.textLength - b.textLength), matches.map((match) => match.element);
  }
  function findByText(doc, matchers, options = {}) {
    return findAllByText(doc, matchers, options)[0] ?? null;
  }
  function isDisabled(element) {
    let current = element;
    for (let depth = 0; current && depth < 6; depth += 1) {
      if (current.matches("[disabled], [aria-disabled='true']") || current instanceof HTMLButtonElement && current.disabled || current instanceof HTMLInputElement && current.disabled) return !0;
      current = current.parentElement;
    }
    return !1;
  }
  function clickElement(element) {
    let clickable = clickableAncestor(element), target = clickable.shadowRoot?.querySelector("button, [role='button'], a[href]") ?? clickable.querySelector(":scope > button, :scope > [role='button'], :scope > a[href]") ?? clickable;
    try {
      target.scrollIntoView?.({ block: "center" });
    } catch {
    }
    for (let type of ["pointerdown", "mousedown", "pointerup", "mouseup"])
      target.dispatchEvent(
        new MouseEvent(type, {
          bubbles: !0,
          cancelable: !0,
          composed: !0
        })
      );
    target.click();
  }
  function setInputValue(input, value) {
    let prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter ? setter.call(input, value) : input.value = value, input.dispatchEvent(new Event("input", { bubbles: !0, composed: !0 })), input.dispatchEvent(new Event("change", { bubbles: !0, composed: !0 }));
  }
  function findTextInput(doc) {
    let candidates = [];
    for (let element of allElements(doc)) {
      if (element instanceof HTMLTextAreaElement) {
        if (!isVisible(element) || element.disabled) continue;
        candidates.push(element);
        continue;
      }
      if (!(element instanceof HTMLInputElement) || !isVisible(element) || element.disabled) continue;
      let type = (element.type || "text").toLowerCase();
      if (type === "search" || type === "email" || type === "password" || type === "hidden" || type !== "text" && type !== "") continue;
      let hint = `${element.placeholder} ${element.getAttribute("aria-label") ?? ""}`;
      /検索|search/i.test(hint) || candidates.push(element);
    }
    return candidates[0] ?? null;
  }
  function findLabelInput(doc) {
    let label = findByText(doc, ["\u30E9\u30D9\u30EB", /^label$/i], { maxTextLength: 40 });
    if (label) {
      let current = label;
      for (let depth = 0; current && depth < 5; depth += 1) {
        let input = current.querySelector(
          "input:not([type='hidden']):not([type='search']), textarea"
        );
        if (input && isVisible(input) && !input.disabled) return input;
        current = current.parentElement;
      }
    }
    return findTextInput(doc);
  }

  // src/lib/hme/automation.ts
  var ADDRESS_PATTERN = /[a-z0-9._%+-]+\s*@\s*(?:icloud\.com|privaterelay\.appleid\.com)/gi, EXCLUDED_LOCAL_PARTS = /* @__PURE__ */ new Set(["support", "privacy", "apple", "noreply", "no-reply"]), AutomationError = class extends Error {
    constructor(code, message = errorMessage(code)) {
      super(message);
      this.code = code;
      this.name = "AutomationError";
    }
    code;
  };
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async function waitFor(check, timeoutMs, pollMs) {
    let deadline = Date.now() + timeoutMs;
    for (; Date.now() < deadline; ) {
      let value = check();
      if (value) return value;
      await sleep(pollMs);
    }
    throw new AutomationError("UI_NOT_FOUND");
  }
  function parentAcrossShadow(element) {
    let parent = element.parentElement;
    if (parent) return parent;
    let root = element.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }
  function extractEmails(doc) {
    let found = /* @__PURE__ */ new Set(), text = doc.body?.innerText ?? doc.body?.textContent ?? "";
    for (let match of text.matchAll(ADDRESS_PATTERN))
      found.add(match[0].replace(/\s+/g, "").toLowerCase());
    for (let element of allElements(doc))
      if (isVisible(element)) {
        if (element instanceof HTMLAnchorElement && element.href.startsWith("mailto:")) {
          let address = decodeURIComponent(element.href.slice(7)).split("?")[0] ?? "";
          ADDRESS_PATTERN.test(address) && found.add(address.trim().toLowerCase()), ADDRESS_PATTERN.lastIndex = 0;
        }
        (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && (ADDRESS_PATTERN.test(element.value) && found.add(element.value.trim().toLowerCase()), ADDRESS_PATTERN.lastIndex = 0);
      }
    return [...found].filter((address) => {
      let local = address.split("@")[0] ?? "";
      return !EXCLUDED_LOCAL_PARTS.has(local);
    });
  }
  function hasHmeControls(doc) {
    return findCreateButton(doc) || findByText(doc, ["\u65B0\u3057\u3044\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u3092\u8A2D\u5B9A", /set up a new email address/i], {
      maxTextLength: 80
    }) || findByText(doc, [/件の有効なメールアドレス/, /active email address/i, /有効なメールアドレス/], {
      maxTextLength: 80
    }) ? !0 : !!(findByText(doc, ["\u30E1\u30FC\u30EB\u3092\u975E\u516C\u958B", /hide my email/i], { maxTextLength: 40 }) && findLabelInput(doc));
  }
  function detectAuth(doc) {
    for (let element of allElements(doc))
      if (element instanceof HTMLInputElement && element.type === "password" && isVisible(element))
        return "SESSION_EXPIRED";
    return findByText(doc, ["\u30B5\u30A4\u30F3\u30A4\u30F3", /sign in/i], {
      interactiveOnly: !0,
      maxTextLength: 40
    }) ? "AUTH_REQUIRED" : null;
  }
  function openHmeTile(doc) {
    let title = findByText(doc, ["\u30E1\u30FC\u30EB\u3092\u975E\u516C\u958B", /hide my email/i], { maxTextLength: 40 });
    return title ? (clickElement(clickableAncestor(title)), !0) : !1;
  }
  function findCreateButton(doc) {
    return findByText(doc, ["\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u3092\u4F5C\u6210", /create email address/i], {
      interactiveOnly: !0,
      maxTextLength: 50
    });
  }
  function findOpenAddressButton(doc) {
    let newAddress = findByText(doc, ["\u65B0\u3057\u3044\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9\u3092\u8A2D\u5B9A", /set up a new email address/i], {
      interactiveOnly: !0,
      maxTextLength: 80
    });
    if (newAddress) return newAddress;
    let countHeading = findByText(
      doc,
      [/件の有効なメールアドレス/, /active email address/i, /有効なメールアドレス/],
      { maxTextLength: 80 }
    );
    if (countHeading) {
      let current = countHeading;
      for (let depth = 0; current && depth < 4; depth += 1) {
        let controls = current.querySelectorAll(
          "button, [role='button'], ui-button, a[href], [tabindex]"
        );
        for (let control of controls) {
          if (!isVisible(control) || isDisabled(control)) continue;
          let text = elementText(control);
          if (text === "+" || text === "\uFF0B" || /追加|add|new|作成|create/i.test(text)) return control;
        }
        for (let control of controls)
          if (!(!isVisible(control) || isDisabled(control)))
            return control;
        current = parentAcrossShadow(current);
      }
    }
    return findByText(doc, [/メールアドレスを追加/, /新しいメールアドレス/, /add email address/i, /new email address/i], {
      interactiveOnly: !0,
      maxTextLength: 80
    });
  }
  function fillLabel(doc, label, options) {
    return waitFor(
      () => {
        let input = findLabelInput(doc);
        if (!input) return null;
        let value = label.slice(0, input.maxLength > 0 ? input.maxLength : label.length);
        return setInputValue(input, value), input;
      },
      options.timeoutMs,
      options.pollMs
    ).then(async (input) => {
      if (await sleep(60), normalizeText(input.value) !== normalizeText(label.slice(0, input.maxLength > 0 ? input.maxLength : label.length))) {
        let value = label.slice(0, input.maxLength > 0 ? input.maxLength : label.length);
        setInputValue(input, value), await sleep(120);
      }
      if (!normalizeText(input.value))
        throw new AutomationError("UI_NOT_FOUND");
    });
  }
  async function prepareInsideHme(doc, label, options) {
    if (findCreateButton(doc) && findLabelInput(doc))
      return await fillLabel(doc, label, options), { kind: "ready" };
    let opener = findOpenAddressButton(doc);
    if (!opener) throw new AutomationError("UI_NOT_FOUND");
    if (isDisabled(opener)) throw new AutomationError("UI_NOT_FOUND");
    return clickElement(opener), await waitFor(() => findCreateButton(doc), options.timeoutMs, options.pollMs), await fillLabel(doc, label, options), { kind: "ready" };
  }
  async function prepareAddress(doc, label, options = { isTopFrame: !1 }) {
    if (navigator.onLine === !1) throw new AutomationError("NETWORK");
    if (hasHmeControls(doc))
      return prepareInsideHme(doc, label, {
        timeoutMs: options.timeoutMs ?? 12e3,
        pollMs: options.pollMs ?? 120
      });
    let auth = detectAuth(doc);
    return auth ? { kind: "auth_required", code: auth } : options.isTopFrame && !options.tileAlreadyClicked && openHmeTile(doc) ? { kind: "opening" } : { kind: "none" };
  }
  function findCreationError(doc) {
    let errorKeywords = /失敗|エラー|問題|できません|やり直|無効|上限|error|failed|couldn't|could not|unable|try again/i, successKeywords = /作成しました|created successfully|作成済み/i;
    for (let element of allElements(doc)) {
      if (!isVisible(element)) continue;
      let role = element.getAttribute("role"), className = typeof element.className == "string" ? element.className : "";
      if (!(role === "alert" || element.matches("[aria-live='assertive'], [class*='error'], [class*='Error']"))) continue;
      let text = elementText(element);
      if (!(!text || text.length > 300) && !successKeywords.test(text) && errorKeywords.test(text))
        return text;
    }
    return null;
  }
  async function copyText(text) {
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
  async function createAddress(doc, options = {}) {
    if (navigator.onLine === !1) throw new AutomationError("NETWORK");
    let button = findCreateButton(doc);
    if (!button)
      return { kind: "failed", clicked: !1, code: "UI_NOT_FOUND", message: errorMessage("UI_NOT_FOUND") };
    let clickableButton = button;
    if (isDisabled(button)) {
      let enabled = await waitFor(
        () => {
          let candidate = findCreateButton(doc);
          return candidate && !isDisabled(candidate) ? candidate : null;
        },
        1500,
        100
      ).catch(() => null);
      if (!enabled)
        return { kind: "failed", clicked: !1, code: "CREATE_FAILED", message: errorMessage("CREATE_FAILED") };
      clickableButton = enabled;
    }
    let before = new Set(extractEmails(doc));
    options.onClick?.();
    try {
      clickElement(clickableButton);
    } catch {
      return { kind: "failed", clicked: !1, code: "CREATE_FAILED", message: errorMessage("CREATE_FAILED") };
    }
    let timeoutMs = options.timeoutMs ?? 35e3, pollMs = options.pollMs ?? 250, deadline = Date.now() + timeoutMs;
    for (; Date.now() < deadline; ) {
      if (findCreationError(doc))
        return {
          kind: "failed",
          clicked: !0,
          code: "CREATE_FAILED",
          message: errorMessage("CREATE_FAILED")
        };
      let fresh = extractEmails(doc).filter((address) => !before.has(address));
      if (fresh.length > 0) {
        let address = fresh[0], copied = await copyText(address);
        return { kind: "success", address, copied };
      }
      await sleep(pollMs);
    }
    return {
      kind: "failed",
      clicked: !0,
      code: "RESULT_UNKNOWN",
      message: errorMessage("RESULT_UNKNOWN")
    };
  }

  // src/content.ts
  var currentJobId = null, prepared = !1, preparing = null, createAttempted = !1, tileClicked = !1;
  function resetFor(jobId) {
    currentJobId !== jobId && (currentJobId = jobId, prepared = !1, preparing = null, createAttempted = !1, tileClicked = !1);
  }
  function emit(phase, extra = {}) {
    if (!currentJobId) return;
    let message = {
      type: "JOB_EVENT",
      jobId: currentJobId,
      phase,
      ...extra
    };
    try {
      chrome.runtime.sendMessage(message).catch(() => {
      });
    } catch {
    }
  }
  function errorPhase(code) {
    return code === "NETWORK" ? "network_error" : "ui_not_found";
  }
  async function handlePrepare(command) {
    return resetFor(command.jobId), createAttempted ? { ok: !1, status: "accepted" } : prepared ? { ok: !0, status: "ready" } : preparing || (preparing = (async () => {
      try {
        let outcome = await prepareAddress(document, command.label, {
          timeoutMs: 12e3,
          pollMs: 120,
          isTopFrame: window === window.top,
          tileAlreadyClicked: tileClicked
        });
        switch (outcome.kind) {
          case "ready":
            return prepared = !0, emit("prepared"), { ok: !0, status: "ready" };
          case "opening":
            return tileClicked = !0, emit("opened_hme"), { ok: !0, status: "opening" };
          case "auth_required":
            return emit("auth_required", { code: outcome.code }), { ok: !1, status: "auth", code: outcome.code };
          case "none":
            return { ok: !0, status: "not_hme" };
        }
      } catch (error) {
        return error instanceof AutomationError ? (emit(errorPhase(error.code), { code: error.code }), { ok: !1, status: "failed", code: error.code }) : (emit("ui_not_found", { code: "UI_NOT_FOUND" }), { ok: !1, status: "failed", code: "UI_NOT_FOUND" });
      } finally {
        preparing = null;
      }
    })(), preparing);
  }
  async function handleCreate(command) {
    if (resetFor(command.jobId), createAttempted)
      return { ok: !1, status: "failed", clicked: !0, code: "CREATE_FAILED" };
    if (!prepared)
      return { ok: !1, status: "failed", clicked: !1, code: "UI_NOT_FOUND" };
    createAttempted = !0;
    try {
      let outcome = await createAddress(document, {
        timeoutMs: 35e3,
        pollMs: 250,
        onClick: () => emit("create_clicked")
      });
      return outcome.kind === "success" ? (emit("created", { address: outcome.address, copied: outcome.copied }), { ok: !0, status: "accepted" }) : (emit("create_failed", {
        clicked: outcome.clicked,
        code: outcome.code,
        message: outcome.message
      }), { ok: !1, status: "failed", clicked: outcome.clicked, code: outcome.code });
    } catch (error) {
      return error instanceof AutomationError ? (emit("network_error", { code: error.code }), { ok: !1, status: "failed", clicked: !0, code: error.code }) : (emit("create_failed", { clicked: !0, code: "RESULT_UNKNOWN" }), { ok: !1, status: "failed", clicked: !0, code: "RESULT_UNKNOWN" });
    }
  }
  chrome.runtime.onMessage.addListener(
    (message, _sender, sendResponse) => message?.type === "PREPARE" ? (handlePrepare(message).then(sendResponse), !0) : message?.type === "CREATE" ? (handleCreate(message).then(sendResponse), !0) : !1
  );
})();
