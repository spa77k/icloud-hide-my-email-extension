import { AutomationError, createAddress, prepareAddress } from "./lib/hme/automation";
import type {
  ContentCommand,
  ContentEventMessage,
  ContentEventPhase,
  ContentResponse,
  ErrorCode,
} from "./lib/protocol";

let currentJobId: string | null = null;
let prepared = false;
let preparing: Promise<ContentResponse> | null = null;
let createAttempted = false;
let tileClicked = false;

function resetFor(jobId: string): void {
  if (currentJobId === jobId) return;
  currentJobId = jobId;
  prepared = false;
  preparing = null;
  createAttempted = false;
  tileClicked = false;
}

function emit(
  phase: ContentEventPhase,
  extra: Partial<Pick<ContentEventMessage, "code" | "message" | "address" | "copied" | "clicked">> = {},
): void {
  if (!currentJobId) return;
  const message: ContentEventMessage = {
    type: "JOB_EVENT",
    jobId: currentJobId,
    phase,
    ...extra,
  };
  try {
    void chrome.runtime.sendMessage(message).catch(() => {
      // バックグラウンドが休止していても、次回の状態取得で復帰する。
    });
  } catch {
    // 拡張機能のコンテキストが無効になった場合は何もしない。
  }
}

function errorPhase(code: ErrorCode): ContentEventPhase {
  if (code === "NETWORK") return "network_error";
  return "ui_not_found";
}

async function handlePrepare(command: Extract<ContentCommand, { type: "PREPARE" }>): Promise<ContentResponse> {
  resetFor(command.jobId);
  if (createAttempted) return { ok: false, status: "accepted" };
  if (prepared) return { ok: true, status: "ready" };
  if (preparing) return preparing;

  preparing = (async (): Promise<ContentResponse> => {
    try {
      const outcome = await prepareAddress(document, command.label, {
        timeoutMs: 12000,
        pollMs: 120,
        isTopFrame: window === window.top,
        tileAlreadyClicked: tileClicked,
      });

      switch (outcome.kind) {
        case "ready":
          prepared = true;
          emit("prepared");
          return { ok: true, status: "ready" };
        case "opening":
          tileClicked = true;
          emit("opened_hme");
          return { ok: true, status: "opening" };
        case "auth_required":
          emit("auth_required", { code: outcome.code });
          return { ok: false, status: "auth", code: outcome.code };
        case "none":
          return { ok: true, status: "not_hme" };
      }
    } catch (error) {
      if (error instanceof AutomationError) {
        emit(errorPhase(error.code), { code: error.code });
        return { ok: false, status: "failed", code: error.code };
      }
      emit("ui_not_found", { code: "UI_NOT_FOUND" });
      return { ok: false, status: "failed", code: "UI_NOT_FOUND" };
    } finally {
      preparing = null;
    }
  })();

  return preparing;
}

async function handleCreate(command: Extract<ContentCommand, { type: "CREATE" }>): Promise<ContentResponse> {
  resetFor(command.jobId);
  if (createAttempted) {
    return { ok: false, status: "failed", clicked: true, code: "CREATE_FAILED" };
  }
  if (!prepared) {
    return { ok: false, status: "failed", clicked: false, code: "UI_NOT_FOUND" };
  }

  createAttempted = true;
  try {
    const outcome = await createAddress(document, {
      timeoutMs: 35000,
      pollMs: 250,
      onClick: () => emit("create_clicked"),
    });

    if (outcome.kind === "success") {
      emit("created", { address: outcome.address, copied: outcome.copied });
      return { ok: true, status: "accepted" };
    }

    emit("create_failed", {
      clicked: outcome.clicked,
      code: outcome.code,
      message: outcome.message,
    });
    return { ok: false, status: "failed", clicked: outcome.clicked, code: outcome.code };
  } catch (error) {
    if (error instanceof AutomationError) {
      emit("network_error", { code: error.code });
      return { ok: false, status: "failed", clicked: true, code: error.code };
    }
    emit("create_failed", { clicked: true, code: "RESULT_UNKNOWN" });
    return { ok: false, status: "failed", clicked: true, code: "RESULT_UNKNOWN" };
  }
}

chrome.runtime.onMessage.addListener(
  (message: ContentCommand, _sender, sendResponse: (response?: ContentResponse) => void) => {
    if (message?.type === "PREPARE") {
      void handlePrepare(message).then(sendResponse);
      return true;
    }
    if (message?.type === "CREATE") {
      void handleCreate(message).then(sendResponse);
      return true;
    }
    return false;
  },
);
