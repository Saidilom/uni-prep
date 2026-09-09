"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import MockTestStudio from "@/components/mock-test-studio";
import { useAuthStore } from "@/store/useAuthStore";

export default function TeacherMockTestsPage() {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();

  // «Пользователь неизвестен» и «роль не та» — разные вещи. Первое означает,
  // что сессия ещё не восстановлена (например, только что вернулись во
  // вкладку), и уводить с рабочей страницы на главную из-за этого нельзя:
  // раскладка дашборда сама отправит на логин, если пользователя и правда нет.
  useEffect(() => {
    if (isLoading || !user) return;
    if (user.role !== "teacher") router.replace("/");
  }, [isLoading, router, user]);

  if (isLoading || user?.role !== "teacher") return null;
  return <MockTestStudio mode="teacher" />;
}

