// ty-hei/rag/RAG-a5f2999dcbcb56fd0b4be65925d4f800bb62e21e/background.ts
import { Storage } from "@plasmohq/storage"

import { callLlm } from "./lib/llm"
import { researchStrategistPrompt } from "./lib/prompts"
import { useStore } from "./lib/store"
import type { LLMConfig, ResearchPlan } from "./lib/types"

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

// 全局消息监听器，处理来自UI的事件
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === "START_RESEARCH") {
    await handleStartResearch(message.topic)
  }
  // 在后续里程碑中添加对其它消息的处理
  // if (message.type === "EXECUTE_SEARCH") { ... }
  // if (message.type === "GET_FULL_TEXT_AND_SYNTHESIZE") { ... }
})

/**
 * 向活动的侧边栏发送消息，并优雅地处理无接收者的情况。
 * @param message 要发送的消息
 */
const notifySidePanel = (message: any) => {
  chrome.runtime.sendMessage(message).catch((err) => {
    // 如果没有侧边栏打开来接收消息，会产生一个错误，这是正常现象，可以忽略。
    if (err.message.includes("Could not establish connection")) {
      // Silently ignore.
    } else {
      console.error("Error sending message to side panel:", err)
    }
  })
}

/**
 * 【核心逻辑】处理研究启动请求
 * @param topic 用户输入的研究主题
 */
async function handleStartResearch(topic: string) {
  useStore.setState({
    loading: true,
    stage: "PLANNING",
    topic: topic,
    error: null
  })

  try {
    const storage = new Storage({ area: "local" })
    const config = await storage.get<LLMConfig>("llmConfig")

    if (!config?.apiKey) {
      throw new Error("API密钥未配置。请在设置页面中设置。")
    }

    const prompt = researchStrategistPrompt(topic)
    console.log("Calling LLM for research plan using fast model...")
    const llmResponse = await callLlm(
      prompt,
      config,
      config.fastModel,
      "json"
    )
    
    const cleanedResponse = llmResponse
      .trim()
      .replace(/^```json\s*/, "")
      .replace(/\s*```$/, "")
    
    const plan: ResearchPlan = JSON.parse(cleanedResponse)

    useStore.setState({ researchPlan: plan, stage: "SCREENING", loading: false })
    console.log("Research plan generated:", plan)
    
    // 【核心变更】通知侧边栏状态已更新
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" })

  } catch (err) {
    console.error("Error during research planning:", err)
    const errorMessage =
      err instanceof SyntaxError
        ? "无法解析AI模型的返回结果，请稍后重试。"
        : err.message
    useStore.setState({ error: errorMessage, loading: false, stage: "IDLE" })

    // 【核心变更】即使失败，也要通知侧边栏更新状态以显示错误信息
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" })
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