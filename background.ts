// RAG-main/background.ts

import { Storage } from "@plasmohq/storage"
import { v4 as uuidv4 } from 'uuid';

import { callLlm } from "./lib/llm"
import { researchStrategistPrompt, refinePlanPrompt, searchRefinerPrompt, literatureReviewerPrompt, synthesisWriterPrompt } from "./lib/prompts"
import { useStore } from "./lib/store"
import type { LLMConfig, ResearchPlan, FetchedArticle, ScoredArticle, ClinicalTrial } from "./lib/types"

async function addToLog(sessionId: string, message: string) {
    await useStore.persist.rehydrate();
    const { sessions, updateSessionById } = useStore.getState();
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
        const newLog = [...session.log, `[${new Date().toLocaleTimeString()}] ${message}`];
        updateSessionById(sessionId, { log: newLog });
        notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
    }
}

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
  } else if (message.type === "ADD_TO_LOG") {
    await addToLog(message.sessionId, message.message);
  }
});

const notifySidePanel = (message: any) => {
  chrome.runtime.sendMessage(message).catch((err) => {
    if (err.message.includes("Could not establish connection")) {} else {
      console.error("Error sending message to side panel:", err)
    }
  });
};

async function handleStartResearch(topic: string, sessionId: string) {
  const { updateSessionById } = useStore.getState();
  await useStore.persist.rehydrate();
  await addToLog(sessionId, `研究启动，主题: "${topic}"`);
  updateSessionById(sessionId, { loading: true, stage: "PLANNING", topic: topic, error: null });
  notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });

  try {
    const storage = new Storage({ area: "local" })
    const config = await storage.get<LLMConfig>("llmConfig")
    if (!config?.apiKey) throw new Error("API密钥未配置。请在设置页面中设置。")

    await addToLog(sessionId, "调用LLM生成初步研究计划...");
    const prompt = researchStrategistPrompt(topic)
    const llmResponse = await callLlm(prompt, config, config.fastModel, "json")
    const cleanedResponse = llmResponse.trim().replace(/^```json\s*/, "").replace(/\s*```$/, "")
    let plan: ResearchPlan = JSON.parse(cleanedResponse);
    plan = ensureSubQuestionIds(plan);
    
    await addToLog(sessionId, "研究计划已生成，等待用户审核。");
    updateSessionById(sessionId, { researchPlan: plan, stage: "PLANNING", loading: false });

  } catch (err) {
    const errorMessage = err instanceof SyntaxError ? "无法解析AI模型的返回结果，请稍后重试。" : err.message
    await addToLog(sessionId, `错误: ${errorMessage}`);
    updateSessionById(sessionId, { error: errorMessage, loading: false, stage: "IDLE" });
  } finally {
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  }
}

async function handleRefinePlan(sessionId: string, feedback: string) {
  const { updateSessionById } = useStore.getState();
  await useStore.persist.rehydrate();
  const currentSession = useStore.getState().sessions.find(s => s.id === sessionId);
  if (!currentSession || !currentSession.researchPlan) {
    const errorMsg = "无法优化计划：未找到当前研究计划。";
    await addToLog(sessionId, `错误: ${errorMsg}`);
    updateSessionById(sessionId, { error: errorMsg, loading: false });
    return;
  }
  
  await addToLog(sessionId, `收到用户反馈，正在优化计划: "${feedback}"`);
  updateSessionById(sessionId, { loading: true, error: null });
  notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  
  try {
    const storage = new Storage({ area: "local" })
    const config = await storage.get<LLMConfig>("llmConfig");
    if (!config?.apiKey) throw new Error("API密钥未配置。请在设置页面中设置。")
    
    const prompt = refinePlanPrompt(currentSession.topic, currentSession.researchPlan, feedback);
    const llmResponse = await callLlm(prompt, config, config.fastModel, "json");
    const cleanedResponse = llmResponse.trim().replace(/^```json\s*/, "").replace(/\s*```$/, "");
    let refinedPlan: ResearchPlan = JSON.parse(cleanedResponse);
    refinedPlan = ensureSubQuestionIds(refinedPlan);
    
    await addToLog(sessionId, "计划已根据反馈优化，等待用户审核。");
    updateSessionById(sessionId, { researchPlan: refinedPlan, loading: false });
  } catch (err) {
    const errorMessage = err instanceof SyntaxError ? "无法解析AI模型的返回结果，请稍后重试。" : err.message;
    await addToLog(sessionId, `错误: ${errorMessage}`);
    updateSessionById(sessionId, { error: errorMessage, loading: false });
  } finally {
      notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  }
}

async function handleExecuteSearch(plan: ResearchPlan, sessionId: string) {
  const { updateSessionById } = useStore.getState();
  await useStore.persist.rehydrate();
  
  await addToLog(sessionId, "计划已确认，开始执行多源信息检索...");
  updateSessionById(sessionId, {
    loading: true,
    loadingMessage: "正在组合关键词并准备并行检索...",
    stage: "SCREENING",
    error: null,
    pubmedQuery: null,
    rawArticles: [],
    scoredAbstracts: [],
    clinicalTrials: [],
  });
  notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });

  try {
    const allKeywords = plan.subQuestions.flatMap(sq => sq.keywords).filter(Boolean);
    const uniqueKeywords = [...new Set(allKeywords)];
    if (uniqueKeywords.length === 0) throw new Error("研究计划中没有任何关键词，请检查计划。")
    const searchTerm = uniqueKeywords.join(" OR ");
    
    await addToLog(sessionId, `通用检索词: ${searchTerm}`);
    updateSessionById(sessionId, { pubmedQuery: searchTerm });
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });

    await Promise.all([
      searchPubMed(plan, searchTerm, sessionId),
      searchClinicalTrials(searchTerm, sessionId)
    ]);

    updateSessionById(sessionId, { loading: false, loadingMessage: null });

  } catch (err) {
    await addToLog(sessionId, `错误: ${err.message}`);
    updateSessionById(sessionId, { error: err.message, loading: false, loadingMessage: null });
  } finally {
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  }
}

async function searchPubMed(plan: ResearchPlan, searchTerm: string, sessionId: string) {
    const { updateSessionById } = useStore.getState();
    await addToLog(sessionId, `[PubMed] 开始检索...`);
    
    const storage = new Storage({ area: "local" });
    const config = await storage.get<LLMConfig>("llmConfig");
    if (!config?.apiKey) throw new Error("[PubMed] API密钥未配置。");
    
    const esearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchTerm)}&retmax=50&retmode=json`;
    const esearchResponse = await fetch(esearchUrl);
    if (!esearchResponse.ok) throw new Error(`[PubMed] ESearch API 失败，状态: ${esearchResponse.status}`);
    const esearchData = await esearchResponse.json();
    const initialPmids: string[] = esearchData.esearchresult?.idlist || [];

    if (initialPmids.length === 0) {
      await addToLog(sessionId, "[PubMed] 未找到相关文献。");
      updateSessionById(sessionId, { rawArticles: [], loadingMessage: "PubMed检索完成，未找到文献。" });
      notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
      return;
    }
    
    await addToLog(sessionId, `[PubMed] 初步找到 ${initialPmids.length} 篇文献，正在获取摘要...`);
    updateSessionById(sessionId, { loadingMessage: `[PubMed] 找到 ${initialPmids.length} 篇文献，获取摘要中...` });
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
    
    const efetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${initialPmids.join(",")}&rettype=abstract&retmode=xml`;
    const efetchResponse = await fetch(efetchUrl);
    if (!efetchResponse.ok) throw new Error(`[PubMed] EFetch API 失败，状态: ${efetchResponse.status}`);
    const xmlText = await efetchResponse.text();
    
    const parseArticles = (pids: string[], text: string): FetchedArticle[] => pids.map(pmid => {
      const articleRegex = new RegExp(`<PubmedArticle>.*?<PMID Version="1">${pmid}</PMID>.*?<ArticleTitle>(.*?)</ArticleTitle>.*?<Abstract>(.*?)</Abstract>.*?</PubmedArticle>`, "s");
      const match = text.match(articleRegex);
      if (match) {
          const title = match[1].replace(/<\/?(b|i|sup|sub)>/g, "").trim();
          const abstractParts = [...match[2].matchAll(/<AbstractText.*?>(.*?)<\/AbstractText>/gs)].map(part => part[1]);
          const abstract = abstractParts.join(" ").replace(/<\/?(b|i|sup|sub)>/g, "").trim() || "No abstract available.";
          return { pmid, title, abstract };
      }
      return null;
    }).filter(Boolean) as FetchedArticle[];
    let combinedArticles = parseArticles(initialPmids, xmlText);
    
    updateSessionById(sessionId, { rawArticles: combinedArticles, loadingMessage: "[PubMed] 初步结果已获取，正在进行自我反思..." });
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
    await addToLog(sessionId, "[PubMed] 开始自我反思以优化检索...");
    
    const refinerPrompt = searchRefinerPrompt(plan, combinedArticles);
    const llmRefinerResponse = await callLlm(refinerPrompt, config, config.fastModel, "json");
    const { new_queries }: { new_queries: string[] } = JSON.parse(llmRefinerResponse.trim().replace(/^```json\s*/, "").replace(/\s*```$/, ""));
    
    if (new_queries && new_queries.length > 0) {
        await addToLog(sessionId, `[PubMed] AI识别到 ${new_queries.length} 个知识缺口，正在执行补充检索...`);
        const newPmids = new Set<string>();

        for (const query of new_queries) {
            await addToLog(sessionId, `[PubMed] 补充检索: "${query}"`);
            const supplEsearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=10&retmode=json`;
            const supplEsearchResponse = await fetch(supplEsearchUrl);
            if (supplEsearchResponse.ok) {
                const supplEsearchData = await supplEsearchResponse.json();
                const foundPimds: string[] = supplEsearchData.esearchresult?.idlist || [];
                foundPimds.forEach(pmid => newPmids.add(pmid));
            }
        }
        
        const existingPmidSet = new Set(combinedArticles.map(a => a.pmid));
        const uniqueNewPmids = [...newPmids].filter(pmid => !existingPmidSet.has(pmid));

        if (uniqueNewPmids.length > 0) {
            await addToLog(sessionId, `[PubMed] 补充检索找到 ${uniqueNewPmids.length} 篇新文献，正在获取摘要...`);
            const supplEfetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${uniqueNewPmids.join(",")}&rettype=abstract&retmode=xml`;
            const supplEfetchResponse = await fetch(supplEfetchUrl);
            if (supplEfetchResponse.ok) {
                const supplXmlText = await supplEfetchResponse.text();
                const newArticles = parseArticles(uniqueNewPmids, supplXmlText);
                combinedArticles.push(...newArticles);
                updateSessionById(sessionId, { rawArticles: combinedArticles });
                notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
            }
        } else {
            await addToLog(sessionId, "[PubMed] 补充检索未发现新的文献。");
        }
    } else {
        await addToLog(sessionId, "[PubMed] AI评估认为初步检索结果已足够全面。");
    }

    await addToLog(sessionId, `[PubMed] 共 ${combinedArticles.length} 篇文章待评估。`);
    updateSessionById(sessionId, { loadingMessage: `[PubMed] 正在调用AI评估 ${combinedArticles.length} 篇文章...` });
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
    
    const reviewPrompt = literatureReviewerPrompt(plan, combinedArticles);
    const llmReviewResponse = await callLlm(reviewPrompt, config, config.fastModel, "json");
    const reviews: { pmid: string; score: number; reason: string }[] = JSON.parse(llmReviewResponse.trim().replace(/^```json\s*/, "").replace(/\s*```$/, ""));
    
    const scoredAbstracts: ScoredArticle[] = combinedArticles.map(article => {
      const review = reviews.find(r => r.pmid === article.pmid);
      return { ...article, score: review?.score || 0, reason: review?.reason || "AI未提供评估意见。" };
    }).sort((a, b) => b.score - a.score);

    await addToLog(sessionId, "[PubMed] 文献评估完成。");
    updateSessionById(sessionId, { scoredAbstracts, rawArticles: [] });
}

async function searchClinicalTrials(searchTerm: string, sessionId: string) {
    const { updateSessionById } = useStore.getState();
    await addToLog(sessionId, `[ClinicalTrials.gov] 开始检索...`);
    updateSessionById(sessionId, { loadingMessage: "正在检索 ClinicalTrials.gov..."});
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });

    try {
        const fields = "NCTId,BriefTitle,OverallStatus,BriefSummary,Condition,InterventionName";
        const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(searchTerm)}&fields=${fields}&pageSize=15&format=json`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`API 请求失败，状态: ${response.status}`);
        
        const data = await response.json();
        const trials: ClinicalTrial[] = data.studies.map((study: any) => ({
            nctId: study.protocolSection.identificationModule.nctId,
            title: study.protocolSection.identificationModule.briefTitle,
            status: study.protocolSection.statusModule.overallStatus,
            summary: study.protocolSection.descriptionModule.briefSummary,
            conditions: study.protocolSection.conditionsModule.conditions,
            interventions: study.protocolSection.armsAndInterventionsModule.interventions.map((i:any) => i.name),
            url: `https://clinicaltrials.gov/study/${study.protocolSection.identificationModule.nctId}`
        }));

        await addToLog(sessionId, `[ClinicalTrials.gov] 找到 ${trials.length} 个相关临床试验。`);
        updateSessionById(sessionId, { clinicalTrials: trials });
    } catch (error) {
        await addToLog(sessionId, `[ClinicalTrials.gov] 检索失败: ${error.message}`);
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
  await addToLog(sessionId, `用户已选择 ${articles.length} 篇文章，进入全文抓取阶段。`);
  updateSessionById(sessionId, {
    stage: 'GATHERING',
    articlesToFetch: articles,
    fullTexts: [],
    loading: false,
    error: null,
    gatheringIndex: 0, 
  });
  notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
}

async function handleScrapeActiveTab(sessionId: string, pmid: string) {
  const { updateSessionById, sessions } = useStore.getState();
  await useStore.persist.rehydrate();
  
  await addToLog(sessionId, `请求抓取当前标签页内容 (目标PMID: ${pmid})...`);
  updateSessionById(sessionId, { loading: true, error: null });
  notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0] || !tabs[0].id) throw new Error("找不到有效的激活标签页。");
    
    const tabId = tabs[0].id;
    chrome.tabs.sendMessage(tabId, { type: "DO_SCRAPE" });

    const scrapedText = await new Promise<string>((resolve, reject) => {
      const listener = (message: any) => {
        if (message.type === 'SCRAPED_CONTENT' || message.type === 'SCRAPING_FAILED') {
          chrome.runtime.onMessage.removeListener(listener);
          if (message.type === 'SCRAPED_CONTENT') resolve(message.payload.text);
          else reject(new Error(message.payload.error));
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener);
        reject(new Error("抓取超时 (20秒)。"));
      }, 20000);
    });

    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      const newFullTexts = [...session.fullTexts, { pmid, text: scrapedText }];
      await addToLog(sessionId, `PMID ${pmid} 的全文抓取成功。`);
      updateSessionById(sessionId, { 
        fullTexts: newFullTexts, 
        gatheringIndex: session.gatheringIndex + 1,
        loading: false 
      });
    }
  } catch (err) {
    await addToLog(sessionId, `错误: 抓取PMID ${pmid} 失败: ${err.message}`);
    updateSessionById(sessionId, { error: `抓取PMID ${pmid} 失败: ${err.message}`, loading: false });
  } finally {
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  }
}

async function handleSynthesizeReport(sessionId: string) {
  const { updateSessionById, sessions } = useStore.getState();
  await useStore.persist.rehydrate();
  await addToLog(sessionId, "所有全文已就绪，开始生成最终报告...");
  updateSessionById(sessionId, { stage: 'SYNTHESIZING', loading: true, error: null });
  notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  try {
    const session = sessions.find(s => s.id === sessionId);
    if (!session || !session.researchPlan || session.fullTexts.length === 0) {
      throw new Error("无法生成报告：缺少研究计划或未抓取到任何全文。");
    }
    const storage = new Storage({ area: "local" });
    const config = await storage.get<LLMConfig>("llmConfig");
    if (!config?.apiKey) throw new Error("API密钥未配置。");

    await addToLog(sessionId, "调用增强模型撰写文献综述...");
    const synthesisPrompt = synthesisWriterPrompt(session.researchPlan, session.fullTexts);
    const finalReport = await callLlm(synthesisPrompt, config, config.smartModel, "text");
    
    await addToLog(sessionId, "研究报告生成完毕！");
    updateSessionById(sessionId, { finalReport, stage: 'DONE', loading: false });
  } catch (err) {
    await addToLog(sessionId, `错误: 报告合成失败: ${err.message}`);
    updateSessionById(sessionId, { error: err.message, loading: false });
  } finally {
    notifySidePanel({ type: "STATE_UPDATED_FROM_BACKGROUND" });
  }
}