import { describe, it, expect } from "vitest";
import { userHasMockAccess } from "./registan-utils";
import type { User, MockTest, MockAccess } from "./firestore-schema";

const baseUser = (overrides: Partial<User> = {}): User => ({
    id: "u1",
    shortId: "STU-000001",
    email: "a@b.com",
    phone: "",
    name: "Test",
    role: "student",
    subjects: [],
    isRegistanStudent: false,
    registeredVia: "google",
    createdAt: "",
    avatar: "",
    ...overrides,
});

const baseTest = (overrides: Partial<MockTest> = {}): MockTest => ({
    id: "test1",
    title: "Mock 1",
    type: "free",
    price: 0,
    durationMinutes: 60,
    sections: [],
    createdAt: "",
    ...overrides,
});

describe("userHasMockAccess", () => {
    it("grants free tests to Registan students", () => {
        const user = baseUser({ isRegistanStudent: true });
        const test = baseTest({ type: "free" });
        expect(userHasMockAccess(user, test, [])).toBe(true);
    });

    it("denies free tests to non-Registan students with no purchased access", () => {
        const user = baseUser({ isRegistanStudent: false });
        const test = baseTest({ type: "free" });
        expect(userHasMockAccess(user, test, [])).toBe(false);
    });

    it("grants class_only tests only when the class access set contains the test id", () => {
        const user = baseUser();
        const test = baseTest({ id: "test1", type: "class_only" });
        expect(userHasMockAccess(user, test, [], new Set(["test1"]))).toBe(true);
        expect(userHasMockAccess(user, test, [], new Set(["other"]))).toBe(false);
        expect(userHasMockAccess(user, test, [])).toBe(false);
    });

    it("grants paid tests only via an individual access record", () => {
        const user = baseUser();
        const test = baseTest({ id: "test1", type: "paid", price: 5000 });
        const access: MockAccess[] = [{ id: "a1", userId: "u1", mockTestId: "test1", source: "payment", grantedAt: "" }];
        expect(userHasMockAccess(user, test, access)).toBe(true);
        expect(userHasMockAccess(user, test, [])).toBe(false);
    });

    it("does not let being a Registan student unlock a paid test", () => {
        const user = baseUser({ isRegistanStudent: true });
        const test = baseTest({ id: "test1", type: "paid", price: 5000 });
        expect(userHasMockAccess(user, test, [])).toBe(false);
    });
});
