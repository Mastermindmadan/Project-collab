import { useState } from 'react';
import {
  Zap, FileText, AlertTriangle, BarChart3, Brain, Loader2,
  CheckCircle2, ChevronRight, Sparkles, Clock, Target, AlertCircle, RefreshCw,
  Layers, ShieldAlert, Cpu, Users
} from 'lucide-react';
import api from '../utils/api';

type AITool = 'planner' | 'analyzer' | 'risk' | 'sprint';

const tools = [
  {
    id: 'planner' as AITool,
    label: 'AI Project Planner',
    icon: Brain,
    desc: 'Generate a complete project roadmap with milestones, timeline, and risk assessment.',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/20'
  },
  {
    id: 'analyzer' as AITool,
    label: 'Requirement Analyzer',
    icon: FileText,
    desc: 'Upload or input project document text to get AI-extracted requirements, scope, and user stories.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20'
  },
  {
    id: 'risk' as AITool,
    label: 'Risk Detection Engine',
    icon: AlertTriangle,
    desc: 'Analyze project risk profile across technical, timeline, security, budget, and team dimensions.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20'
  },
  {
    id: 'sprint' as AITool,
    label: 'Sprint Summary AI',
    icon: BarChart3,
    desc: 'Generate automated weekly sprint summaries highlighting progress, productivity, and blockers.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20'
  },
];

export default function AIPlanner() {
  const [activeTool, setActiveTool] = useState<AITool>('planner');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Inputs
  const [projectTitle, setProjectTitle] = useState('Smart Campus Navigation System');
  const [projectDesc, setProjectDesc] = useState('An AI-powered mobile app providing indoor positioning, route guidance, and live event announcements for university students and visitors.');
  const [teamSize, setTeamSize] = useState('4');
  const [duration, setDuration] = useState('12 weeks');

  // Requirement Analyzer Inputs
  const [reqDocText, setReqDocText] = useState('Project Title: AI Research Collaboration Platform\nGoal: Build a high-performance web app for research collaboration.\nSecurity Requirements: JWT authentication, TLS encryption, RBAC authorization.\nFeatures: Real-time chat via Socket.io, GitHub integration, AI roadmap generator.\nDatabase: PostgreSQL with Prisma ORM.');

  // Results State
  const [plannerResult, setPlannerResult] = useState<any>(null);
  const [analyzerResult, setAnalyzerResult] = useState<any>(null);
  const [riskResult, setRiskResult] = useState<any>(null);
  const [sprintResult, setSprintResult] = useState<any>(null);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);

    try {
      if (activeTool === 'planner') {
        const res = await api.post('/ai/planner', {
          title: projectTitle,
          description: projectDesc,
          teamSize: parseInt(teamSize) || 4,
          deadline: duration
        });
        setPlannerResult(res.data.plan);
      } else if (activeTool === 'analyzer') {
        const res = await api.post('/ai/analyze-docs', {
          documentText: reqDocText || projectDesc
        });
        setAnalyzerResult(res.data.analysis);
      } else if (activeTool === 'risk') {
        const res = await api.post('/ai/risk-detection', {
          projectName: projectTitle,
          description: projectDesc,
          teamSize: parseInt(teamSize) || 4,
          deadline: duration
        });
        setRiskResult(res.data.riskAnalysis);
      } else if (activeTool === 'sprint') {
        const res = await api.post('/ai/sprint-summary', {
          completedTasks: ['Authentication endpoints', 'Prisma DB migration schema', 'Kanban drag-and-drop board'],
          pendingTasks: ['Socket.io chat integration', 'Unit tests execution', 'Cloud deployment script'],
          commitStats: '28 commits by 4 contributors this week',
          blockages: ['Third-party API OAuth key configuration']
        });
        setSprintResult(res.data.summary);
      }
    } catch (err: any) {
      console.error('AI Analysis Error:', err);
      setError(err.response?.data?.error || 'Failed to connect to AI Intelligence server. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-muted-foreground text-sm mb-1 flex items-center gap-1.5 font-medium">
          <Zap className="w-4 h-4 text-primary" /> Google Gemini AI Intelligence Suite
        </p>
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">AI Planning & Risk Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Powered by Google Gemini API · Real-time task planning, requirement analysis, risk detection, and sprint intelligence
        </p>
      </div>

      {/* Tool Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => { setActiveTool(tool.id); setError(null); }}
            className={`flex flex-col gap-3 p-5 rounded-2xl border text-left transition-all duration-200 ${
              activeTool === tool.id
                ? `${tool.bg} border-opacity-60 ring-1 ring-inset ring-current shadow-lg`
                : 'glass-card hover:border-border'
            }`}
          >
            <div className={`p-2.5 rounded-xl w-fit ${activeTool === tool.id ? tool.bg : 'bg-secondary'}`}>
              <tool.icon className={`w-5 h-5 ${tool.color}`} />
            </div>
            <div>
              <p className={`text-sm font-bold mb-1 ${activeTool === tool.id ? 'text-foreground' : 'text-foreground'}`}>{tool.label}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{tool.desc}</p>
            </div>
            {activeTool === tool.id && (
              <div className="flex items-center gap-1 text-xs font-semibold text-primary mt-auto">
                Active <Sparkles className="w-3 h-3" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Interface Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Input Controls */}
        <div className="xl:col-span-2 glass-panel rounded-2xl p-6 h-fit space-y-5">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400" />
            {tools.find(t => t.id === activeTool)?.label} Parameters
          </h2>

          {activeTool === 'planner' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Project Title</label>
                <input
                  type="text"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  placeholder="e.g. Autonomous Drone Flight Controller"
                  className="glass-input w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Project Description & Objectives</label>
                <textarea
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                  placeholder="Describe your target outcomes, architecture requirements, and key features..."
                  rows={4}
                  className="glass-input w-full text-sm resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Team Size</label>
                  <select
                    value={teamSize}
                    onChange={(e) => setTeamSize(e.target.value)}
                    className="glass-input w-full text-sm"
                  >
                    <option value="2">2 members</option>
                    <option value="3">3 members</option>
                    <option value="4">4 members</option>
                    <option value="5">5 members</option>
                    <option value="6">6+ members</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Target Duration</label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="glass-input w-full text-sm"
                  >
                    <option value="4 weeks">4 weeks</option>
                    <option value="8 weeks">8 weeks</option>
                    <option value="12 weeks">12 weeks</option>
                    <option value="16 weeks">16 weeks</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTool === 'analyzer' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Proposal / Specification Document Text</label>
                <textarea
                  value={reqDocText}
                  onChange={(e) => setReqDocText(e.target.value)}
                  placeholder="Paste your project specification text or requirements document content here..."
                  rows={8}
                  className="glass-input w-full text-sm font-mono text-xs resize-none"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Google Gemini will parse functional specs, non-functional rules, user stories, missing requirements, and risk factors.
              </p>
            </div>
          )}

          {activeTool === 'risk' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Project Name</label>
                <input
                  type="text"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  className="glass-input w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Project Details</label>
                <textarea
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                  rows={4}
                  className="glass-input w-full text-sm resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Team Size</label>
                  <select value={teamSize} onChange={(e) => setTeamSize(e.target.value)} className="glass-input w-full text-sm">
                    <option value="2">2 members</option>
                    <option value="4">4 members</option>
                    <option value="6">6 members</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Deadline</label>
                  <select value={duration} onChange={(e) => setDuration(e.target.value)} className="glass-input w-full text-sm">
                    <option value="8 weeks">8 weeks</option>
                    <option value="12 weeks">12 weeks</option>
                    <option value="16 weeks">16 weeks</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTool === 'sprint' && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2">
                <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4" /> Live Sprint Parameters
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Analyzing current sprint task completions, pending backlog items, commit frequency, and team blockages.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={runAnalysis}
            disabled={loading}
            className="w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Gemini AI is analyzing...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generate Gemini AI Analysis</>
            )}
          </button>
        </div>

        {/* Results Panel */}
        <div className="xl:col-span-3">
          {/* Default State */}
          {!loading && !plannerResult && !analyzerResult && !riskResult && !sprintResult && (
            <div className="glass-panel rounded-2xl p-8 flex flex-col items-center justify-center text-center h-full min-h-80 border-dashed border-2">
              <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 mb-4 glow-primary">
                <Brain className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-base font-bold text-foreground mb-2">Ready to Run AI Analysis</h3>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                Configure parameters on the left and click "Generate Gemini AI Analysis" to view real-time Google Gemini intelligence.
              </p>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="glass-panel rounded-2xl p-8 flex flex-col items-center justify-center text-center h-full min-h-80 space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                <Brain className="w-6 h-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Google Gemini AI is processing...</h3>
                <p className="text-xs text-muted-foreground mt-1">Synthesizing milestones · Evaluating risks · Structuring output</p>
              </div>
            </div>
          )}

          {/* 1. PLANNER RESULT */}
          {!loading && activeTool === 'planner' && plannerResult && (
            <div className="glass-panel rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" /> {plannerResult.title}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" /> Total Time: <span className="font-bold text-foreground">{plannerResult.totalTime}</span>
                  </p>
                </div>
                <button onClick={runAnalysis} className="p-2 rounded-xl glass-card text-muted-foreground hover:text-foreground">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {/* Phases */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-primary" /> Roadmap Phases
                </h3>
                {plannerResult.phases?.map((p: any, i: number) => (
                  <div key={i} className="glass-card rounded-xl p-4 border border-border">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-sm font-bold text-foreground flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold">{i + 1}</span>
                        {p.phase}
                      </span>
                      <span className="text-xs text-muted-foreground px-2 py-0.5 bg-secondary rounded-lg font-medium">{p.duration}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {p.tasks?.map((t: string, j: number) => (
                        <div key={j} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <ChevronRight className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                          <span>{t}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Tech Suggestions & Team */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="glass-card p-4 rounded-xl space-y-2">
                  <p className="text-xs font-bold text-primary flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" /> Tech Stack Recommendations
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {plannerResult.techSuggestions?.map((tech: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 text-xs font-semibold bg-primary/10 border border-primary/20 text-primary rounded-lg">
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="glass-card p-4 rounded-xl space-y-2">
                  <p className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> Team Role Allocation
                  </p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {plannerResult.teamDistribution?.map((role: any, i: number) => (
                      <li key={i} className="flex justify-between items-center">
                        <span>{role.roleName}</span>
                        <span className="font-bold text-foreground">{role.recommendedMemberCount} member(s)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Risks & Suggestions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl space-y-2">
                  <p className="text-xs font-bold text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Identified Risks
                  </p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {plannerResult.risks?.map((r: string, i: number) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-destructive mt-0.5">•</span> {r}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2">
                  <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5" /> Strategic Suggestions
                  </p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {plannerResult.suggestions?.map((s: string, i: number) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-emerald-400 mt-0.5">•</span> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 2. ANALYZER RESULT */}
          {!loading && activeTool === 'analyzer' && analyzerResult && (
            <div className="glass-panel rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-400" /> {analyzerResult.title}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Est. Duration: <span className="font-bold text-foreground">{analyzerResult.estimatedCompletionTime}</span>
                  </p>
                </div>
              </div>

              {/* Functional Requirements */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Functional Requirements</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {analyzerResult.functionalRequirements?.map((req: string, i: number) => (
                    <div key={i} className="p-2.5 glass-card rounded-xl text-xs font-medium text-foreground flex items-start gap-2">
                      <span className="text-primary font-bold">{i + 1}.</span> {req}
                    </div>
                  ))}
                </div>
              </div>

              {/* User Stories */}
              {analyzerResult.userStories && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Extracted User Stories</h3>
                  <div className="space-y-2">
                    {analyzerResult.userStories.map((story: any, i: number) => (
                      <div key={i} className="p-3 glass-card rounded-xl text-xs space-y-1">
                        <p className="font-bold text-primary">As a {story.role}</p>
                        <p className="text-foreground">I want to {story.feature}</p>
                        <p className="text-muted-foreground italic">So that {story.benefit}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk Areas */}
              {analyzerResult.riskAreas && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Risk Areas</h3>
                  <div className="space-y-2">
                    {analyzerResult.riskAreas.map((risk: any, i: number) => (
                      <div key={i} className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs flex justify-between items-start gap-3">
                        <div>
                          <p className="font-bold text-amber-400">{risk.area}</p>
                          <p className="text-muted-foreground mt-0.5">{risk.description}</p>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-300">{risk.severity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. RISK DETECTION RESULT */}
          {!loading && activeTool === 'risk' && riskResult && (
            <div className="glass-panel rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-amber-400" /> {riskResult.projectName} Risk Assessment
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                    Delay Probability: <span className="font-extrabold text-amber-400">{riskResult.delayProbability}%</span>
                  </p>
                </div>
                <span className={`px-3 py-1.5 rounded-xl font-bold text-xs ${
                  riskResult.overallRiskLevel === 'HIGH' ? 'bg-destructive/20 border border-destructive/40 text-destructive' :
                  riskResult.overallRiskLevel === 'MEDIUM' ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400' :
                  'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                }`}>
                  {riskResult.overallRiskLevel} RISK
                </span>
              </div>

              {/* Risk Categories */}
              {riskResult.riskCategories && (
                <div className="space-y-4">
                  {Object.entries(riskResult.riskCategories).map(([catKey, risks]: [string, any]) => {
                    if (!Array.isArray(risks) || risks.length === 0) return null;
                    return (
                      <div key={catKey} className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground capitalize">
                          {catKey.replace('Risks', ' Risks')}
                        </h4>
                        <div className="space-y-2">
                          {risks.map((r: any, i: number) => (
                            <div key={i} className="p-3.5 glass-card rounded-xl border border-border space-y-1.5 text-xs">
                              <div className="flex justify-between items-center">
                                <p className="font-bold text-foreground">{r.risk}</p>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-secondary text-muted-foreground">{r.severity}</span>
                              </div>
                              <p className="text-muted-foreground">Impact: {r.impact}</p>
                              <p className="text-emerald-400 font-medium">Mitigation: {r.mitigation}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 4. SPRINT SUMMARY RESULT */}
          {!loading && activeTool === 'sprint' && sprintResult && (
            <div className="glass-panel rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-emerald-400" /> Weekly Sprint Summary
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Productivity Index: <span className="font-bold text-emerald-400">{sprintResult.productivityIndex}%</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="glass-card p-4 rounded-xl space-y-2">
                  <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Work Completed
                  </p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {sprintResult.workCompleted?.map((w: string, i: number) => (
                      <li key={i} className="flex items-start gap-1.5">• {w}</li>
                    ))}
                  </ul>
                </div>

                <div className="glass-card p-4 rounded-xl space-y-2">
                  <p className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Pending Work
                  </p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {sprintResult.pendingWork?.map((p: string, i: number) => (
                      <li key={i} className="flex items-start gap-1.5">• {p}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
