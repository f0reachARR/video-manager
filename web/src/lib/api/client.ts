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
export type TeamMarkerStats = components["schemas"]["TeamMarkerStats"];

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
export type SessionCandidate = components["schemas"]["SessionCandidate"];
export type SessionCandidateList = components["schemas"]["SessionCandidateList"];

export type Run = components["schemas"]["Run"];
export type CreateRunRequest = components["schemas"]["CreateRunRequest"];
export type UpdateRunRequest = components["schemas"]["UpdateRunRequest"];
export type RunList = components["schemas"]["RunList"];
export type RunVideo = components["schemas"]["RunVideo"];
export type AddRunVideoRequest = components["schemas"]["AddRunVideoRequest"];
export type UpdateRunVideoRequest = components["schemas"]["UpdateRunVideoRequest"];

export type Tournament = components["schemas"]["Tournament"];
export type CreateTournamentRequest = components["schemas"]["CreateTournamentRequest"];
export type UpdateTournamentRequest = components["schemas"]["UpdateTournamentRequest"];
export type TournamentList = components["schemas"]["TournamentList"];

export type Annotation = components["schemas"]["Annotation"];
export type AnnotationType = components["schemas"]["AnnotationType"];
export type AnnotationList = components["schemas"]["AnnotationList"];
export type CreateAnnotationRequest = components["schemas"]["CreateAnnotationRequest"];
export type UpdateAnnotationRequest = components["schemas"]["UpdateAnnotationRequest"];

export type Match = components["schemas"]["Match"];
export type CreateMatchRequest = components["schemas"]["CreateMatchRequest"];
export type UpdateMatchRequest = components["schemas"]["UpdateMatchRequest"];
export type MatchList = components["schemas"]["MatchList"];

export type Marker = components["schemas"]["Marker"];
export type MarkerList = components["schemas"]["MarkerList"];
export type MarkerCategory = components["schemas"]["MarkerCategory"];
export type CreateMarkerRequest = components["schemas"]["CreateMarkerRequest"];
export type UpdateMarkerRequest = components["schemas"]["UpdateMarkerRequest"];

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
  markerStats: (id: string) =>
    request<TeamMarkerStats>(`/teams/${id}/marker-stats`),
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
  thumbnailUrl: (id: string) =>
    request<PlaybackUrl>(`/videos/${id}/thumbnail-url`),
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
  candidates: (videoId: string) =>
    request<SessionCandidateList>(`/sessions/candidates${qs({ videoId })}`),
};

// ---- Runs ----
export type RunListParams = PageParams & {
  sessionId?: string;
  teamId?: string;
  robotId?: string;
  scenarioId?: string;
  matchId?: string;
};
export const runsApi = {
  list: (p: RunListParams = {}) =>
    request<RunList>(
      `/runs${qs({
        cursor: p.cursor,
        limit: p.limit,
        sessionId: p.sessionId,
        teamId: p.teamId,
        robotId: p.robotId,
        scenarioId: p.scenarioId,
        matchId: p.matchId,
      })}`,
    ),
  get: (id: string) => request<Run>(`/runs/${id}`),
  create: (body: CreateRunRequest) =>
    request<Run>("/runs", { method: "POST", json: body }),
  update: (id: string, body: UpdateRunRequest) =>
    request<Run>(`/runs/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) =>
    request<void>(`/runs/${id}`, { method: "DELETE" }),
  addVideo: (runId: string, body: AddRunVideoRequest) =>
    request<RunVideo>(`/runs/${runId}/videos`, { method: "POST", json: body }),
  updateVideo: (runId: string, runVideoId: string, body: UpdateRunVideoRequest) =>
    request<RunVideo>(`/runs/${runId}/videos/${runVideoId}`, {
      method: "PATCH",
      json: body,
    }),
  removeVideo: (runId: string, runVideoId: string) =>
    request<void>(`/runs/${runId}/videos/${runVideoId}`, { method: "DELETE" }),
};

// ---- Search ----
export type SearchRunsParams = PageParams & {
  from?: string;
  to?: string;
  robotId?: string;
  scenarioId?: string;
  tagIds?: string[];
  markerCategories?: MarkerCategory[];
  q?: string;
};
export const searchApi = {
  runs: (p: SearchRunsParams = {}) =>
    request<RunList>(
      `/search/runs${qs({
        cursor: p.cursor,
        limit: p.limit,
        from: p.from,
        to: p.to,
        robotId: p.robotId,
        scenarioId: p.scenarioId,
        tagIds: p.tagIds && p.tagIds.length > 0 ? p.tagIds.join(",") : undefined,
        markerCategories:
          p.markerCategories && p.markerCategories.length > 0
            ? p.markerCategories.join(",")
            : undefined,
        q: p.q,
      })}`,
    ),
};

// ---- Annotations ----
export const annotationsApi = {
  list: (videoId: string) =>
    request<AnnotationList>(`/videos/${videoId}/annotations`),
  create: (videoId: string, body: CreateAnnotationRequest) =>
    request<Annotation>(`/videos/${videoId}/annotations`, {
      method: "POST",
      json: body,
    }),
  update: (annotationId: string, body: UpdateAnnotationRequest) =>
    request<Annotation>(`/annotations/${annotationId}`, {
      method: "PATCH",
      json: body,
    }),
  remove: (annotationId: string) =>
    request<void>(`/annotations/${annotationId}`, { method: "DELETE" }),
};

// ---- Tournaments ----
export const tournamentsApi = {
  list: (p: PageParams = {}) =>
    request<TournamentList>(`/tournaments${qs({ cursor: p.cursor, limit: p.limit })}`),
  get: (id: string) => request<Tournament>(`/tournaments/${id}`),
  create: (body: CreateTournamentRequest) =>
    request<Tournament>("/tournaments", { method: "POST", json: body }),
  update: (id: string, body: UpdateTournamentRequest) =>
    request<Tournament>(`/tournaments/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) =>
    request<void>(`/tournaments/${id}`, { method: "DELETE" }),
};

// ---- Matches ----
export type MatchListParams = PageParams & { tournamentId?: string };
export const matchesApi = {
  list: (p: MatchListParams = {}) =>
    request<MatchList>(
      `/matches${qs({ cursor: p.cursor, limit: p.limit, tournamentId: p.tournamentId })}`,
    ),
  get: (id: string) => request<Match>(`/matches/${id}`),
  create: (body: CreateMatchRequest) =>
    request<Match>("/matches", { method: "POST", json: body }),
  update: (id: string, body: UpdateMatchRequest) =>
    request<Match>(`/matches/${id}`, { method: "PATCH", json: body }),
  remove: (id: string) =>
    request<void>(`/matches/${id}`, { method: "DELETE" }),
};

// ---- Markers ----
export type MarkerListParams = PageParams & {
  category?: MarkerCategory[];
};
export const markersApi = {
  list: (runId: string, p: MarkerListParams = {}) =>
    request<MarkerList>(
      `/runs/${runId}/markers${qs({
        cursor: p.cursor,
        limit: p.limit,
        category: p.category && p.category.length > 0 ? p.category.join(",") : undefined,
      })}`,
    ),
  create: (runId: string, body: CreateMarkerRequest) =>
    request<Marker>(`/runs/${runId}/markers`, { method: "POST", json: body }),
  update: (markerId: string, body: UpdateMarkerRequest) =>
    request<Marker>(`/markers/${markerId}`, { method: "PATCH", json: body }),
  remove: (markerId: string) =>
    request<void>(`/markers/${markerId}`, { method: "DELETE" }),
};
