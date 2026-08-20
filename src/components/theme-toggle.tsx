"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { APP_THEME_KEY } from "@/lib/app-config";

type ThemeMode = "light" | "dark";

const STORAGE_KEY = APP_THEME_KEY;

function applyTheme(mode: ThemeMode) {
    const root = document.documentElement;
    if (mode === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
}

export function ThemeToggle({ className = "" }: { className?: string }) {
    const [mode, setMode] = useState<ThemeMode>("light");

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        const initial: ThemeMode = saved === "dark" ? "dark" : "light";
        if (saved !== "dark" && saved !== "light") {
            localStorage.setItem(STORAGE_KEY, "light");
        }
        setMode(initial);
        applyTheme(initial);
    }, []);

    const toggle = () => {
        const next: ThemeMode = mode === "dark" ? "light" : "dark";
        setMode(next);
        localStorage.setItem(STORAGE_KEY, next);
        applyTheme(next);
    };

    const Icon = mode === "dark" ? Sun : Moon;
    const label = mode === "dark" ? "Светлая тема" : "Тёмная тема";

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={label}
            title={label}
            className={`h-10 w-10 rounded-full border border-border bg-card hover:bg-muted text-foreground transition-colors flex items-center justify-center ${className}`}
        >
            <Icon className="w-4.5 h-4.5" />
        </button>
    );
}

