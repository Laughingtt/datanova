import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../stores/app";
import { querySkillApi, type QuerySkill } from "../../api/client";
import SkillForm from "./SkillForm";
import AIGenerateDialog from "./AIGenerateDialog";

export default function QuerySkillsPage() {
  const { selectedDatasourceId } = useAppStore();
  const dsId = selectedDatasourceId!;

  // State
  const [selectedDomain, setSelectedDomain] = useState<string>("__all__");
  const [domains, setDomains] = useState<string[]>([]);
  const [skills, setSkills] = useState<QuerySkill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<QuerySkill | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{ skills: Array<{ skillId: string; skillDir: string; skillName: string; skillSummary: string; skillFullContent: string }> } | null>(null);
  const [aiGeneratedData, setAIGeneratedData] = useState<any>(null);
  // Stable form key: changes only when user explicitly opens a different form
  const [formKey, setFormKey] = useState(0);

  // Load domains
  const loadDomains = useCallback(async () => {
    if (!dsId) return;
    try {
      const list = await querySkillApi.domains(dsId);
      setDomains(list);
    } catch { setDomains([]); }
  }, [dsId]);

  // Load skills
  const loadSkills = useCallback(async () => {
    if (!dsId) return;
    setLoading(true);
    try {
      const domain = selectedDomain === "__all__" ? undefined : selectedDomain;
      const list = await querySkillApi.list(dsId, domain);
      setSkills(list);
    } catch { setSkills([]); }
    finally { setLoading(false); }
  }, [dsId, selectedDomain]);

  useEffect(() => { loadDomains(); loadSkills(); }, [loadDomains, loadSkills]);

  // Reset selection when domain changes
  useEffect(() => {
    setSelectedSkill(null);
    setShowForm(false);
    setAIGeneratedData(null);
  }, [selectedDomain]);

  // Toggle skill enabled/disabled
  const handleToggle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await querySkillApi.toggle(dsId, id);
      loadSkills();
    } catch (err) { console.error("Toggle failed:", err); }
  };

  // Delete skill
  const handleDelete = async () => {
    setSelectedSkill(null);
    setShowForm(false);
    setAIGeneratedData(null);
    loadSkills();
    loadDomains();
  };

  // Save callback
  const handleSave = () => {
    setSelectedSkill(null);
    setShowForm(false);
    setAIGeneratedData(null);
    loadSkills();
    loadDomains();
  };

  // Cancel form
  const handleCancel = () => {
    setSelectedSkill(null);
    setShowForm(false);
    setAIGeneratedData(null);
  };

  // Select skill for editing
  const handleSelectSkill = (skill: QuerySkill) => {
    setSelectedSkill(skill);
    setShowForm(true);
    setFormKey((k) => k + 1);
  };

  // Create new skill
  const handleCreate = () => {
    setSelectedSkill(null);
    setShowForm(true);
    setFormKey((k) => k + 1);
  };

  // AI generate callback — skill data returned from dialog
  const handleAIGenerated = (skillData: any) => {
    if (skillData?._batch) {
      // Batch generation: skills already auto-created, just reload the list
      loadDomains();
      loadSkills();
    } else {
      // Single generation: open form with AI data pre-filled
      setSelectedSkill(null);
      setAIGeneratedData(skillData); // Set data BEFORE incrementing formKey
      setShowForm(true);
      setFormKey((k) => k + 1); // Force remount with new data
    }
  };

  // Preview AI perspective
  const handlePreview = async () => {
    if (!dsId) return;
    setPreviewLoading(true);
    try {
      const result = await querySkillApi.preview(dsId);
      setPreviewData(result);
      setShowPreview(true);
    } catch (err) {
      setPreviewData({ skills: [] });
      setShowPreview(true);
    } finally { setPreviewLoading(false); }
  };

  // Get trigger keywords as array
  const getKeywords = (skill: QuerySkill): string[] => {
    try { return JSON.parse(skill.trigger_keywords) as string[]; } catch { return []; }
  };

  return (
    <div className="h-full flex flex-col bg-[var(--canvas)]">
      <div className="sunset-stripe" />

      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="px-8 pt-8 pb-4">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="font-display text-heading-2 text-[var(--ink)]">查询技能</h2>
              <p className="text-body-sm text-[var(--slate)] mt-1">
                让 AI 掌握你的业务查询经验，提升复杂查询准确度
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handlePreview} disabled={previewLoading} className="btn-secondary inline-flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                {previewLoading ? "加载中..." : "预览 AI 视角"}
              </button>
              <button onClick={() => setShowAIDialog(true)} className="btn-secondary inline-flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                AI 生成
              </button>
              <button onClick={handleCreate} className="btn-primary inline-flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                新增技能
              </button>
            </div>
          </div>
        </div>

        {/* Content: 3-column layout */}
        <div className="flex-1 flex min-h-0 px-8 pb-8 gap-4">
          {/* Left: Domain list (140px) */}
          <div className="w-[140px] flex-shrink-0 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5">
              <button
                onClick={() => setSelectedDomain("__all__")}
                className={`w-full text-left px-3 py-2.5 rounded-md transition-colors text-sm ${
                  selectedDomain === "__all__"
                    ? "bg-[var(--primary-soft)] border border-[var(--primary)] text-[var(--primary-text)]"
                    : "hover:bg-[var(--surface)] border border-transparent text-[var(--ink)]"
                }`}
              >
                📋 全部
              </button>
              {domains.map((domain) => (
                <button
                  key={domain}
                  onClick={() => setSelectedDomain(domain)}
                  className={`w-full text-left px-3 py-2.5 rounded-md transition-colors text-sm ${
                    selectedDomain === domain
                      ? "bg-[var(--primary-soft)] border border-[var(--primary)] text-[var(--primary-text)]"
                      : "hover:bg-[var(--surface)] border border-transparent text-[var(--ink)]"
                  }`}
                >
                  🎯 {domain}
                </button>
              ))}
            </div>
          </div>

          {/* Middle: Skill list (240px) */}
          <div className="w-[240px] flex-shrink-0 flex flex-col min-h-0">
            <div className="mb-2">
              <h4 className="text-xs font-medium text-[var(--steel)] uppercase tracking-wide">
                查询技能
              </h4>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
              {loading ? (
                <p className="text-sm text-[var(--steel)] py-4">加载中...</p>
              ) : skills.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-[var(--steel)]">暂无技能</p>
                  <p className="text-xs text-[var(--stone)] mt-1">
                    点击「新增技能」或「AI 生成」添加
                  </p>
                </div>
              ) : (
                skills.map((skill) => {
                  const isSelected = selectedSkill?.id === skill.id;
                  const keywords = getKeywords(skill);
                  return (
                    <div
                      key={skill.id}
                      onClick={() => handleSelectSkill(skill)}
                      className={`relative px-3 py-2.5 rounded-md transition-colors cursor-pointer group ${
                        isSelected
                          ? "bg-[var(--primary-soft)] border border-[var(--primary)]"
                          : "hover:bg-[var(--surface)] border border-transparent"
                      } ${!skill.enabled ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-[var(--ink)] truncate flex-1">
                          {skill.name}
                        </span>
                        <button
                          onClick={(e) => handleToggle(skill.id, e)}
                          className={`ml-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] transition-colors ${
                            skill.enabled
                              ? "bg-[var(--success)]/20 text-[var(--success)]"
                              : "bg-[var(--surface)] text-[var(--steel)]"
                          }`}
                          title={skill.enabled ? "点击禁用" : "点击启用"}
                        >
                          {skill.enabled ? "✓" : "○"}
                        </button>
                      </div>
                      {keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {keywords.slice(0, 3).map((kw) => (
                            <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] text-[var(--steel)]">
                              {kw}
                            </span>
                          ))}
                          {keywords.length > 3 && (
                            <span className="text-[10px] text-[var(--steel)]">+{keywords.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Form / Detail (flex-1) */}
          <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar bg-[var(--surface)] rounded-xl border border-[var(--hairline)]">
            {showForm ? (
              <SkillForm
                key={formKey}
                datasourceId={dsId}
                skill={selectedSkill}
                initialData={aiGeneratedData}
                onSave={handleSave}
                onDelete={handleDelete}
                onCancel={handleCancel}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-sm text-[var(--steel)]">
                    选择左侧技能编辑，或点击「新增技能」
                  </p>
                  <p className="text-xs text-[var(--stone)] mt-1">
                    查询技能通过 Skill 渐进式加载：摘要始终注入 System Prompt，完整内容在 Agent 需要时按需加载
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Generate Dialog */}
      {showAIDialog && (
        <AIGenerateDialog
          datasourceId={dsId}
          onGenerated={(skillData) => {
            handleAIGenerated(skillData);
            setShowAIDialog(false);
          }}
          onClose={() => setShowAIDialog(false)}
        />
      )}

      {/* Preview Modal */}
      {showPreview && previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--hairline)] w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col">
            <div className="sunset-stripe" />
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--hairline)]">
              <div>
                <h3 className="font-display text-lg text-[var(--ink)]">AI 视角预览</h3>
                <p className="text-xs text-[var(--steel)] mt-0.5">
                  查询技能通过 Skill 渐进式加载机制注入 AI
                </p>
              </div>
              <button onClick={() => setShowPreview(false)} className="btn-ghost text-xs">关闭</button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-6 space-y-6">
              {previewData.skills.length === 0 ? (
                <p className="text-sm text-[var(--steel)] text-center py-8">暂无启用的查询技能</p>
              ) : (
                previewData.skills.map((item, idx) => (
                  <div key={item.skillId}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--primary)] text-white text-[10px] font-bold">{idx + 1}</span>
                      <h4 className="text-sm font-medium text-[var(--ink)]">{item.skillName}</h4>
                      <span className="text-[10px] text-[var(--steel)] bg-[var(--surface-raised)] px-1.5 py-0.5 rounded">{item.skillDir}</span>
                    </div>
                    <p className="text-xs text-[var(--slate)] mb-1">
                      System Prompt 摘要: <code className="text-[var(--primary)]">{item.skillSummary}</code>
                    </p>
                    <pre className="text-sm font-mono text-[var(--ink)] whitespace-pre-wrap bg-[var(--canvas)] rounded-lg p-4 border border-[var(--hairline)] max-h-[200px] overflow-auto">
                      {item.skillFullContent}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
