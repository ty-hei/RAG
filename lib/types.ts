// RAG-main/lib/types.ts

// 【修改】调整Stage类型以适应新流程
export type Stage = 'IDLE' | 'PLANNING' | 'SCREENING' | 'GATHERING' | 'SYNTHESIZING' | 'DONE';

// LLM 配置
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
  scoredAbstracts: ScoredArticle[];
  // 【新增】用于存储用户选择要处理的文章
  articlesToFetch: ScoredArticle[];
  // 【新增】用于存储已抓取到的全文
  fullTexts: { pmid: string; text: string }[];
  finalReport: string;
  loading: boolean;
  error: string | null;
}

export interface AppState {
  sessions: ResearchSession[];
  activeSessionId: string | null;

  // Action，用于管理会话
  addSession: (topic: string) => string;
  switchSession: (sessionId: string | null) => void;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, newName: string) => void;
  updateActiveSession: (update: Partial<Omit<ResearchSession, 'id' | 'createdAt'>>) => void;
  updateSessionById: (sessionId: string, update: Partial<Omit<ResearchSession, 'id' | 'createdAt'>>) => void;
  getActiveSession: () => ResearchSession | null;
  resetActiveSession: () => void;
}