/**
 * Firestore logical schema and TypeScript types for the application.
 */

export type UserRole = "student" | "teacher" | "admin";

export interface User {
  id: string; // Firebase UID
  shortId: string; // Короткий ID (только буквы и цифры)
  email: string;
  name: string; // Имя
  surname?: string; // Фамилия (опционально)
  role: UserRole;
  subjects: string[]; // массив ID предметов
  createdAt: string;
  updatedAt?: string; // Дата последнего обновления
  avatar: string; // URL аватара
}

export interface Subject {
  id: string;
  name: string;
  emoji: string;
  color: string;
  order: number;
  backgroundImage: string;
  topicCount?: number; // Количество тем
  questionCount?: number; // Количество вопросов
}

export interface Textbook {
  id: string;
  subjectId: string;
  title: string;
  grade: string | number;
  coverImage: string;
  createdAt: string;
}

export interface Topic {
  id: string;
  textbookId: string;
  title: string;
  order: number;
  totalQuestions: number;
}

export interface Question {
  id: string;
  topicId: string;
  text: string;
  options: {
    a: string;
    b: string;
    c: string;
    d: string;
  };
  correctAnswer: "a" | "b" | "c" | "d";
  difficulty: "easy" | "medium" | "hard";
}

export type Medal = "none" | "green" | "grey" | "bronze";

export interface UserProgress {
  userId: string;
  topicId: string;
  solvedQuestions: number;
  errors: number;
  medal: Medal;
  accuracy: number; // процент точности
  completedAt: string;
}

export interface SubjectRating {
  userId: string;
  subjectId: string;
  stars: number;
  lastUpdated: string;
}

export interface Class {
  id: string;
  teacherId: string;
  name: string;
  subjectId: string;
  students: string[]; // массив ID студентов
  createdAt: string;
}

export interface Badge {
  id: string;
  userId: string;
  name: string;
  description: string;
  textbookId: string;
  unlockedAt: string;
}

export interface TestResult {
  id: string;
  userId: string;
  topicId: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  errors: number;
  timeSpentSeconds: number;
  completedAt: string;
}

