"use client";

import { useParams } from "next/navigation";
import ClassMockResultsView from "@/components/class-mock-results-view";

export default function AdminClassMockResultsPage() {
    const { id, mockTestId } = useParams();
    const classId = id as string;
    const testId = mockTestId as string;

    return <ClassMockResultsView classId={classId} mockTestId={testId} backHref={`/admin/classes/${classId}`} />;
}
