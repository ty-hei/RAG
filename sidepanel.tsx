// sidepanel.tsx

import React, { useState, useEffect, useMemo } from "react"
import { useStore } from "./lib/store"
import type { ResearchPlan, ScoredArticle, SubQuestion } from "./lib/types"

function SessionManager() {
  const { sessions, activeSessionId, switchSession, addSession } = useStore()
  
  const handleNewResearch = () => {
    const newTopic = prompt("请输入新研究的主题：", "未命名研究");
    if (newTopic && newTopic.trim()) {
      const newSessionId = addSession(newTopic.trim());
      switchSession(newSessionId);
    }
  }

  return (
    <div style={styles.sessionManager}>
      <select 
        value={activeSessionId || ''} 
        onChange={(e) => switchSession(e.target.value || null)}
        style={styles.sessionSelect}
        title="切换研究项目"
      >
        <option value="" disabled>选择或开始一个新研究</option>
        {sessions.map(session => (
          <option key={session.id} value={session.id}>
            {session.name}
          </option>
        ))}
      </select>
      <button onClick={handleNewResearch} style={styles.newSessionButton} title="开始新的研究项目">
        + 新研究
      </button>
    </div>
  )
}

function SidePanel() {
  const { addSession, updateActiveSession, resetActiveSession, deleteSession } = useStore()
  
  const { sessions, activeSessionId } = useStore();
  const activeSession = useMemo(() => sessions.find(s => s.id === activeSessionId), [sessions, activeSessionId]);

  const [topic, setTopic] = useState("")
  const [refinementRequest, setRefinementRequest] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === "STATE_UPDATED_FROM_BACKGROUND") {
        useStore.persist.rehydrate()
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])
  
  useEffect(() => {
    setTopic(activeSession?.topic || "");
    setValidationError(null);
    setRefinementRequest("");
    setIsRefining(false);
    setSelectedArticles(new Set());
  }, [activeSession]);

  useEffect(() => {
    if (!activeSession?.loading) {
        setIsRefining(false);
    }
  }, [activeSession?.loading]);

  const handleStart = () => {
    if (!topic.trim()) {
      setValidationError("请输入一个研究主题。");
      return;
    }
    setValidationError(null);
    let currentSessionId = activeSession?.id;
    if (!currentSessionId || activeSession.topic === "未命名研究") {
      currentSessionId = addSession(topic);
    } else {
      const newName = topic.length > 50 ? topic.substring(0, 47) + '...' : topic;
      updateActiveSession({ topic, name: newName });
    }
    chrome.runtime.sendMessage({ type: "START_RESEARCH", topic, sessionId: currentSessionId });
  };
  
  const handlePlanChange = (subQuestionId: string, field: 'question' | 'keywords', value: string) => {
    if (!activeSession?.researchPlan) return;
    const updatedSubQuestions = activeSession.researchPlan.subQuestions.map(sq => (sq.id === subQuestionId) ? (field === 'keywords' ? { ...sq, keywords: value.split(',').map(k => k.trim()) } : { ...sq, [field]: value }) : sq);
    updateActiveSession({ researchPlan: { ...activeSession.researchPlan, subQuestions: updatedSubQuestions } });
  };

  const deleteSubQuestion = (subQuestionId: string) => {
    if (!activeSession?.researchPlan) return;
    const updatedSubQuestions = activeSession.researchPlan.subQuestions.filter(sq => sq.id !== subQuestionId);
    updateActiveSession({ researchPlan: { ...activeSession.researchPlan, subQuestions: updatedSubQuestions } });
  };
  
  const addSubQuestion = () => {
    if (!activeSession?.researchPlan) return;
    const newSubQuestion: SubQuestion = { id: `sq_manual_${Date.now()}`, question: "新的子问题（请编辑）", keywords: [] };
    const updatedSubQuestions = [...activeSession.researchPlan.subQuestions, newSubQuestion];
    updateActiveSession({ researchPlan: { ...activeSession.researchPlan, subQuestions: updatedSubQuestions } });
  };

  const handleConfirmPlan = () => {
    if(!activeSession || !activeSession.researchPlan) return;
    updateActiveSession({ loading: true, error: null });
    chrome.runtime.sendMessage({
      type: "EXECUTE_SEARCH",
      plan: activeSession.researchPlan,
      sessionId: activeSession.id
    });
  };
  
  const handleRequestRefinement = () => {
    if (!refinementRequest.trim() || !activeSession) {
      alert("请输入您的修改意见。");
      return;
    }
    setIsRefining(true);
    chrome.runtime.sendMessage({ type: "REFINE_PLAN", sessionId: activeSession.id, feedback: refinementRequest });
  };

  const handleDeleteCurrentSession = () => {
    if (activeSession && confirm("您确定要删除这个研究项目吗？此操作不可撤销。")) {
        deleteSession(activeSession.id);
    }
  }

  const handleArticleSelection = (pmid: string) => {
    setSelectedArticles(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(pmid)) {
        newSelected.delete(pmid);
      } else {
        newSelected.add(pmid);
      }
      return newSelected;
    });
  };

  const handleGenerateReport = () => {
    const articlesToProcess = activeSession?.scoredAbstracts.filter(a => selectedArticles.has(a.pmid));
    if (!articlesToProcess || articlesToProcess.length === 0) {
      alert("请至少选择一篇文章。");
      return;
    }
    console.log("Requesting to generate report for these articles:", articlesToProcess);
    alert("生成报告功能（第三阶段）待实现！");
  };

  const renderInitialView = () => (
    <div>
      <h3>您想研究什么？</h3>
      <p style={styles.description}>选择一个已有研究，或在下方输入新主题开始。</p>
      <textarea value={topic} onChange={(e) => { setTopic(e.target.value); if (validationError) setValidationError(null); }} placeholder="例如：肠道菌群与抑郁症的最新研究进展" style={{ ...styles.textarea, ...(validationError ? styles.inputError : {}) }} />
      {validationError && <p style={styles.errorText}>{validationError}</p>}
      <button onClick={handleStart} disabled={activeSession?.loading} style={{...styles.button, ...(activeSession?.loading ? styles.buttonDisabled : {})}}>
        {activeSession?.loading ? "正在规划..." : (activeSession ? "更新并开始研究" : "开始新研究")}
      </button>
    </div>
  )

  const renderResearchPlan = (plan: ResearchPlan) => (
    <div>
      <h3>研究计划协商</h3>
      <p style={styles.description}>AI为您起草了以下计划。您可以直接编辑，或在下方通过对话让AI帮您修改。</p>
      <div style={{ marginTop: '15px' }}><label style={styles.label}>AI 提出的澄清问题 (供您参考)</label><p style={styles.clarification}>{plan.clarification}</p></div>
      {plan.subQuestions.map((sq) => (
        <div key={sq.id} style={styles.planCard}>
          <button onClick={() => deleteSubQuestion(sq.id)} style={styles.deleteButton} title="删除此子问题">×</button>
          <label style={styles.label}>子问题</label>
          <textarea value={sq.question} onChange={(e) => handlePlanChange(sq.id, 'question', e.target.value)} style={styles.textareaSmall}/>
          <label style={{...styles.label, marginTop: '10px'}}>关键词 (逗号分隔)</label>
          <input type="text" value={sq.keywords.join(', ')} onChange={(e) => handlePlanChange(sq.id, 'keywords', e.target.value)} style={styles.input}/>
        </div>
      ))}
      <button onClick={addSubQuestion} style={{...styles.buttonSecondary, marginTop: '10px'}}>+ 手动添加子问题</button>
      <div style={styles.refinementBox}><h4 style={styles.label}>与AI对话以优化计划</h4><textarea value={refinementRequest} onChange={(e) => setRefinementRequest(e.target.value)} placeholder="例如：请合并关于治疗的两个问题。再增加一个关于副作用的子问题。" style={styles.textarea}/>
        <button onClick={handleRequestRefinement} disabled={isRefining || activeSession?.loading} style={{...styles.button, ...( (isRefining || activeSession?.loading) ? styles.buttonDisabled : {})}}>
          {isRefining ? "正在思考..." : "发送修改意见给AI"}
        </button>
      </div>
      <hr style={{border: 'none', borderTop: '1px solid #eee', margin: '20px 0'}}/>
      <button onClick={handleConfirmPlan} disabled={activeSession?.loading} style={{...styles.button, backgroundColor: '#28a745'}}>
          {activeSession?.loading ? "..." : "计划确认，开始检索文献"}
      </button>
      <button onClick={resetActiveSession} style={{...styles.buttonSecondary, backgroundColor: '#6c757d'}}>重置研究</button>
    </div>
  )
  
  const renderScreeningResults = (scoredAbstracts: ScoredArticle[]) => (
    <div>
        <h3>文献评估结果</h3>
        <p style={styles.description}>AI已为您评估了相关文献。请勾选您认为最值得精读的文章（建议3-5篇）。</p>
        <div style={styles.articleList}>
          {scoredAbstracts.map((article) => (
            <div key={article.pmid} style={styles.articleItem}>
              <div style={{ display: 'flex', alignItems: 'flex-start' }}><input type="checkbox" style={{ marginRight: '10px', marginTop: '5px' }} checked={selectedArticles.has(article.pmid)} onChange={() => handleArticleSelection(article.pmid)} />
                <div style={{ flex: 1 }}>
                  <h4 style={styles.articleTitle}>{article.title}</h4>
<p style={styles.articleMeta}>
  <strong>PMID:</strong> <a href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`} target="_blank" rel="noopener noreferrer">{article.pmid}</a>
</p>
                  <p style={{...styles.articleMeta, fontStyle: 'italic', color: '#007bff' }}><strong>AI评分: {article.score}/10</strong> - {article.reason}</p>
                  <details style={styles.articleDetails}><summary>查看摘要</summary><p style={styles.articleAbstract}>{article.abstract}</p></details>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={handleGenerateReport} disabled={selectedArticles.size === 0} style={{...styles.button, ...((selectedArticles.size === 0) ? styles.buttonDisabled : {})}}>
          {`获取全文并生成报告 (${selectedArticles.size})`}
        </button>
    </div>
  );

  const renderContent = () => {
    if (!activeSession) return renderInitialView();
    const { stage, loading, error, researchPlan, scoredAbstracts } = activeSession;
    if (error) return (<div style={styles.errorBox}><h4>发生错误</h4><p>{error}</p><button onClick={resetActiveSession} style={styles.button}>重试</button></div>);
    if (loading && !isRefining) {
      const messages = {PLANNING: "AI正在为您规划研究方向...", SCREENING: "正在检索PubMed并让AI评估摘要，请稍候...", SYNTHESIZING: "正在撰写报告..."}
      return (<div style={styles.loadingBox}><p>{messages[stage] || "AI 正在工作中..."}</p></div>);
    }
    switch (stage) {
      case 'IDLE':
      case 'PLANNING':
        return renderInitialView();
      case 'SCREENING':
        if (scoredAbstracts && scoredAbstracts.length > 0) { return renderScreeningResults(scoredAbstracts); }
        return researchPlan ? renderResearchPlan(researchPlan) : renderInitialView();
      case 'SYNTHESIZING': case 'DONE':
        return <p>后续阶段待实现</p>;
      default:
        return <p>未知阶段: {stage}</p>;
    }
  }

  return (
    <div style={styles.container}>
      <SessionManager />
      <div style={styles.mainContent}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
           <h1>PubMed RAG 助理</h1>
           {activeSession && <button onClick={handleDeleteCurrentSession} style={styles.deleteSessionButton} title="删除当前研究项目">删除当前研究</button>}
        </div>
        {renderContent()}
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "sans-serif" },
  mainContent: { flex: 1, padding: '0 15px 15px 15px', overflowY: 'auto' },
  sessionManager: { display: 'flex', padding: '10px', backgroundColor: '#f8f9fa', borderBottom: '1px solid #dee2e6', gap: '10px' },
  sessionSelect: { flex: 1, padding: '5px', borderRadius: '4px', border: '1px solid #ccc' },
  newSessionButton: { padding: '5px 10px', cursor: 'pointer', border: '1px solid #007bff', backgroundColor: 'white', color: '#007bff', borderRadius: '4px' },
  deleteSessionButton: { padding: '4px 8px', fontSize: '12px', cursor: 'pointer', border: '1px solid #dc3545', backgroundColor: 'transparent', color: '#dc3545', borderRadius: '4px'},
  description: { fontSize: 14, color: '#555' },
  textarea: { width: '100%', minHeight: '80px', boxSizing: 'border-box', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', marginTop: '5px' },
  textareaSmall: { width: '100%', minHeight: '50px', boxSizing: 'border-box', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', marginTop: '5px' },
  input: { width: '100%', boxSizing: 'border-box', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', marginTop: '5px' },
  button: { width: '100%', padding: '10px 15px', marginTop: '10px', backgroundColor: "#007bff", color: "white", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 16, transition: 'background-color 0.2s' },
  buttonSecondary: { width: '100%', padding: '8px 15px', marginTop: '10px', backgroundColor: "#e9ecef", color: "#212529", border: "1px solid #ced4da", borderRadius: 5, cursor: "pointer", fontSize: 14 },
  buttonDisabled: { backgroundColor: "#aaa", cursor: "not-allowed" },
  inputError: { border: '1px solid red' },
  errorText: { color: 'red', fontSize: '13px', marginTop: '5px' },
  errorBox: { padding: '15px', backgroundColor: '#ffebee', border: '1px solid #ef5350', borderRadius: '5px', color: '#c62828' },
  loadingBox: { textAlign: 'center', padding: '40px 20px', color: '#555' },
  planCard: { position: 'relative', border: '1px solid #e0e0e0', padding: '15px', margin: '15px 0', borderRadius: '8px', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  deleteButton: { position: 'absolute', top: '5px', right: '5px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#aaa', padding: '0 5px', lineHeight: '1' },
  label: { fontWeight: 'bold', display: 'block', fontSize: '14px', marginBottom: '5px' },
  clarification: { fontStyle: 'italic', color: '#555', background: '#f8f9fa', padding: '10px', borderRadius: '5px', border: '1px solid #eee' },
  refinementBox: { marginTop: '25px', padding: '15px', border: '1px dashed #007bff', borderRadius: '8px', backgroundColor: 'rgba(0, 123, 255, 0.05)'},
  articleList: { maxHeight: '55vh', overflowY: 'auto', border: '1px solid #eee', padding: '5px', borderRadius: '5px', marginTop: '15px' },
  articleItem: { borderBottom: '1px solid #eee', padding: '10px', transition: 'background-color 0.2s' },
  articleTitle: { margin: 0, fontSize: '14px', fontWeight: 'bold' },
  articleMeta: { margin: '5px 0', fontSize: '12px', color: '#333' },
  articleDetails: { marginTop: '8px', fontSize: '12px' },
  articleAbstract: { margin: '5px 0', paddingLeft: '10px', borderLeft: '3px solid #eee', color: '#555', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
};

export default SidePanel;