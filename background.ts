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

// ... 其他消息监听和函数保持不变 ...
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === "START_RESEARCH") {
    await handleStartResearch(message.topic, message.sessionId)
  }
  if (message.type === "REFINE_PLAN") {
    await handleRefinePlan(message.sessionId, message.feedback);
  }
  if (message.type === "EXECUTE_SEARCH") {
    await handleExecuteSearch(message.plan, message.sessionId);
  }
  if (message.type === "GENERATE_REPORT") {
    await handleGenerateReport(message.sessionId, message.articles);
  }
})
const notifySidePanel = (message: any) => {
  chrome.runtime.sendMessage(message).catch((err) => {
    if (err.message.includes("Could not establish connection")) {} else {
      console.error("Error sending message to side panel:", err)
    }
  })
}
const ensureSubQuestionIds = (plan: ResearchPlan) => {
  const seenIds = new Set<string>();
  const updatedSubQuestions = plan.subQuestions.map(sq => {
    let newId = sq.id;
    if (!newId || seenIds.has(newId)) newId = uuidv4();
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

async function handleGenerateReport(sessionId: string, articles: ScoredArticle[]) {
  const { updateSessionById } = useStore.getState();
  await useStore.persist.rehydrate();
  updateSessionById(sessionId, { loading: true, stage: "SYNTHESIZING", error: null });
  notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  
  try {
    const storage = new Storage({ area: "local" })
    const config = await storage.get<LLMConfig>("llmConfig");
    if (!config?.apiKey) throw new Error("API密钥未配置。");

    const fullTexts: { pmid: string, text: string }[] = [];
    const rateLimit = (config.fetchRateLimit || 15) * 1000;

    for (const article of articles) {
      const url = `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`;
      const scrapedText = await scrapeArticleText(url, config.manualScrapingConfirmation);

      if (scrapedText) {
        fullTexts.push({ pmid: article.pmid, text: scrapedText });
      }
      
      if (articles.indexOf(article) < articles.length - 1) {
        await new Promise(resolve => setTimeout(resolve, rateLimit)); 
      }
    }
    
    if (fullTexts.length === 0) {
      throw new Error("没有成功抓取到任何文章的全文，无法生成报告。")
    }

    const currentSession = useStore.getState().sessions.find(s => s.id === sessionId);
    if (!currentSession?.researchPlan) throw new Error("无法找到当前研究计划以生成报告。");
    
    const synthesisPrompt = synthesisWriterPrompt(currentSession.researchPlan, fullTexts);
    const finalReport = await callLlm(synthesisPrompt, config, config.smartModel, "text");

    updateSessionById(sessionId, { finalReport, stage: 'DONE', loading: false });

  } catch(err) {
    console.error("Error during report generation phase:", err);
    updateSessionById(sessionId, { error: err.message, loading: false });
  } finally {
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  }
}

async function scrapeArticleText(url: string, isManual: boolean): Promise<string | null> {
  return new Promise(async (resolve, reject) => {
    let tabId: number | undefined;

    const cleanup = (listener: any, shouldCloseTab: boolean = true) => {
      chrome.runtime.onMessage.removeListener(listener);
      if (tabId && shouldCloseTab) {
        chrome.tabs.remove(tabId).catch(e => console.log(`Error closing tab ${tabId}: ${e.message}`));
      }
    };

    const messageListener = (message: any, sender: chrome.runtime.MessageSender) => {
      if (sender.tab?.id !== tabId) return;

      if (!isManual) {
        if (message.type === "SCRAPED_CONTENT") {
          cleanup(messageListener);
          resolve(message.payload.text);
        } else if (message.type === "SCRAPING_FAILED") {
          cleanup(messageListener);
          reject(new Error(`Failed to scrape ${url}: ${message.payload.error}`));
        }
        return;
      }
      
      switch (message.type) {
        case 'CONFIRM_SCRAPE':
          // 【核心修正】注入两个脚本，路径已简化
          chrome.scripting.executeScript({
              target: { tabId: tabId! },
              files: ["Readability.js", "scraper.js"],
          });
          break;
        case 'SCRAPED_CONTENT':
          cleanup(messageListener);
          resolve(message.payload.text);
          break;
        case 'SKIP_ARTICLE':
          cleanup(messageListener);
          resolve(null);
          break;
        case 'SCRAPING_FAILED':
          cleanup(messageListener);
          reject(new Error(`Failed to scrape ${url}: ${message.payload.error}`));
          break;
      }
    };
    
    chrome.runtime.onMessage.addListener(messageListener);

    try {
      const tab = await chrome.tabs.create({ url, active: isManual });
      tabId = tab.id;

      const tabUpdateListener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
        if (updatedTabId === tabId && info.status === "complete" && tab.url?.startsWith("http")) {
          chrome.tabs.onUpdated.removeListener(tabUpdateListener);
          
          // 【核心修正】根据模式，注入正确的、路径已简化的脚本
          const scriptsToInject = isManual 
            ? ["confirmation.js"] 
            : ["Readability.js", "scraper.js"];
          
          console.log(`Injecting scripts '${scriptsToInject.join(', ')}' into tab ${tabId}`);
          chrome.scripting.executeScript({
            target: { tabId: tabId! },
            files: scriptsToInject,
          }).catch(err => {
            const detailedError = `\n>>>>>>>>>> RAG ASSISTANT DEBUG <<<<<<<<<<\nFailed to inject scripts '${scriptsToInject.join(', ')}' into ${tab.url}.\nREASON: ${err.message}\nTROUBLESHOOTING:\n1. Did you run 'pnpm build' after adding/changing the content script file?\n2. Is the file path in 'package.json' under 'web_accessible_resources' correct?\n3. Was the extension reloaded after the build?\nThe tab will remain open for debugging.\n>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<`;
            console.error(detailedError);
            cleanup(messageListener, false); 
            reject(new Error(`注入脚本失败: ${scriptsToInject.join(', ')}`));
          });
        }
      };
      chrome.tabs.onUpdated.addListener(tabUpdateListener);

    } catch (e) {
      cleanup(messageListener);
      reject(e);
    }
  });
}