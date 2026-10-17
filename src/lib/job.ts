import {
  idleState,
  isActiveStatus,
  type ContentEventMessage,
  type ErrorCode,
  type JobState,
} from "./protocol";

export const STATUS_MESSAGES = {
  preparing: "iCloud+の「メールを非公開」画面を準備しています…",
  awaiting_login: "Appleのサインインが必要です。iCloudを開いてサインインしてから、もう一度お試しください。",
  ready: "ラベルを入力しました。アドレスを作成しています…",
  creating: "アドレスを作成しています…（二重作成を防ぐため、そのままお待ちください）",
  success: "アドレスを作成しました。",
  error: "作成を完了できませんでした。",
  uncertain: "作成結果を確認できませんでした。iCloudで結果を確認してください。",
} as const;

const EMAIL_PATTERN = /^[^\s@]+@(?:icloud\.com|privaterelay\.appleid\.com)$/i;

function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

function errorMessage(code: ErrorCode): string {
  switch (code) {
    case "AUTH_REQUIRED":
      return "Appleのサインインが必要です。iCloudを開いてサインインしてください。";
    case "SESSION_EXPIRED":
      return "iCloudのセッションが切れました。iCloudを開いてサインインし直してください。";
    case "NETWORK":
      return "通信に失敗しました。接続を確認してから、もう一度お試しください。";
    case "NO_ICLOUD_PLUS":
      return "「メールを非公開」を開けませんでした。iCloud+の加入状況を確認してください。";
    case "UI_NOT_FOUND":
      return "iCloud+の画面が見つかりませんでした。画面が変わった可能性があります。iCloudで確認してください。";
    case "CREATE_FAILED":
      return "アドレスを作成できませんでした。iCloudの画面で内容を確認してください。";
    case "TIMEOUT":
      return "iCloudの応答を待ちきれませんでした。iCloudを開いて状態を確認してください。";
    case "RESULT_UNKNOWN":
      return "作成結果を確認できませんでした。iCloudで結果を確認してください。";
  }
}

export function newJobState(jobId: string, label: string, now = Date.now()): JobState {
  return {
    jobId,
    status: "preparing",
    label,
    message: STATUS_MESSAGES.preparing,
    address: null,
    copied: false,
    verified: false,
    createAttempted: false,
    tabId: null,
    frameId: null,
    startedAt: now,
    updatedAt: now,
    errorCode: null,
  };
}

export function restoreState(raw: unknown, now = Date.now()): JobState {
  if (!raw || typeof raw !== "object") return idleState(now);
  const value = raw as Partial<JobState>;
  if (typeof value.jobId !== "string") return idleState(now);

  const restored: JobState = {
    jobId: value.jobId,
    status: value.status ?? "idle",
    label: typeof value.label === "string" ? value.label : "",
    message: typeof value.message === "string" ? value.message : "",
    address: typeof value.address === "string" && isEmail(value.address) ? value.address : null,
    copied: value.copied === true,
    verified: value.verified === true,
    createAttempted: value.createAttempted === true,
    tabId: typeof value.tabId === "number" ? value.tabId : null,
    frameId: typeof value.frameId === "number" ? value.frameId : null,
    startedAt: typeof value.startedAt === "number" ? value.startedAt : 0,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : now,
    errorCode: value.errorCode ?? null,
  };

  if (restored.status === "creating") {
    return {
      ...restored,
      status: "uncertain",
      message: STATUS_MESSAGES.uncertain,
      createAttempted: true,
      errorCode: "RESULT_UNKNOWN",
      updatedAt: now,
    };
  }

  if (restored.createAttempted && restored.status !== "success") {
    return {
      ...restored,
      status: "uncertain",
      message: STATUS_MESSAGES.uncertain,
      errorCode: restored.errorCode ?? "RESULT_UNKNOWN",
      updatedAt: now,
    };
  }

  if (restored.status === "preparing" || restored.status === "ready") {
    return {
      ...restored,
      status: "error",
      message: "前回の準備は中断されました。もう一度「作成してコピー」を押してください。",
      createAttempted: false,
      frameId: null,
      errorCode: "TIMEOUT",
      updatedAt: now,
    };
  }

  if (restored.status === "success" && !restored.verified) {
    // 修正前に保存された結果は、作成を確認できていない。
    // 転送先などを再表示・再コピーしないよう「未確認」にする。
    return {
      ...restored,
      status: "uncertain",
      address: null,
      copied: false,
      message: STATUS_MESSAGES.uncertain,
      errorCode: "RESULT_UNKNOWN",
      updatedAt: now,
    };
  }

  if (restored.status === "success" && !restored.address) {
    return {
      ...restored,
      copied: false,
    };
  }

  return restored;
}

export function applyContentEvent(
  state: JobState,
  event: ContentEventMessage,
  meta: { tabId: number; frameId: number; now?: number },
): JobState {
  if (!state.jobId || state.jobId !== event.jobId) return state;
  if (state.tabId !== null && state.tabId !== meta.tabId) return state;

  const now = meta.now ?? Date.now();
  const base: JobState = {
    ...state,
    tabId: meta.tabId,
    updatedAt: now,
  };

  switch (event.phase) {
    case "preparing":
      return state.status === "preparing"
        ? { ...base, message: "iCloudの画面を読み込んでいます…" }
        : state;

    case "opened_hme":
      return state.status === "preparing"
        ? { ...base, message: "「メールを非公開」画面を開いています…" }
        : state;

    case "prepared":
      if (state.status !== "preparing" || state.createAttempted) return state;
      return {
        ...base,
        status: "ready",
        frameId: meta.frameId,
        message: STATUS_MESSAGES.ready,
      };

    case "auth_required": {
      if (state.createAttempted) {
        return {
          ...base,
          status: "uncertain",
          message: STATUS_MESSAGES.uncertain,
          errorCode: "RESULT_UNKNOWN",
        };
      }
      const code = event.code === "SESSION_EXPIRED" ? "SESSION_EXPIRED" : "AUTH_REQUIRED";
      return {
        ...base,
        status: "awaiting_login",
        message: errorMessage(code),
        errorCode: code,
      };
    }

    case "create_clicked":
      if (state.status !== "creating" && state.status !== "ready") return state;
      return {
        ...base,
        status: "creating",
        createAttempted: true,
        message: STATUS_MESSAGES.creating,
      };

    case "created": {
      if (!state.createAttempted) return state;
      const address = typeof event.address === "string" && isEmail(event.address) ? event.address : null;
      // 作成を確認できていない結果（verifiedでない）は成功として表示しない。
      if (!address || event.verified !== true) {
        return {
          ...base,
          status: "uncertain",
          address: null,
          copied: false,
          message: STATUS_MESSAGES.uncertain,
          errorCode: "RESULT_UNKNOWN",
        };
      }
      return {
        ...base,
        status: "success",
        address,
        copied: event.copied === true,
        verified: true,
        message: event.copied
          ? "アドレスを作成し、クリップボードにコピーしました。"
          : "アドレスを作成しました。「コピー」を押してください。",
        errorCode: null,
      };
    }

    case "create_failed": {
      if (event.clicked === false && !state.createAttempted) {
        return {
          ...base,
          status: "error",
          message: errorMessage(event.code ?? "UI_NOT_FOUND"),
          errorCode: event.code ?? "UI_NOT_FOUND",
        };
      }
      return {
        ...base,
        status: "uncertain",
        message: STATUS_MESSAGES.uncertain,
        errorCode: "RESULT_UNKNOWN",
      };
    }

    case "network_error":
      if (state.createAttempted) {
        return {
          ...base,
          status: "uncertain",
          message: STATUS_MESSAGES.uncertain,
          errorCode: "RESULT_UNKNOWN",
        };
      }
      return {
        ...base,
        status: "error",
        message: errorMessage("NETWORK"),
        errorCode: "NETWORK",
      };

    case "ui_not_found":
      if (state.createAttempted) {
        return {
          ...base,
          status: "uncertain",
          message: STATUS_MESSAGES.uncertain,
          errorCode: "RESULT_UNKNOWN",
        };
      }
      return {
        ...base,
        status: "error",
        message: errorMessage("UI_NOT_FOUND"),
        errorCode: "UI_NOT_FOUND",
      };

    case "no_icloud_plus":
      return {
        ...base,
        status: "error",
        message: errorMessage("NO_ICLOUD_PLUS"),
        errorCode: "NO_ICLOUD_PLUS",
      };
  }
}

export function failBeforeCreate(state: JobState, code: ErrorCode, now = Date.now()): JobState {
  return {
    ...state,
    status: "error",
    createAttempted: false,
    frameId: null,
    message: errorMessage(code),
    errorCode: code,
    updatedAt: now,
  };
}

export function markUncertain(state: JobState, now = Date.now()): JobState {
  return {
    ...state,
    status: "uncertain",
    message: STATUS_MESSAGES.uncertain,
    errorCode: "RESULT_UNKNOWN",
    updatedAt: now,
  };
}

export function markAuth(state: JobState, code: "AUTH_REQUIRED" | "SESSION_EXPIRED", now = Date.now()): JobState {
  if (state.createAttempted) return markUncertain(state, now);
  return {
    ...state,
    status: "awaiting_login",
    message: errorMessage(code),
    errorCode: code,
    updatedAt: now,
  };
}

/**
 * コピーしたジョブとアドレスが一致する成功状態だけを「コピー済み」にする。
 * 古いポップアップの非同期コピー完了が、新しい成功ジョブを書き換えないようにする。
 */
export function markCopied(state: JobState, jobId: string, address: string, now = Date.now()): JobState {
  if (state.status !== "success" || !state.address || state.copied) return state;
  if (state.jobId !== jobId || state.address !== address) return state;
  return {
    ...state,
    copied: true,
    message: "アドレスをクリップボードにコピーしました。",
    updatedAt: now,
  };
}

/**
 * ポップアップを開いたときに自動コピーしてよいか。
 * 新しい取得ロジックで作成を確認した結果（verified）だけを対象にし、
 * 修正前の古い結果を開いた際に自動で再コピーしない。
 */
export function shouldAutoCopy(state: JobState): boolean {
  return state.status === "success" && Boolean(state.address) && !state.copied && state.verified;
}

/**
 * PREPAREに応答が無いときに、裏のまま再読み込みしてよいか。
 * 送信中に準備完了・作成開始・終端へ進んでいたら、確定処理を壊さないため false。
 */
export function shouldReloadForPrepare(
  state: JobState,
  jobId: string,
  response: unknown,
  alreadyReloaded: boolean,
): boolean {
  if (alreadyReloaded) return false;
  if (response !== undefined) return false;
  if (state.jobId !== jobId) return false;
  if (state.status !== "preparing" || state.createAttempted) return false;
  return true;
}

export function acknowledgeReview(state: JobState, now = Date.now()): JobState {
  if (state.status !== "uncertain") return state;
  return {
    ...state,
    status: "error",
    createAttempted: false,
    frameId: null,
    message: "確認済みにしました。必要なら、もう一度「作成してコピー」を押してください。",
    errorCode: null,
    updatedAt: now,
  };
}

export { errorMessage, isEmail };
