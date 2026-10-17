import { describe, expect, it } from "vitest";
import {
  acknowledgeReview,
  applyContentEvent,
  markCopied,
  newJobState,
  restoreState,
  shouldReloadForPrepare,
} from "../src/lib/job";
import { startBlockReason, type ContentEventMessage, type JobState } from "../src/lib/protocol";

function event(jobId: string, phase: ContentEventMessage["phase"], extra: Partial<ContentEventMessage> = {}): ContentEventMessage {
  return { type: "JOB_EVENT", jobId, phase, ...extra };
}

const meta = { tabId: 10, frameId: 2, now: 1000 };

describe("ジョブ状態", () => {
  it("作成中のまま復元されたら、重複防止のため未確認にする", () => {
    const state = restoreState({
      ...newJobState("job-1", "example.com", 100),
      status: "creating",
      createAttempted: true,
    });
    expect(state.status).toBe("uncertain");
    expect(state.createAttempted).toBe(true);
    expect(state.errorCode).toBe("RESULT_UNKNOWN");
  });

  it("準備中に中断されたら、作成前なのでやり直せる", () => {
    const state = restoreState({
      ...newJobState("job-1", "example.com", 100),
      status: "preparing",
    });
    expect(state.status).toBe("error");
    expect(state.createAttempted).toBe(false);
  });

  it("作成クリック後は、成功イベントが来るまで再実行をブロックする", () => {
    let state: JobState = newJobState("job-1", "example.com", 100);
    state = applyContentEvent(state, event("job-1", "prepared"), meta);
    expect(state.status).toBe("ready");

    state = { ...state, status: "creating", createAttempted: true };
    state = applyContentEvent(state, event("job-1", "prepared"), meta);
    expect(state.status).toBe("creating");
    expect(startBlockReason(state)).toBe("busy");
  });

  it("作成成功でアドレスを保持する", () => {
    let state: JobState = newJobState("job-1", "example.com", 100);
    state = {
      ...state,
      status: "creating",
      createAttempted: true,
      tabId: 10,
    };
    state = applyContentEvent(
      state,
      event("job-1", "created", { address: "sample-address@icloud.com", copied: true }),
      meta,
    );
    expect(state.status).toBe("success");
    expect(state.address).toBe("sample-address@icloud.com");
    expect(state.copied).toBe(true);
    expect(state.message).toContain("クリップボード");
  });

  it("作成クリック前の失敗はエラー、クリック後の失敗は未確認にする", () => {
    const before = applyContentEvent(
      newJobState("job-1", "example.com", 100),
      event("job-1", "create_failed", { clicked: false, code: "UI_NOT_FOUND" }),
      meta,
    );
    expect(before.status).toBe("error");
    expect(before.createAttempted).toBe(false);

    const after = applyContentEvent(
      { ...newJobState("job-1", "example.com", 100), status: "creating", createAttempted: true },
      event("job-1", "create_failed", { clicked: true, code: "CREATE_FAILED" }),
      meta,
    );
    expect(after.status).toBe("uncertain");
    expect(startBlockReason(after)).toBe("review");
  });

  it("サインイン要求はログイン案内にし、作成後なら未確認にする", () => {
    const before = applyContentEvent(
      newJobState("job-1", "example.com", 100),
      event("job-1", "auth_required", { code: "AUTH_REQUIRED" }),
      meta,
    );
    expect(before.status).toBe("awaiting_login");
    expect(before.errorCode).toBe("AUTH_REQUIRED");

    const after = applyContentEvent(
      { ...newJobState("job-1", "example.com", 100), status: "creating", createAttempted: true },
      event("job-1", "auth_required", { code: "SESSION_EXPIRED" }),
      meta,
    );
    expect(after.status).toBe("uncertain");
  });

  it("通信エラーは作成前なら再試行可能、作成後なら未確認にする", () => {
    const before = applyContentEvent(
      newJobState("job-1", "example.com", 100),
      event("job-1", "network_error", { code: "NETWORK" }),
      meta,
    );
    expect(before.status).toBe("error");
    expect(before.errorCode).toBe("NETWORK");
    expect(before.createAttempted).toBe(false);

    const after = applyContentEvent(
      { ...newJobState("job-1", "example.com", 100), status: "creating", createAttempted: true },
      event("job-1", "network_error", { code: "NETWORK" }),
      meta,
    );
    expect(after.status).toBe("uncertain");
    expect(after.createAttempted).toBe(true);
  });

  it("画面が見つからない場合は作成前にエラーにする", () => {
    const state = applyContentEvent(
      newJobState("job-1", "example.com", 100),
      event("job-1", "ui_not_found", { code: "UI_NOT_FOUND" }),
      meta,
    );
    expect(state.status).toBe("error");
    expect(state.errorCode).toBe("UI_NOT_FOUND");
    expect(state.createAttempted).toBe(false);
  });

  it("別ジョブのイベントは無視する", () => {
    const state = newJobState("job-1", "example.com", 100);
    const next = applyContentEvent(state, event("job-2", "created", { address: "x@icloud.com" }), meta);
    expect(next).toBe(state);
  });

  it("確認済みにすると再開できる", () => {
    const uncertain = {
      ...newJobState("job-1", "example.com", 100),
      status: "uncertain" as const,
      createAttempted: true,
      errorCode: "RESULT_UNKNOWN" as const,
    };
    const next = acknowledgeReview(uncertain);
    expect(next.status).toBe("error");
    expect(next.createAttempted).toBe(false);
    expect(startBlockReason(next)).toBeNull();
  });

  it("成功とアドレスが一致するときだけコピー済みにできる", () => {
    const success = {
      ...newJobState("job-1", "example.com", 100),
      status: "success" as const,
      address: "sample-address@icloud.com",
      copied: false,
    };
    const copied = markCopied(success, "job-1", "sample-address@icloud.com", 200);
    expect(copied.copied).toBe(true);
    expect(copied.message).toContain("クリップボード");
    expect(copied.updatedAt).toBe(200);
  });

  it("古いジョブや異なるアドレスのコピー記録は拒否する", () => {
    const success = {
      ...newJobState("job-1", "example.com", 100),
      status: "success" as const,
      address: "sample-address@icloud.com",
      copied: false,
    };
    // 古いポップアップの非同期コピー完了が、新しい成功ジョブを書き換えない。
    expect(markCopied(success, "job-old", "sample-address@icloud.com", 200)).toBe(success);
    expect(markCopied(success, "job-1", "other-address@icloud.com", 200)).toBe(success);

    // 失敗中・アドレス無しでは変化しない（誤ったコピー済み表示を防ぐ）。
    const failed = { ...newJobState("job-2", "example.com", 100), status: "error" as const };
    expect(markCopied(failed, "job-2", "sample-address@icloud.com", 200)).toBe(failed);

    const noAddress = { ...success, address: null };
    expect(markCopied(noAddress, "job-1", "sample-address@icloud.com", 200)).toBe(noAddress);
  });

  it("コピー済みの状態は再度変えない", () => {
    const success = {
      ...newJobState("job-1", "example.com", 100),
      status: "success" as const,
      address: "sample-address@icloud.com",
      copied: true,
    };
    expect(markCopied(success, "job-1", "sample-address@icloud.com", 200)).toBe(success);
  });
});

describe("PREPARE無応答時の再読み込み判定", () => {
  it("準備中で未作成の無応答だけ再読み込みする", () => {
    const preparing = newJobState("job-1", "example.com", 100);
    expect(shouldReloadForPrepare(preparing, "job-1", undefined, false)).toBe(true);
    // 応答があった、別ジョブ、再読み込み済みは対象外。
    expect(shouldReloadForPrepare(preparing, "job-1", { ok: true }, false)).toBe(false);
    expect(shouldReloadForPrepare(preparing, "job-2", undefined, false)).toBe(false);
    expect(shouldReloadForPrepare(preparing, "job-1", undefined, true)).toBe(false);
  });

  it("遅いPREPARE応答中に作成開始・終端へ進んだら再読み込みしない", () => {
    const preparing = newJobState("job-1", "example.com", 100);
    const ready = { ...preparing, status: "ready" as const };
    const creating = { ...preparing, status: "creating" as const, createAttempted: true };
    const success = {
      ...preparing,
      status: "success" as const,
      createAttempted: true,
      address: "sample-address@icloud.com",
    };
    const error = { ...preparing, status: "error" as const };

    for (const state of [ready, creating, success, error]) {
      expect(shouldReloadForPrepare(state, "job-1", undefined, false)).toBe(false);
    }
    // 準備完了した直後（createAttempted前）でも、確定処理へ進んでいるので対象外。
    expect(shouldReloadForPrepare(ready, "job-1", undefined, false)).toBe(false);
    // 準備中のままなら再読み込みしてよい。
    expect(shouldReloadForPrepare(preparing, "job-1", undefined, false)).toBe(true);
  });
});
