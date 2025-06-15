// RAG-main/lib/store.ts

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { Storage } from "@plasmohq/storage"
import type { AppState, ResearchSession } from "../lib/types"

const chromeStorage = new Storage({
  area: "local"
})

const zustandChromeStorage = {
  getItem: async (name:string): Promise<string | null> => {
    return (await chromeStorage.get(name)) || null
  },
  setItem: async (name:string, value:string): Promise<void> => {
    await chromeStorage.set(name, value)
  },
  removeItem: async (name:string): Promise<void> => {
    await chromeStorage.remove(name)
  }
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,

      getActiveSession: () => {
        const { sessions, activeSessionId } = get()
        return sessions.find((s) => s.id === activeSessionId) || null
      },
      
      addSession: (topic: string) => {
        const newSession: ResearchSession = {
          id: Date.now().toString(),
          name: topic.length > 50 ? topic.substring(0, 47) + '...' : topic,
          createdAt: Date.now(),
          stage: "IDLE",
          topic: topic,
          researchPlan: null,
          pubmedQuery: null,
          clinicalTrialsQuery: null,
          rawArticles: [],
          scoredAbstracts: [],
          webResults: [], // 初始化
          loadingMessage: null,
          articlesToFetch: [],
          fullTexts: [],
          finalReport: "",
          loading: false,
          error: null,
          lastFailedAction: null,
          log: [`[${new Date().toLocaleTimeString()}] 会话已创建: "${topic}"`],
          gatheringIndex: 0,
          clinicalTrials: [],
        }
        set((state) => ({
          sessions: [...state.sessions, newSession],
          activeSessionId: newSession.id
        }));
        return newSession.id;
      },

      switchSession: (sessionId: string | null) => {
        set({ activeSessionId: sessionId })
      },
      
      deleteSession: (sessionId: string) => {
        set((state) => {
          const newSessions = state.sessions.filter(s => s.id !== sessionId);
          let newActiveId = state.activeSessionId;
          if(state.activeSessionId === sessionId) {
            newActiveId = newSessions.length > 0 ? newSessions[0].id : null;
          }
          return { sessions: newSessions, activeSessionId: newActiveId };
        })
      },
      
      renameSession: (sessionId: string, newName: string) => {
        set(state => ({
          sessions: state.sessions.map(s => s.id === sessionId ? {...s, name: newName} : s)
        }))
      },

      updateActiveSession: (update: Partial<Omit<ResearchSession, 'id' | 'createdAt'>>) => {
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === state.activeSessionId
              ? { ...session, ...update }
              : session
          )
        }))
      },
      
      updateSessionById: (sessionId: string, update: Partial<Omit<ResearchSession, 'id' | 'createdAt'>>) => {
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId
              ? { ...session, ...update }
              : session
          )
        }))
      },

      resetActiveSession: () => {
        set((state) => ({
          sessions: state.sessions.map((session) => {
            if (session.id === state.activeSessionId) {
              return {
                ...session,
                stage: "IDLE",
                researchPlan: null,
                pubmedQuery: null,
                clinicalTrialsQuery: null, 
                rawArticles: [],
                scoredAbstracts: [],
                webResults: [], // 重置
                loadingMessage: null,
                articlesToFetch: [],
                fullTexts: [],
                finalReport: "",
                loading: false,
                error: null,
                lastFailedAction: null,
                log: [`[${new Date().toLocaleTimeString()}] 会话已重置.`],
                gatheringIndex: 0,
                clinicalTrials: [],
              };
            }
            return session;
          })
        }));
      }

    }),
    {
      name: "pubmed-rag-storage-v2",
      storage: createJSONStorage(() => zustandChromeStorage)
    }
  )
)