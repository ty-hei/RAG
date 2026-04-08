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

export interface LLMModelConfig {
  id: string;
  name: string;
  provider: 'gemini' | 'openai';
  apiKey: string;
  apiEndpoint?: string;
  fastModel: string;
  smartModel: string;
}

export interface WebSearchConfig {
  id: string;
  name: string;
  provider: 'tavily' | 'google' | 'none';
  tavilyApiKey?: string;
  googleApiKey?: string;
  googleCseId?: string;
}

export interface NCBIConfig {
  id: string;
  name: string;
  ncbiApiKey?: string;
  fetchRateLimit: number;
}

// Runtime config used by background services (merged from active profiles)
export interface RuntimeConfig extends Omit<LLMModelConfig, 'id' | 'name'>, Omit<WebSearchConfig, 'id' | 'name' | 'provider'>, Omit<NCBIConfig, 'id' | 'name'> {
  webSearchProvider: 'tavily' | 'google' | 'none';
}

export interface SettingsState {
  llmConfigs: LLMModelConfig[];
  webSearchConfigs: WebSearchConfig[];
  ncbiConfigs: NCBIConfig[];
  activeLlmId: string | null;
  activeWebSearchId: string | null;
  activeNcbiId: string | null;
}

// Deprecated: Kept for migration purposes if needed, but we will migrate directly.
// We can remove LLMConfig if we update all references.
// For now, let's alias RuntimeConfig to LLMConfig to minimize refactoring churn in background.ts
export type LLMConfig = RuntimeConfig;

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
  doi?: string;
  pmcid?: string;
}

export interface ScoredArticle extends FetchedArticle {
  score: number;
  reason: string;
  pmcid?: string; // <-- Add optional pmcid
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
  synthesisProgress?: { [subQuestionId: string]: string };
  processedPmids?: string[];
  finalReport: string;
  loading: boolean;
  error: string | null;
  log: string[];
  gatheringIndex: number;
  clinicalTrials: ScoredClinicalTrial[];
  lastFailedAction: { type: string; payload: any } | null;
  streamingContent?: string; // New field for streaming raw content
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