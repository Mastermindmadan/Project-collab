import { useState, useEffect } from 'react';
import { FileBarChart, Download, FileText, Table2, Loader2, CheckCircle2, FolderOpen, Users, CheckSquare, BarChart3, ChevronRight, Github } from 'lucide-react';
import api from '../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

type ReportType = 'project' | 'team' | 'tasks' | 'members' | 'github';

interface ReportData { [key: string]: any }

const REPORT_TYPES = [
  { id: 'project' as ReportType, label: 'Project Report', icon: FolderOpen, color: 'text-blue-500', bg: 'bg-blue-500/10', desc: 'Health score, task breakdown, member stats' },
  { id: 'team' as ReportType, label: 'Team Report', icon: Users, color: 'text-purple-500', bg: 'bg-purple-500/10', desc: 'Team overview with all projects' },
  { id: 'tasks' as ReportType, label: 'Task Report', icon: CheckSquare, color: 'text-amber-500', bg: 'bg-amber-500/10', desc: 'All tasks with status and priority breakdown' },
  { id: 'members' as ReportType, label: 'Member Analytics', icon: BarChart3, color: 'text-emerald-500', bg: 'bg-emerald-500/10', desc: 'Per-member productivity and contribution' },
  { id: 'github' as ReportType, label: 'GitHub Report', icon: Github, color: 'text-slate-400', bg: 'bg-slate-500/10', desc: 'Commits, verified tasks, contribution percentages' },
];

export default function Reports() {
  const [selectedType, setSelectedType] = useState<ReportType>('project');
  const [projects, setProjects] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.get('/teams/my-teams').then(res => {
      const ts = res.data.teams || [];
      setTeams(ts);
      const ps: any[] = [];
      ts.forEach((t: any) => (t.projects || []).forEach((p: any) => ps.push({ ...p, teamName: t.name })));
      setProjects(ps);
      if (ps.length > 0) setSelectedId(ps[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedType === 'project' || selectedType === 'tasks' || selectedType === 'github') {
      if (projects.length > 0) setSelectedId(projects[0].id);
    } else if (selectedType === 'team' || selectedType === 'members') {
      if (teams.length > 0) setSelectedId(teams[0].id);
    }
    setReport(null);
  }, [selectedType, projects, teams]);

  const fetchReport = async () => {
    setLoading(true);
    setReport(null);
    try {
      let res;
      if (selectedType === 'project') res = await api.get(`/reports/project/${selectedId}`);
      else if (selectedType === 'team') res = await api.get(`/reports/team/${selectedId}`);
      else if (selectedType === 'tasks') res = await api.get(`/reports/tasks?projectId=${selectedId}`);
      else if (selectedType === 'members') res = await api.get(`/reports/members?teamId=${selectedId}`);
      else if (selectedType === 'github') {
        const githubRes = await api.get(`/github/report/${selectedId}`, { responseType: 'blob' });
        const url = window.URL.createObjectURL(new Blob([githubRes.data], { type: 'application/pdf' }));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `github-report-${selectedId}-${Date.now()}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        setLoading(false);
        return;
      }
      setReport(res?.data || null);
    } catch { } finally { setLoading(false); }
  };

  const generatePDF = () => {
    if (!report) return;
    setGenerating(true);
    try {
      const doc = new jsPDF();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('ProjectCollab AI — Report', 14, 20);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
      doc.text(`Report Type: ${selectedType.toUpperCase()}`, 14, 35);

      let y = 45;
      if (selectedType === 'project' && report.report) {
        const r = report.report;
        doc.setFont('helvetica', 'bold');
        doc.text(`Project: ${r.project.title}`, 14, y); y += 7;
        doc.setFont('helvetica', 'normal');
        doc.text(`Status: ${r.project.status}  Health: ${r.project.healthScore}%  Team: ${r.team.name}`, 14, y); y += 10;
        autoTable(doc, {
          startY: y,
          head: [['Status', 'Count']],
          body: Object.entries(r.tasks.byStatus).map(([k, v]) => [k, String(v)]),
        });
        autoTable(doc, {
          startY: (doc as any).lastAutoTable.finalY + 8,
          head: [['Member', 'Role', 'Assigned', 'Completed']],
          body: r.memberStats.map((m: any) => [m.name, m.role, m.assigned, m.completed]),
        });
      } else if (selectedType === 'tasks' && report.report) {
        const r = report.report;
        autoTable(doc, {
          startY: y,
          head: [['Title', 'Status', 'Priority', 'Assignee', 'Project']],
          body: r.tasks.map((t: any) => [t.title, t.status, t.priority, t.assignee?.name || '—', t.project?.title || '—']),
        });
      } else if (selectedType === 'members') {
        autoTable(doc, {
          startY: y,
          head: [['Name', 'Team', 'Role', 'Total', 'Completed', 'Productivity']],
          body: (report.members || []).map((m: any) => [m.name, m.team, m.role, m.totalTasks, m.completed, `${m.productivity}%`]),
        });
      }
      doc.save(`projectcollab-${selectedType}-report-${Date.now()}.pdf`);
    } finally { setGenerating(false); }
  };

  const generateExcel = () => {
    if (!report) return;
    setGenerating(true);
    try {
      let data: any[] = [];
      if (selectedType === 'tasks' && report.report) data = report.report.tasks.map((t: any) => ({ Title: t.title, Status: t.status, Priority: t.priority, Assignee: t.assignee?.name || '', Project: t.project?.title || '' }));
      else if (selectedType === 'members') data = (report.members || []).map((m: any) => ({ Name: m.name, Team: m.team, Role: m.role, Total: m.totalTasks, Completed: m.completed, Productivity: `${m.productivity}%` }));
      else if (selectedType === 'project' && report.report) data = report.report.memberStats.map((m: any) => ({ Name: m.name, Role: m.role, Assigned: m.assigned, Completed: m.completed }));
      else if (selectedType === 'team' && report.report) data = report.report.projects.map((p: any) => ({ Title: p.title, Status: p.status, HealthScore: p.healthScore, TotalTasks: p.totalTasks, CompletedTasks: p.completedTasks }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      XLSX.writeFile(wb, `projectcollab-${selectedType}-report-${Date.now()}.xlsx`);
    } finally { setGenerating(false); }
  };

  const generateCSV = () => {
    if (!report) return;
    generateExcel(); // XLSX supports CSV via writeFile with .csv extension
  };

  const cfg = REPORT_TYPES.find(r => r.id === selectedType)!;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <p className="text-muted-foreground text-sm flex items-center gap-1.5"><FileBarChart className="w-4 h-4 text-primary" /> Reports</p>
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Report Generator</h1>
        <p className="text-muted-foreground text-sm mt-1">Generate and export project, team & analytics reports as PDF, Excel, or CSV</p>
      </div>

      {/* Report Type Selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {REPORT_TYPES.map(r => (
          <button key={r.id} onClick={() => setSelectedType(r.id)}
            className={`glass-card p-4 rounded-2xl text-left transition-all hover:border-primary/40 ${selectedType === r.id ? 'border-primary bg-primary/5' : ''}`}>
            <div className={`p-2 rounded-lg ${r.bg} w-fit mb-2`}>
              <r.icon className={`w-5 h-5 ${r.color}`} />
            </div>
            <p className="text-sm font-bold text-foreground">{r.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
          </button>
        ))}
      </div>

      {/* Scope Selector */}
      <div className="glass-panel rounded-2xl p-5 flex items-center gap-4 flex-wrap">
        <div className={`p-2.5 rounded-xl ${cfg.bg}`}>
          <cfg.icon className={`w-5 h-5 ${cfg.color}`} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">Report Scope</p>
          <p className="text-xs text-muted-foreground">Choose which {selectedType === 'project' || selectedType === 'tasks' || selectedType === 'github' ? 'project' : 'team'} to generate the report for</p>
        </div>
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
          className="glass-input text-sm rounded-xl outline-none text-foreground">
          {(selectedType === 'project' || selectedType === 'tasks' ? projects : teams).map((item: any) => (
            <option key={item.id} value={item.id}>{item.title || item.name}</option>
          ))}
        </select>
        <button onClick={fetchReport} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          Generate
        </button>
      </div>

      {/* Report Output */}
      {report && selectedType !== 'github' && (
        <div className="glass-panel rounded-3xl p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <h2 className="text-base font-extrabold text-foreground">Report Ready</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={generatePDF} disabled={generating}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-500 text-white text-xs font-bold rounded-xl hover:bg-rose-600 transition-colors">
                <FileText className="w-4 h-4" /> PDF
              </button>
              <button onClick={generateExcel} disabled={generating}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-xl hover:bg-emerald-600 transition-colors">
                <Table2 className="w-4 h-4" /> Excel
              </button>
              <button onClick={generateCSV} disabled={generating}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-xs font-bold rounded-xl hover:bg-amber-600 transition-colors">
                <Download className="w-4 h-4" /> CSV
              </button>
            </div>
          </div>

          {/* Report Preview */}
          <div className="bg-secondary/50 rounded-2xl p-5 overflow-auto">
            <pre className="text-xs text-foreground font-mono whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(report.report || report.members || report, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
