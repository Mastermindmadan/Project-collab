// src/utils/socket.ts
// Simple holder to share the Socket.io server instance across the codebase
import { Server } from 'socket.io';

let ioInstance: Server | null = null;

export const setIO = (io: Server) => {
  ioInstance = io;
};

export const getIO = (): Server | null => ioInstance;

export const sendNotificationToUser = (userId: string, notification: any) => {
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit('notification:new', notification);
  }
};

