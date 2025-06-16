// RAG-main/lib/types.ts

export type Stage = 'IDLE' | 'PLANNING' | 'SCREENING' | 'GATHERING' | 'SYNTHESIZING' | 'DONE';

// ✅ 【新增】用于存储关键词及其验证状态的类型
export interface ValidatedKeyword {
  term: string;
  validated: boolean;
}

export interface FetchedClinicalTrial {
  nctId: string;
  title: string;
  status: string;
  summary: string;
  conditions: string[];
  interventions: string[];
  url: string;
}

export interface ScoredClinicalTrial extends FetchedClinicalTrial {
  score: number;
  reason: string;
}

export interface ScoredWebResult {
  url: string;
  title: string;
  content: string; 
  score: number;
  reason: string;
}

export interface LLMConfig {
  provider: 'gemini' | 'openai';
  apiKey: string;
  apiEndpoint?: string;
  fastModel: string;
  smartModel: string;
  fetchRateLimit: number;
  webSearchProvider: 'tavily' | 'google' | 'none';
  tavilyApiKey?: string;
  googleApiKey?: string;
  googleCseId?: string;
  ncbiApiKey?: string;
}

export interface SubQuestion {
  id: string;
  question: string;
  // ✅ 【变更】关键词现在是一个对象数组，而不再是简单的字符串数组
  keywords: ValidatedKeyword[];
}

export interface ResearchPlan {
  subQuestions: SubQuestion[];
  clarification: string;
  webQuery: string;
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
  clinicalTrialsQuery: string | null;
  rawArticles: FetchedArticle[];
  scoredAbstracts: ScoredArticle[];
  webResults: ScoredWebResult[];
  loadingMessage: string | null;
  articlesToFetch: ScoredArticle[];
  fullTexts: { pmid: string; text: string }[];
  finalReport: string;
  loading: boolean;
  error: string | null;
  log: string[];
  gatheringIndex: number;
  clinicalTrials: ScoredClinicalTrial[];
  lastFailedAction: { type: string; payload: any } | null;
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