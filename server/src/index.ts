import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { db, DB_PATH } from './db/connection.js';
import { migrate } from './db/schema.js';
import taskRoutes from './routes/tasks.js';
import projectRoutes from './routes/projects.js';
import followUpRoutes from './routes/followUps.js';
import inboxRoutes from './routes/inbox.js';
import settingsRoutes from './routes/settings.js';
import notificationRoutes from './routes/notifications.js';
import documentRoutes from './routes/documents.js';
import clipRoutes from './routes/clips.js';
import docFolderRoutes from './routes/docFolders.js';
import reportRoutes from './routes/reports.js';
import canvasRoutes from './routes/canvas.js';
import live2dRoutes from './routes/live2d.js';
import llmRoutes from './routes/llm.js';
import systemRoutes from './routes/system.js';
import chatRoutes from './routes/chat.js';
import { startScheduler } from './scheduler/index.js';

migrate();

// bodyLimit 50MB：网页剪藏 HTML 可达数 MB（M11）
const app = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 });

// 本地个人应用：允许任意来源（Tauri webview 源为 tauri.localhost / http://tauri.localhost）
// 注意：必须显式声明 methods，默认仅放行 GET,HEAD,POST，PATCH/DELETE 会被浏览器预检拦截
await app.register(cors, {
  origin: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
});

// Chrome 130+ Private Network Access：扩展从公网页面访问 localhost 需此预检头
app.addHook('onSend', async (req, reply) => {
  if (req.method === 'OPTIONS') {
    reply.header('Access-Control-Allow-Private-Network', 'true');
  }
});

// 容忍空 body 的 application/json 请求
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  if (!body || body === '') return done(null, undefined);
  try {
    done(null, JSON.parse(body as string));
  } catch (err) {
    done(err as Error, undefined);
  }
});

// 兜底解析器：无 Content-Type 的请求（fetch 无 body POST 场景）
app.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => {
  if (!body || body === '') return done(null, undefined);
  try {
    done(null, JSON.parse(body as string));
  } catch {
    done(null, undefined);
  }
});

await app.register(multipart, { limits: { fileSize: 30 * 1024 * 1024 } });

app.get('/api/health', async () => {
  const dbUp = db.prepare('SELECT 1 AS one').get() as { one: number };
  return {
    status: 'ok',
    db: dbUp.one === 1 ? 'up' : 'down',
    dbPath: DB_PATH,
    time: new Date().toISOString(),
  };
});

await app.register(taskRoutes);
await app.register(projectRoutes);
await app.register(followUpRoutes);
await app.register(inboxRoutes);
await app.register(settingsRoutes);
await app.register(reportRoutes);
await app.register(notificationRoutes);
await app.register(documentRoutes);
await app.register(clipRoutes);
await app.register(docFolderRoutes);
await app.register(canvasRoutes);
await app.register(live2dRoutes);
await app.register(llmRoutes);
await app.register(systemRoutes);
await app.register(chatRoutes);

startScheduler();

const start = async () => {
  try {
    await app.listen({ port: config.port, host: '127.0.0.1' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
