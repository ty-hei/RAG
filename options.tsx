// RAG-main/options.tsx

import { Storage } from "@plasmohq/storage"
import React, { useState, useEffect } from "react"
import type { LLMModelConfig, WebSearchConfig, NCBIConfig, SettingsState } from "./lib/types"
import { useThemeStore } from "./lib/theme-store"
import { v4 as uuidv4 } from 'uuid';
import { callLlm } from "./lib/llm";

const storage = new Storage({ area: "local" })

// Default Templates
const defaultLlmConfig: Omit<LLMModelConfig, 'id' | 'name'> = {
  provider: "gemini",
  apiKey: "",
  apiEndpoint: "",
  fastModel: "gemini-1.5-flash",
  smartModel: "gemini-1.5-pro",
}

const defaultWebConfig: Omit<WebSearchConfig, 'id' | 'name'> = {
  provider: "none",
  tavilyApiKey: "",
  googleApiKey: "",
  googleCseId: "",
}

const defaultNcbiConfig: Omit<NCBIConfig, 'id' | 'name'> = {
  ncbiApiKey: "",
  fetchRateLimit: 15,
}

function OptionsPage() {
  const [settings, setSettings] = useState<SettingsState>({
    llmConfigs: [], webSearchConfigs: [], ncbiConfigs: [],
    activeLlmId: null, activeWebSearchId: null, activeNcbiId: null
  })
  const [activeTab, setActiveTab] = useState<'llm' | 'web' | 'ncbi'>('llm');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle")
  const [testMessage, setTestMessage] = useState<string>("")

  const { theme } = useThemeStore();
  const styles = theme === 'dark' ? darkStyles : lightStyles;

  useEffect(() => {
    const loadSettings = async () => {
      const savedSettings = await storage.get<any>("settingsState")

      if (savedSettings && savedSettings.llmConfigs) {
        // Already in new format
        setSettings(savedSettings)
      } else {
        // Migration Logic
        console.log("Migrating settings to new format...");
        let oldConfigs: any[] = [];
        let oldActiveId = null;

        if (savedSettings && savedSettings.configs) {
          // Intermediate format (multi-config but coupled)
          oldConfigs = savedSettings.configs;
          oldActiveId = savedSettings.activeConfigId;
        } else {
          // Legacy format (single config)
          const oldConfig = await storage.get<any>("llmConfig");
          if (oldConfig) {
            oldConfigs = [{ ...oldConfig, id: uuidv4(), name: "默认配置" }];
            oldActiveId = oldConfigs[0].id;
          }
        }

        if (oldConfigs.length > 0) {
          const newLlmConfigs: LLMModelConfig[] = [];
          const newWebConfigs: WebSearchConfig[] = [];
          const newNcbiConfigs: NCBIConfig[] = [];

          let firstLlmId = null;
          let firstWebId = null;
          let firstNcbiId = null;

          oldConfigs.forEach((c, index) => {
            const llmId = uuidv4();
            const webId = uuidv4();
            const ncbiId = uuidv4();

            if (c.id === oldActiveId || index === 0) {
              firstLlmId = llmId;
              firstWebId = webId;
              firstNcbiId = ncbiId;
            }

            newLlmConfigs.push({
              id: llmId,
              name: c.name || `配置 ${index + 1}`,
              provider: c.provider,
              apiKey: c.apiKey,
              apiEndpoint: c.apiEndpoint,
              fastModel: c.fastModel,
              smartModel: c.smartModel
            });

            newWebConfigs.push({
              id: webId,
              name: `${c.name || '配置'} - Web`,
              provider: c.webSearchProvider,
              tavilyApiKey: c.tavilyApiKey,
              googleApiKey: c.googleApiKey,
              googleCseId: c.googleCseId
            });

            newNcbiConfigs.push({
              id: ncbiId,
              name: `${c.name || '配置'} - NCBI`,
              ncbiApiKey: c.ncbiApiKey,
              fetchRateLimit: c.fetchRateLimit
            });
          });

          const newSettingsState: SettingsState = {
            llmConfigs: newLlmConfigs,
            webSearchConfigs: newWebConfigs,
            ncbiConfigs: newNcbiConfigs,
            activeLlmId: firstLlmId,
            activeWebSearchId: firstWebId,
            activeNcbiId: firstNcbiId
          };

          setSettings(newSettingsState);
          await storage.set("settingsState", newSettingsState);
        } else {
          // Initialize fresh
          const llmId = uuidv4();
          const webId = uuidv4();
          const ncbiId = uuidv4();

          const newSettingsState: SettingsState = {
            llmConfigs: [{ ...defaultLlmConfig, id: llmId, name: "默认 LLM 配置" } as LLMModelConfig],
            webSearchConfigs: [{ ...defaultWebConfig, id: webId, name: "默认 Web 搜索配置" } as WebSearchConfig],
            ncbiConfigs: [{ ...defaultNcbiConfig, id: ncbiId, name: "默认 NCBI 配置" } as NCBIConfig],
            activeLlmId: llmId,
            activeWebSearchId: webId,
            activeNcbiId: ncbiId
          };
          setSettings(newSettingsState);
          await storage.set("settingsState", newSettingsState);
        }
      }
    }
    loadSettings()
  }, [])

  const saveSettings = async (newSettings: SettingsState) => {
    setSettings(newSettings);
    await storage.set("settingsState", newSettings);
  }

  // --- CRUD Helpers ---

  const createConfig = (type: 'llm' | 'web' | 'ncbi') => {
    const id = uuidv4();
    let newSettings = { ...settings };

    if (type === 'llm') {
      const newConfig = { ...defaultLlmConfig, id, name: `新 LLM 配置 ${settings.llmConfigs.length + 1}` } as LLMModelConfig;
      newSettings.llmConfigs = [...settings.llmConfigs, newConfig];
      if (!newSettings.activeLlmId) newSettings.activeLlmId = id;
    } else if (type === 'web') {
      const newConfig = { ...defaultWebConfig, id, name: `新 Web 配置 ${settings.webSearchConfigs.length + 1}` } as WebSearchConfig;
      newSettings.webSearchConfigs = [...settings.webSearchConfigs, newConfig];
      if (!newSettings.activeWebSearchId) newSettings.activeWebSearchId = id;
    } else {
      const newConfig = { ...defaultNcbiConfig, id, name: `新 NCBI 配置 ${settings.ncbiConfigs.length + 1}` } as NCBIConfig;
      newSettings.ncbiConfigs = [...settings.ncbiConfigs, newConfig];
      if (!newSettings.activeNcbiId) newSettings.activeNcbiId = id;
    }

    saveSettings(newSettings);
    setEditingId(id);
  }

  const deleteConfig = (type: 'llm' | 'web' | 'ncbi', id: string) => {
    if (!confirm("确定要删除此配置吗？")) return;
    let newSettings = { ...settings };

    if (type === 'llm') {
      newSettings.llmConfigs = settings.llmConfigs.filter(c => c.id !== id);
      if (settings.activeLlmId === id) newSettings.activeLlmId = newSettings.llmConfigs[0]?.id || null;
    } else if (type === 'web') {
      newSettings.webSearchConfigs = settings.webSearchConfigs.filter(c => c.id !== id);
      if (settings.activeWebSearchId === id) newSettings.activeWebSearchId = newSettings.webSearchConfigs[0]?.id || null;
    } else {
      newSettings.ncbiConfigs = settings.ncbiConfigs.filter(c => c.id !== id);
      if (settings.activeNcbiId === id) newSettings.activeNcbiId = newSettings.ncbiConfigs[0]?.id || null;
    }

    saveSettings(newSettings);
    if (editingId === id) setEditingId(null);
  }

  const setActive = (type: 'llm' | 'web' | 'ncbi', id: string) => {
    let newSettings = { ...settings };
    if (type === 'llm') newSettings.activeLlmId = id;
    else if (type === 'web') newSettings.activeWebSearchId = id;
    else newSettings.activeNcbiId = id;
    saveSettings(newSettings);
  }

  const updateConfig = (type: 'llm' | 'web' | 'ncbi', id: string, updates: any) => {
    let newSettings = { ...settings };
    if (type === 'llm') {
      newSettings.llmConfigs = settings.llmConfigs.map(c => c.id === id ? { ...c, ...updates } : c);
    } else if (type === 'web') {
      newSettings.webSearchConfigs = settings.webSearchConfigs.map(c => c.id === id ? { ...c, ...updates } : c);
    } else {
      newSettings.ncbiConfigs = settings.ncbiConfigs.map(c => c.id === id ? { ...c, ...updates } : c);
    }
    setSettings(newSettings); // Optimistic update
  }

  const persistChanges = async () => {
    setSaveStatus("saving");
    await storage.set("settingsState", settings);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  const handleTestConnection = async (config: LLMModelConfig) => {
    if (!config.apiKey) {
      alert("请先输入 API Key");
      return;
    }
    setTestStatus("testing");
    setTestMessage("正在连接...");
    try {
      // Construct a temporary runtime config for testing
      const testRuntimeConfig = {
        ...config,
        webSearchProvider: 'none' as const,
        fetchRateLimit: 15
      };
      const response = await callLlm("Hello", testRuntimeConfig, config.fastModel, "text");
      setTestStatus("success");
      setTestMessage(`连接成功！`);
    } catch (error) {
      setTestStatus("error");
      setTestMessage(`连接失败: ${error.message}`);
    }
  }

  // --- Render Helpers ---

  const renderSidebarItem = (id: string, name: string, isActive: boolean, type: 'llm' | 'web' | 'ncbi') => (
    <div
      key={id}
      onClick={() => setEditingId(id)}
      style={{
        padding: '10px',
        borderRadius: '5px',
        cursor: 'pointer',
        backgroundColor: editingId === id ? (theme === 'dark' ? '#333' : '#e9ecef') : 'transparent',
        border: isActive ? `1px solid ${theme === 'dark' ? '#00aaff' : '#007bff'}` : '1px solid transparent',
        marginBottom: '5px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
    >
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
        <div style={{ fontWeight: 'bold', color: styles.label.color, fontSize: '14px' }}>{name}</div>
        {isActive && <div style={{ fontSize: '10px', color: theme === 'dark' ? '#00aaff' : '#007bff' }}>● 当前使用</div>}
      </div>
    </div>
  );

  const renderLlmEditor = (config: LLMModelConfig) => (
    <>
      <div style={styles.formGroup}>
        <label style={styles.label}>配置名称</label>
        <input type="text" style={styles.input} value={config.name} onChange={(e) => updateConfig('llm', config.id, { name: e.target.value })} />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>AI 提供商</label>
        <select style={styles.input} value={config.provider} onChange={(e) => updateConfig('llm', config.id, { provider: e.target.value })}>
          <option value="gemini">Google Gemini</option>
          <option value="openai">OpenAI 兼容 API</option>
        </select>
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>API 密钥</label>
        <input type="password" style={styles.input} value={config.apiKey} onChange={(e) => updateConfig('llm', config.id, { apiKey: e.target.value })} placeholder="输入 API Key" />
      </div>
      {config.provider === 'openai' && (
        <div style={styles.formGroup}>
          <label style={styles.label}>API Endpoint</label>
          <input type="text" style={styles.input} value={config.apiEndpoint || ''} onChange={(e) => updateConfig('llm', config.id, { apiEndpoint: e.target.value })} placeholder="https://api.openai.com/v1" />
        </div>
      )}
      <div style={styles.formGroup}>
        <label style={styles.label}>快速模型 (Planning)</label>
        <input type="text" style={styles.input} value={config.fastModel} onChange={(e) => updateConfig('llm', config.id, { fastModel: e.target.value })} />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>增强模型 (Reporting)</label>
        <input type="text" style={styles.input} value={config.smartModel} onChange={(e) => updateConfig('llm', config.id, { smartModel: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
        <button onClick={persistChanges} style={styles.button}>{saveStatus === 'saving' ? '保存中...' : '保存配置'}</button>
        <button onClick={() => handleTestConnection(config)} style={{ ...styles.button, backgroundColor: '#28a745' }}>{testStatus === 'testing' ? '测试中...' : '测试连接'}</button>
      </div>
      {testMessage && <div style={{ marginTop: '10px', color: testStatus === 'error' ? 'red' : 'green' }}>{testMessage}</div>}
    </>
  );

  const renderWebEditor = (config: WebSearchConfig) => (
    <>
      <div style={styles.formGroup}>
        <label style={styles.label}>配置名称</label>
        <input type="text" style={styles.input} value={config.name} onChange={(e) => updateConfig('web', config.id, { name: e.target.value })} />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>搜索服务商</label>
        <select style={styles.input} value={config.provider} onChange={(e) => updateConfig('web', config.id, { provider: e.target.value })}>
          <option value="none">禁用</option>
          <option value="google">Google Search</option>
          <option value="tavily">Tavily AI</option>
        </select>
      </div>
      {config.provider === 'tavily' && (
        <div style={styles.formGroup}>
          <label style={styles.label}>Tavily API Key</label>
          <input type="password" style={styles.input} value={config.tavilyApiKey || ''} onChange={(e) => updateConfig('web', config.id, { tavilyApiKey: e.target.value })} />
        </div>
      )}
      {config.provider === 'google' && (
        <>
          <div style={styles.formGroup}>
            <label style={styles.label}>Google API Key</label>
            <input type="password" style={styles.input} value={config.googleApiKey || ''} onChange={(e) => updateConfig('web', config.id, { googleApiKey: e.target.value })} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>CSE ID</label>
            <input type="password" style={styles.input} value={config.googleCseId || ''} onChange={(e) => updateConfig('web', config.id, { googleCseId: e.target.value })} />
          </div>
        </>
      )}
      <div style={{ marginTop: '20px' }}>
        <button onClick={persistChanges} style={styles.button}>{saveStatus === 'saving' ? '保存中...' : '保存配置'}</button>
      </div>
    </>
  );

  const renderNcbiEditor = (config: NCBIConfig) => (
    <>
      <div style={styles.formGroup}>
        <label style={styles.label}>配置名称</label>
        <input type="text" style={styles.input} value={config.name} onChange={(e) => updateConfig('ncbi', config.id, { name: e.target.value })} />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>NCBI API Key (可选)</label>
        <input type="password" style={styles.input} value={config.ncbiApiKey || ''} onChange={(e) => updateConfig('ncbi', config.id, { ncbiApiKey: e.target.value })} placeholder="留空则使用默认速率" />
        <p style={styles.fieldDescription}>配置 Key 可将 API 速率限制从 3次/秒 提升至 10次/秒。</p>
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>全文抓取速率 (秒/篇)</label>
        <input type="number" style={styles.input} min="1" max="60" value={config.fetchRateLimit} onChange={(e) => updateConfig('ncbi', config.id, { fetchRateLimit: parseInt(e.target.value) || 15 })} />
        <p style={styles.fieldDescription}>建议设置：无Key时 5-10秒，有Key时 2-5秒。</p>
      </div>
      <div style={{ marginTop: '20px' }}>
        <button onClick={persistChanges} style={styles.button}>{saveStatus === 'saving' ? '保存中...' : '保存配置'}</button>
      </div>
    </>
  );

  const getActiveList = () => {
    if (activeTab === 'llm') return settings.llmConfigs;
    if (activeTab === 'web') return settings.webSearchConfigs;
    return settings.ncbiConfigs;
  }

  const getActiveId = () => {
    if (activeTab === 'llm') return settings.activeLlmId;
    if (activeTab === 'web') return settings.activeWebSearchId;
    return settings.activeNcbiId;
  }

  const getCurrentEditingConfig = () => {
    if (!editingId) return null;
    if (activeTab === 'llm') return settings.llmConfigs.find(c => c.id === editingId);
    if (activeTab === 'web') return settings.webSearchConfigs.find(c => c.id === editingId);
    return settings.ncbiConfigs.find(c => c.id === editingId);
  }

  return (
    <div style={styles.container}>
      <h1 style={{ color: styles.label.color, marginBottom: '30px' }}>PubMed RAG 设置</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${theme === 'dark' ? '#333' : '#ddd'}`, marginBottom: '20px' }}>
        <div onClick={() => { setActiveTab('llm'); setEditingId(null); }} style={{ ...styles.tab, borderBottom: activeTab === 'llm' ? `2px solid ${theme === 'dark' ? '#00aaff' : '#007bff'}` : 'none', color: activeTab === 'llm' ? (theme === 'dark' ? '#00aaff' : '#007bff') : styles.label.color }}>🤖 AI 模型</div>
        <div onClick={() => { setActiveTab('web'); setEditingId(null); }} style={{ ...styles.tab, borderBottom: activeTab === 'web' ? `2px solid ${theme === 'dark' ? '#00aaff' : '#007bff'}` : 'none', color: activeTab === 'web' ? (theme === 'dark' ? '#00aaff' : '#007bff') : styles.label.color }}>🌐 Web 搜索</div>
        <div onClick={() => { setActiveTab('ncbi'); setEditingId(null); }} style={{ ...styles.tab, borderBottom: activeTab === 'ncbi' ? `2px solid ${theme === 'dark' ? '#00aaff' : '#007bff'}` : 'none', color: activeTab === 'ncbi' ? (theme === 'dark' ? '#00aaff' : '#007bff') : styles.label.color }}>🧬 NCBI / 速率</div>
      </div>

      <div style={{ display: 'flex', gap: '20px', minHeight: '400px' }}>
        {/* Sidebar List */}
        <div style={{ width: '220px', borderRight: `1px solid ${theme === 'dark' ? '#333' : '#eee'}`, paddingRight: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', color: '#888' }}>配置列表</h3>
            <button onClick={() => createConfig(activeTab)} style={{ ...styles.buttonSecondary, padding: '2px 8px', fontSize: '12px' }}>+ 新建</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {getActiveList().map(c => renderSidebarItem(c.id, c.name, c.id === getActiveId(), activeTab))}
          </div>
        </div>

        {/* Main Editor */}
        <div style={{ flex: 1, paddingLeft: '10px' }}>
          {editingId && getCurrentEditingConfig() ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '10px', borderBottom: `1px solid ${theme === 'dark' ? '#333' : '#eee'}` }}>
                <h2 style={{ margin: 0, fontSize: '18px', color: styles.label.color }}>编辑配置</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {getActiveId() !== editingId && (
                    <button onClick={() => setActive(activeTab, editingId)} style={styles.buttonSecondary}>设为当前激活</button>
                  )}
                  <button onClick={() => deleteConfig(activeTab, editingId)} style={{ ...styles.buttonSecondary, color: 'red', borderColor: 'red' }}>删除</button>
                </div>
              </div>

              {activeTab === 'llm' && renderLlmEditor(getCurrentEditingConfig() as LLMModelConfig)}
              {activeTab === 'web' && renderWebEditor(getCurrentEditingConfig() as WebSearchConfig)}
              {activeTab === 'ncbi' && renderNcbiEditor(getCurrentEditingConfig() as NCBIConfig)}
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#888', flexDirection: 'column' }}>
              <p>请从左侧选择一个配置进行编辑</p>
              <p style={{ fontSize: '12px' }}>当前激活的配置将用于所有后台任务</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const lightStyles: { [key: string]: React.CSSProperties } = {
  container: { maxWidth: 900, margin: "30px auto", padding: 30, fontFamily: "sans-serif" },
  tab: { padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold' },
  formGroup: { marginBottom: 15 },
  label: { display: "block", marginBottom: 5, fontWeight: "bold", color: '#333', fontSize: '14px' },
  input: { width: "100%", padding: 10, boxSizing: "border-box", borderRadius: '4px', border: '1px solid #ccc' },
  fieldDescription: { fontSize: 12, color: "#777", marginTop: 5 },
  button: {
    padding: "10px 20px",
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: 5,
    cursor: "pointer",
    fontSize: 14,
  },
  buttonSecondary: {
    padding: "6px 12px",
    backgroundColor: "transparent",
    color: "#007bff",
    border: "1px solid #007bff",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 13,
  }
};

const darkStyles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: 900,
    margin: "30px auto",
    padding: 30,
    fontFamily: "'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif",
    backgroundColor: '#1e1e1e',
    color: '#d4d4d4',
    borderRadius: '8px',
    border: '1px solid #333'
  },
  tab: { padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold' },
  formGroup: { marginBottom: 15 },
  label: { display: "block", marginBottom: 5, fontWeight: "bold", color: '#00aaff', fontSize: '14px' },
  input: {
    width: "100%",
    padding: 10,
    boxSizing: "border-box",
    backgroundColor: '#2a2a2a',
    color: '#d4d4d4',
    border: '1px solid #3c3c3c',
    borderRadius: '4px',
    fontSize: '14px'
  },
  fieldDescription: { fontSize: 12, color: "#888", marginTop: 5 },
  button: {
    padding: "10px 20px",
    backgroundColor: "#007acc",
    color: "white",
    border: "none",
    borderRadius: 5,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 'bold'
  },
  buttonSecondary: {
    padding: "6px 12px",
    backgroundColor: "transparent",
    color: "#00aaff",
    border: "1px solid #00aaff",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 13,
  }
};

export default OptionsPage;