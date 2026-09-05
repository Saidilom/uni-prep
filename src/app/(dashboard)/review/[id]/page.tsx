"use client";

import { useParams } from "next/navigation";
import ClassMockResultsView from "@/components/class-mock-results-view";

// Экран проверки для назначенного проверяющего (миграция 080).
//
// Тот же компонент, что у супер-админа в /admin/mock-tests/[id]/results:
// classId = null переводит его в режим «весь тест», участники берутся из самих
// результатов — бесплатный мок не привязан ни к какому классу.
//
// Кнопки публикации в этом компоненте нет, и добавлять её сюда нельзя:
// проверяющий по решению владельца только ставит баллы. База это подтверждает
// независимо от интерфейса — finalize_mock_group_results требует автора теста
// или админа и откажет ему.
export default function ReviewMockPage() {
    const { id } = useParams();
    return <ClassMockResultsView classId={null} mockTestId={id as string} backHref="/review" />;
}
