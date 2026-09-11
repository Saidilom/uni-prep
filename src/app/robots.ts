import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/app-config";

// robots.txt.
//
// До этого файла его не существовало вовсе, и запрос на /robots.txt попадал в
// middleware, который отправлял робота на /login. То есть первое, что делал
// поисковик при заходе на сайт, — получал редирект на страницу входа.
//
// Закрываем всё, что за авторизацией: там нет ничего для поиска, зато есть
// работы учеников. Открыт только лендинг и вход.
export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                disallow: [
                    "/api/",
                    "/admin/",
                    "/branch/",
                    "/teacher/",
                    "/mock/",
                    "/placement/",
                    "/classes/",
                    "/results",
                    "/review",
                    "/rating",
                    "/achievements",
                    "/profile",
                    "/onboarding",
                    "/join",
                ],
            },
        ],
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    };
}
