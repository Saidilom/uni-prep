"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import MockTestStudio from "@/components/mock-test-studio";
import { useAuthStore } from "@/store/useAuthStore";

export default function TeacherMockTestsPage() {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user?.role !== "teacher") router.replace("/");
  }, [isLoading, router, user]);

  if (isLoading || user?.role !== "teacher") return null;
  return <MockTestStudio mode="teacher" />;
}

