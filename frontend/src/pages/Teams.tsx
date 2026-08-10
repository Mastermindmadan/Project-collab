import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth.store';
import api from '../utils/api';
import {
  Users, Plus, Copy, QrCode, Link as LinkIcon, Crown, Shield,
  UserCheck, X, Search, LogOut, Trash2, Loader2
} from 'lucide-react';

interface TeamMember {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string;
    skills: string[];
  };
}

interface ProjectBrief {
  id: string;
  title: string;
  status: 'HEALTHY' | 'ATTENTION' | 'RISK';
  healthScore: number;
}

interface Team {
  id: string;
  name: string;
  inviteCode: string;
  myRole?: 'OWNER' | 'ADMIN' | 'MEMBER';
  members?: TeamMember[];
  projects?: ProjectBrief[];
}

const roleConfig = {
  OWNER: { icon: Crown, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', label: 'Owner' },
  ADMIN: { icon: Shield, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', label: 'Admin' },
  MEMBER: { icon: UserCheck, color: 'text-slate-400', bg: 'bg-slate-800 border-slate-700', label: 'Member' },
};

export default function Teams() {
  const currentUser = useAuthStore((state) => state.user);

  // States
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Modals
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [joinInviteCode, setJoinInviteCode] = useState('');

  // Copy state
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [activeInviteTab, setActiveInviteTab] = useState<'code' | 'qr' | 'link'>('code');

  // Load teams list
  const loadTeams = async (selectId?: string) => {
    try {
      setLoading(true);
      const res = await api.get('/teams/my-teams');
      const fetchedTeams = res.data.teams || [];
      setTeams(fetchedTeams);

      if (fetchedTeams.length > 0) {
        const toSelect = selectId
          ? fetchedTeams.find((t: Team) => t.id === selectId)
          : fetchedTeams[0];
        if (toSelect) {
          loadTeamDetails(toSelect.id);
        } else {
          loadTeamDetails(fetchedTeams[0].id);
        }
      } else {
        setSelectedTeam(null);
        setQrCodeUrl(null);
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch teams.');
    } finally {
      setLoading(false);
    }
  };

  // Load selected team details & QR invite
  const loadTeamDetails = async (teamId: string) => {
    try {
      const detailsRes = await api.get(`/teams/${teamId}`);
      const detailedTeam = detailsRes.data.team;

      // Parse JSON string skills for each member
      const safeJson = (val: any, fallback: any = []) => {
        if (val == null) return fallback;
        if (typeof val === 'string') { try { return JSON.parse(val); } catch { return fallback; } }
        return val;
      };
      const normalizedTeam = {
        ...detailedTeam,
        members: (detailedTeam.members || []).map((m: any) => ({
          ...m,
          user: { ...m.user, skills: safeJson(m.user?.skills, []) }
        }))
      };
      
      // Determine current user's role in this team
      const myMembership = normalizedTeam.members.find((m: any) => m.user.id === currentUser?.id);
      
      setSelectedTeam({
        ...normalizedTeam,
        myRole: myMembership?.role || 'MEMBER',
      });

      // Fetch QR Code Data URL
      try {
        const qrRes = await api.get(`/teams/${teamId}/qr-invite`);
        setQrCodeUrl(qrRes.data.qrCodeDataURL);
      } catch (qrErr) {
        console.error('Failed to generate QR invite code URL', qrErr);
        setQrCodeUrl(null);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load team details.');
    }
  };

  useEffect(() => {
    loadTeams();
  }, []);

  const handleSelectTeam = (teamId: string) => {
    loadTeamDetails(teamId);
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;

    try {
      setActionLoading(true);
      const res = await api.post('/teams/create', { name: newTeamName });
      const createdTeam = res.data.team;
      setNewTeamName('');
      setShowCreateModal(false);
      // Reload teams and select the newly created team
      await loadTeams(createdTeam.id);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to create team.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinInviteCode.trim()) return;

    try {
      setActionLoading(true);
      const res = await api.post('/teams/join', { inviteCode: joinInviteCode });
      const joinedTeam = res.data.team;
      setJoinInviteCode('');
      setShowJoinModal(false);
      // Reload teams and select the newly joined team
      await loadTeams(joinedTeam.id);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Invalid or expired invite code.');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePromoteDemote = async (targetUserId: string, currentRole: 'OWNER' | 'ADMIN' | 'MEMBER') => {
    if (!selectedTeam) return;
    const nextRoles: Record<string, 'ADMIN' | 'MEMBER'> = {
      ADMIN: 'MEMBER',
      MEMBER: 'ADMIN',
    };
    const newRole = nextRoles[currentRole];
    if (!newRole) return;

    try {
      setActionLoading(true);
      await api.put('/teams/role', {
        teamId: selectedTeam.id,
        targetUserId,
        newRole,
      });
      await loadTeamDetails(selectedTeam.id);
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to update member role.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!selectedTeam) return;
    const isSelf = targetUserId === currentUser?.id;
    const msg = isSelf
      ? 'Are you sure you want to leave this team?'
      : 'Are you sure you want to remove this member from the team?';
    if (!window.confirm(msg)) return;

    try {
      setActionLoading(true);
      await api.post('/teams/remove', {
        teamId: selectedTeam.id,
        targetUserId,
      });
      
      if (isSelf) {
        // Reload all teams
        await loadTeams();
      } else {
        // Refresh details
        await loadTeamDetails(selectedTeam.id);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to remove member.');
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: 'code' | 'link') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  // Shared variables
  const inviteLink = selectedTeam ? `${window.location.origin}/invite/${selectedTeam.inviteCode}` : '';
  const filteredMembers = (selectedTeam?.members || []).filter(
    (m) =>
      m.user.name.toLowerCase().includes(search.toLowerCase()) ||
      m.user.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-slate-400 text-sm mb-1 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Team Workspace Directory
          </p>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Teams</h1>
          <p className="text-slate-500 text-sm mt-1">
            Create or join collaborative team workspaces to manage academic modules and milestones.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowJoinModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700/60 transition-all cursor-pointer"
          >
            Join with Code
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-xl transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Create Team
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="p-1 hover:text-white">✕</button>
        </div>
      )}

      {loading ? (
        <div className="glass-panel rounded-2xl p-16 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-sm text-slate-400">Loading workspaces and directory...</p>
        </div>
      ) : teams.length === 0 ? (
        <div className="glass-panel rounded-2xl p-16 text-center">
          <Users className="w-16 h-16 text-slate-700 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white mb-1">No Teams Joined</h3>
          <p className="text-slate-400 text-sm max-w-md mx-auto mb-6">
            Get started by creating a new team workspace or joining an existing team using the invitation code shared by your peers.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setShowJoinModal(true)}
              className="px-5 py-2.5 bg-slate-850 hover:bg-slate-800 text-slate-200 text-sm font-medium rounded-xl border border-slate-750 transition-all"
            >
              Join Existing Team
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold rounded-xl transition-all"
            >
              Create New Team
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Workspaces List */}
          <div className="lg:col-span-4 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">My Workspaces</h2>
            <div className="space-y-3.5">
              {teams.map((t) => {
                const isSelected = selectedTeam?.id === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTeam(t.id)}
                    className={`w-full text-left p-5 rounded-2xl border transition-all relative overflow-hidden group ${
                      isSelected
                        ? 'glass-panel border-primary/45 shadow-lg bg-slate-900/40'
                        : 'glass-card border-slate-900 hover:border-slate-800 hover:bg-slate-900/20'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-0 left-0 bottom-0 w-1 bg-primary" />
                    )}
                    <h3 className="font-bold text-white text-base group-hover:text-primary transition-colors">{t.name}</h3>
                    <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        {t.members?.length || 1} members
                      </span>
                      {t.projects && t.projects.length > 0 && (
                        <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                          {t.projects.length} Active {t.projects.length === 1 ? 'Project' : 'Projects'}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Team Detail */}
          <div className="lg:col-span-8 space-y-6">
            {selectedTeam && (
              <>
                {/* Active Workspace Banner */}
                <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-44 h-44 rounded-full bg-primary/5 blur-3xl -translate-y-12 translate-x-12" />
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-white tracking-tight">{selectedTeam.name}</h2>
                      <p className="text-xs text-slate-500 mt-1 font-mono">WORKSPACE ID: {selectedTeam.id}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowInviteModal(true)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-primary/15 hover:bg-primary/25 border border-primary/20 text-primary text-xs font-semibold rounded-xl transition-all cursor-pointer"
                      >
                        <QrCode className="w-3.5 h-3.5" /> Invite Codes
                      </button>
                      <button
                        onClick={() => handleRemoveMember(currentUser?.id || '')}
                        className="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" /> Leave Team
                      </button>
                    </div>
                  </div>
                </div>

                {/* Team Projects section */}
                {selectedTeam.projects && selectedTeam.projects.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Enrolled Workspace Projects</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedTeam.projects.map((p) => (
                        <div key={p.id} className="p-4 bg-slate-900/40 border border-slate-850 rounded-xl flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold text-white text-sm">{p.title}</h4>
                            <p className="text-xs text-slate-500 mt-0.5">Status: <span className={p.status === 'HEALTHY' ? 'text-emerald-400' : 'text-red-400'}>{p.status}</span></p>
                          </div>
                          <div className="text-right">
                            <span className={`text-sm font-bold ${p.healthScore >= 75 ? 'text-emerald-400' : p.healthScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                              {p.healthScore}%
                            </span>
                            <p className="text-[10px] text-slate-600">health</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Members list */}
                <div className="glass-panel rounded-2xl p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                      <h3 className="text-base font-bold text-white">Member Directory</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Users matching database roster criteria for team access</p>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search directory..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8 pr-4 py-2 bg-slate-950/50 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all w-full md:w-56"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    {filteredMembers.length === 0 ? (
                      <div className="text-center py-8 text-slate-500 text-sm">No members found matching your search.</div>
                    ) : (
                      filteredMembers.map((member) => {
                        const isSelf = member.user.id === currentUser?.id;
                        const role = roleConfig[member.role];
                        const canManage =
                          (selectedTeam.myRole === 'OWNER' && member.role !== 'OWNER') ||
                          (selectedTeam.myRole === 'ADMIN' && member.role === 'MEMBER');

                        return (
                          <div
                            key={member.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl hover:bg-slate-900/50 transition-all border border-transparent hover:border-slate-800/40 group"
                          >
                            {/* Member Details */}
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative flex-shrink-0">
                                <div className="w-10 h-10 rounded-full bg-slate-850 border border-slate-700 overflow-hidden flex items-center justify-center text-primary font-bold text-sm bg-gradient-to-tr from-slate-900 to-slate-800">
                                  {member.user.avatarUrl ? (
                                    <img src={member.user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                                  ) : (
                                    member.user.name.charAt(0).toUpperCase()
                                  )}
                                </div>
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-white text-sm">{member.user.name}</span>
                                  {isSelf && (
                                    <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-md font-mono">You</span>
                                  )}
                                </div>
                                <span className="text-xs text-slate-500 truncate block">{member.user.email}</span>
                              </div>
                            </div>

                            {/* Role Badge and Control Actions */}
                            <div className="flex items-center gap-3 justify-end sm:justify-start">
                              {/* Skills preview tags */}
                              {member.user.skills && member.user.skills.length > 0 && (
                                <div className="hidden xl:flex items-center gap-1.5 mr-2">
                                  {member.user.skills.slice(0, 2).map((s) => (
                                    <span key={s} className="px-1.5 py-0.5 text-[10px] bg-slate-850 text-slate-400 rounded-md border border-slate-800">{s}</span>
                                  ))}
                                  {member.user.skills.length > 2 && (
                                    <span className="text-[10px] text-slate-500">+{member.user.skills.length - 2}</span>
                                  )}
                                </div>
                              )}

                              <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold ${role.bg} ${role.color}`}>
                                <role.icon className="w-3.5 h-3.5" />
                                {role.label}
                              </div>

                              {/* Administrative Actions */}
                              {canManage && (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handlePromoteDemote(member.user.id, member.role)}
                                    title={member.role === 'MEMBER' ? 'Promote to Admin' : 'Demote to Member'}
                                    className="p-2 text-slate-500 hover:text-white hover:bg-slate-850 rounded-xl transition-all"
                                  >
                                    {member.role === 'MEMBER' ? <Shield className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                                  </button>
                                  <button
                                    onClick={() => handleRemoveMember(member.user.id)}
                                    title="Remove from Workspace"
                                    className="p-2 text-red-500/60 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && selectedTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-md border-slate-700 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Workspace Team Invitation</h2>
              <button onClick={() => setShowInviteModal(false)} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Invite Tabs */}
            <div className="flex gap-1 mb-6 p-1 bg-slate-950/60 rounded-xl border border-slate-900">
              {[
                { key: 'code', label: 'Invite Code', icon: Copy },
                { key: 'qr', label: 'QR Scan', icon: QrCode },
                { key: 'link', label: 'Share Link', icon: LinkIcon },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveInviteTab(tab.key as any)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                    activeInviteTab === tab.key ? 'bg-primary text-primary-foreground' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Invite Tab Content */}
            {activeInviteTab === 'code' && (
              <div className="text-center space-y-4">
                <p className="text-xs text-slate-400">Share this code with your teammates to invite them to this workspace</p>
                <div className="flex items-center gap-3 p-4 bg-slate-950/80 rounded-xl border border-slate-850">
                  <code className="flex-1 text-2xl font-mono font-extrabold text-primary tracking-widest">{selectedTeam.inviteCode}</code>
                  <button
                    onClick={() => copyToClipboard(selectedTeam.inviteCode, 'code')}
                    className="p-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-all cursor-pointer"
                  >
                    {copied === 'code' ? '✓' : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {activeInviteTab === 'qr' && (
              <div className="text-center space-y-4">
                <p className="text-xs text-slate-400">Scan this QR code on a mobile device to join instantly</p>
                <div className="inline-flex items-center justify-center p-4 bg-white rounded-2xl mx-auto shadow-inner">
                  {qrCodeUrl ? (
                    <img src={qrCodeUrl} alt="Team QR Invite Code" className="w-44 h-44 object-contain" />
                  ) : (
                    <div className="w-44 h-44 flex flex-col items-center justify-center bg-slate-100 text-slate-500 text-xs gap-2">
                      <QrCode className="w-10 h-10 text-slate-400 animate-pulse" />
                      <span>Generating QR Invite...</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-600">Invite Code: <span className="font-mono text-slate-400">{selectedTeam.inviteCode}</span></p>
              </div>
            )}

            {activeInviteTab === 'link' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-400">Send this registration link directly to students or instructors</p>
                <div className="flex items-center gap-2 p-3.5 bg-slate-950/80 rounded-xl border border-slate-800">
                  <p className="flex-1 text-xs text-slate-400 truncate font-mono">{inviteLink}</p>
                  <button
                    onClick={() => copyToClipboard(inviteLink, 'link')}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs rounded-lg transition-all cursor-pointer font-semibold"
                  >
                    {copied === 'link' ? '✓ Copied' : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-8 pt-4 border-t border-slate-800 flex gap-2">
              <button
                onClick={() => setShowInviteModal(false)}
                className="w-full py-2.5 border border-slate-700 text-slate-400 text-xs font-semibold rounded-xl hover:bg-slate-850 transition-all cursor-pointer"
              >
                Close Invitation Center
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Team Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-md border-slate-700 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Create Workspace Team</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTeam} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Workspace Name</label>
                <input
                  type="text"
                  placeholder="e.g. ProjectCollab AI Team"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 border border-slate-750 text-slate-400 text-xs font-semibold rounded-xl hover:bg-slate-850 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                >
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Team Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-md border-slate-700 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Join Workspace Team</h2>
              <button onClick={() => setShowJoinModal(false)} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleJoinTeam} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Workspace Invite Code</label>
                <input
                  type="text"
                  placeholder="e.g. 1A2B3C4D"
                  value={joinInviteCode}
                  onChange={(e) => setJoinInviteCode(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all uppercase font-mono tracking-widest"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 py-2.5 border border-slate-750 text-slate-400 text-xs font-semibold rounded-xl hover:bg-slate-850 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                >
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Join Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
