import { cn } from "@/lib/utils";

// Shared gradient hero shell — was duplicated identically (gradient +
// dot-pattern overlay) in the dashboard home greeting and the profile ID
// card, so a tweak to one silently drifted from the other.
export default function HeroBanner({
    className = "",
    children,
}: {
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={cn("relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-indigo-700 p-8 text-white shadow-sm", className)}>
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.12]"
                style={{
                    backgroundImage: "radial-gradient(circle, white 1.5px, transparent 1.5px)",
                    backgroundSize: "18px 18px",
                }}
            />
            <div className="relative">{children}</div>
        </div>
    );
}
