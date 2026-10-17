export const ICLOUD_PLUS_URL = __E2E__
  ? "http://127.0.0.1:4173/icloudplus"
  : "https://www.icloud.com/icloudplus";

export const ICLOUD_MATCH_PATTERN = __E2E__
  ? "http://127.0.0.1:4173/*"
  : "https://www.icloud.com/*";

export const ICLOUD_ORIGIN = __E2E__ ? "http://127.0.0.1:4173" : "https://www.icloud.com";

export type JobStatus =
  | "idle"
  | "preparing"
  | "awaiting_login"
  | "ready"
  | "creating"
  | "success"
  | "error"
  | "uncertain";

export type ErrorCode =
  | "AUTH_REQUIRED"
  | "SESSION_EXPIRED"
  | "NETWORK"
  | "UI_NOT_FOUND"
  | "NO_ICLOUD_PLUS"
  | "CREATE_FAILED"
  | "RESULT_UNKNOWN"
  | "TIMEOUT";

export interface JobState {
  jobId: string;
  status: JobStatus;
  label: string;
  message: string;
  address: string | null;
  copied: boolean;
  createAttempted: boolean;
  tabId: number | null;
  frameId: number | null;
  startedAt: number;
  updatedAt: number;
  errorCode: ErrorCode | null;
}

export type PopupRequest =
  | { type: "GET_STATE" }
  | { type: "START_JOB"; label: string }
  | { type: "OPEN_ICLOUD" }
  | { type: "MARK_COPIED"; jobId: string; address: string }
  | { type: "ACK_REVIEW" };

export interface PopupResponse {
  ok: boolean;
  state: JobState;
  reason?: "busy" | "review";
}

export type ContentCommand =
  | { type: "PREPARE"; jobId: string; label: string }
  | { type: "CREATE"; jobId: string };

export type ContentEventPhase =
  | "preparing"
  | "opened_hme"
  | "prepared"
  | "auth_required"
  | "create_clicked"
  | "created"
  | "create_failed"
  | "network_error"
  | "ui_not_found"
  | "no_icloud_plus";

export interface ContentEventMessage {
  type: "JOB_EVENT";
  jobId: string;
  phase: ContentEventPhase;
  code?: ErrorCode;
  message?: string;
  address?: string;
  copied?: boolean;
  clicked?: boolean;
}

export interface ContentResponse {
  ok: boolean;
  status?: "ready" | "opening" | "preparing" | "not_hme" | "auth" | "accepted" | "failed";
  code?: ErrorCode;
  clicked?: boolean;
}

export function idleState(now = Date.now()): JobState {
  return {
    jobId: "",
    status: "idle",
    label: "",
    message: "",
    address: null,
    copied: false,
    createAttempted: false,
    tabId: null,
    frameId: null,
    startedAt: 0,
    updatedAt: now,
    errorCode: null,
  };
}

export function isActiveStatus(status: JobStatus): boolean {
  return status === "preparing" || status === "ready" || status === "creating";
}

export function startBlockReason(state: JobState): "busy" | "review" | null {
  if (state.status === "uncertain") return "review";
  if (isActiveStatus(state.status)) return "busy";
  return null;
}
