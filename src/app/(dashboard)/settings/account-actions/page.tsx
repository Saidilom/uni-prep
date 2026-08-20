"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SettingsAccountActionsPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/settings#account-actions");
    }, [router]);

    return null;
}
