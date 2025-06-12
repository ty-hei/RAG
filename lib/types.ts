// lib/types.ts

export type Stage = 'IDLE' | 'PLANNING' | 'SCREENING' | 'SYNTHESIZING' | 'DONE';

export interface LLMConfig {
  provider: 'gemini' | 'openai';
  apiKey: string;
  apiEndpoint?: string;
  // 更新：区分快速和增强模型
  fastModel: string;
  smartModel: string;
  fetchRateLimit: number;
}

export interface SubQuestion {
  question: string;
  keywords: string[];
}

export interface ResearchPlan {
  subQuestions: SubQuestion[];
  clarification: string;
}

// 新增：为检索到的文献摘要定义一个基本类型
export interface FetchedArticle {
  pmid: string;
  title: string;
  abstract: string;
}

// 新增：为经过AI评分的文献定义类型
export interface ScoredArticle extends FetchedArticle {
  score: number;
  reason: string;
}

export interface AppState {
  stage: Stage;
  topic: string;
  researchPlan: ResearchPlan | null;
  // 更新：使用更具体的类型
  scoredAbstracts: ScoredArticle[]; 
  finalReport: string;
  loading: boolean;
  error: string | null;

  setStage: (stage: Stage) => void;
  setTopic: (topic: string) => void;
  setResearchPlan: (plan: ResearchPlan) => void;
  // 更新：使用更具体的类型
  setScoredAbstracts: (abstracts: ScoredArticle[]) => void;
  setFinalReport: (report: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}