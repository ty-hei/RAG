// background.ts
import { Storage } from "@plasmohq/storage"
import { v4 as uuidv4 } from 'uuid';

import { callLlm } from "./lib/llm"
import { researchStrategistPrompt, refinePlanPrompt, literatureReviewerPrompt } from "./lib/prompts"
import { useStore } from "./lib/store"
import type { LLMConfig, ResearchPlan, ResearchSession, SubQuestion, FetchedArticle, ScoredArticle } from "./lib/types"

// ... (onInstalled, sidePanel, onUpdated listeners remain the same) ...
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
    await handleStartResearch(message.topic, message.sessionId)
  }
  if (message.type === "REFINE_PLAN") {
    await handleRefinePlan(message.sessionId, message.feedback);
  }
  if (message.type === "EXECUTE_SEARCH") {
    await handleExecuteSearch(message.plan, message.sessionId);
  }
})

const notifySidePanel = (message: any) => {
  chrome.runtime.sendMessage(message).catch((err) => {
    if (err.message.includes("Could not establish connection")) {} else {
      console.error("Error sending message to side panel:", err)
    }
  })
}

const ensureSubQuestionIds = (plan: ResearchPlan): ResearchPlan => {
  const seenIds = new Set<string>();
  const updatedSubQuestions = plan.subQuestions.map(sq => {
    let newId = sq.id;
    if (!newId || seenIds.has(newId)) newId = uuidv4();
    seenIds.add(newId);
    return { ...sq, id: newId };
  });
  return { ...plan, subQuestions: updatedSubQuestions };
}

// ... (handleStartResearch 和 handleRefinePlan 的代码保持原样，此处省略以保持简洁)
const DUMMY_HANDLE_START_RESEARCH = () => {};
const DUMMY_HANDLE_REFINE_PLAN = () => {};


// 【核心变更】重写此函数，使用PubMed E-utilities API代替屏幕抓取
async function handleExecuteSearch(plan: ResearchPlan, sessionId: string) {
  const { updateSessionById } = useStore.getState();
  await useStore.persist.rehydrate();
  updateSessionById(sessionId, { loading: true, stage: "SCREENING", error: null });
  
  try {
    // 步骤 1: 组合关键词
    const allKeywords = plan.subQuestions.flatMap(sq => sq.keywords);
    const uniqueKeywords = [...new Set(allKeywords)];
    const searchTerm = uniqueKeywords.join(" OR ");
    
    // 步骤 2: ESearch - 使用关键词获取文章PMID列表
    console.log(`Step 1: ESearching PubMed for PMIDs with term: "${searchTerm}"`);
    const esearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchTerm)}&retmax=20&retmode=json`;
    const esearchResponse = await fetch(esearchUrl);
    if (!esearchResponse.ok) throw new Error(`PubMed ESearch API failed with status: ${esearchResponse.status}`);
    const esearchData = await esearchResponse.json();
    const pmids: string[] = esearchData.esearchresult?.idlist || [];

    if (pmids.length === 0) {
      throw new Error("未能从PubMed找到任何相关文献。请尝试调整关键词。");
    }
    console.log(`Step 2: Found ${pmids.length} PMIDs. Now fetching details...`);

    // 步骤 3: EFetch - 使用PMID列表获取文章详细信息(包括摘要)
    // EFetch返回XML，我们将手动解析它，因为它比ESummary更可靠地返回摘要
    const efetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmids.join(",")}&rettype=abstract&retmode=xml`;
    const efetchResponse = await fetch(efetchUrl);
    if (!efetchResponse.ok) throw new Error(`PubMed EFetch API failed with status: ${efetchResponse.status}`);
    const xmlText = await efetchResponse.text();

    // 手动解析XML文本以提取文章信息
    const articles: FetchedArticle[] = pmids.map(pmid => {
      // 这是一个简单的XML解析技巧，对于PubMed的固定格式是有效的
      const articleRegex = new RegExp(`<PubmedArticle>.*?<PMID Version="1">${pmid}</PMID>.*?<ArticleTitle>(.*?)</ArticleTitle>.*?<Abstract>(.*?)</Abstract>.*?</PubmedArticle>`, "s");
      const match = xmlText.match(articleRegex);

      if (match) {
        const title = match[1].replace(/<\/?(b|i|sup|sub)>/g, "").trim(); // 清理标题中的一些标签
        // 摘要可能包含多个<AbstractText>标签，我们需要将它们全部拼接起来
        const abstractParts = [...match[2].matchAll(/<AbstractText.*?>(.*?)<\/AbstractText>/gs)].map(part => part[1]);
        const abstract = abstractParts.join(" ").replace(/<\/?(b|i|sup|sub)>/g, "").trim() || "No abstract available in the fetched data.";
        return { pmid, title, abstract };
      }
      return { pmid, title: "Title not found", abstract: "Abstract not found" };
    }).filter(article => article.title !== "Title not found"); // 过滤掉解析失败的文章

    console.log(`Step 3: Successfully parsed details for ${articles.length} articles.`);

    // 步骤 4: 调用LLM进行评估
    const storage = new Storage({ area: "local" })
    const config = await storage.get<LLMConfig>("llmConfig");
    if (!config?.apiKey) throw new Error("API密钥未配置。");
    
    const reviewPrompt = literatureReviewerPrompt(plan, articles);
    console.log(`Step 4: Calling LLM to review ${articles.length} abstracts...`);
    const llmResponse = await callLlm(reviewPrompt, config, config.fastModel, "json");
    const cleanedResponse = llmResponse.trim().replace(/^```json\s*/, "").replace(/\s*```$/, "");
    const reviews: { pmid: string; score: number; reason: string }[] = JSON.parse(cleanedResponse);

    // 步骤 5: 合并评分和原文信息
    const scoredAbstracts: ScoredArticle[] = articles.map(article => {
      const review = reviews.find(r => r.pmid === article.pmid);
      return {
        ...article,
        score: review?.score || 0,
        reason: review?.reason || "AI未提供评估意见。"
      };
    }).sort((a, b) => b.score - a.score);

    console.log("Step 5: Finished scoring abstracts.");
    
    // 步骤 6: 更新状态
    updateSessionById(sessionId, { scoredAbstracts, loading: false });

  } catch (err) {
    console.error("Error during search and screen phase:", err);
    updateSessionById(sessionId, { error: err.message, loading: false });
  } finally {
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  }
}

// ... (handleStartResearch 和 handleRefinePlan 的完整代码需要保留在这里)
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
    plan = ensureSubQuestionIds(plan);
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
async function handleRefinePlan(sessionId: string, feedback: string) {
  const { updateSessionById } = useStore.getState();
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
    refinedPlan = ensureSubQuestionIds(refinedPlan);
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