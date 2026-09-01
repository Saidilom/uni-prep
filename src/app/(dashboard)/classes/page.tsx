"use client";

import { useAuthStore } from "@/store/useAuthStore";
import TeacherDashboard from "@/components/teacher-dashboard";
import StudentClassesView from "@/components/student-classes-view";

export default function ClassesPage() {
    const { user } = useAuthStore();
    if (!user) return null;
    if (user.role === "student") return <StudentClassesView />;
    return <TeacherDashboard />;
}
