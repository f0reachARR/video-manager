import type { MarkerCategory } from "../../../lib/api/client";

export const markerCategoryColor: Record<MarkerCategory, string> = {
  success: "teal",
  failure: "red",
  note: "blue",
};

export const markerCategoryLabel: Record<MarkerCategory, string> = {
  success: "成功",
  failure: "失敗",
  note: "メモ",
};
