// RAG-main/options.tsx

import { Storage } from "@plasmohq/storage"
import React, { useState, useEffect } from "react"
import type { LLMConfig } from "./lib/types"

const storage = new Storage({ area: "local" })

const defaultConfig: LLMConfig = {
  provider: "gemini",
  apiKey: "",
  apiEndpoint: "",
  fastModel: "gemini-1.5-flash",
  smartModel: "gemini-2.0-flash",
  fetchRateLimit: 15,
  webSearchProvider: "none",
  tavilyApiKey: "",
  // ✅ 【新增】初始化 Google 配置
  googleApiKey: "",
  googleCseId: "",
  ncbiApiKey: "",
}

function OptionsPage() {
  const [config, setConfig] = useState<LLMConfig>(defaultConfig)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")

  useEffect(() => {
    const loadConfig = async () => {
      const savedConfig = await storage.get<LLMConfig>("llmConfig")
      if (savedConfig) {
        setConfig({ ...defaultConfig, ...savedConfig })
      }
    }
    loadConfig()
  }, [])

  const handleSave = async () => {
    setSaveStatus("saving")
    try {
      await storage.set("llmConfig", config)
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2000)
    } catch (error) {
      console.error("Failed to save config:", error)
      setSaveStatus("idle")
      alert("保存失败，请查看控制台日志！")
    }
  }

  const getButtonText = () => {
    if (saveStatus === "saving") return "正在保存..."
    if (saveStatus === "saved") return "已保存！"
    return "保存设置"
  }

  const handleConfigChange = (field: keyof LLMConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div style={styles.container}>
      <h1>PubMed RAG 智能助理 - 设置</h1>
      
      <h2 style={{marginTop: '40px'}}>AI 模型设置</h2>
      <p style={styles.description}>
        请在此处配置您的语言模型API密钥。您的数据将安全地存储在本地。
      </p>

      <div style={styles.formGroup}>
        <label style={styles.label}>AI 提供商</label>
        <select
          value={config.provider}
          onChange={(e) => handleConfigChange("provider", e.target.value)}
          style={styles.input}>
          <option value="gemini">Google Gemini</option>
          <option value="openai">OpenAI 兼容 API</option>
        </select>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>API 密钥</label>
        <input
          type="password"
          style={styles.input}
          placeholder="在此处粘贴您的API密钥"
          value={config.apiKey}
          onChange={(e) => handleConfigChange("apiKey", e.target.value)}
        />
      </div>

      {config.provider === "openai" && (
        <div style={styles.formGroup}>
          <label style={styles.label}>API Endpoint URL (仅OpenAI兼容API需要)</label>
          <input
            type="text"
            style={styles.input}
            placeholder="例如: https://api.openai.com/v1"
            value={config.apiEndpoint}
            onChange={(e) => handleConfigChange("apiEndpoint", e.target.value)}
          />
        </div>
      )}

      <div style={styles.formGroup}>
        <label style={styles.label}>快速模型名称 (用于规划和初筛)</label>
        <input
          type="text"
          style={styles.input}
          placeholder="例如: gemini-1.5-flash-latest 或 gpt-4o-mini"
          value={config.fastModel}
          onChange={(e) => handleConfigChange("fastModel", e.target.value)}
        />
        <p style={styles.fieldDescription}>
          一个速度快、成本效益高的模型，用于研究规划、摘要评分等任务。
        </p>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>增强模型名称 (用于生成最终报告)</label>
        <input
          type="text"
          style={styles.input}
          placeholder="例如: gemini-1.5-pro-latest 或 gpt-4o"
          value={config.smartModel}
          onChange={(e) => handleConfigChange("smartModel", e.target.value)}
        />
        <p style={styles.fieldDescription}>
          一个能力强、更深入的模型，用于从全文生成高质量的文献综述报告。
        </p>
      </div>
      
      <hr style={{margin: '30px 0', border: 'none', borderTop: '1px solid #eee'}}/>
      
      <h2>工作流设置</h2>
      
      <div style={styles.formGroup}>
        <label style={styles.label}>NCBI API Key (推荐)</label>
        <input
          type="password"
          style={styles.input}
          placeholder="粘贴您的 NCBI API 密钥以提高PubMed请求速率"
          value={config.ncbiApiKey}
          onChange={(e) => handleConfigChange("ncbiApiKey", e.target.value)}
        />
        <p style={styles.fieldDescription}>
            从您的NCBI账户免费获取。可以避免因请求频繁而被PubMed临时屏蔽。此项为可选。
        </p>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>全文抓取速率限制（秒/篇）</label>
        <input
          type="number"
          style={styles.input}
          min="5"
          max="60"
          value={config.fetchRateLimit}
          onChange={(e) => handleConfigChange("fetchRateLimit", parseInt(e.target.value, 10))}
        />
        <p style={styles.fieldDescription}>
          为了避免被网站屏蔽，插件将以这个速度逐一打开标签页抓取全文。建议15-30秒。
        </p>
      </div>

      <hr style={{margin: '30px 0', border: 'none', borderTop: '1px solid #eee'}}/>
      <h2>Web搜索设置</h2>
      <p style={styles.fieldDescription}>
        (可选) 启用Web搜索服务，可以用新闻、博客等信息丰富研究上下文。
      </p>
      <div style={styles.formGroup}>
        <label style={styles.label}>Web搜索服务商</label>
        <select
          value={config.webSearchProvider}
          onChange={(e) => handleConfigChange("webSearchProvider", e.target.value)}
          style={styles.input}>
          <option value="none">禁用</option>
          {/* ✅ 【变更】增加 Google Search 选项 */}
          <option value="google">Google Search</option>
          <option value="tavily">Tavily AI</option>
        </select>
      </div>

      {config.webSearchProvider === 'tavily' && (
        <div style={styles.formGroup}>
          <label style={styles.label}>Tavily AI API 密钥</label>
          <input
            type="password"
            style={styles.input}
            placeholder="粘贴您的 Tavily API 密钥"
            value={config.tavilyApiKey}
            onChange={(e) => handleConfigChange("tavilyApiKey", e.target.value)}
          />
        </div>
      )}

      {/* ✅ 【新增】Google Search 的配置输入框 */}
      {config.webSearchProvider === 'google' && (
        <>
          <div style={styles.formGroup}>
            <label style={styles.label}>Google API 密钥</label>
            <input
              type="password"
              style={styles.input}
              placeholder="粘贴您的 Google API 密钥"
              value={config.googleApiKey}
              onChange={(e) => handleConfigChange("googleApiKey", e.target.value)}
            />
             <p style={styles.fieldDescription}>
                从 Google Cloud Console 获取。需要启用 Custom Search API。
            </p>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Google 可编程搜索引擎 ID (CSE ID)</label>
            <input
              type="password"
              style={styles.input}
              placeholder="粘贴您的搜索引擎 ID"
              value={config.googleCseId}
              onChange={(e) => handleConfigChange("googleCseId", e.target.value)}
            />
             <p style={styles.fieldDescription}>
                在 Programmable Search Engine 控制面板中创建并获取。
            </p>
          </div>
        </>
      )}

      <div style={{...styles.formGroup, marginTop: '40px'}}>
        <button
          onClick={handleSave}
          style={{ ...styles.button, ...(saveStatus === 'saving' ? styles.buttonDisabled : {}) }}
          disabled={saveStatus === "saving"}>
          {getButtonText()}
        </button>
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { maxWidth: 600, margin: "50px auto", padding: 20, fontFamily: "sans-serif" },
  description: { color: "#555" },
  formGroup: { marginBottom: 20 },
  label: { display: "block", marginBottom: 5, fontWeight: "bold" },
  input: { width: "100%", padding: 8, boxSizing: "border-box" },
  fieldDescription: { fontSize: 12, color: "#777", marginTop: 5 },
  button: {
    width: "100%",
    padding: "10px 15px",
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: 5,
    cursor: "pointer",
    fontSize: 16,
    opacity: 1,
    transition: "background-color 0.2s"
  },
  buttonDisabled: {
    backgroundColor: "#aaa",
    cursor: "not-allowed"
  }
}

export default OptionsPage