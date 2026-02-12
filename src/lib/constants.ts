import { Subject, Medal } from "./firestore-schema";

export const SUBJECTS: Subject[] = [
    {
        id: "history",
        name: "История",
        emoji: "📜",
        color: "#8B4513",
        order: 1,
        backgroundImage: "https://images.unsplash.com/photo-1461360370896-922624d12aa1?q=80&w=1000&auto=format&fit=crop",
    },
    {
        id: "math",
        name: "Математика",
        emoji: "🔢",
        color: "#0000FF",
        order: 2,
        backgroundImage: "https://images.unsplash.com/photo-1509228468518-180dd482180c?q=80&w=1000&auto=format&fit=crop",
    },
    {
        id: "biology",
        name: "Биология",
        emoji: "🧬",
        color: "#008000",
        order: 3,
        backgroundImage: "https://images.unsplash.com/photo-1530026405186-ed1f139313f8?q=80&w=1000&auto=format&fit=crop",
    },
    {
        id: "geography",
        name: "География",
        emoji: "🌍",
        color: "#87CEEB",
        order: 4,
        backgroundImage: "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?q=80&w=1000&auto=format&fit=crop",
    },
    {
        id: "chemistry",
        name: "Химия",
        emoji: "⚗️",
        color: "#FFA500",
        order: 5,
        backgroundImage: "https://images.unsplash.com/photo-1532187875605-1ef6c23ce921?q=80&w=1000&auto=format&fit=crop",
    },
    {
        id: "physics",
        name: "Физика",
        emoji: "⚡",
        color: "#800080",
        order: 6,
        backgroundImage: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?q=80&w=1000&auto=format&fit=crop",
    },
    {
        id: "english",
        name: "Английский",
        emoji: "🇬🇧",
        color: "#FF0000",
        order: 7,
        backgroundImage: "https://images.unsplash.com/photo-1444858291040-58f756a3bdd6?q=80&w=1000&auto=format&fit=crop",
    },
];

export const getMedalByErrors = (errors: number, attempts: number): Medal => {
    if (attempts === 0) return "none";
    if (errors <= 1) return "green";
    if (errors === 2) return "grey";
    return "bronze";
};

export const MEDAL_RULES = {
    green: { minErrors: 0, maxErrors: 1, label: "Зелёная медаль" },
    grey: { minErrors: 2, maxErrors: 2, label: "Серая медаль" },
    bronze: { minErrors: 3, maxErrors: Infinity, label: "Бронзовая медаль" },
};
