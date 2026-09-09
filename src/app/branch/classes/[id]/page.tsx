"use client";

import { useParams } from "next/navigation";
import ClassDetailView from "@/components/class-detail-view";

// Тот же экран группы, что у супер-админа. Отдельной фильтрации по филиалу
// здесь нет и не нужно: RLS отдаёт админу филиала только своих учеников
// (миграции 072 и 106), а чужая группа просто не откроется — данных не придёт.
export default function BranchClassDetailPage() {
    const { id } = useParams();
    return (
        <ClassDetailView
            classId={id as string}
            basePath="/branch/classes"
            backHref="/branch/classes"
        />
    );
}
