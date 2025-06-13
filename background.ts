// RAG-main/background.ts

import { Storage } from "@plasmohq/storage"
import { v4 as uuidv4 } from 'uuid';

import { callLlm } from "./lib/llm"
import { researchStrategistPrompt, refinePlanPrompt, literatureReviewerPrompt, synthesisWriterPrompt } from "./lib/prompts"
import { useStore } from "./lib/store"
import type { LLMConfig, ResearchPlan, FetchedArticle, ScoredArticle } from "./lib/types"

chrome.runtime.onInstalled.addListener(() => { console.log("PubMed RAG Assistant installed.") });
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;
  if (info.status !== "complete") return;
  const url = new URL(tab.url);
  if (url.origin === "https://pubmed.ncbi.nlm.nih.gov") {
    await chrome.sidePanel.setOptions({ tabId, path: "sidepanel.html", enabled: true });
  } else {
    await chrome.sidePanel.setOptions({ tabId, enabled: false });
  }
});

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === "START_RESEARCH") {
    await handleStartResearch(message.topic, message.sessionId);
  } else if (message.type === "REFINE_PLAN") {
    await handleRefinePlan(message.sessionId, message.feedback);
  } else if (message.type === "EXECUTE_SEARCH") {
    await handleExecuteSearch(message.plan, message.sessionId);
  } else if (message.type === "START_GATHERING") {
    await handleStartGathering(message.sessionId, message.articles);
  } else if (message.type === "SCRAPE_ACTIVE_TAB") {
    await handleScrapeActiveTab(message.sessionId, message.pmid);
  } else if (message.type === "SYNTHESIZE_REPORT") {
    await handleSynthesizeReport(message.sessionId);
  }
});

const notifySidePanel = (message: any) => {
  chrome.runtime.sendMessage(message).catch((err) => {
    if (err.message.includes("Could not establish connection")) {} else {
      console.error("Error sending message to side panel:", err)
    }
  });
};

// ... 其他 handle 函数保持不变 ...
async function handleStartResearch(topic: string, sessionId: string) {
  const { updateSessionById } = useStore.getState();
  await useStore.persist.rehydrate();
  updateSessionById(sessionId, { loading: true, stage: "PLANNING", topic: topic, error: null });
  try {
    const storage = new Storage({ area: "local" })
    const config = await storage.get<LLMConfig>("llmConfig")
    if (!config?.apiKey) throw new Error("API密钥未配置。请在设置页面中设置。")
    const prompt = researchStrategistPrompt(topic)
    const llmResponse = await callLlm(prompt, config, config.fastModel, "json")
    const cleanedResponse = llmResponse.trim().replace(/^```json\s*/, "").replace(/\s*```$/, "")
    let plan: ResearchPlan = JSON.parse(cleanedResponse);
    plan = ensureSubQuestionIds(plan);
    updateSessionById(sessionId, { researchPlan: plan, stage: "SCREENING", loading: false });
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" })
  } catch (err) {
    const errorMessage = err instanceof SyntaxError ? "无法解析AI模型的返回结果，请稍后重试。" : err.message
    updateSessionById(sessionId, { error: errorMessage, loading: false, stage: "IDLE" });
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" })
  }
}
async function handleRefinePlan(sessionId: string, feedback: string) {
  const { updateSessionById } = useStore.getState();
  await useStore.persist.rehydrate();
  const currentSession = useStore.getState().sessions.find(s => s.id === sessionId);
  if (!currentSession || !currentSession.researchPlan) {
    updateSessionById(sessionId, { error: "无法优化计划：未找到当前研究计划。", loading: false });
    return;
  }
  updateSessionById(sessionId, { loading: true, error: null });
  try {
    const storage = new Storage({ area: "local" })
    const config = await storage.get<LLMConfig>("llmConfig");
    if (!config?.apiKey) throw new Error("API密钥未配置。请在设置页面中设置。")
    const prompt = refinePlanPrompt(currentSession.topic, currentSession.researchPlan, feedback);
    const llmResponse = await callLlm(prompt, config, config.fastModel, "json");
    const cleanedResponse = llmResponse.trim().replace(/^```json\s*/, "").replace(/\s*```$/, "");
    let refinedPlan: ResearchPlan = JSON.parse(cleanedResponse);
    refinedPlan = ensureSubQuestionIds(refinedPlan);
    updateSessionById(sessionId, { researchPlan: refinedPlan, loading: false });
  } catch (err) {
    const errorMessage = err instanceof SyntaxError ? "无法解析AI模型的返回结果，请稍后重试。" : err.message;
    updateSessionById(sessionId, { error: errorMessage, loading: false });
  } finally {
      notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  }
}
async function handleExecuteSearch(plan: ResearchPlan, sessionId: string) {
  const { updateSessionById } = useStore.getState();
  await useStore.persist.rehydrate();
  updateSessionById(sessionId, { loading: true, stage: "SCREENING", error: null });
  try {
    const allKeywords = plan.subQuestions.flatMap(sq => sq.keywords).filter(Boolean);
    const uniqueKeywords = [...new Set(allKeywords)];
    if (uniqueKeywords.length === 0) {
      throw new Error("研究计划中没有任何关键词，请检查计划。")
    }
    const searchTerm = uniqueKeywords.join(" OR ");
    const esearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchTerm)}&retmax=20&retmode=json`;
    const esearchResponse = await fetch(esearchUrl);
    if (!esearchResponse.ok) throw new Error(`PubMed ESearch API failed with status: ${esearchResponse.status}`);
    const esearchData = await esearchResponse.json();
    const pmids: string[] = esearchData.esearchresult?.idlist || [];

    if (pmids.length === 0) {
      throw new Error("未能从PubMed找到任何相关文献。请尝试调整关键词。");
    }
    const efetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmids.join(",")}&rettype=abstract&retmode=xml`;
    const efetchResponse = await fetch(efetchUrl);
    if (!efetchResponse.ok) throw new Error(`PubMed EFetch API failed with status: ${efetchResponse.status}`);
    const xmlText = await efetchResponse.text();
    const articles: FetchedArticle[] = pmids.map(pmid => {
      const articleRegex = new RegExp(`<PubmedArticle>.*?<PMID Version="1">${pmid}</PMID>.*?<ArticleTitle>(.*?)</ArticleTitle>.*?<Abstract>(.*?)</Abstract>.*?</PubmedArticle>`, "s");
      const match = xmlText.match(articleRegex);
      if (match) {
        const title = match[1].replace(/<\/?(b|i|sup|sub)>/g, "").trim();
        const abstractParts = [...match[2].matchAll(/<AbstractText.*?>(.*?)<\/AbstractText>/gs)].map(part => part[1]);
        const abstract = abstractParts.join(" ").replace(/<\/?(b|i|sup|sub)>/g, "").trim() || "No abstract available in the fetched data.";
        return { pmid, title, abstract };
      }
      return null
    }).filter(Boolean) as FetchedArticle[];
    
    const storage = new Storage({ area: "local" })
    const config = await storage.get<LLMConfig>("llmConfig");
    if (!config?.apiKey) throw new Error("API密钥未配置。");
    const reviewPrompt = literatureReviewerPrompt(plan, articles);
    const llmResponse = await callLlm(reviewPrompt, config, config.fastModel, "json");
    const cleanedResponse = llmResponse.trim().replace(/^```json\s*/, "").replace(/\s*```$/, "");
    const reviews: { pmid: string; score: number; reason: string }[] = JSON.parse(cleanedResponse);
    const scoredAbstracts: ScoredArticle[] = articles.map(article => {
      const review = reviews.find(r => r.pmid === article.pmid);
      return { ...article, score: review?.score || 0, reason: review?.reason || "AI未提供评估意见。" };
    }).sort((a, b) => b.score - a.score);
    updateSessionById(sessionId, { scoredAbstracts, loading: false });
  } catch (err) {
    updateSessionById(sessionId, { error: err.message, loading: false });
  } finally {
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  }
}
function ensureSubQuestionIds(plan: ResearchPlan) {
  const seenIds = new Set<string>();
  const updatedSubQuestions = plan.subQuestions.map(sq => {
    let newId = sq.id;
    if (!newId || seenIds.has(newId)) newId = uuidv4();
    seenIds.add(newId);
    return { ...sq, id: newId };
  });
  return { ...plan, subQuestions: updatedSubQuestions };
}
async function handleStartGathering(sessionId: string, articles: ScoredArticle[]) {
  const { updateSessionById } = useStore.getState();
  await useStore.persist.rehydrate();
  updateSessionById(sessionId, {
    stage: 'GATHERING',
    articlesToFetch: articles,
    fullTexts: [],
    loading: false,
    error: null,
  });
  notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
}

// 【核心修改】重写此函数，用发消息替代注入
async function handleScrapeActiveTab(sessionId: string, pmid: string) {
  const { updateSessionById, getActiveSession } = useStore.getState();
  await useStore.persist.rehydrate();

  updateSessionById(sessionId, { loading: true, error: null });
  notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0] || !tabs[0].id) {
      throw new Error("找不到有效的激活标签页。");
    }
    const tabId = tabs[0].id;

    // 向内容脚本发送抓取指令
    chrome.tabs.sendMessage(tabId, { type: "DO_SCRAPE" });

    // 等待内容脚本返回结果
    const scrapedText = await new Promise<string>((resolve, reject) => {
      const listener = (message: any) => {
        // 确保消息是我们想要的，因为后台会收到所有消息
        if (message.type === 'SCRAPED_CONTENT' || message.type === 'SCRAPING_FAILED') {
          chrome.runtime.onMessage.removeListener(listener);
          if (message.type === 'SCRAPED_CONTENT') {
            resolve(message.payload.text);
          } else {
            reject(new Error(message.payload.error));
          }
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener);
        reject(new Error("抓取超时。内容脚本没有在规定时间内返回信息。"));
      }, 20000);
    });

    const session = getActiveSession();
    if (session) {
      const newFullTexts = [...session.fullTexts, { pmid, text: scrapedText }];
      updateSessionById(sessionId, { fullTexts: newFullTexts, loading: false });
    }

  } catch (err) {
    console.error(`抓取标签页失败:`, err);
    updateSessionById(sessionId, { error: err.message, loading: false });
  } finally {
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  }
}

async function handleSynthesizeReport(sessionId: string) {
  const { updateSessionById, getActiveSession } = useStore.getState();
  await useStore.persist.rehydrate();
  updateSessionById(sessionId, { stage: 'SYNTHESIZING', loading: true, error: null });
  notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  try {
    const session = getActiveSession();
    if (!session || !session.researchPlan || session.fullTexts.length === 0) {
      throw new Error("无法生成报告：缺少研究计划或未抓取到任何全文。");
    }
    const storage = new Storage({ area: "local" });
    const config = await storage.get<LLMConfig>("llmConfig");
    if (!config?.apiKey) throw new Error("API密钥未配置。");
    const synthesisPrompt = synthesisWriterPrompt(session.researchPlan, session.fullTexts);
    const finalReport = await callLlm(synthesisPrompt, config, config.smartModel, "text");
    updateSessionById(sessionId, { finalReport, stage: 'DONE', loading: false });
  } catch (err) {
    console.error("报告合成阶段发生错误:", err);
    updateSessionById(sessionId, { error: err.message, loading: false });
  } finally {
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  }
}