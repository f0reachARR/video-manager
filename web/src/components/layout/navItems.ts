import type { useMatchRoute } from "@tanstack/react-router";

type NavItem = {
  to: string;
  label: string;
};

// Items that operate against the currently selected tournament. Disabled when
// nothing is selected so the user can't navigate into a screen that will only
// show "tournament required" 400s.
export const tournamentScopedItems = [
  { to: "/", label: "ホーム" },
  { to: "/pre-match", label: "本番前モード" },
  { to: "/bulk-upload", label: "現場一括アップロード" },
  { to: "/search", label: "検索" },
  { to: "/matches", label: "試合" },
  { to: "/sessions", label: "セッション" },
  { to: "/runs", label: "Run" },
  { to: "/videos", label: "動画" },
  { to: "/encoding", label: "エンコード状況" },
  { to: "/robots", label: "ロボット" },
] as const satisfies readonly NavItem[];

// Tournament-agnostic masters. Tournament/User/Device/Scenario/Tag are the
// five "universals"; Team rides along because it's M:N with tournaments.
export const masterItems = [
  { to: "/tournaments", label: "大会" },
  { to: "/teams", label: "チーム" },
  { to: "/users", label: "ユーザー" },
  { to: "/devices", label: "機材" },
  { to: "/scenarios", label: "シナリオ" },
  { to: "/tags", label: "タグ" },
] as const satisfies readonly NavItem[];

// Primary destinations surfaced as bottom-tab-bar tabs on mobile. All are
// tournament-scoped, so they share the navbar's "disabled without tournament"
// behavior. The "メニュー" tab (added in BottomTabBar) opens the full list.
export const primaryTabs = [
  { to: "/", label: "ホーム", tournamentScoped: true },
  { to: "/runs", label: "Run", tournamentScoped: true },
  { to: "/videos", label: "動画", tournamentScoped: true },
  { to: "/matches", label: "試合", tournamentScoped: true },
] as const;

type MatchRoute = ReturnType<typeof useMatchRoute>;

// "/" must match exactly (non-fuzzy); every other route highlights for any
// descendant path. Shared so the desktop navbar and the mobile bottom bar
// highlight identically.
export function isActive(matchRoute: MatchRoute, to: string): boolean {
  return to === "/"
    ? !!matchRoute({ to: "/", fuzzy: false })
    : !!matchRoute({ to, fuzzy: true });
}
