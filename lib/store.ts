// lib/store.ts

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppState } from './types'

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      stage: 'IDLE',
      topic: '',
      researchPlan: null,
      scoredAbstracts: [],
      finalReport: '',
      loading: false,
      error: null,
      
      setStage: (stage) => set({ stage }),
      setTopic: (topic) => set({ topic }),
      setResearchPlan: (plan) => set({ researchPlan: plan }),
      setScoredAbstracts: (abstracts) => set({ scoredAbstracts: abstracts }),
      setFinalReport: (report) => set({ finalReport: report }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      
      reset: () => set({
        stage: 'IDLE',
        topic: '',
        researchPlan: null,
        scoredAbstracts: [],
        finalReport: '',
        loading: false,
        error: null,
      })
    }),
    {
      name: 'pubmed-rag-storage', // 在localStorage中的存储名称
    }
  )
)