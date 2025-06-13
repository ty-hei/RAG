// RAG-main/lib/types.ts

export type Stage = 'IDLE' | 'PLANNING' | 'SCREENING' | 'GATHERING' | 'SYNTHESIZING' | 'DONE';

export interface LLMConfig {
  provider: 'gemini' | 'openai';
  apiKey: string;
  apiEndpoint?: string;
  fastModel: string;
  smartModel: string;
  fetchRateLimit: number;
}

export interface SubQuestion {
  id: string;
  question: string;
  keywords: string[];
}

export interface ResearchPlan {
  subQuestions: SubQuestion[];
  clarification: string;
}

export interface FetchedArticle {
  pmid: string;
  title: string;
  abstract: string;
}

export interface ScoredArticle extends FetchedArticle {
  score: number;
  reason: string;
}

export interface ResearchSession {
  id: string;
  name: string;
  createdAt: number;
  stage: Stage;
  topic: string;
  researchPlan: ResearchPlan | null;
  pubmedQuery: string | null;
  rawArticles: FetchedArticle[];
  scoredAbstracts: ScoredArticle[];
  loadingMessage: string | null;
  articlesToFetch: ScoredArticle[];
  fullTexts: { pmid: string; text: string }[];
  finalReport: string;
  loading: boolean;
  error: string | null;
  log: string[];
  // 【新增】用于追踪全文抓取阶段的进度，支持跳过功能
  gatheringIndex: number;
}

export interface AppState {
  sessions: ResearchSession[];
  activeSessionId: string | null;

  addSession: (topic: string) => string;
  switchSession: (sessionId: string | null) => void;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, newName: string) => void;
  updateActiveSession: (update: Partial<Omit<ResearchSession, 'id' | 'createdAt'>>) => void;
  updateSessionById: (sessionId: string, update: Partial<Omit<ResearchSession, 'id' | 'createdAt'>>) => void;
  getActiveSession: () => ResearchSession | null;
  resetActiveSession: () => void;
}