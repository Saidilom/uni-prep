"use client";

import { useParams } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import TeacherClassDetail from "@/components/teacher-class-detail";
import StudentClassDetail from "@/components/student-class-detail";

export default function ClassDetailPage() {
    const { id } = useParams();
    const { user } = useAuthStore();
    if (!user) return null;
    if (user.role === "student") return <StudentClassDetail classId={id as string} />;
    return <TeacherClassDetail />;
}
