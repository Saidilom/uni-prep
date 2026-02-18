import { Subject, Medal } from "./firestore-schema";

// Маппинг названий предметов на локальные изображения из public/subjects
export const getSubjectImage = (subjectId: string, subjectName?: string): string => {
    // Нормализуем ID: убираем пробелы и приводим к нижнему регистру
    const normalizedId = subjectId.trim().toLowerCase();
    
    // Сначала пробуем по ID
    const imageMapById: Record<string, string> = {
        "math": "/subjects/math.png",
        "physics": "/subjects/physics.jpeg",
        "chemistry": "/subjects/chemistry.jpeg",
        "biology": "/subjects/biology.png",
        "history": "/subjects/history.jpeg",
        "english": "/subjects/english.jpeg",
        "russian": "/subjects/russion.jpeg", // опечатка в имени файла сохранена
        "geography": "/subjects/history.jpeg", // используем history как fallback
        "it": "/subjects/math.png", // используем math как fallback
    };
    
    // Если есть маппинг по ID, используем его
    if (imageMapById[normalizedId]) {
        return imageMapById[normalizedId];
    }
    
    // Иначе пробуем по названию предмета (приоритет названию над ID)
    if (subjectName) {
        // Нормализуем название: убираем пробелы в начале/конце, множественные пробелы и приводим к нижнему регистру
        const nameLower = subjectName.trim().replace(/\s+/g, ' ').toLowerCase();
        
        // Специальные проверки для сложных названий (делаем их первыми, до общего маппинга)
        // Проверяем "родной язык и литература" или "родной язык"
        if (nameLower.includes("родной язык и литература")) {
            return "/subjects/russion.jpeg";
        }
        if (nameLower.includes("родной") && nameLower.includes("язык")) {
            return "/subjects/russion.jpeg";
        }
        if (nameLower.includes("родной") && nameLower.includes("литература")) {
            return "/subjects/russion.jpeg";
        }
        if (nameLower.includes("иностранные языки") || nameLower.includes("иностранный язык")) {
            return "/subjects/english.jpeg";
        }
        
        const imageMapByName: Record<string, string> = {
            "родной язык и литература": "/subjects/russion.jpeg",
            "родной язык": "/subjects/russion.jpeg",
            "иностранные языки": "/subjects/english.jpeg",
            "иностранный язык": "/subjects/english.jpeg",
            "английский язык": "/subjects/english.jpeg",
            "русский язык": "/subjects/russion.jpeg",
            "математика": "/subjects/math.png",
            "физика": "/subjects/physics.jpeg",
            "химия": "/subjects/chemistry.jpeg",
            "биология": "/subjects/biology.png",
            "история": "/subjects/history.jpeg",
            "английский": "/subjects/english.jpeg",
            "русский": "/subjects/russion.jpeg",
            "литература": "/subjects/russion.jpeg",
            "география": "/subjects/history.jpeg",
            "информатика": "/subjects/math.png",
        };
        
        // Проверяем точное совпадение
        if (imageMapByName[nameLower]) {
            return imageMapByName[nameLower];
        }
        
        // Проверяем частичное совпадение (на случай, если название содержит дополнительные слова)
        // Приоритет: более длинные ключи проверяем первыми
        const sortedKeys = Object.keys(imageMapByName).sort((a, b) => b.length - a.length);
        for (const key of sortedKeys) {
            // Проверяем только: содержит ли название ключ (не наоборот!)
            if (nameLower.includes(key)) {
                return imageMapByName[key];
            }
        }
    }
    
    // Используем math.png как fallback
    return "/subjects/math.png";
};

export const SUBJECTS: Subject[] = [
    {
        id: "history",
        name: "История",
        emoji: "📜",
        color: "#171717",
        order: 1,
        backgroundImage: "/subjects/history.jpeg",
    },
    {
        id: "math",
        name: "Математика",
        emoji: "🔢",
        color: "#171717",
        order: 2,
        backgroundImage: "/subjects/math.png",
    },
    {
        id: "biology",
        name: "Биология",
        emoji: "🧬",
        color: "#171717",
        order: 3,
        backgroundImage: "/subjects/biology.png",
    },
    {
        id: "geography",
        name: "География",
        emoji: "🌍",
        color: "#171717",
        order: 4,
        backgroundImage: "/subjects/history.jpeg",
    },
    {
        id: "chemistry",
        name: "Химия",
        emoji: "⚗️",
        color: "#171717",
        order: 5,
        backgroundImage: "/subjects/chemistry.jpeg",
    },
    {
        id: "physics",
        name: "Физика",
        emoji: "⚡",
        color: "#171717",
        order: 6,
        backgroundImage: "/subjects/physics.jpeg",
    },
    {
        id: "english",
        name: "Английский",
        emoji: "🇬🇧",
        color: "#171717",
        order: 7,
        backgroundImage: "/subjects/english.jpeg",
    },
    {
        id: "russian",
        name: "Русский язык",
        emoji: "🖋️",
        color: "#171717",
        order: 8,
        backgroundImage: "/subjects/russion.jpeg",
    },
    {
        id: "it",
        name: "Информатика",
        emoji: "💻",
        color: "#171717",
        order: 9,
        backgroundImage: "/subjects/math.png",
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
