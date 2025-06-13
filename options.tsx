// RAG-main/options.tsx

import { Storage } from "@plasmohq/storage"
import React, { useState, useEffect } from "react"
import type { LLMConfig } from "./lib/types"

const storage = new Storage({ area: "local" })

const defaultConfig: LLMConfig = {
  provider: "gemini",
  apiKey: "",
  apiEndpoint: "",
  fastModel: "gemini-1.5-flash-latest",
  smartModel: "gemini-1.5-pro-latest",
  fetchRateLimit: 15,
  // 【删除】移除了 manualScrapingConfirmation 默认值
}

function OptionsPage() {
  const [config, setConfig] = useState<LLMConfig>(defaultConfig)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")

  useEffect(() => {
    const loadConfig = async () => {
      const savedConfig = await storage.get<LLMConfig>("llmConfig")
      // 合并加载的配置和默认配置，以确保新字段存在
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

  // 【修改】简化 handleConfigChange，不再需要处理复选框
  const handleConfigChange = (field: keyof LLMConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div style={styles.container}>
      <h1>PubMed RAG 智能助理 - 设置</h1>
      <p style={styles.description}>
        请在此处配置您的语言模型API密钥和其它设置。您的数据将安全地存储在本地。
      </p>

      {/* Provider, API Key, Endpoint, Models ... */}
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
      
      {/* 【删除】移除人工确认复选框的整个 div */}

      <div style={styles.formGroup}>
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