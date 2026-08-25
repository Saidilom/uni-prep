import supabase from "./supabase/client";
import { User, PlacementAssignment, MockTest, MockAccess } from "./firestore-schema";
import { pageCache } from "./page-cache";

export type { MockTest, MockAccess, PlacementAssignment, User } from "./firestore-schema";

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
  const { data } = await supabase.from("mock_tests").select("*").order("created_at", { ascending: false });
  return (data || []) as MockTest[];
}

export async function fetchUserMockAccess(
  userId: string
): Promise<MockAccess[]> {
  const { data } = await supabase.from("mock_access").select("*").eq("user_id", userId);
  return (data || []) as MockAccess[];
}

export async function getMockTestById(
  testId: string
): Promise<MockTest | null> {
  const { data } = await supabase.from("mock_tests").select("*").eq("id", testId).single();
  return data || null;
}

// mock_test_ids the user can reach via a class_only assignment — the
// student's own class_members rows joined against mock_class_assignments
// (both readable by the student per migration 010's RLS policies).
export async function fetchUserClassMockAccess(userId: string): Promise<Set<string>> {
  const { data: memberships } = await supabase.from("class_members").select("class_id").eq("student_id", userId);
  const classIds = (memberships || []).map((m) => m.class_id as string);
  if (classIds.length === 0) return new Set();
  const { data: assignments } = await supabase.from("mock_class_assignments").select("mock_test_id").in("class_id", classIds);
  return new Set((assignments || []).map((a) => a.mock_test_id as string));
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
