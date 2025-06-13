// background.ts
import { Storage } from "@plasmohq/storage"
import { v4 as uuidv4 } from 'uuid';

import { callLlm } from "./lib/llm"
import { researchStrategistPrompt, refinePlanPrompt } from "./lib/prompts"
import { useStore } from "./lib/store"
import type { LLMConfig, ResearchPlan, ResearchSession, SubQuestion } from "./lib/types"

chrome.runtime.onInstalled.addListener(() => {
  console.log("PubMed RAG Assistant installed.")
})

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error))

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return
  if (info.status !== "complete") return 
  const url = new URL(tab.url)
  if (url.origin === "https://pubmed.ncbi.nlm.nih.gov") {
    await chrome.sidePanel.setOptions({
      tabId,
      path: "sidepanel.html",
      enabled: true
    })
  } else {
    await chrome.sidePanel.setOptions({
      tabId,
      enabled: false
    })
  }
})

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === "START_RESEARCH") {
    await handleStartResearch(message.topic, message.sessionId)
  }
  // 【核心变更】添加新的消息监听
  if (message.type === "REFINE_PLAN") {
    await handleRefinePlan(message.sessionId, message.feedback);
  }
})

const notifySidePanel = (message: any) => {
  chrome.runtime.sendMessage(message).catch((err) => {
    if (err.message.includes("Could not establish connection")) {
      // Silently ignore.
    } else {
      console.error("Error sending message to side panel:", err)
    }
  })
}

/**
 * 确保从LLM返回的计划中的每个子问题都有一个唯一的ID。
 * AI可能会忘记或生成重复/空的ID。
 */
const ensureSubQuestionIds = (plan: ResearchPlan): ResearchPlan => {
  const seenIds = new Set<string>();
  const updatedSubQuestions = plan.subQuestions.map(sq => {
    let newId = sq.id;
    if (!newId || seenIds.has(newId)) {
      newId = uuidv4();
    }
    seenIds.add(newId);
    return { ...sq, id: newId };
  });
  return { ...plan, subQuestions: updatedSubQuestions };
}


async function handleStartResearch(topic: string, sessionId: string) {
  const { updateSessionById } = useStore.getState();
  await useStore.persist.rehydrate();
  
  updateSessionById(sessionId, { loading: true, stage: "PLANNING", topic: topic, error: null });

  try {
    const storage = new Storage({ area: "local" })
    const config = await storage.get<LLMConfig>("llmConfig")
    if (!config?.apiKey) throw new Error("API密钥未配置。请在设置页面中设置。")

    const prompt = researchStrategistPrompt(topic)
    console.log("Calling LLM for research plan...")
    const llmResponse = await callLlm(prompt, config, config.fastModel, "json")
    
    const cleanedResponse = llmResponse.trim().replace(/^```json\s*/, "").replace(/\s*```$/, "")
    let plan: ResearchPlan = JSON.parse(cleanedResponse);
    plan = ensureSubQuestionIds(plan); // 确保ID唯一

    updateSessionById(sessionId, { researchPlan: plan, stage: "SCREENING", loading: false });
    console.log("Research plan generated:", plan)
    
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" })

  } catch (err) {
    console.error("Error during research planning:", err)
    const errorMessage = err instanceof SyntaxError ? "无法解析AI模型的返回结果，请稍后重试。" : err.message
    updateSessionById(sessionId, { error: errorMessage, loading: false, stage: "IDLE" });
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" })
  }
}

// 【核心变更】新增处理计划优化请求的函数
async function handleRefinePlan(sessionId: string, feedback: string) {
  const { updateSessionById, sessions } = useStore.getState();
  await useStore.persist.rehydrate();

  const currentSession = useStore.getState().sessions.find(s => s.id === sessionId);

  if (!currentSession || !currentSession.researchPlan) {
    console.error("Refinement failed: No active session or research plan found.");
    updateSessionById(sessionId, { error: "无法优化计划：未找到当前研究计划。", loading: false });
    return;
  }

  updateSessionById(sessionId, { loading: true, error: null });

  try {
    const storage = new Storage({ area: "local" })
    const config = await storage.get<LLMConfig>("llmConfig");
    if (!config?.apiKey) throw new Error("API密钥未配置。请在设置页面中设置。")

    const prompt = refinePlanPrompt(currentSession.topic, currentSession.researchPlan, feedback);
    console.log("Calling LLM to refine research plan...");
    const llmResponse = await callLlm(prompt, config, config.fastModel, "json");
    
    const cleanedResponse = llmResponse.trim().replace(/^```json\s*/, "").replace(/\s*```$/, "");
    let refinedPlan: ResearchPlan = JSON.parse(cleanedResponse);
    refinedPlan = ensureSubQuestionIds(refinedPlan); // 再次确保ID的唯一性

    updateSessionById(sessionId, { researchPlan: refinedPlan, loading: false });
    console.log("Research plan refined:", refinedPlan);

    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });

  } catch (err) {
    console.error("Error during plan refinement:", err);
    const errorMessage = err instanceof SyntaxError ? "无法解析AI模型的返回结果，请稍后重试。" : err.message;
    updateSessionById(sessionId, { error: errorMessage, loading: false });
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  }
}


chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url) return
  const url = new URL(tab.url)
  if (url.origin === "https://pubmed.ncbi.nlm.nih.gov") {
    await chrome.sidePanel.open({ tabId: tab.id! })
  }
})