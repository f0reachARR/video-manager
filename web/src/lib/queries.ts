import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  type AddRunVideoRequest,
  type CreateRunRequest,
  type RunListParams,
  type UpdateRunRequest,
  type UpdateRunVideoRequest,
  type UpdateVideoRequest,
  type VideoListParams,
  runsApi,
  videosApi,
  markersApi,
  type CreateMarkerRequest,
  type MarkerCategory,
  type MarkerListParams,
  type UpdateMarkerRequest,
  type CreateDeviceRequest,
  type CreateRobotRequest,
  type CreateScenarioRequest,
  type CreateSessionRequest,
  type CreateTagRequest,
  type CreateTeamRequest,
  type CreateUserRequest,
  type RobotListParams,
  type SessionListParams,
  type UpdateDeviceRequest,
  type UpdateRobotRequest,
  type UpdateScenarioRequest,
  type UpdateSessionRequest,
  type UpdateTagRequest,
  type UpdateTeamRequest,
  type UpdateUserRequest,
  devicesApi,
  robotsApi,
  scenariosApi,
  sessionsApi,
  tagsApi,
  teamsApi,
  usersApi,
} from "./api/client";

export const queryKeys = {
  users: ["users"] as const,
  devices: ["devices"] as const,
  teams: ["teams"] as const,
  robots: (params: RobotListParams = {}) => ["robots", params] as const,
  scenarios: ["scenarios"] as const,
  tags: ["tags"] as const,
  sessions: (params: SessionListParams = {}) => ["sessions", params] as const,
  videos: (params: VideoListParams = {}) => ["videos", params] as const,
  runs: (params: RunListParams = {}) => ["runs", params] as const,
  run: (id: string) => ["runs", "detail", id] as const,
  markers: (runId: string, params: MarkerListParams = {}) =>
    ["markers", runId, params] as const,
};

// ---- Runs ----
export const useRuns = (params: RunListParams = {}) =>
  useQuery({
    queryKey: queryKeys.runs(params),
    queryFn: () => runsApi.list({ limit: 200, ...params }),
  });

export const useRun = (id: string | null | undefined) =>
  useQuery({
    queryKey: queryKeys.run(id ?? ""),
    queryFn: () => runsApi.get(id as string),
    enabled: !!id,
  });

export const useCreateRun = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRunRequest) => runsApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });
};

export const useUpdateRun = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRunRequest }) =>
      runsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });
};

export const useDeleteRun = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });
};

export const useAddRunVideo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, body }: { runId: string; body: AddRunVideoRequest }) =>
      runsApi.addVideo(runId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });
};

export const useUpdateRunVideo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      runId,
      runVideoId,
      body,
    }: {
      runId: string;
      runVideoId: string;
      body: UpdateRunVideoRequest;
    }) => runsApi.updateVideo(runId, runVideoId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });
};

export const useRemoveRunVideo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, runVideoId }: { runId: string; runVideoId: string }) =>
      runsApi.removeVideo(runId, runVideoId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });
};

// ---- Markers ----
export const useMarkers = (
  runId: string | null | undefined,
  params: MarkerListParams = {},
) =>
  useQuery({
    queryKey: queryKeys.markers(runId ?? "", params),
    queryFn: () => markersApi.list(runId as string, { limit: 200, ...params }),
    enabled: !!runId,
  });

export const useCreateMarker = (runId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMarkerRequest) => markersApi.create(runId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["markers", runId] }),
  });
};

export const useUpdateMarker = (runId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMarkerRequest }) =>
      markersApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["markers", runId] }),
  });
};

export const useDeleteMarker = (runId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markersApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["markers", runId] }),
  });
};

export const markerCategories: MarkerCategory[] = ["success", "failure", "note"];

// ---- Videos ----
export const useVideos = (params: VideoListParams = {}) =>
  useQuery({
    queryKey: queryKeys.videos(params),
    queryFn: () => videosApi.list({ limit: 200, ...params }),
  });

export const useUpdateVideo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateVideoRequest }) =>
      videosApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["videos"] }),
  });
};

export const useDeleteVideo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => videosApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["videos"] }),
  });
};

// ---- Users ----
export const useUsers = () =>
  useQuery({ queryKey: queryKeys.users, queryFn: () => usersApi.list({ limit: 200 }) });

export const useCreateUser = (
  opts?: UseMutationOptions<unknown, Error, CreateUserRequest>,
) => {
  const qc = useQueryClient();
  return useMutation({
    ...opts,
    mutationFn: (body: CreateUserRequest) => usersApi.create(body),
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: queryKeys.users });
      opts?.onSuccess?.(...args);
    },
  });
};

export const useUpdateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserRequest }) =>
      usersApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users }),
  });
};

export const useDeleteUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users }),
  });
};

// ---- Devices ----
export const useDevices = () =>
  useQuery({ queryKey: queryKeys.devices, queryFn: () => devicesApi.list({ limit: 200 }) });

export const useCreateDevice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDeviceRequest) => devicesApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.devices }),
  });
};

export const useUpdateDevice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateDeviceRequest }) =>
      devicesApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.devices }),
  });
};

export const useDeleteDevice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => devicesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.devices }),
  });
};

// ---- Teams ----
export const useTeams = () =>
  useQuery({ queryKey: queryKeys.teams, queryFn: () => teamsApi.list({ limit: 200 }) });

export const useCreateTeam = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTeamRequest) => teamsApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.teams }),
  });
};

export const useUpdateTeam = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTeamRequest }) =>
      teamsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.teams }),
  });
};

export const useDeleteTeam = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => teamsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.teams }),
  });
};

// ---- Robots ----
export const useRobots = (params: RobotListParams = {}) =>
  useQuery({
    queryKey: queryKeys.robots(params),
    queryFn: () => robotsApi.list({ limit: 200, ...params }),
  });

export const useCreateRobot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRobotRequest) => robotsApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["robots"] }),
  });
};

export const useUpdateRobot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRobotRequest }) =>
      robotsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["robots"] }),
  });
};

export const useDeleteRobot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => robotsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["robots"] }),
  });
};

// ---- Scenarios ----
export const useScenarios = () =>
  useQuery({ queryKey: queryKeys.scenarios, queryFn: () => scenariosApi.list({ limit: 200 }) });

export const useCreateScenario = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateScenarioRequest) => scenariosApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.scenarios }),
  });
};

export const useUpdateScenario = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateScenarioRequest }) =>
      scenariosApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.scenarios }),
  });
};

export const useDeleteScenario = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => scenariosApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.scenarios }),
  });
};

// ---- Tags ----
export const useTags = () =>
  useQuery({ queryKey: queryKeys.tags, queryFn: () => tagsApi.list({ limit: 200 }) });

export const useCreateTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTagRequest) => tagsApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tags }),
  });
};

export const useUpdateTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTagRequest }) =>
      tagsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tags }),
  });
};

export const useDeleteTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tagsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tags }),
  });
};

// ---- Sessions ----
export const useSessions = (params: SessionListParams = {}) =>
  useQuery({
    queryKey: queryKeys.sessions(params),
    queryFn: () => sessionsApi.list({ limit: 200, ...params }),
  });

export const useCreateSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSessionRequest) => sessionsApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
};

export const useUpdateSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSessionRequest }) =>
      sessionsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
};

export const useDeleteSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sessionsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
};
