// ty-hei/rag/RAG-a5f2999dcbcb56fd0b4be65925d4f800bb62e21e/lib/store.ts
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { Storage } from "@plasmohq/storage"
import type { AppState } from "./types"

// 创建一个基于 chrome.storage.local 的存储实例
// 这将确保 background, sidepanel, options 等所有部分共享同一个数据源
const chromeStorage = new Storage({
  area: "local"
})

// 为 Zustand 的 persist 中间件创建一个兼容的存储适配器
const zustandChromeStorage = {
  getItem: async (name: string): Promise<string | null> => {
    // 从 chrome.storage 中获取数据
    return (await chromeStorage.get(name)) || null
  },
  setItem: async (name: string, value: string): Promise<void> => {
    // 将数据存入 chrome.storage
    await chromeStorage.set(name, value)
  },
  removeItem: async (name: string): Promise<void> => {
    // 从 chrome.storage 中移除数据
    await chromeStorage.remove(name)
  }
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      stage: "IDLE",
      topic: "",
      researchPlan: null,
      scoredAbstracts: [],
      finalReport: "",
      loading: false,
      error: null,

      setStage: (stage) => set({ stage }),
      setTopic: (topic) => set({ topic }),
      setResearchPlan: (plan) => set({ researchPlan: plan }),
      setScoredAbstracts: (abstracts) => set({ scoredAbstracts: abstracts }),
      setFinalReport: (report) => set({ finalReport: report }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),

      reset: () =>
        set({
          stage: "IDLE",
          topic: "",
          researchPlan: null,
          scoredAbstracts: [],
          finalReport: "",
          loading: false,
          error: null
        })
    }),
    {
      name: "pubmed-rag-storage", // 存储的键名
      // 【核心变更】指定使用我们自定义的、基于 chrome.storage 的存储引擎
      // createJSONStorage 会自动处理 JSON 的序列化和反序列化
      storage: createJSONStorage(() => zustandChromeStorage)
    }
  )
)