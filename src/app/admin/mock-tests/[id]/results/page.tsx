"use client";

import { useParams } from "next/navigation";
import ClassMockResultsView from "@/components/class-mock-results-view";

// Результаты и ручная проверка для мока, созданного в админ-панели.
// Такой тест не привязан ни к какому классу — его проходят ученики из
// каталога напрямую, поэтому экран результатов класса сюда не подходил, и
// проверять эссе было негде. classId = null переводит тот же компонент в
// режим «весь тест»: участники берутся из самих результатов.
export default function AdminMockTestResultsPage() {
    const { id } = useParams();
    const testId = id as string;

    return <ClassMockResultsView classId={null} mockTestId={testId} backHref="/admin/mock-tests" />;
}
