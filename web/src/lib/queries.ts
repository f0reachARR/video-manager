// Deprecated barrel: re-exports per-feature query hooks while imports across
// the codebase are migrated to the feature paths. New code should import from
// `features/<name>/api/queries` directly.

export { queryKeys } from "./api/queryKeys";

export {
  useRuns,
  useRun,
  useCreateRun,
  useUpdateRun,
  useDeleteRun,
  useAddRunVideo,
  useUpdateRunVideo,
  useRemoveRunVideo,
  useRecommendedRunVideos,
} from "../features/runs/api/queries";

export {
  useMarkers,
  useCreateMarker,
  useUpdateMarker,
  useDeleteMarker,
  useMarker,
  markerCategories,
} from "../features/markers/api/queries";

export { useVideos, useUpdateVideo, useDeleteVideo } from "../features/videos/api/queries";

export {
  useUser,
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from "../features/users/api/queries";

export {
  useDevices,
  useCreateDevice,
  useUpdateDevice,
  useDeleteDevice,
} from "../features/devices/api/queries";

export {
  useTeams,
  useTeam,
  useTeamMarkerStats,
  useCreateTeam,
  useUpdateTeam,
  useDeleteTeam,
} from "../features/teams/api/queries";

export {
  useRobots,
  useCreateRobot,
  useUpdateRobot,
  useDeleteRobot,
} from "../features/robots/api/queries";

export {
  useScenarios,
  useCreateScenario,
  useUpdateScenario,
  useDeleteScenario,
} from "../features/scenarios/api/queries";

export {
  useTags,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
} from "../features/tags/api/queries";

export {
  useAnnotations,
  useCreateAnnotation,
  useUpdateAnnotation,
  useDeleteAnnotation,
} from "../features/annotations/api/queries";

export {
  useScoutingNotesByMatch,
  useScoutingNote,
  useCreateScoutingNote,
  useDeleteScoutingNote,
} from "../features/scouting-notes/api/queries";

export {
  useTournaments,
  useTournament,
  useCreateTournament,
  useUpdateTournament,
  useDeleteTournament,
} from "../features/tournaments/api/queries";

export {
  useMatch,
  useMatches,
  useCreateMatch,
  useUpdateMatch,
  useDeleteMatch,
} from "../features/matches/api/queries";

export {
  useSessions,
  useCreateSession,
  useUpdateSession,
  useDeleteSession,
} from "../features/sessions/api/queries";

export { useSearchRuns } from "../features/search/api/queries";
