// RAG-main/lib/types.ts

export type Stage = 'IDLE' | 'PLANNING' | 'SCREENING' | 'GATHERING' | 'SYNTHESIZING' | 'DONE';

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
  url:string;
  title: string;
  content: string; // snippet or summary from search result
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
  // ✅ 【变更】增加 'google' 选项
  webSearchProvider: 'tavily' | 'google' | 'none';
  tavilyApiKey?: string;
  // ✅ 【新增】Google API 密钥和自定义搜索引擎 ID
  googleApiKey?: string;
  googleCseId?: string;
  ncbiApiKey?: string;
}

export interface SubQuestion {
  id: string;
  question: string;
  keywords: string[];
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