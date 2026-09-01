import supabase from "./supabase/client";
import { User, PlacementAssignment, MockTest, MockAccess } from "./firestore-schema";
import { pageCache } from "./page-cache";

export type { MockTest, MockAccess, PlacementAssignment, User } from "./firestore-schema";

// Short TTL: long enough that navigating between student pages feels instant
// (repeat visits within this window hit cache, not the network), short enough
// that a newly assigned/purchased test or a just-submitted result shows up on
// its own without needing an explicit invalidation from every possible caller.
const STUDENT_CACHE_TTL = 60 * 1000;

export async function fetchAllUsers(): Promise<User[]> {
  const { data } = await supabase.from("users").select("*").order("createdat", { ascending: false });
  return (data || []) as User[];
}

export async function fetchUserPlacementAssignments(
  userId: string
): Promise<PlacementAssignment[]> {
  return pageCache.fetch(
    `placementAssignments:${userId}`,
    async () => {
      const { data } = await supabase.from("placement_assignments").select("*").eq("user_id", userId).order("assigned_at", { ascending: false });
      return (data || []) as PlacementAssignment[];
    },
    60 * 1000
  );
}

export async function fetchAvailableMockTests(): Promise<MockTest[]> {
  return pageCache.fetch("availableMockTests", async () => {
    const { data } = await supabase.from("mock_tests").select("*").eq("status", "published").order("created_at", { ascending: false });
    return (data || []).map((row) => ({
      ...row,
      durationMinutes: row.duration_minutes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      subjectId: row.subject_id,
      createdBy: row.created_by,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      resultsPublishAt: row.results_publish_at,
    })) as MockTest[];
  }, STUDENT_CACHE_TTL);
}

export async function fetchUserMockAccess(
  userId: string
): Promise<MockAccess[]> {
  return pageCache.fetch(`mockAccess:${userId}`, async () => {
    const { data } = await supabase.from("mock_access").select("*").eq("user_id", userId);
    return (data || []).map((row) => ({
      ...row,
      userId: row.user_id,
      mockTestId: row.mock_test_id,
      grantedAt: row.granted_at,
      paymentId: row.payment_id,
    })) as MockAccess[];
  }, STUDENT_CACHE_TTL);
}

export async function getMockTestById(
  testId: string
): Promise<MockTest | null> {
  return pageCache.fetch(`mockTest:${testId}`, async () => {
    const { data } = await supabase.from("mock_tests").select("*").eq("id", testId).single();
    return data || null;
  }, 5 * 60 * 1000);
}

// mock_test_ids the user can reach via a class_only assignment — the
// student's own class_members rows joined against mock_class_assignments
// (both readable by the student per migration 010's RLS policies).
export async function fetchUserClassMockAccess(userId: string): Promise<Set<string>> {
  return pageCache.fetch(`classMockAccess:${userId}`, async () => {
    const [{ data: memberships }, { data: individualAssignments }] = await Promise.all([
      supabase.from("class_members").select("class_id").eq("student_id", userId),
      supabase.from("mock_student_assignments").select("mock_test_id").eq("student_id", userId),
    ]);
    const accessible = new Set((individualAssignments || []).map((assignment) => assignment.mock_test_id as string));
    const classIds = (memberships || []).map((m) => m.class_id as string);
    if (classIds.length === 0) return accessible;
    const { data: assignments } = await supabase.from("mock_class_assignments").select("mock_test_id").in("class_id", classIds);
    (assignments || []).forEach((assignment) => accessible.add(assignment.mock_test_id as string));
    return accessible;
  }, STUDENT_CACHE_TTL);
}

export type MockResultRow = {
  id: string;
  mock_test_id: string;
  mock_test_title: string;
  score: number;
  max_score: number;
  total_questions: number;
  correct_answers: number;
  accuracy: number;
  grade_level: string | null;
  completed_at: string;
  revealed_at: string | null;
};

export async function fetchUserMockResults(userId: string): Promise<MockResultRow[]> {
  return pageCache.fetch(`mockResults:${userId}`, async () => {
    const { data } = await supabase
      .from("mock_results")
      .select("id, mock_test_id, mock_test_title, score, max_score, total_questions, correct_answers, accuracy, grade_level, completed_at, revealed_at")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false });
    return (data || []) as MockResultRow[];
  }, STUDENT_CACHE_TTL);
}

export async function fetchHasPlacementResult(userId: string): Promise<boolean> {
  return pageCache.fetch(`hasPlacementResult:${userId}`, async () => {
    const { count } = await supabase.from("placement_results").select("id", { count: "exact", head: true }).eq("user_id", userId);
    return (count ?? 0) > 0;
  }, STUDENT_CACHE_TTL);
}

// Call after a mock/placement submission so the student's own next page view
// (home, catalog, results) reflects it immediately instead of waiting out
// STUDENT_CACHE_TTL.
export function invalidateStudentMockCaches(userId: string): void {
  pageCache.invalidate(`mockResults:${userId}`);
  pageCache.invalidate(`hasPlacementResult:${userId}`);
}

export function userHasMockAccess(
  user: User,
  mockTest: MockTest,
  accessList: MockAccess[],
  classAccessMockIds?: Set<string>
): boolean {
  if (mockTest.type === "free" && user.isRegistanStudent) return true;
  if (mockTest.type === "class_only") return classAccessMockIds?.has(mockTest.id) ?? false;
  return accessList.some((a) => a.mockTestId === mockTest.id);
}
