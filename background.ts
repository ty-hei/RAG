// background.ts

import { Storage } from "@plasmohq/storage"
import type { LLMConfig, ResearchPlan } from "./lib/types"
import { callLlm } from "./lib/llm"
import { researchStrategistPrompt } from "./lib/prompts"
import { useStore } from "./lib/store"

// 当插件安装时运行
chrome.runtime.onInstalled.addListener(() => {
  console.log("PubMed RAG Assistant installed.")
})

// 设置点击插件图标时打开侧边栏
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error))

// 监听标签页更新事件，以便在用户导航到 PubMed 时启用侧边栏图标
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return
  if (info.status !== "complete") return // 确保页面加载完成后再操作

  const url = new URL(tab.url)
  if (url.origin === "https://pubmed.ncbi.nlm.nih.gov") {
    await chrome.sidePanel.setOptions({
      tabId,
      path: "sidepanel.html",
      enabled: true
    })
  } else {
    // 在其他网站禁用侧边栏
    await chrome.sidePanel.setOptions({
      tabId,
      enabled: false
    })
  }
})

// 【新增】全局消息监听器，处理来自UI的事件
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === "START_RESEARCH") {
    await handleStartResearch(message.topic)
  }
  // 在后续里程碑中添加对其它消息的处理
  // if (message.type === "EXECUTE_SEARCH") { ... }
  // if (message.type === "GET_FULL_TEXT_AND_SYNTHESIZE") { ... }
})

/**
 * 【核心逻辑】处理研究启动请求
 * @param topic 用户输入的研究主题
 */
async function handleStartResearch(topic: string) {
  const { setState } = useStore

  // 1. 更新Zustand状态，通知UI进入加载状态
  setState({ loading: true, stage: "PLANNING", topic: topic, error: null })

  try {
    // 2. 从Chrome Storage获取LLM配置
    const storage = new Storage({ area: "local" })
    const config = await storage.get<LLMConfig>("llmConfig")

    if (!config?.apiKey) {
      throw new Error("API密钥未配置。请在设置页面中设置。")
    }

    // 3. 调用LLM（使用快速模型）生成研究计划
    const prompt = researchStrategistPrompt(topic)
    console.log("Calling LLM for research plan using fast model...")
    const llmResponse = await callLlm(
      prompt,
      config,
      config.fastModel,
      "json"
    )
    const plan: ResearchPlan = JSON.parse(llmResponse)

    // 4. 将生成的计划保存到Zustand状态中，并进入下一步
    setState({ researchPlan: plan, stage: "SCREENING", loading: false })
    console.log("Research plan generated:", plan)
  } catch (err) {
    console.error("Error during research planning:", err)
    // 5. 如果发生错误，更新Zustand状态以显示错误信息
    setState({ error: err.message, loading: false, stage: "IDLE" })
  }
}

// 保留此监听器以确保在PubMed页面点击图标总能打开侧边栏
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url) return

  const url = new URL(tab.url)
  if (url.origin === "https://pubmed.ncbi.nlm.nih.gov") {
    await chrome.sidePanel.open({ tabId: tab.id! })
  }
})