"use client";

import { useParams } from "next/navigation";
import ClassMockResultsView from "@/components/class-mock-results-view";

// Результаты одного мока по группе — тот же компонент, что у учителя и
// супер-админа, но в режиме просмотра.
//
// readOnly убирает формы оценивания эссе. Не для красоты: проверять работы
// админу филиала не положено — can_review_mock_response (миграция 099) пускает
// админа, назначенного проверяющего и автора теста. Без этого флага он видел бы
// форму, заполнял её и получал отказ от сервера.
export default function BranchClassMockResultsPage() {
    const { id, mockTestId } = useParams();
    const classId = id as string;
    return (
        <ClassMockResultsView
            classId={classId}
            mockTestId={mockTestId as string}
            backHref={`/branch/classes/${classId}`}
            readOnly
        />
    );
}
