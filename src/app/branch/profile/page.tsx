"use client";

import AdminProfileView from "@/components/admin-profile-view";

// Профиль админа филиала — тот же компонент, что у супер-админа. Отличие одно:
// здесь дополнительно показывается филиал, и решает это сам компонент по роли.
export default function BranchProfilePage() {
    return <AdminProfileView />;
}
