import { GraduationCap } from "lucide-react";

export default function RegistanLogo({ className = "h-14 w-14" }: { className?: string }) {
    return (
        <div
            className={`flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-sm ${className}`}
        >
            <GraduationCap className="h-[55%] w-[55%] text-white" strokeWidth={2} />
        </div>
    );
}
