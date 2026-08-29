// Shared semantic color scale — was previously copy-pasted with identical
// thresholds in results/page.tsx (scoreColor) and teacher-results-explorer.tsx
// (accuracyColor), which is how the two drifted enough to be worth merging.
export function accuracyColor(value: number | null): string {
  if (value === null) return "text-muted-foreground bg-muted";
  if (value >= 80) return "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40";
  if (value >= 50) return "text-amber-600 bg-amber-50 dark:bg-amber-950/40";
  return "text-red-600 bg-red-50 dark:bg-red-950/40";
}

// Mock-test lifecycle status — "completed" uses the brand accent (text-primary)
// rather than a raw blue literal so it stays in sync with the app's one accent
// color instead of needing a manual update if the brand hue ever changes.
export const MOCK_STATUS_COLOR = {
  available: "text-emerald-600",
  locked: "text-red-600",
  completed: "text-primary",
} as const;
