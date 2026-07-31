import supabase from "./supabase/client";
import { Textbook, Topic, Subject, Question } from "./firestore-schema";
import { pageCache } from "./page-cache";

const TTL_STATIC = 15 * 1000; // 15 seconds — allows fast updates while still deduplicating concurrent calls
const TTL_QUESTIONS = 2 * 60 * 1000; // 2 min

export const fetchSubjects = (): Promise<Subject[]> =>
    pageCache.fetch("subjects", async () => {
        const { data, error } = await supabase.from<Subject>("subjects").select("*").order("order", { ascending: true });
        return (data || []) as Subject[];
    }, TTL_STATIC);

export const fetchSubjectById = (id: string): Promise<Subject | null> =>
    pageCache.fetch(`subject:${id}`, async () => {
        const { data, error } = await supabase.from<Subject>("subjects").select("*").eq("id", id).single();
        return data || null;
    }, TTL_STATIC);

export const fetchTextbookById = (id: string): Promise<Textbook | null> =>
    pageCache.fetch(`textbook:${id}`, async () => {
        const { data } = await supabase.from<Textbook>("textbooks").select("*").eq("id", id).single();
        return data || null;
    }, TTL_STATIC);

export const fetchTextbooksBySubject = (subjectId: string): Promise<Textbook[]> =>
    pageCache.fetch(`textbooks:${subjectId}`, async () => {
        const { data } = await supabase.from<Textbook>("textbooks").select("*").eq("subjectId", subjectId);
        const textbooks = (data || []) as Textbook[];
        return textbooks.sort((a, b) => (parseInt(String(a.grade)) || 0) - (parseInt(String(b.grade)) || 0));
    }, TTL_STATIC);

export const fetchTopicById = (id: string): Promise<Topic | null> =>
    pageCache.fetch(`topic:${id}`, async () => {
        const { data } = await supabase.from<Topic>("topics").select("*").eq("id", id).single();
        return data || null;
    }, TTL_STATIC);

export const fetchTopicsByTextbook = (textbookId: string): Promise<Topic[]> =>
    pageCache.fetch(`topics:${textbookId}`, async () => {
        const { data } = await supabase.from<Topic>("topics").select("*").eq("textbookId", textbookId);
        const topics = (data || []) as Topic[];
        return topics.sort((a, b) => a.order - b.order);
    }, TTL_STATIC);

export const fetchTopicsBySubject = (subjectId: string): Promise<Topic[]> =>
    pageCache.fetch(`topics-direct:${subjectId}`, async () => {
        const { data } = await supabase.from<Topic>("topics").select("*").eq("subjectId", subjectId);
        return ((data || []) as Topic[]).sort((a, b) => a.order - b.order);
    }, TTL_STATIC);

export const fetchQuestionsByTopic = (topicId: string): Promise<Question[]> =>
    pageCache.fetch(`questions:${topicId}`, async () => {
        const { data } = await supabase.from<Question>("questions").select("*").eq("topicId", topicId);
        const questions = (data || []) as Question[];
        return questions.sort(() => Math.random() - 0.5);
    }, TTL_QUESTIONS);
