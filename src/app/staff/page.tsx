"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// §9: назначение учителей ушло админу филиала.
//
// Владелец: «два админа не нужны». Причина не косметическая — staff назначал
// учителя БЕЗ филиала, и группы такого учителя не попадали ни в один средний
// балл. Теперь это делает админ филиала в /branch/teachers, и учитель сразу
// получает филиал.
//
// Роль staff сохранена: за ней остались списки учителей и результаты
// вступительных тестов. Эта страница только переводит на первый оставшийся
// раздел — replace, а не push, чтобы «назад» не возвращал сюда же.
export default function StaffHomePage() {
    const router = useRouter();
    useEffect(() => {
        router.replace("/staff/teachers");
    }, [router]);
    return null;
}
