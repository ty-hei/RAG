// RAG-main/sidepanel.tsx

import React, { useState, useEffect, useMemo, useRef } from "react"
import { useStore } from "./lib/store"
import type { ResearchSession, Stage, FetchedArticle, ScoredArticle } from "./lib/types"

// #region --- Helper Components ---

function SimpleMarkdownViewer({ content }: { content: string }) {
  const [copyStatus, setCopyStatus] = useState('复制报告');

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopyStatus('已复制!');
      setTimeout(() => setCopyStatus('复制报告'), 2000);
    }).catch(err => {
      alert('复制失败: ' + err);
    });
  };

  const renderContent = () => {
    const htmlContent = content
      .replace(/\n/g, '<br />')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[PMID:(\d+)\]/g, '<a href="https://pubmed.ncbi.nlm.nih.gov/$1/" target="_blank" rel="noopener noreferrer">[PMID:$1]</a>');
    
    return { __html: htmlContent };
  };

  return (
    <div>
      <button onClick={handleCopy} style={{...styles.buttonSecondary, width: 'auto', float: 'right'}}>
        {copyStatus}
      </button>
      <div style={styles.reportContent} dangerouslySetInnerHTML={renderContent()} />
    </div>
  );
}

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

const Section: React.FC<{
  title: string, 
  stage: Stage,
  completedStages: Stage[],
  children: React.ReactNode,
  isLoading?: boolean,
  loadingText?: string,
}> = ({ title, stage, completedStages, children, isLoading = false, loadingText }) => {
  const isCompleted = completedStages.includes(stage);
  const [isExpanded, setIsExpanded] = useState(!isCompleted);

  useEffect(() => {
    setIsExpanded(!completedStages.includes(stage));
  }, [stage, completedStages]);

  const headerStyle = isCompleted ? {...styles.sectionHeader, ...styles.sectionHeaderCompleted} : styles.sectionHeader;

  return (
    <div style={styles.section}>
      <div style={headerStyle} onClick={() => setIsExpanded(!isExpanded)}>
        <span>{title}</span>
        <span>{isCompleted ? '✓ 完成' : (isLoading ? '...' : (isExpanded ? '▼' : '▶'))}</span>
      </div>
      {isExpanded && (
        <div style={styles.sectionContent}>
          {isLoading ? <div style={styles.loadingBox}><p>{loadingText}</p></div> : children}
        </div>
      )}
    </div>
  );
};

const StrategyLogSection: React.FC<{ session: ResearchSession }> = ({ session }) => {
    const logContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [session.log]);

    if (!session.log || session.log.length === 0) {
        return null;
    }

    return (
        <details style={styles.logDetails}>
            <summary style={styles.logSummary}>查看代理活动日志</summary>
            <div ref={logContainerRef} style={styles.logContainer}>
                {session.log.map((entry, index) => (
                    <p key={index} style={styles.logEntry}>{entry}</p>
                ))}
            </div>
        </details>
    );
};


// #endregion --- Helper Components ---


// #region --- Stage Sections ---

const InitialSection: React.FC<{
  session: ResearchSession | null | undefined,
  onStart: (topic: string) => void
}> = ({ session, onStart }) => {
  const [topic, setTopic] = useState(session?.topic || "");
  const [validationError, setValidationError] = useState<string|null>(null);

  useEffect(() => {
    setTopic(session?.topic || "");
  }, [session?.topic]);

  const handleStartClick = () => {
    if (!topic.trim()) {
      setValidationError("请输入一个研究主题。");
      return;
    }
    setValidationError(null);
    onStart(topic);
  };
  
  return (
    <div style={{padding: '0 15px 15px'}}>
       <h3>您想研究什么？</h3>
       <p style={styles.description}>选择一个已有研究，或在下方输入新主题开始。</p>
       <textarea value={topic} onChange={(e) => { setTopic(e.target.value); if (validationError) setValidationError(null); }} placeholder="例如：肠道菌群与抑郁症的最新研究进展" style={{ ...styles.textarea, ...(validationError ? styles.inputError : {}) }} />
       {validationError && <p style={styles.errorText}>{validationError}</p>}
       <button onClick={handleStartClick} disabled={session?.loading} style={{...styles.button, ...(session?.loading ? styles.buttonDisabled : {})}}>
         {session?.loading ? "正在规划..." : "开始研究 / 更新主题"}
       </button>
    </div>
  );
}

const ResearchPlanSection: React.FC<{ session: ResearchSession }> = ({ session }) => {
  const { updateActiveSession } = useStore();
  const [refinementRequest, setRefinementRequest] = useState("");
  const [isRefining, setIsRefining] = useState(false);

  useEffect(() => {
    if (!session.loading) {
      setIsRefining(false);
    }
  }, [session.loading]);

  const addSubQuestion = () => {
    if (!session?.researchPlan) return;
    const newSubQuestion = { id: `sq_manual_${Date.now()}`, question: "新的子问题（请编辑）", keywords: [] };
    const updatedSubQuestions = [...session.researchPlan.subQuestions, newSubQuestion];
    updateActiveSession({ researchPlan: { ...session.researchPlan, subQuestions: updatedSubQuestions } });
  };

  const handleRequestRefinement = () => {
    if (!refinementRequest.trim()) {
      alert("请输入您的修改意见。");
      return;
    }
    setIsRefining(true);
    chrome.runtime.sendMessage({ type: "REFINE_PLAN", sessionId: session.id, feedback: refinementRequest });
  };
  
  const handlePlanChange = (subQuestionId: string, field: 'question' | 'keywords', value: string) => {
    const newPlan = {
      ...session.researchPlan!,
      subQuestions: session.researchPlan!.subQuestions.map(sq => 
        sq.id === subQuestionId 
          ? (field === 'keywords' ? { ...sq, keywords: value.split(',').map(k => k.trim()) } : { ...sq, [field]: value }) 
          : sq
      )
    };
    
    if (session.stage !== 'PLANNING') {
      if (window.confirm("修改研究计划将重置后续的文献筛选和报告生成进度，是否继续？")) {
        updateActiveSession({
          researchPlan: newPlan,
          stage: 'SCREENING',
          loading: true,
          scoredAbstracts: [],
          articlesToFetch: [],
          fullTexts: [],
          finalReport: '',
        });
        chrome.runtime.sendMessage({ type: "EXECUTE_SEARCH", plan: newPlan, sessionId: session.id });
      }
    } else {
      updateActiveSession({ researchPlan: newPlan });
    }
  };

  const handleConfirmPlan = () => {
    if(!session.researchPlan) return;
    updateActiveSession({ loading: true, stage: 'SCREENING' });
    chrome.runtime.sendMessage({ type: "EXECUTE_SEARCH", plan: session.researchPlan, sessionId: session.id });
  };
  
  if (!session.researchPlan) return null;

  return (
    <Section title="第 1 步：研究计划" stage="PLANNING" completedStages={['SCREENING', 'GATHERING', 'SYNTHESIZING', 'DONE']}>
        <p style={styles.description}>AI为您起草了以下计划。您可以直接编辑，或在下方通过对话让AI帮您修改。</p>
        <div style={{ marginTop: '15px' }}><label style={styles.label}>AI 提出的澄清问题 (供您参考)</label><p style={styles.clarification}>{session.researchPlan.clarification}</p></div>
        {session.researchPlan.subQuestions.map((sq) => (
          <div key={sq.id} style={styles.planCard}>
            <label style={styles.label}>子问题</label>
            <textarea value={sq.question} onChange={(e) => handlePlanChange(sq.id, 'question', e.target.value)} style={styles.textareaSmall}/>
            <label style={{...styles.label, marginTop: '10px'}}>关键词 (逗号分隔)</label>
            <input type="text" value={sq.keywords.join(', ')} onChange={(e) => handlePlanChange(sq.id, 'keywords', e.target.value)} style={styles.input}/>
          </div>
        ))}
        {session.stage === 'PLANNING' && (
          <>
            <button onClick={addSubQuestion} style={{...styles.buttonSecondary, marginTop: '10px'}}>+ 手动添加子问题</button>
            <div style={styles.refinementBox}>
              <h4 style={styles.label}>与AI对话以优化计划</h4>
              <textarea value={refinementRequest} onChange={(e) => setRefinementRequest(e.target.value)} placeholder="例如：请合并关于治疗的两个问题。再增加一个关于副作用的子问题。" style={styles.textarea}/>
              <button onClick={handleRequestRefinement} disabled={isRefining || session.loading} style={{...styles.button, ...( (isRefining || session.loading) ? styles.buttonDisabled : {})}}>
                  {isRefining ? "正在思考..." : "发送修改意见给AI"}
              </button>
            </div>
            <hr style={{border: 'none', borderTop: '1px solid #eee', margin: '20px 0'}}/>
            <button onClick={handleConfirmPlan} style={{...styles.button, backgroundColor: '#28a745', width: '100%'}}>
              计划确认，开始检索文献
            </button>
          </>
        )}
    </Section>
  );
};

const ScreeningResultsSection: React.FC<{ session: ResearchSession }> = ({ session }) => {
  const [selectedPmids, setSelectedPmids] = useState<Set<string>>(new Set());
  const { updateActiveSession } = useStore();

  const handleSelectionChange = (pmid: string) => {
    const newSelection = new Set(selectedPmids);
    if (newSelection.has(pmid)) newSelection.delete(pmid);
    else newSelection.add(pmid);
    setSelectedPmids(newSelection);
  }

  const handleStartGathering = () => {
    const articlesToFetch = session.scoredAbstracts.filter(a => selectedPmids.has(a.pmid));
    if (articlesToFetch.length === 0) {
      alert("请至少选择一篇文章。");
      return;
    }
    updateActiveSession({ articlesToFetch, stage: 'GATHERING' });
  };

  const hasScored = session.scoredAbstracts.length > 0;
  const articles = hasScored ? session.scoredAbstracts : session.rawArticles;

  if (session.loading && articles.length === 0) {
    return (
      <Section
        title="第 2 步：文献筛选"
        stage="SCREENING"
        completedStages={[]}
        isLoading={true}
        loadingText={session.loadingMessage || "正在初始化检索..."}
      >
        {session.pubmedQuery && (
          <div style={styles.queryBox}>
            <strong>PubMed 检索式:</strong>
            <p style={styles.queryText}>{session.pubmedQuery}</p>
          </div>
        )}
      </Section>
    );
  }
  
  if (!session.loading && articles.length === 0) {
      return null;
  }

  return (
    <Section
      title="第 2 步：文献筛选"
      stage="SCREENING"
      completedStages={['GATHERING', 'SYNTHESIZING', 'DONE']}
    >
      {session.pubmedQuery && (
        <details style={styles.details}>
          <summary style={styles.summary}>查看本次使用的PubMed检索式</summary>
          <div style={styles.queryBox}>
            <p style={styles.queryText}>{session.pubmedQuery}</p>
          </div>
        </details>
      )}
      
      <p style={styles.description}>
        {hasScored
          ? `AI已为您评估了 ${articles.length} 篇相关文献。请勾选您认为最值得精读的文章。`
          : `已找到 ${articles.length} 篇文献，正在等待AI评估...`
        }
      </p>

      {!hasScored && session.loading && (
        <div style={styles.inlineLoadingBox}>
          <p>{session.loadingMessage || "正在调用AI进行评估..."}</p>
        </div>
      )}

      <div style={styles.articleList}>
        {articles.map((article: ScoredArticle | FetchedArticle) => (
          <div key={article.pmid} style={styles.articleItem}>
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                style={{ marginRight: '10px', marginTop: '5px' }}
                disabled={!hasScored}
                checked={selectedPmids.has(article.pmid)}
                onChange={() => handleSelectionChange(article.pmid)}
              />
              <div style={{ flex: 1 }}>
                <h4 style={styles.articleTitle}>{article.title}</h4>
                {(article as ScoredArticle).score !== undefined ? (
                  <p style={{ ...styles.articleMeta, fontStyle: 'italic', color: '#007bff' }}>
                    <strong>AI评分: {(article as ScoredArticle).score}/10</strong> - {(article as ScoredArticle).reason}
                  </p>
                ) : (
                  <p style={{ ...styles.articleMeta, fontStyle: 'italic', color: '#6c757d' }}>
                    [ 正在等待AI评分... ]
                  </p>
                )}
                <details style={styles.articleDetails}><summary>查看摘要</summary><p style={styles.articleAbstract}>{article.abstract}</p></details>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {hasScored && session.stage === 'SCREENING' && (
        <button onClick={handleStartGathering} disabled={selectedPmids.size === 0} style={{ ...styles.button, ...((selectedPmids.size === 0) ? styles.buttonDisabled : {}) }}>
          {`进入全文抓取阶段 (${selectedPmids.size})`}
        </button>
      )}
    </Section>
  );
};

const FullTextGatheringSection: React.FC<{ session: ResearchSession }> = ({ session }) => {
  const { updateActiveSession } = useStore();
  const [copyStatus, setCopyStatus] = useState("复制所有全文");

  const handleScrapeClick = (pmid: string) => {
    chrome.runtime.sendMessage({ type: 'SCRAPE_ACTIVE_TAB', sessionId: session.id, pmid: pmid });
  }

  const handleSynthesizeClick = () => {
    chrome.runtime.sendMessage({ type: 'SYNTHESIZE_REPORT', sessionId: session.id });
  }
  
  const handleSkipClick = () => {
    const currentArticle = session.articlesToFetch[session.gatheringIndex];
    if(currentArticle) {
      chrome.runtime.sendMessage({type: 'ADD_TO_LOG', sessionId: session.id, message: `用户选择跳过文章 PMID: ${currentArticle.pmid}`});
    }
    updateActiveSession({ gatheringIndex: session.gatheringIndex + 1 });
  }
  
  const handleCopyFullTexts = () => {
    const formattedTexts = session.fullTexts.map(ft => {
      const articleInfo = session.articlesToFetch.find(a => a.pmid === ft.pmid);
      return `## Article: ${articleInfo?.title || 'Unknown Title'}\n**PMID:** ${ft.pmid}\n\n${ft.text}\n\n---\n\n`;
    }).join('');
    
    navigator.clipboard.writeText(formattedTexts).then(() => {
      setCopyStatus("已复制!");
      setTimeout(() => setCopyStatus("复制所有全文"), 2000);
    }).catch(err => {
      alert('复制失败: ' + err);
    });
  }

  if (!['GATHERING', 'SYNTHESIZING', 'DONE'].includes(session.stage)) return null;
  
  const totalToFetch = session.articlesToFetch.length;
  const isDoneGathering = session.gatheringIndex >= totalToFetch;
  const currentArticle = isDoneGathering ? null : session.articlesToFetch[session.gatheringIndex];

  return (
    <Section 
      title={`第 3 步：全文抓取 (${session.fullTexts.length}/${totalToFetch})`} 
      stage="GATHERING" 
      completedStages={['SYNTHESIZING', 'DONE']}
    >
        {isDoneGathering ? (
          <div>
            <div style={styles.successBox}>
              <p>太棒了！所有文章已处理完毕（抓取或跳过）。</p>
              {session.stage === 'GATHERING' && (
                <button onClick={handleSynthesizeClick} style={styles.button} disabled={session.fullTexts.length === 0}>
                  {session.fullTexts.length > 0 ? `生成最终报告 (${session.fullTexts.length}篇)` : '没有可供分析的文章'}
                </button>
              )}
            </div>
            
            <details style={{marginTop: '20px'}}>
              <summary style={styles.summary}>查看/复制已抓取的全文 ({session.fullTexts.length}篇)</summary>
              <div style={{...styles.articleList, marginTop: '10px'}}>
                {session.fullTexts.map(ft => {
                   const articleInfo = session.articlesToFetch.find(a => a.pmid === ft.pmid);
                   return (
                     <div key={ft.pmid} style={styles.articleItem}>
                       <h4 style={styles.articleTitle}>{articleInfo?.title}</h4>
                       <p style={{...styles.articleAbstract, whiteSpace: 'pre-wrap', maxHeight: '100px', overflow: 'hidden'}}>{ft.text}</p>
                     </div>
                   )
                })}
              </div>
              <button onClick={handleCopyFullTexts} style={{...styles.buttonSecondary, width: '100%'}}>
                {copyStatus}
              </button>
            </details>
          </div>
        ) : (
          currentArticle && (
            <div>
              <p style={styles.description}>请按以下步骤操作，抓取下一篇文章的全文：</p>
              <div style={styles.planCard}>
                <p><strong>待处理 ({session.gatheringIndex + 1}/{totalToFetch}):</strong> {currentArticle.title} (PMID: {currentArticle.pmid})</p>
                <ol style={{paddingLeft: '20px', fontSize: '14px'}}>
                  <li>点击下方按钮，在新标签页中打开文章的PubMed页面。</li>
                  <li>在打开的页面中，通过DOI或其他链接，**手动导航**到文章全文页面。</li>
                  <li>确认全文加载完毕后，回到本侧边栏，点击“抓取当前页面”按钮。</li>
                  <li>如果无法访问或不需此文，可直接“跳过此文”。</li>
                </ol>
                <button onClick={() => chrome.tabs.create({ url: `https://pubmed.ncbi.nlm.nih.gov/${currentArticle.pmid}/`})} style={styles.buttonSecondary}>
                  1. 打开PubMed页面
                </button>
                <button onClick={() => handleScrapeClick(currentArticle.pmid)} disabled={session.loading} style={{...styles.button, ...(session.loading ? styles.buttonDisabled : {}), marginLeft: '10px'}}>
                  {session.loading ? '抓取中...' : '2. 抓取当前页面'}
                </button>
                <button onClick={handleSkipClick} disabled={session.loading} style={{...styles.buttonSecondary, marginLeft: '10px', borderColor: '#6c757d'}}>
                  跳过此文
                </button>
              </div>
            </div>
          )
        )}
    </Section>
  )
};

const FinalReportSection: React.FC<{ session: ResearchSession }> = ({ session }) => {
  if (session.stage !== 'DONE') return null;

  return (
    <Section title="第 4 步：研究综述报告" stage="DONE" completedStages={['DONE']}>
      <SimpleMarkdownViewer content={session.finalReport} />
    </Section>
  );
};


// #endregion --- Stage Sections ---


function SidePanel() {
  const { addSession, deleteSession, resetActiveSession } = useStore()
  const { sessions, activeSessionId } = useStore();
  const activeSession = useMemo(() => sessions.find(s => s.id === activeSessionId), [sessions, activeSessionId]);
  
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.type === "STATE_UPDATED_FROM_BACKGROUND") {
        useStore.persist.rehydrate()
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])

  const handleStartResearch = (topic: string) => {
    let currentSessionId = activeSession?.id;
    if (!currentSessionId || activeSession.topic === "未命名研究") {
      currentSessionId = addSession(topic);
    }
    chrome.runtime.sendMessage({ type: "START_RESEARCH", topic, sessionId: currentSessionId });
  };
  
  const handleDeleteCurrentSession = () => {
    if (activeSession && confirm("您确定要删除这个研究项目吗？此操作不可撤销。")) {
        deleteSession(activeSession.id);
    }
  }

  const renderError = () => (
    <div style={styles.errorBox}>
      <h4>发生错误</h4>
      <p>{activeSession?.error}</p>
      <button onClick={() => resetActiveSession()} style={styles.button}>重置研究</button>
    </div>
  );

  return (
    <div style={styles.container}>
      <SessionManager />
      <div style={styles.header}>
         <h1>PubMed RAG 助理</h1>
         {activeSession && (
           <div>
             <button onClick={() => resetActiveSession()} style={{...styles.deleteSessionButton, color: '#6c757d', borderColor: '#6c757d', marginRight: '10px'}} title="重置当前研究">重置</button>
             <button onClick={handleDeleteCurrentSession} style={styles.deleteSessionButton} title="删除当前研究项目">删除</button>
           </div>
         )}
      </div>
      <div style={styles.mainContent}>
        {activeSession && <StrategyLogSection session={activeSession} />}
        
        {!activeSession && <InitialSection session={null} onStart={handleStartResearch} />}
        
        {activeSession && (
          <>
            {activeSession.error && renderError()}

            {activeSession.stage === 'IDLE' && <InitialSection session={activeSession} onStart={handleStartResearch} />}
            
            {activeSession.stage === 'PLANNING' && (
              activeSession.loading 
                ? <div style={styles.loadingBox}><p>AI正在为您规划研究方向...</p></div> 
                : <ResearchPlanSection session={activeSession} />
            )}

            {['SCREENING', 'GATHERING', 'SYNTHESIZING', 'DONE'].includes(activeSession.stage) && (
              <>
                <ResearchPlanSection session={activeSession} />
                <ScreeningResultsSection session={activeSession} />
                <FullTextGatheringSection session={activeSession} />
                {activeSession.stage === 'SYNTHESIZING' && <div style={styles.loadingBox}><p>AI正在阅读全文并撰写报告，这可能需要几分钟...</p></div>}
                <FinalReportSection session={activeSession} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "sans-serif", backgroundColor: '#f0f2f5' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 15px',
    backgroundColor: '#fff',
    borderBottom: '1px solid #dee2e6'
  },
  mainContent: { flex: 1, overflowY: 'auto' },
  sessionManager: { display: 'flex', padding: '10px', backgroundColor: '#f8f9fa', borderBottom: '1px solid #dee2e6', gap: '10px' },
  sessionSelect: { flex: 1, padding: '5px', borderRadius: '4px', border: '1px solid #ccc' },
  newSessionButton: { padding: '5px 10px', cursor: 'pointer', border: '1px solid #007bff', backgroundColor: 'white', color: '#007bff', borderRadius: '4px' },
  deleteSessionButton: { padding: '4px 8px', fontSize: '12px', cursor: 'pointer', border: '1px solid #dc3545', backgroundColor: 'transparent', color: '#dc3545', borderRadius: '4px'},
  description: { fontSize: 14, color: '#555', marginTop: 0 },
  textarea: { width: '100%', minHeight: '80px', boxSizing: 'border-box', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', marginTop: '5px' },
  textareaSmall: { width: '100%', minHeight: '50px', boxSizing: 'border-box', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', marginTop: '5px' },
  input: { width: '100%', boxSizing: 'border-box', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', marginTop: '5px' },
  button: { width: 'auto', padding: '10px 15px', marginTop: '10px', backgroundColor: "#007bff", color: "white", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 16, transition: 'background-color 0.2s' },
  buttonSecondary: { width: 'auto', padding: '8px 15px', marginTop: '10px', backgroundColor: "#e9ecef", color: "#212529", border: "1px solid #ced4da", borderRadius: 5, cursor: "pointer", fontSize: 14 },
  buttonDisabled: { backgroundColor: "#aaa", cursor: "not-allowed" },
  inputError: { border: '1px solid red' },
  errorText: { color: 'red', fontSize: '13px', marginTop: '5px' },
  errorBox: { margin: '15px', padding: '15px', backgroundColor: '#ffebee', border: '1px solid #ef5350', borderRadius: '5px', color: '#c62828' },
  successBox: { padding: '15px', backgroundColor: '#e8f5e9', border: '1px solid #66bb6a', borderRadius: '5px', color: '#2e7d32' },
  loadingBox: { textAlign: 'center', padding: '40px 20px', color: '#555' },
  planCard: { position: 'relative', border: '1px solid #e0e0e0', padding: '15px', margin: '10px 0', borderRadius: '8px', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  label: { fontWeight: 'bold', display: 'block', fontSize: '14px', marginBottom: '5px' },
  clarification: { fontStyle: 'italic', color: '#555', background: '#f8f9fa', padding: '10px', borderRadius: '5px', border: '1px solid #eee' },
  refinementBox: { marginTop: '25px', padding: '15px', border: '1px dashed #007bff', borderRadius: '8px', backgroundColor: 'rgba(0, 123, 255, 0.05)'},
  articleList: { maxHeight: '40vh', overflowY: 'auto', border: '1px solid #eee', padding: '5px', borderRadius: '5px' },
  articleItem: { borderBottom: '1px solid #eee', padding: '10px' },
  articleTitle: { margin: 0, fontSize: '14px', fontWeight: 'bold' },
  articleMeta: { margin: '5px 0', fontSize: '12px', color: '#333' },
  articleDetails: { marginTop: '8px', fontSize: '12px', cursor: 'pointer' },
  articleAbstract: { margin: '5px 0', paddingLeft: '10px', borderLeft: '3px solid #eee', color: '#555', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  reportContent: { marginTop: '20px', padding: '15px', backgroundColor: '#fff', borderRadius: '5px', border: '1px solid #dee2e6', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'serif' },
  section: {
    backgroundColor: '#ffffff',
    margin: '0 15px 15px 15px',
    borderRadius: '8px',
    border: '1px solid #dee2e6',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    overflow: 'hidden'
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px',
    cursor: 'pointer',
    backgroundColor: '#f8f9fa',
    fontWeight: 'bold'
  },
  sectionHeaderCompleted: {
    backgroundColor: '#e9ecef',
    color: '#495057'
  },
  sectionContent: {
    padding: '15px'
  },
  details: {
    marginBottom: '15px'
  },
  summary: {
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '14px',
    color: '#0056b3'
  },
  queryBox: { 
    padding: '10px', 
    marginTop: '10px', 
    backgroundColor: '#e9ecef', 
    borderRadius: '4px', 
    border: '1px solid #dee2e6', 
    wordBreak: 'break-all'
  },
  queryText: { 
    margin: 0, 
    fontSize: '13px', 
    color: '#343a40', 
    whiteSpace: 'pre-wrap'
  },
  logDetails: {
      margin: '15px',
      padding: '10px',
      backgroundColor: '#fff',
      border: '1px solid #dee2e6',
      borderRadius: '8px'
  },
  logSummary: {
      cursor: 'pointer',
      fontWeight: 'bold',
      fontSize: '14px',
  },
  logContainer: {
      maxHeight: '150px',
      overflowY: 'auto',
      marginTop: '10px',
      padding: '10px',
      backgroundColor: '#f8f9fa',
      borderRadius: '4px',
      borderLeft: '3px solid #007bff'
  },
  logEntry: {
      margin: '0 0 5px 0',
      fontSize: '12px',
      color: '#495057',
      whiteSpace: 'pre-wrap',
      fontFamily: 'monospace',
      lineHeight: '1.4'
  },
  inlineLoadingBox: {
    textAlign: 'center',
    padding: '20px',
    color: '#555',
    backgroundColor: 'rgba(0, 123, 255, 0.05)',
    borderRadius: '5px',
    margin: '10px 0',
    border: '1px dashed #007bff'
  },
};

export default SidePanel;