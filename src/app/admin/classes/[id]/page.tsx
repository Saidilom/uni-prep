"use client";

import { useParams } from "next/navigation";
import ClassDetailView from "@/components/class-detail-view";

export default function AdminClassDetailPage() {
    const { id } = useParams();
    return (
        <ClassDetailView
            classId={id as string}
            basePath="/admin/classes"
            backHref="/admin/classes"
        />
    );
}
