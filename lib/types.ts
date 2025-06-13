// RAG-main/lib/types.ts

// 单个研究任务的阶段
export type Stage = 'IDLE' | 'PLANNING' | 'SCREENING' | 'SYNTHESIZING' | 'DONE';

// LLM 配置
export interface LLMConfig {
  provider: 'gemini' | 'openai';
  apiKey: string;
  apiEndpoint?: string;
  fastModel: string;
  smartModel: string;
  fetchRateLimit: number;
  // 【新增】是否在抓取前进行人工确认
  manualScrapingConfirmation: boolean;
}

export interface SubQuestion {
  id: string; // 新增：为每个子问题添加唯一ID，便于编辑和删除
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
  id: string; // 唯一ID，例如时间戳
  name: string; // 会话名称，默认为用户输入的topic
  createdAt: number; // 创建时间
  stage: Stage;
  topic: string;
  researchPlan: ResearchPlan | null;
  scoredAbstracts: ScoredArticle[];
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