"use client";

import AdminProfileView from "@/components/admin-profile-view";

// Профиль супер-админа. Вся разметка — в общем компоненте: у админа филиала
// такая же страница, и две копии рано или поздно разошлись бы.
export default function AdminProfilePage() {
    return <AdminProfileView />;
}
