import type {
  MarkerListParams,
  RobotListParams,
  RunListParams,
  SessionListParams,
  VideoListParams,
} from "./client";

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
