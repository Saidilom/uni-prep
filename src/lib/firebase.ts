// @ts-expect-error - legacy stub for firebase package
export const db = null as unknown as Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const doc = (..._args: unknown[]) => ({}) as unknown;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const setDoc = async (..._args: unknown[]) => undefined;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const updateDoc = async (..._args: unknown[]) => undefined;
export const increment = (value: number) => value;
export const serverTimestamp = () => new Date();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const collection = (..._args: unknown[]) => ({}) as unknown;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const addDoc = async (..._args: unknown[]) => ({ id: "mock" });
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getDoc = async (..._args: unknown[]) => ({
    exists: () => false,
    data: () => ({}) as Record<string, unknown>,
});
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getDocs = async (..._args: unknown[]) => ({
    docs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
    forEach: (callback: (doc: { id: string; data: () => Record<string, unknown> }) => void) => {
        void callback;
    },
});
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const query = (..._args: unknown[]) => ({}) as unknown;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const where = (..._args: unknown[]) => ({}) as unknown;
