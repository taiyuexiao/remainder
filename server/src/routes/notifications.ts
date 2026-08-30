import type { FastifyInstance } from 'fastify';
import { checkReminders, getNotifications, clearNotifications } from '../scheduler/index.js';

export default async function notificationRoutes(app: FastifyInstance) {
  app.get('/api/notifications', async () => getNotifications());

  app.post('/api/notifications/check', async () => {
    checkReminders();
    return getNotifications();
  });

  app.post('/api/notifications/clear', async () => {
    clearNotifications();
    return { cleared: true };
  });
}
