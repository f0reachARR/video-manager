import type { components, paths } from "./generated";

export type HealthResponse = components["schemas"]["HealthResponse"];
export type ErrorResponse = components["schemas"]["ErrorResponse"];
export type Pagination = components["schemas"]["Pagination"];

export type User = components["schemas"]["User"];
export type CreateUserRequest = components["schemas"]["CreateUserRequest"];
export type UpdateUserRequest = components["schemas"]["UpdateUserRequest"];
export type UserList = components["schemas"]["UserList"];

export type Device = components["schemas"]["Device"];
export type CreateDeviceRequest = components["schemas"]["CreateDeviceRequest"];
export type UpdateDeviceRequest = components["schemas"]["UpdateDeviceRequest"];
export type DeviceList = components["schemas"]["DeviceList"];

export type Team = components["schemas"]["Team"];
export type CreateTeamRequest = components["schemas"]["CreateTeamRequest"];
export type UpdateTeamRequest = components["schemas"]["UpdateTeamRequest"];
export type TeamList = components["schemas"]["TeamList"];

export type Robot = components["schemas"]["Robot"];
export type CreateRobotRequest = components["schemas"]["CreateRobotRequest"];
export type UpdateRobotRequest = components["schemas"]["UpdateRobotRequest"];
export type RobotList = components["schemas"]["RobotList"];

export type Scenario = components["schemas"]["Scenario"];
export type CreateScenarioRequest = components["schemas"]["CreateScenarioRequest"];
export type UpdateScenarioRequest = components["schemas"]["UpdateScenarioRequest"];
export type ScenarioList = components["schemas"]["ScenarioList"];

export type Tag = components["schemas"]["Tag"];
export type CreateTagRequest = components["schemas"]["CreateTagRequest"];
export type UpdateTagRequest = components["schemas"]["UpdateTagRequest"];
export type TagList = components["schemas"]["TagList"];

export type Video = components["schemas"]["Video"];
export type UpdateVideoRequest = components["schemas"]["UpdateVideoRequest"];
export type VideoList = components["schemas"]["VideoList"];
export type PlaybackUrl = components["schemas"]["PlaybackUrl"];

export type Session = components["schemas"]["Session"];
export type CreateSessionRequest = components["schemas"]["CreateSessionRequest"];
export type UpdateSessionRequest = components["schemas"]["UpdateSessionRequest"];
export type SessionList = components["schemas"]["SessionList"];
export type SessionModeHint = components["schemas"]["SessionModeHint"];

const BASE_URL = "/api";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ErrorResponse,
  ) {
    super(body.message);
    this.name = "ApiError";
  }
}

let currentUserIdProvider: () => string | null = () => null;

export function setCurrentUserIdProvider(fn: () => string | null) {
  currentUserIdProvider = fn;
}

type RequestOpts = RequestInit & { json?: unknown };

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { json, headers, ...rest } = opts;
  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(headers as Record<string, string> | undefined),
  };
  let body = rest.body;
  if (json !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  const userId = currentUserIdProvider();
  if (userId) {
    finalHeaders["X-User-Id"] = userId;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    body,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    let errBody: ErrorResponse = {
      code: "unknown",
      message: `HTTP ${res.status}`,
    };
    try {
      errBody = (await res.json()) as ErrorResponse;
    } catch {
      // keep fallback
    }
    throw new ApiError(res.status, errBody);
  }

  return (await res.json()) as T;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function fetchHealth(): Promise<HealthResponse> {
  type Resp =
    paths["/health"]["get"]["responses"]["200"]["content"]["application/json"];
  return request<Resp>("/health");
}

export function fetchReady(): Promise<HealthResponse> {
  type Resp =
    paths["/ready"]["get"]["responses"]["200"]["content"]["application/json"];
  return request<Resp>("/ready");
}

export type PageParams = { cursor?: string; limit?: number };

// ---- Users ----
export const usersApi = {
  list: (p: PageParams = {}) =>
    request<UserList>(`/users${qs({ cursor: p.cursor, limit: p.limit })}`),
  get: (id: string) => request<User>(`/users/${id}`),
  create: (body: CreateUserRequest) =>
    request<User>("/users", { method: "POST", json: body }),
  update: (id: string, body: UpdateUserRequest) =>
    request<User>(`/users/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) =>
    request<void>(`/users/${id}`, { method: "DELETE" }),
};

// ---- Devices ----
export const devicesApi = {
  list: (p: PageParams = {}) =>
    request<DeviceList>(`/devices${qs({ cursor: p.cursor, limit: p.limit })}`),
  get: (id: string) => request<Device>(`/devices/${id}`),
  create: (body: CreateDeviceRequest) =>
    request<Device>("/devices", { method: "POST", json: body }),
  update: (id: string, body: UpdateDeviceRequest) =>
    request<Device>(`/devices/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) =>
    request<void>(`/devices/${id}`, { method: "DELETE" }),
};

// ---- Teams ----
export const teamsApi = {
  list: (p: PageParams = {}) =>
    request<TeamList>(`/teams${qs({ cursor: p.cursor, limit: p.limit })}`),
  get: (id: string) => request<Team>(`/teams/${id}`),
  create: (body: CreateTeamRequest) =>
    request<Team>("/teams", { method: "POST", json: body }),
  update: (id: string, body: UpdateTeamRequest) =>
    request<Team>(`/teams/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) =>
    request<void>(`/teams/${id}`, { method: "DELETE" }),
};

// ---- Robots ----
export type RobotListParams = PageParams & { teamId?: string };
export const robotsApi = {
  list: (p: RobotListParams = {}) =>
    request<RobotList>(
      `/robots${qs({ cursor: p.cursor, limit: p.limit, teamId: p.teamId })}`,
    ),
  get: (id: string) => request<Robot>(`/robots/${id}`),
  create: (body: CreateRobotRequest) =>
    request<Robot>("/robots", { method: "POST", json: body }),
  update: (id: string, body: UpdateRobotRequest) =>
    request<Robot>(`/robots/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) =>
    request<void>(`/robots/${id}`, { method: "DELETE" }),
};

// ---- Scenarios ----
export const scenariosApi = {
  list: (p: PageParams = {}) =>
    request<ScenarioList>(
      `/scenarios${qs({ cursor: p.cursor, limit: p.limit })}`,
    ),
  get: (id: string) => request<Scenario>(`/scenarios/${id}`),
  create: (body: CreateScenarioRequest) =>
    request<Scenario>("/scenarios", { method: "POST", json: body }),
  update: (id: string, body: UpdateScenarioRequest) =>
    request<Scenario>(`/scenarios/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) =>
    request<void>(`/scenarios/${id}`, { method: "DELETE" }),
};

// ---- Tags ----
export const tagsApi = {
  list: (p: PageParams = {}) =>
    request<TagList>(`/tags${qs({ cursor: p.cursor, limit: p.limit })}`),
  get: (id: string) => request<Tag>(`/tags/${id}`),
  create: (body: CreateTagRequest) =>
    request<Tag>("/tags", { method: "POST", json: body }),
  update: (id: string, body: UpdateTagRequest) =>
    request<Tag>(`/tags/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) =>
    request<void>(`/tags/${id}`, { method: "DELETE" }),
};

// ---- Videos ----
export type VideoListParams = PageParams & {
  sessionId?: string;
  deviceId?: string;
  unassigned?: boolean;
};
export const videosApi = {
  list: (p: VideoListParams = {}) =>
    request<VideoList>(
      `/videos${qs({
        cursor: p.cursor,
        limit: p.limit,
        sessionId: p.sessionId,
        deviceId: p.deviceId,
        unassigned: p.unassigned === true ? "true" : undefined,
      })}`,
    ),
  get: (id: string) => request<Video>(`/videos/${id}`),
  update: (id: string, body: UpdateVideoRequest) =>
    request<Video>(`/videos/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) =>
    request<void>(`/videos/${id}`, { method: "DELETE" }),
  playbackUrl: (id: string) =>
    request<PlaybackUrl>(`/videos/${id}/playback-url`),
};

// ---- Sessions ----
export type SessionListParams = PageParams & {
  modeHint?: SessionModeHint;
  tournamentId?: string;
  startedFrom?: string;
  startedTo?: string;
};
export const sessionsApi = {
  list: (p: SessionListParams = {}) =>
    request<SessionList>(
      `/sessions${qs({
        cursor: p.cursor,
        limit: p.limit,
        modeHint: p.modeHint,
        tournamentId: p.tournamentId,
        startedFrom: p.startedFrom,
        startedTo: p.startedTo,
      })}`,
    ),
  get: (id: string) => request<Session>(`/sessions/${id}`),
  create: (body: CreateSessionRequest) =>
    request<Session>("/sessions", { method: "POST", json: body }),
  update: (id: string, body: UpdateSessionRequest) =>
    request<Session>(`/sessions/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) =>
    request<void>(`/sessions/${id}`, { method: "DELETE" }),
};
