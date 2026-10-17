import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { startMockServer, startSourceServer } from "./mock-server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const extensionPath = path.join(root, "dist-e2e");
const chromeCandidates = [
  process.env.CHROME_PATH,
  path.join(
    os.homedir(),
    "Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  ),
  "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));
assert(chromePath, "Chrome for Testing or Chrome was not found");
const baseUrl = "http://127.0.0.1:4173";

const server = await startMockServer();
const sourceServer = await startSourceServer();
let context;
let profileDir;
let popup;
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function setMode(mode) {
  const response = await fetch(`${baseUrl}/control?mode=${encodeURIComponent(mode)}`);
  assert(response.ok, `mock mode could not be set: ${mode}`);
}

async function getState() {
  return popup.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    return response.state;
  });
}

async function getTabs() {
  return popup.evaluate(() => chrome.tabs.query({}));
}

async function activeTabId() {
  return popup.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id);
}

// ポップアップを閉じていても、Service Workerの保存状態とタブ状態をテスト側から観測する。
async function readStoredState() {
  const workers = context.serviceWorkers();
  if (workers.length === 0) return null;
  try {
    return await workers[0].evaluate(async () => {
      const stored = await chrome.storage.session.get("hmeJobState");
      return stored.hmeJobState;
    });
  } catch {
    return null;
  }
}

async function waitForStoredStatus(status, timeout = 35000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await readStoredState();
    if (last?.status === status) return last;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`stored status ${status} was not reached; last ${last?.status}`);
}

async function workerTabs() {
  const workers = context.serviceWorkers();
  if (workers.length === 0) return [];
  return workers[0].evaluate(() => chrome.tabs.query({}));
}

async function workerActiveTabId() {
  const workers = context.serviceWorkers();
  if (workers.length === 0) return undefined;
  return workers[0].evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id);
}

function icloudTabs(tabs) {
  return tabs.filter((tab) => tab.url?.startsWith(`${baseUrl}/icloudplus`));
}

function icloudPage() {
  const page = context.pages().find((candidate) => candidate.url().startsWith(`${baseUrl}/icloudplus`));
  assert(page, "iCloud mock tab was not found");
  return page;
}

async function waitForStatus(status, timeout = 35000, jobId = null) {
  const deadline = Date.now() + timeout;
  let lastState;
  while (Date.now() < deadline) {
    lastState = await getState();
    if (lastState.status === status && (jobId === null || lastState.jobId === jobId)) return lastState;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`status ${status} was not reached; last status: ${lastState?.status}`);
}

async function waitForActive(timeout = 8000) {
  const deadline = Date.now() + timeout;
  let lastState;
  while (Date.now() < deadline) {
    lastState = await getState();
    if (
      lastState.status === "preparing" ||
      lastState.status === "ready" ||
      lastState.status === "creating"
    ) {
      return lastState;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`job did not become active; last status: ${lastState?.status}`);
}

async function waitForCopied(timeout = 15000) {
  const deadline = Date.now() + timeout;
  let lastState;
  while (Date.now() < deadline) {
    lastState = await getState();
    if (lastState.status === "success" && lastState.copied) return lastState;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`copied was not marked; status: ${lastState?.status}, copied: ${lastState?.copied}`);
}

async function waitForResult(timeout = 35000) {
  await popup.waitForSelector("#result:not([hidden])", { timeout });
  return popup.locator("#address").innerText();
}

async function clickCreate() {
  await popup.locator("#create").waitFor({ state: "visible" });
  await popup.locator("#create").click();
}

async function readClipboard() {
  return popup.evaluate(() => navigator.clipboard.readText());
}

async function writeClipboard(text) {
  await popup.evaluate((value) => navigator.clipboard.writeText(value), text);
}

async function currentHmeFrame() {
  const page = icloudPage();
  const frame = page.frames().find((candidate) => candidate.url().startsWith(`${baseUrl}/hme`));
  assert(frame, "HME mock frame was not found");
  return frame;
}

async function launch(headless) {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "hme-e2e-"));
  let browserContext;
  try {
    browserContext = await chromium.launchPersistentContext(userDataDir, {
      headless,
      executablePath: chromePath,
      viewport: { width: 1000, height: 800 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-component-update",
      ],
    });

    let workers = browserContext.serviceWorkers();
    if (workers.length === 0) {
      const workerPromise = browserContext.waitForEvent("serviceworker", { timeout: 10000 }).catch(() => null);
      const blank = await browserContext.newPage();
      await blank.goto("chrome://extensions/").catch(() => {});
      workers = browserContext.serviceWorkers();
      if (workers.length === 0) {
        const worker = await workerPromise;
        if (worker) workers = [worker];
      }
      await blank.close().catch(() => {});
    }
    assert(workers.length > 0, "extension service worker was not found");
    return { browserContext, extensionId: new URL(workers[0].url()).host, userDataDir };
  } catch (error) {
    await browserContext?.close().catch(() => {});
    await rm(userDataDir, { recursive: true, force: true });
    throw error;
  }
}

try {
  let launched;
  try {
    launched = await launch(true);
  } catch (error) {
    console.warn(`headless launch failed (${error.message}); retrying with a visible window`);
    launched = await launch(false);
  }
  context = launched.browserContext;
  profileDir = launched.userDataDir;
  const popupUrl = `chrome-extension://${launched.extensionId}/popup.html`;

  // 読み取りだけテスト用に許可する。書き込みは製品のmanifest clipboardWriteで動くことを確認する。
  await context.grantPermissions(["clipboard-read"]);

  // 元の入力サイト。再読み込みされていないことをマーカーで確認する。
  const sourcePage = await context.newPage();
  await sourcePage.goto("http://127.0.0.1:4174/source");
  await sourcePage.evaluate(() => {
    window.__marker = "keep";
  });

  popup = await context.newPage();
  await popup.setViewportSize({ width: 380, height: 640 });
  await popup.goto(popupUrl);
  await popup.bringToFront();
  await popup.locator("#label").fill("example.com");

  const tabsBefore = await getTabs();
  const icloudBefore = icloudTabs(tabsBefore);
  assert(icloudBefore.length === 0, `iCloud tab existed before the job: ${icloudBefore.length}`);
  const activeBefore = await activeTabId();

  await setMode("normal");
  const startedAt = Date.now();
  await clickCreate();
  const firstAddress = await waitForResult();
  const firstElapsed = Date.now() - startedAt;
  await waitForCopied();
  const firstState = await getState();
  assert(firstState.status === "success", `first creation did not succeed: ${firstState.status}`);
  assert(/@icloud\.com$/.test(firstAddress), `unexpected address: ${firstAddress}`);
  assert(firstState.address === firstAddress, "popup address and state address differ");
  assert(firstState.copied === true, "background job did not mark the popup copy");
  await popup.waitForFunction(() => document.getElementById("copy-state")?.textContent === "コピー済み");
  const clipboardText = await readClipboard();
  assert(clipboardText === firstAddress, `clipboard ${clipboardText} did not match ${firstAddress}`);
  assert(
    /^mock-candidate-\d+@icloud\.com$/.test(firstAddress),
    `returned address was not the create dialog candidate: ${firstAddress}`,
  );

  // 同じ@icloud.comの転送先・アカウント・メモ・hiddenを混在させても、返る値は今回のHME。
  const hmeFrameForDecoys = await currentHmeFrame();
  const decoys = await hmeFrameForDecoys.evaluate(() => ({
    forward: document.getElementById("forward-value")?.textContent ?? "",
    account: document.getElementById("account")?.textContent ?? "",
    memo: document.getElementById("memo")?.value ?? "",
    hidden: document.getElementById("hidden-address")?.textContent ?? "",
  }));
  assert(decoys.forward.includes("forward-user@icloud.com"), "forward decoy was not present");
  assert(decoys.account.includes("account-user@icloud.com"), "account decoy was not present");
  assert(decoys.memo.includes("memo-user@icloud.com"), "memo decoy was not present");
  assert(!firstAddress.includes("forward-user"), "returned the forwarding address");
  assert(!firstAddress.includes("account-user"), "returned the account address");
  assert(!firstAddress.includes("memo-user"), "returned the memo address");
  assert(!firstAddress.includes("hidden-user"), "returned the hidden address");

  const firstFrame = await currentHmeFrame();
  const firstCalls = await firstFrame.evaluate(() => window.__createCalls);
  assert(firstCalls === 1, `create button was pressed ${firstCalls} times`);
  const firstCandidate = await firstFrame.evaluate(() => window.__address);
  const regenerateCalls = await firstFrame.evaluate(() => window.__regenerateCalls);
  assert(firstCandidate === firstAddress, `popup address ${firstAddress} did not match the mock candidate ${firstCandidate}`);
  assert(regenerateCalls === 0, `regenerate button was pressed ${regenerateCalls} times`);

  const tabsAfter = await getTabs();
  const icloudAfter = icloudTabs(tabsAfter);
  assert(icloudAfter.length === 1, `iCloud tabs after creation: ${icloudAfter.length}`);
  assert(icloudAfter[0].active === false, "iCloud tab became the active tab during creation");
  const activeAfter = await activeTabId();
  assert(activeAfter === activeBefore, `active tab changed from ${activeBefore} to ${activeAfter}`);
  assert(activeAfter !== icloudAfter[0].id, "iCloud tab stole the active tab");
  const marker = await sourcePage.evaluate(() => window.__marker);
  assert(marker === "keep", "the source page was reloaded");

  const icloudPageInstance = icloudPage();
  const tileClicks = await icloudPageInstance.evaluate(() => window.__tileClicks);
  const otherTileClicks = await icloudPageInstance.evaluate(() => window.__otherClicks);
  assert(tileClicks === 1, `HME tile button was pressed ${tileClicks} times`);
  assert(otherTileClicks === 0, `other tile button was pressed ${otherTileClicks} times`);
  await popup.screenshot({ path: "/tmp/hme-popup-success.png" });
  results.push({
    scenario: "作成成功（裏タブ・自動コピー）",
    elapsedMs: firstElapsed,
    addressShown: true,
    createCalls: firstCalls,
    tileClicks,
    otherTileClicks,
    regenerateCalls,
    candidateMatched: firstCandidate === firstAddress,
    hmeOnly: true,
    copied: firstState.copied,
    clipboardMatched: clipboardText === firstAddress,
    icloudActive: icloudAfter[0].active === true,
    activeTabUnchanged: activeAfter === activeBefore,
    sourceReloaded: marker !== "keep",
  });

  // 同じiCloud画面のまま連続作成する（テスト側でもreload/gotoしない）。
  await clickCreate();
  const secondAddress = await waitForResult();
  await waitForCopied();
  assert(secondAddress !== firstAddress, `second address was the same: ${secondAddress}`);
  const tabsReuse = await getTabs();
  const icloudReuse = icloudTabs(tabsReuse);
  assert(icloudReuse.length === 1, `iCloud tabs after reuse: ${icloudReuse.length}`);
  assert(icloudReuse[0].active === false, "reused iCloud tab became active");
  const reuseFrame = await currentHmeFrame();
  const reuseCreateCalls = await reuseFrame.evaluate(() => window.__createCalls);
  const reuseRegenerateCalls = await reuseFrame.evaluate(() => window.__regenerateCalls);
  const reuseCandidate = await reuseFrame.evaluate(() => window.__address);
  assert(reuseCreateCalls === 2, `confirm was pressed ${reuseCreateCalls} times after reuse`);
  assert(reuseRegenerateCalls === 0, `regenerate was pressed ${reuseRegenerateCalls} times after reuse`);
  assert(reuseCandidate === secondAddress, `second candidate ${reuseCandidate} did not match ${secondAddress}`);
  results.push({
    scenario: "iCloudタブを再利用（reloadなし・別アドレス）",
    iCloudTabs: icloudReuse.length,
    active: icloudReuse[0].active,
    firstAddress,
    secondAddress,
    distinct: secondAddress !== firstAddress,
    createCalls: reuseCreateCalls,
    regenerateCalls: reuseRegenerateCalls,
  });

  // ユーザーが明示的に押したときだけ前面化する。
  await popup.evaluate(async () => {
    await chrome.runtime.sendMessage({ type: "OPEN_ICLOUD" });
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const tabsOpen = await getTabs();
  const icloudOpen = icloudTabs(tabsOpen)[0];
  assert(icloudOpen?.active === true, "OPEN_ICLOUD did not bring iCloud to front");
  results.push({ scenario: "手動でiCloudを開く", active: icloudOpen.active });

  await setMode("loggedout");
  await icloudPageInstance.reload();
  await clickCreate();
  const authState = await waitForStatus("awaiting_login");
  assert(/サインイン/.test(authState.message), "login guidance was not shown");
  results.push({ scenario: "未ログイン", status: authState.status, message: authState.message });

  await setMode("expired");
  await icloudPageInstance.reload();
  await clickCreate();
  const expiredState = await waitForStatus("awaiting_login");
  assert(/セッション/.test(expiredState.message), "session-expired guidance was not shown");
  results.push({ scenario: "セッション切れ", status: expiredState.status, message: expiredState.message });

  await setMode("normal");
  await icloudPageInstance.reload();
  await popup.bringToFront();
  await clickCreate();
  await waitForResult();
  await waitForCopied();

  await setMode("error");
  await icloudPageInstance.reload();
  await popup.bringToFront();
  await writeClipboard("SENTINEL-NO-COPY");
  await clickCreate();
  const errorState = await waitForStatus("uncertain");
  assert(/確認/.test(errorState.message), "uncertain guidance was not shown");
  assert(errorState.address === null, "failed creation kept an address");
  assert(errorState.copied === false, "failed creation was marked copied");
  const clipboardAfterError = await readClipboard();
  assert(clipboardAfterError === "SENTINEL-NO-COPY", "failed creation copied an address");
  const errorFrame = await currentHmeFrame();
  const errorCalls = await errorFrame.evaluate(() => window.__createCalls);
  assert(errorCalls === 1, `failed creation retried automatically: ${errorCalls}`);
  await popup.locator("#review-check").check();
  await popup.locator("#review-button").click();
  await waitForStatus("error");
  results.push({
    scenario: "作成失敗",
    status: errorState.status,
    createCalls: errorCalls,
    autoRetry: false,
    address: errorState.address,
    copied: errorState.copied,
    clipboardUnchanged: clipboardAfterError === "SENTINEL-NO-COPY",
  });

  await setMode("normal");
  await icloudPageInstance.reload();
  await popup.bringToFront();
  await clickCreate();
  await waitForResult();
  await waitForCopied();
  const duplicateFrame = await currentHmeFrame();
  const callsBeforeDuplicate = await duplicateFrame.evaluate(() => window.__createCalls);
  const duplicateResponses = await popup.evaluate(async () => {
    return Promise.all([
      chrome.runtime.sendMessage({ type: "START_JOB", label: "duplicate.example" }),
      chrome.runtime.sendMessage({ type: "START_JOB", label: "duplicate.example" }),
    ]);
  });
  const accepted = duplicateResponses.filter((response) => response?.ok).length;
  assert(accepted === 1, `duplicate START_JOB accepted ${accepted} times`);
  const acceptedState = duplicateResponses.find((response) => response?.ok)?.state;
  assert(acceptedState?.jobId, "accepted job id was not returned");
  const duplicateState = await waitForStatus("success", 35000, acceptedState.jobId);
  const duplicateAddress = duplicateState.address;
  assert(duplicateAddress, "duplicate test did not produce an address");
  const duplicateCalls = await duplicateFrame.evaluate(() => window.__createCalls);
  const duplicateClicks = duplicateCalls - callsBeforeDuplicate;
  assert(duplicateClicks === 1, `duplicate job pressed create ${duplicateClicks} times`);
  results.push({
    scenario: "二重開始",
    acceptedStarts: accepted,
    createClicksForDuplicate: duplicateClicks,
    addressShown: Boolean(duplicateAddress),
  });

  // ポップアップを閉じてもジョブは続き、閉じたまま完了することを
  // Service Workerの保存状態とタブ状態からテスト側で観測する。
  await setMode("slow");
  await icloudPageInstance.reload();
  await popup.bringToFront();
  await clickCreate();
  await waitForActive();
  await popup.close();

  // 元サイトを前面に戻し、ポップアップは閉じたまま完了を待つ。
  await sourcePage.bringToFront();
  const sourceActiveId = await workerActiveTabId();
  const storedSuccess = await waitForStoredStatus("success", 35000);
  assert(storedSuccess.address, "job did not finish while the popup was closed");
  // 裏のiCloudタブ（背景文書）ではコピーできない通常条件。
  // ここで copied が true ならテストが甘いので失敗させる。
  assert(storedSuccess.copied === false, "background document copied the address without the popup");

  const resumeTabs = await workerTabs();
  const icloudResume = icloudTabs(resumeTabs);
  assert(icloudResume.length === 1, `iCloud tabs while popup closed: ${icloudResume.length}`);
  assert(icloudResume[0].active === false, "iCloud tab became active while the popup was closed");
  const activeWhileClosed = await workerActiveTabId();
  assert(
    activeWhileClosed === sourceActiveId,
    `active tab changed while popup closed: ${activeWhileClosed} !== ${sourceActiveId}`,
  );
  assert(activeWhileClosed !== icloudResume[0].id, "iCloud tab was active while the popup was closed");
  const sourceFocused = await sourcePage.evaluate(() => document.hasFocus());
  const sourceVisibility = await sourcePage.evaluate(() => document.visibilityState);

  // 開き直すと結果が表示され、ポップアップ側でコピーされる。
  const resumedPopup = await context.newPage();
  await resumedPopup.setViewportSize({ width: 380, height: 640 });
  await resumedPopup.goto(popupUrl);
  popup = resumedPopup;
  await popup.bringToFront();
  const resumedState = await waitForStatus("success", 35000);
  assert(resumedState.address === storedSuccess.address, "reopened popup showed a different address");
  const resumedAddress = await waitForResult();
  await waitForCopied();
  const resumedClipboard = await readClipboard();
  assert(resumedClipboard === resumedAddress, "reopened popup did not copy the address");
  results.push({
    scenario: "ポップアップを閉じて再表示",
    completedWhileClosed: true,
    backgroundCopied: storedSuccess.copied,
    sourceActiveWhileClosed: activeWhileClosed === sourceActiveId,
    sourceFocused,
    sourceVisibility,
    icloudActiveWhileClosed: icloudResume[0].active,
    addressShown: Boolean(resumedAddress),
    copied: true,
    clipboardMatched: resumedClipboard === resumedAddress,
  });

  console.log(JSON.stringify({ ok: true, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message, results }, null, 2));
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => sourceServer.close(resolve));
  if (profileDir) await rm(profileDir, { recursive: true, force: true });
}
