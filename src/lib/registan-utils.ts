import supabase from "./supabase/client";
import { User, PlacementAssignment, MockTest, MockAccess } from "./firestore-schema";
import { pageCache } from "./page-cache";

export async function fetchAllUsers(): Promise<User[]> {
  const { data } = await supabase.from<User>("users").select("*").order("createdAt", { ascending: false });
  return (data || []) as User[];
}

export async function fetchUserPlacementAssignments(
  userId: string
): Promise<PlacementAssignment[]> {
  return pageCache.fetch(
    `placementAssignments:${userId}`,
    async () => {
      const { data } = await supabase.from<PlacementAssignment>("placement_assignments").select("*").eq("user_id", userId).order("assignedAt", { ascending: false });
      return (data || []) as PlacementAssignment[];
    },
    60 * 1000
  );
}

export async function fetchAvailableMockTests(): Promise<MockTest[]> {
  const { data } = await supabase.from<MockTest>("mock_tests").select("*").order("createdAt", { ascending: false });
  return (data || []) as MockTest[];
}

export async function fetchUserMockAccess(
  userId: string
): Promise<MockAccess[]> {
  const { data } = await supabase.from<MockAccess>("mock_access").select("*").eq("user_id", userId);
  return (data || []) as MockAccess[];
}

export async function getMockTestById(
  testId: string
): Promise<MockTest | null> {
  const { data } = await supabase.from<MockTest>("mock_tests").select("*").eq("id", testId).single();
  return data || null;
}

export function userHasMockAccess(
  user: User,
  mockTest: MockTest,
  accessList: MockAccess[]
): boolean {
  if (mockTest.type === "free" && user.isRegistanStudent) return true;
  return accessList.some((a) => a.mockTestId === mockTest.id);
}
