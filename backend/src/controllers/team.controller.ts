import { Request, Response } from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import prisma from '../utils/prisma';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const createTeam = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Team name is required.' });
    }

    // Generate unique 8-character invite code
    let inviteCode = '';
    let isUnique = false;
    while (!isUnique) {
      inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 characters
      const existing = await prisma.team.findUnique({ where: { inviteCode } });
      if (!existing) isUnique = true;
    }

    // Create Team and assign creator as MemberRole OWNER
    const team = await prisma.team.create({
      data: {
        name,
        inviteCode,
        members: {
          create: {
            userId: authReq.user.id,
            role: 'OWNER'
          }
        }
      },
      include: {
        members: true
      }
    });

    res.status(201).json({
      message: 'Team created successfully',
      team
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const joinTeam = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { inviteCode } = req.body;
    if (!inviteCode) {
      return res.status(400).json({ error: 'Invite code is required.' });
    }

    const team = await prisma.team.findUnique({
      where: { inviteCode: inviteCode.trim().toUpperCase() }
    });

    if (!team) {
      return res.status(404).json({ error: 'Invalid invite code.' });
    }

    // Check if user is already a member
    const existingMember = await prisma.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId: authReq.user.id,
          teamId: team.id
        }
      }
    });

    if (existingMember) {
      return res.status(400).json({ error: 'You are already a member of this team.' });
    }

    const member = await prisma.teamMember.create({
      data: {
        userId: authReq.user.id,
        teamId: team.id,
        role: 'MEMBER'
      }
    });

    res.status(200).json({
      message: 'Joined team successfully',
      team: {
        id: team.id,
        name: team.name,
        role: member.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getTeamDetails = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { teamId } = req.params;

    // Check membership
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                avatarUrl: true,
                skills: true
              }
            }
          }
        },
        projects: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            healthScore: true,
            createdAt: true
          }
        }
      }
    });

    res.json({ team });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getMyTeams = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const teamMemberships = await prisma.teamMember.findMany({
      where: { userId: authReq.user.id },
      include: {
        team: {
          include: {
            members: {
              select: {
                id: true,
                role: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    avatarUrl: true
                  }
                }
              }
            },
            projects: {
              select: {
                id: true,
                title: true,
                description: true,
                status: true,
                healthScore: true,
                githubRepo: true,
                teamId: true,
                createdAt: true,
                objectives: true
              }
            }
          }
        }
      }
    });

    const teams = teamMemberships.map(tm => ({
      ...tm.team,
      myRole: tm.role
    }));

    res.json({ teams });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updateMemberRole = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { teamId, targetUserId, newRole } = req.body;

    if (!teamId || !targetUserId || !newRole) {
      return res.status(400).json({ error: 'teamId, targetUserId, and newRole are required.' });
    }

    // Verify actor is OWNER or ADMIN
    const actor = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId } }
    });

    if (!actor || (actor.role !== 'OWNER' && actor.role !== 'ADMIN')) {
      return res.status(403).json({ error: 'Permission denied. Must be Owner or Admin.' });
    }

    // Prevent non-owner changing to OWNER or altering OWNER role
    const target = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: targetUserId, teamId } }
    });

    if (!target) {
      return res.status(404).json({ error: 'Member not found in team.' });
    }

    if (target.role === 'OWNER' && actor.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only team Owners can demote/change another Owner.' });
    }

    if (newRole === 'OWNER' && actor.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only team Owners can promote someone to Owner.' });
    }

    const updated = await prisma.teamMember.update({
      where: { id: target.id },
      data: { role: newRole }
    });

    res.json({ message: 'Role updated successfully', member: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const removeMember = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { teamId, targetUserId } = req.body;

    // Check permissions
    const actor = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId } }
    });

    if (!actor || (actor.role !== 'OWNER' && actor.role !== 'ADMIN' && authReq.user.id !== targetUserId)) {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const target = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: targetUserId, teamId } }
    });

    if (!target) {
      return res.status(404).json({ error: 'Member not found.' });
    }

    // Prevent admins from removing owners or other admins
    if (actor.role === 'ADMIN' && (target.role === 'OWNER' || target.role === 'ADMIN') && authReq.user.id !== targetUserId) {
      return res.status(403).json({ error: 'Admins cannot remove other Admins or Owners.' });
    }

    await prisma.teamMember.delete({ where: { id: target.id } });

    res.json({ message: 'Member removed successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const generateQRCodeInvite = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { teamId } = req.params;

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    const qrData = JSON.stringify({
      type: 'team-invite',
      teamId: team.id,
      inviteCode: team.inviteCode,
      name: team.name
    });

    const qrCodeDataURL = await QRCode.toDataURL(qrData);

    res.json({
      inviteCode: team.inviteCode,
      qrCodeDataURL
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
