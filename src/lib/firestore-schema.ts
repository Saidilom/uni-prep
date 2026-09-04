/**
 * Firestore logical schema and TypeScript types for Registan platform.
 */

// Schema types — decouple from Firebase Timestamp. Use ISO strings or Date where needed.

// "staff" is a limited admin role granted by a full admin — its only power
// is promoting a student to teacher (see the /staff panel and
// promote_student_to_teacher, 049_staff_role.sql). It is deliberately
// distinct from "admin" (full power, unchanged) everywhere in RLS.
// 'staff' — узкий админ, который только делает учеников учителями (миграция
// 049). 'branch_admin' — администратор филиала: видит и ведёт только свой
// филиал, работает в разделе /branch (миграция 072). 'admin' — Super Admin,
// единственная роль с полными правами.
export type UserRole = "student" | "teacher" | "branch_admin" | "admin" | "staff";

export type RegisteredVia = "qr" | "google" | "phone" | "admin";

export interface User {
  id: string; // Firebase UID
  shortId: string; // Короткий ID (только буквы и цифры)
  email: string;
  phone: string; // Номер телефона (+998...)
  name: string; // Имя
  surname?: string; // Фамилия (опционально)
  role: UserRole;
  subjects: string[]; // массив ID предметов (legacy, для учителей)
  isRegistanStudent: boolean; // Статус «Ученик Registan»
  registeredVia: RegisteredVia;
  createdAt: string | Date;
  updatedAt?: string | Date; // Дата последнего обновления
  avatar: string; // URL аватара
  locale?: "ru" | "uz"; // Предпочитаемый язык интерфейса
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
  createdAt: string | Date;
}

export interface Topic {
  id: string;
  textbookId?: string;   // опционально — отсутствует у тем без учебника
  subjectId?: string;    // обязательно для тем без учебника
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
  correctAnswer: string; // "a"|"b"|"c"|"d" for MC, any string for text input
  difficulty: "easy" | "medium" | "hard";
  type?: "mc" | "text"; // defaults to "mc"; "text" = free-text answer (e.g. English writing)
  explanation?: string; // step-by-step explanation shown after answering
  domain?: string;      // e.g. "Algebra", "Reading & Writing"
  skill?: string;       // e.g. "Linear equations in one variable"
  imageUrl?: string;    // CDN URL of optional question image (Uploadcare)
}

export type Medal = "none" | "green" | "grey" | "bronze";

export interface UserProgress {
  userId: string;
  topicId: string;
  solvedQuestions: number;
  correctFirstCount?: number;  // верно с первой попытки
  correctRetryCount?: number;  // верно после повторных попыток
  errors: number;
  /** Вопросы с флажком «Отметить» в последнем завершённом прохождении */
  markedQuestions?: number;
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
  // Предмет, который учитель ведёт в этой группе — по нему комплект «Ойлик
  // тест» раздаёт группе её предметный тест. У групп, созданных до появления
  // этого поля, null.
  subjectId: string | null;
  // Филиал: проставляется триггером из карточки учителя, не клиентом.
  branchId: string | null;
  createdAt: string;
}

export interface ClassMember {
  id: string;
  classId: string;
  studentId: string;
  addedAt: string;
}

export interface MockClassAssignment {
  id: string;
  mockTestId: string;
  classId: string;
  assignedAt: string;
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

/* ─── Placement Test ─────────────────────────────────── */

export interface PlacementQuestion {
  id: string;
  text: string;
  options: { a: string; b: string; c: string; d: string };
  correctAnswer: string;
  points?: number;
  order: number;
}

export interface PlacementTest {
  id: string;
  title: string;
  description?: string;
  durationMinutes?: number;
  passingScore?: number;
  questionIds: string[];
  createdAt: string;
  updatedAt?: string;
}

export type PlacementAssignmentStatus = "assigned" | "in_progress" | "completed";

export interface PlacementAssignment {
  id: string;
  userId: string;
  testId: string;
  testTitle: string;
  status: PlacementAssignmentStatus;
  assignedBy: string; // admin uid
  assignedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface PlacementAnswerDetail {
  questionId: string;
  questionText: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  pointsEarned: number;
}

export interface PlacementResult {
  id: string;
  assignmentId: string;
  userId: string;
  testId: string;
  testTitle: string;
  userName: string;
  userSurname?: string;
  userPhone: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number; // процент 0–100
  timeSpentSeconds: number;
  answers: PlacementAnswerDetail[];
  completedAt: string;
}

/* ─── Mock Test ──────────────────────────────────────── */

export type MockTestType = "free" | "paid" | "class_only";

export interface MockSection {
  id: string;
  title: string;
  questionIds: string[];
  order: number;
}

export interface MockTest {
  id: string;
  title: string;
  description?: string;
  type: MockTestType;
  price: number; // сум в UZS, 0 для бесплатных
  durationMinutes: number;
  sections: MockSection[];
  createdAt: string;
  updatedAt?: string;
  subjectId?: string;
  language?: string;
  createdBy?: string;
  status?: "draft" | "review" | "published" | "archived";
  startsAt?: string | null;
  endsAt?: string | null;
  resultsPublishAt?: string | null;
}

export type MockAccessSource = "registan" | "payment" | "admin";

export interface MockAccess {
  id: string;
  userId: string;
  mockTestId: string;
  source: MockAccessSource;
  grantedAt: string;
  paymentId?: string;
}

export interface MockResult {
  id: string;
  userId: string;
  mockTestId: string;
  mockTestTitle: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
  sectionScores: Record<string, number>;
  timeSpentSeconds: number;
  completedAt: string;
}

/* ─── Payments ───────────────────────────────────────── */

export type PaymentStatus = "pending" | "success" | "failed" | "cancelled";

export interface Payment {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  mockTestId: string;
  mockTestTitle: string;
  amount: number;
  currency: string; // "UZS"
  status: PaymentStatus;
  provider: string; // "payme" | "click" | ...
  providerTransactionId?: string;
  paidAt?: string;
  createdAt: string;
}
