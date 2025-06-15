// RAG-main/lib/prompts.ts

import type { FetchedArticle, FetchedClinicalTrial, ResearchPlan, ScoredClinicalTrial, ScoredWebResult } from "./types";

// 【变更】更新 researchStrategistPrompt 以生成专用的 webQuery
export const researchStrategistPrompt = (topic: string): string => `
  You are a helpful and collaborative research strategist specializing in biomedical fields. Your goal is to work with the user to break down their broad research interest into a structured, actionable research plan.

  The user's topic is: "${topic}"

  Please perform the following steps:
  1.  Decompose the user's topic into a suitable number of critical, distinct sub-questions. Frame these as questions we want to answer. Each should represent a key facet of the topic.
  2.  For each sub-question, generate a concise list of 3-5 effective PubMed search keywords. These should be a mix of MeSH terms and common phrases.
  3.  Formulate a single, insightful clarification question to ask the user. This will help us refine the focus of the research together.
  4.  **Based on the topic, generate a single, simple, and concise query (5-7 words max) suitable for a general web search engine like Google or Tavily.** This query should capture the core essence of the research topic.

  Your final output MUST be a single, valid JSON object, with no markdown formatting or other text outside of the JSON. The JSON object must have the following structure:
  {
    "subQuestions": [
      {
        "id": "placeholder_id_1",
        "question": "The first sub-question text.",
        "keywords": ["keyword1", "keyword2", "keyword3"]
      }
    ],
    "clarification": "The single clarification question to the user.",
    "webQuery": "A concise query for web search."
  }
`;

export const refinePlanPrompt = (topic: string, currentPlan: ResearchPlan, userFeedback: string): string => `
  You are a helpful research strategist in an ongoing conversation with a user. You have already proposed an initial research plan, and now the user has provided feedback for refinement.

  **Original Research Topic:** "${topic}"

  **Current Research Plan (in JSON format):**
  \`\`\`json
  ${JSON.stringify(currentPlan, null, 2)}
  \`\`\`

  **User's Feedback and Request for Changes:**
  "${userFeedback}"

  **Your Task:**
  Carefully analyze the user's feedback and revise the **ENTIRE** research plan accordingly. You can add, remove, merge, or rephrase sub-questions and their keywords. Also, update the \`webQuery\` to reflect the refined research focus. The goal is to produce a new version of the plan that better aligns with the user's intent.

  **CRITICAL INSTRUCTIONS:**
  - Your final output MUST be a single, valid JSON object representing the **COMPLETE, UPDATED** research plan.
  - The structure of the JSON object must be identical to the original plan's structure: { "subQuestions": [...], "clarification": "...", "webQuery": "..." }.
  - Do NOT just output the changes. Output the full, revised plan.
`;

export const searchRefinerPrompt = (plan: ResearchPlan, articles: FetchedArticle[]): string => `
  You are an expert research analyst. Your task is to determine if the current search results adequately cover all aspects of the user's research plan. If not, you must generate new search queries to fill the gaps.

  **Research Plan:**
  - Main Topic: "${plan.clarification}"
  - Sub-questions to address:
    ${plan.subQuestions.map((sq, i) => `${i + 1}. ${sq.question}`).join('\n    ')}

  **Current Search Results (first ${articles.length} titles and abstracts):**
  ${articles.map(article => `
  <article>
    <pmid>${article.pmid}</pmid>
    <title>${article.title}</title>
    <abstract>${article.abstract}</abstract>
  </article>
  `).join('\n')}

  **Your Analysis & Task:**
  1.  Review the sub-questions in the research plan.
  2.  Review the titles and abstracts of the articles found so far.
  3.  Identify any sub-questions that are **poorly covered** or **not covered at all** by the current results.
  4.  For each identified gap, formulate one or two new, specific, and effective PubMed search queries that are likely to find relevant articles. These queries can be more targeted than the initial broad search.
  5.  If you believe the current results are sufficient and all sub-questions are well-covered, return an empty array.

  **CRITICAL INSTRUCTIONS:**
  - Your final output MUST be a single, valid JSON object, with no markdown formatting or other text outside of the JSON.
  - The JSON object must have a single key "new_queries" which is an array of strings.
  - Example output: { "new_queries": ["(autism) AND (gut microbiota) AND (probiotics)", "serotonin pathway gut-brain axis"] }
  - If no new queries are needed, output: { "new_queries": [] }
`;

export const clinicalTrialSearchRefinerPrompt = (plan: ResearchPlan, trials: FetchedClinicalTrial[]): string => `
  You are an expert research analyst. Your task is to determine if the current clinical trial search results adequately cover all aspects of the user's research plan. If not, you must generate new search queries to fill the gaps.

  **Research Plan:**
  - Main Topic: "${plan.clarification}"
  - Sub-questions to address:
    ${plan.subQuestions.map((sq, i) => `${i + 1}. ${sq.question}`).join('\n    ')}

  **Current Clinical Trial Results (${trials.length} trials):**
  ${trials.map(trial => `
  <trial>
    <nctId>${trial.nctId}</nctId>
    <title>${trial.title}</title>
    <summary>${trial.summary}</summary>
    <conditions>${trial.conditions.join(', ')}</conditions>
  </trial>
  `).join('\n')}

  **Your Analysis & Task:**
  1.  Review the sub-questions in the research plan.
  2.  Review the titles, summaries, and conditions of the trials found so far.
  3.  Identify any sub-questions that are **poorly covered** or **not covered at all** by the current results.
  4.  For each identified gap, formulate one or two new, specific, and effective search queries for ClinicalTrials.gov.
  5.  If you believe the current results are sufficient and all sub-questions are well-covered, return an empty array.

  **CRITICAL INSTRUCTIONS:**
  - Your final output MUST be a single, valid JSON object, with no markdown formatting or other text outside of the JSON.
  - The JSON object must have a single key "new_queries" which is an array of strings.
  - Example output: { "new_queries": ["(metastatic breast cancer) AND (CDK4/6 inhibitor OR palbociclib)", "triple-negative breast cancer immunotherapy"] }
  - If no new queries are needed, output: { "new_queries": [] }
`;

export const literatureReviewerPrompt = (plan: ResearchPlan, articles: FetchedArticle[]): string => `
  You are a meticulous medical literature reviewer. Your task is to evaluate a list of article abstracts based on their relevance to a given research plan.

  The research plan is as follows:
  - Main Topic: "${plan.clarification}" 
  - Sub-questions:
    ${plan.subQuestions.map(sq => `- ${sq.question}`).join('\n    ')}

  Here are the articles you need to evaluate:
  ${articles.map(article => `
  <article>
    <pmid>${article.pmid}</pmid>
    <title>${article.title}</title>
    <abstract>${article.abstract}</abstract>
  </article>
  `).join('\n')}

  Please evaluate each article and provide a relevance score from 1 (not relevant) to 10 (highly relevant). Also, provide a single, concise sentence explaining your reasoning for the score.

  Your final output MUST be a single, valid JSON object, with no markdown formatting or other text outside of the JSON. The JSON object should be an array, where each item corresponds to an article and has the following structure:
  [
    {
      "pmid": "The PMID of the article",
      "score": 8,
      "reason": "The concise reason for the score."
    },
    {
      "pmid": "Another PMID",
      "score": 3,
      "reason": "Another reason."
    }
  ]
`;

export const clinicalTrialReviewerPrompt = (plan: ResearchPlan, trials: FetchedClinicalTrial[]): string => `
  You are an expert clinical trial analyst. Your task is to evaluate a list of clinical trials based on their relevance to a given research plan.

  The research plan is as follows:
  - Main Topic: "${plan.clarification}" 
  - Sub-questions:
    ${plan.subQuestions.map(sq => `- ${sq.question}`).join('\n    ')}

  Here are the clinical trials you need to evaluate. Each has a title, summary, conditions, and interventions.
  ${trials.map(trial => `
  <trial>
    <nctId>${trial.nctId}</nctId>
    <title>${trial.title}</title>
    <status>${trial.status}</status>
    <summary>${trial.summary}</summary>
    <conditions>${trial.conditions.join(', ')}</conditions>
    <interventions>${trial.interventions.join(', ')}</interventions>
  </trial>
  `).join('\n')}

  Please evaluate each trial and provide a relevance score from 1 (not relevant) to 10 (highly relevant). Also, provide a single, concise sentence explaining your reasoning for the score, considering the trial's status, summary, and interventions in relation to the research questions.

  Your final output MUST be a single, valid JSON object, with no markdown formatting or other text outside of the JSON. The JSON object should be an array, where each item corresponds to a trial and has the following structure:
  [
    {
      "nctId": "The NCTId of the trial",
      "score": 9,
      "reason": "The concise reason for the score."
    },
    {
      "nctId": "Another NCTId",
      "score": 4,
      "reason": "Another reason."
    }
  ]
`;

export const webSearchReviewerPrompt = (plan: ResearchPlan, results: { url: string, title: string, content: string }[]): string => `
  You are a pragmatic research assistant. Your task is to evaluate a list of web search results based on their relevance to a given research plan, focusing on news, expert opinions, and supplementary data.

  The research plan is as follows:
  - Main Topic: "${plan.clarification}"
  - Sub-questions:
    ${plan.subQuestions.map(sq => `- ${sq.question}`).join('\n    ')}

  Here are the web search results you need to evaluate. Each has a title and a content snippet.
  ${results.map(res => `
  <result>
    <url>${res.url}</url>
    <title>${res.title}</title>
    <content>${res.content}</content>
  </result>
  `).join('\n')}

  Please evaluate each result and provide a relevance score from 1 (not relevant) to 10 (highly relevant). The goal is to find context, news, or expert commentary, not to replace academic papers. Also, provide a single, concise sentence explaining your reasoning for the score.

  Your final output MUST be a single, valid JSON object, with no markdown formatting or other text outside of the JSON. The JSON object should be an array, where each item corresponds to a search result and has the following structure:
  [
    {
      "url": "The URL of the web page",
      "score": 7,
      "reason": "This news article provides recent context on the topic."
    },
    {
      "url": "Another URL",
      "score": 3,
      "reason": "This is a commercial product page and not relevant."
    }
  ]
`;

export const synthesisWriterPrompt = (
  plan: ResearchPlan,
  fullTexts: { pmid: string; text: string }[],
  clinicalTrials: ScoredClinicalTrial[],
  webResults: ScoredWebResult[]
): string => `
  You are a top-tier medical researcher and writer. Your task is to synthesize information from MULTIPLE sources (full-text articles, clinical trial summaries, and web results) into a comprehensive, structured, and insightful literature review.

  The research is guided by the following plan:
  - Main Topic/Clarification: "${plan.clarification}"
  - Key Sub-questions to address:
    ${plan.subQuestions.map((sq, i) => `${i + 1}. ${sq.question}`).join('\n    ')}

  You have been provided with three types of information sources:

  1.  **Full-Text Articles (${fullTexts.length} documents):** These are the primary, in-depth academic sources.
      ${fullTexts.map(doc => `
      <document pmid="${doc.pmid}">
        ${doc.text}
      </document>
      `).join('\n\n')}

  2.  **Clinical Trials (${clinicalTrials.length} summaries):** These provide information on ongoing or completed studies, which can be used to discuss the latest research landscape and future directions.
      ${clinicalTrials.map(trial => `
      <trial nctId="${trial.nctId}">
        <title>${trial.title}</title>
        <status>${trial.status}</status>
        <summary>${trial.summary}</summary>
        <conditions>${trial.conditions.join(', ')}</conditions>
        <interventions>${trial.interventions.join(', ')}</interventions>
      </trial>
      `).join('\n\n')}

  3.  **Web Results (${webResults.length} snippets):** These can provide context from news, expert opinions, or guidelines that may not be in academic papers yet.
      ${webResults.map(res => `
      <web url="${res.url}">
        <title>${res.title}</title>
        <content>${res.content}</content>
      </web>
      `).join('\n\n')}

  **CRITICAL INSTRUCTIONS:**
  Your final output MUST be a single, well-formatted Markdown document. Do not just summarize sources; you must intelligently INTEGRATE them. For example, when discussing a treatment mentioned in an article, you can cite a clinical trial that is currently testing it, or a news article that discusses its recent FDA approval.

  The report must be structured with the following sections:

  1.  **核心见解摘要 (Executive Summary)**: A bulleted list of 3-5 key takeaways from the entire review, integrating all sources.

  2.  **引言 (Introduction)**: Set the context for the research topic, state its importance, and outline the structure of this review.

  3.  **方法论总览 (Methodology Overview)**: Briefly summarize the types of evidence used (e.g., "This review is based on X full-text articles, supplemented by Y clinical trial summaries and Z relevant web results...").

  4.  **分主题综合分析 (Synthesis by Sub-question)**: This is the main body. For each sub-question, synthesize findings from ALL RELEVANT sources.
      - **Integrate, don't just list.** Weave together information from articles, trials, and web results to build a strong narrative.
      - **Cite everything.** Every piece of information must be cited immediately.

  5.  **研究局限性 (Limitations)**: Discuss the limitations of the current body of research, using evidence from all sources.

  6.  **结论与未来研究方向 (Conclusion and Future Directions)**: Summarize the main findings. Then, suggest specific future research directions, explicitly referencing ongoing clinical trials or gaps identified in web news.

  **Formatting and Citation Style:**
  - Use Markdown headings (\`##\`) for each section title.
  - Use the following MANDATORY inline citation formats:
    - For academic papers: **[PMID:XXXXXX]**
    - For clinical trials: **[TRIAL:NCTXXXXXX]**
    - For web results: **[WEB:https://...]**
`;

export const generateSearchQueriesPrompt = (plan: ResearchPlan): string => `
  You are an expert medical librarian and search strategist. Your task is to generate effective boolean search queries for PubMed and ClinicalTrials.gov based on a complete research plan.

  **Research Plan:**
  - Main Topic: "${plan.clarification}"
  - Sub-questions:
    ${plan.subQuestions.map((sq, i) => `${i + 1}. ${sq.question}`).join('\n    ')}

  **Your Task:**
  1.  Analyze all sub-questions to identify the core, overarching concepts.
  2.  Create a primary, powerful boolean query for **PubMed**. This query should be broad enough to cover the main topic but specific enough to yield relevant results. Combine related keywords with "OR" and group them with parentheses. Then, connect the conceptual groups with "AND".
  3.  Create a similar, potentially simpler query for **ClinicalTrials.gov**.
  4.  If the research plan contains a dedicated \`webQuery\`, use it for the web search. Otherwise, create a simple, non-boolean query for general web search.

  **CRITICAL INSTRUCTIONS:**
  - Your final output MUST be a single, valid JSON object, with no markdown formatting or other text outside of the JSON.
  - The JSON object must have three keys: "pubmedQuery", "clinicalTrialQuery", and "webQuery".
  - Example output for a topic on "metformin for pcos": 
    {
      "pubmedQuery": "((metformin OR glucophage) AND (polycystic ovary syndrome OR PCOS) AND (treatment OR therapy OR efficacy))",
      "clinicalTrialQuery": "(metformin) AND (PCOS OR Polycystic Ovary Syndrome)",
      "webQuery": "metformin PCOS latest guidelines"
    }
`;