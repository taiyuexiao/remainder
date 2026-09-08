import { useCallback, useEffect, useRef, useState } from 'react';
import { api, API_BASE, type Live2dModelInfo } from '../api/client';
import { loadBgConfig, saveBgConfig, type BgConfig } from '../components/BackgroundLayer';
import { PET_MODE_KEY, PET_MODEL_KEY, type PetMode } from '../pet/renderers/types';

const isTauri = '__TAURI_INTERNALS__' in window;

function PetSection() {
  const [sizeIdx, setSizeIdx] = useState(() => Number(localStorage.getItem('pet-size') ?? 0));
  const [mode, setMode] = useState<PetMode>(() =>
    localStorage.getItem(PET_MODE_KEY) === 'live2d' ? 'live2d' : 'sprite',
  );
  const [models, setModels] = useState<Live2dModelInfo[]>([]);
  const [modelRoot, setModelRoot] = useState('');
  const [modelName, setModelName] = useState(() => localStorage.getItem(PET_MODEL_KEY) ?? '');
  const [modelsLoaded, setModelsLoaded] = useState(false);

  const loadModels = useCallback(async () => {
    try {
      const res = await api.listLive2dModels();
      setModels(res.models);
      setModelRoot(res.root);
    } catch {
      setModels([]);
    } finally {
      setModelsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (mode === 'live2d') void loadModels();
  }, [mode, loadModels]);

  if (!isTauri) return null;

  const changeSize = async (idx: number) => {
    setSizeIdx(idx);
    localStorage.setItem('pet-size', String(idx));
    const { emit } = await import('@tauri-apps/api/event');
    await emit('pet-resize', idx);
  };

  const changeMode = async (m: PetMode) => {
    setMode(m);
    localStorage.setItem(PET_MODE_KEY, m);
    const { emit } = await import('@tauri-apps/api/event');
    await emit('pet-mode', m);
  };

  const changeModel = async (name: string) => {
    setModelName(name);
    localStorage.setItem(PET_MODEL_KEY, name);
    const { emit } = await import('@tauri-apps/api/event');
    await emit('pet-model', name);
  };

  const openFolder = async () => {
    try {
      const res = await api.openLive2dFolder();
      setModelRoot(res.root);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const showPet = async () => {
    const { getAllWindows } = await import('@tauri-apps/api/window');
    const pet = (await getAllWindows()).find((w) => w.label === 'pet');
    if (pet) await pet.show();
  };

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4">
      <h3 className="text-sm font-medium">桌宠</h3>
      <p className="text-xs text-slate-400 mt-0.5">大小调节即时生效；右键桌宠有娱乐模式</p>
      <div className="mt-3 flex items-center gap-2">
        {(['小', '中', '大'] as const).map((label, i) => (
          <button
            key={label}
            onClick={() => changeSize(i)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              sizeIdx === i
                ? 'bg-pink-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="flex-1" />
        <button
          onClick={showPet}
          className="rounded-lg bg-pink-50 text-pink-600 px-3 py-1.5 text-sm hover:bg-pink-100"
        >
          唤回桌宠
        </button>
      </div>

      {/* 形象引擎：立绘（内置伪 Live2D）/ Live2D 模型 */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">形象引擎</span>
          <button
            onClick={() => changeMode('sprite')}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              mode === 'sprite'
                ? 'bg-pink-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            立绘（内置）
          </button>
          <button
            onClick={() => changeMode('live2d')}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              mode === 'live2d'
                ? 'bg-pink-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Live2D 模型
          </button>
        </div>

        {mode === 'live2d' && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={modelName}
                onChange={(e) => changeModel(e.target.value)}
                className="flex-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-pink-300"
              >
                <option value="">{models.length ? '自动（第一个模型）' : '（暂无模型）'}</option>
                {models.map((m) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
              <button
                onClick={() => void loadModels()}
                className="rounded-lg bg-slate-100 text-slate-600 px-3 py-1.5 text-sm hover:bg-slate-200"
              >
                刷新列表
              </button>
              <button
                onClick={openFolder}
                className="rounded-lg bg-pink-50 text-pink-600 px-3 py-1.5 text-sm hover:bg-pink-100"
              >
                打开模型文件夹
              </button>
            </div>
            {modelsLoaded && models.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                未检测到模型。把一个含 .model3.json 的模型包文件夹放进
                {modelRoot ? <code className="mx-1 break-all">{modelRoot}</code> : '模型目录'}
                （点「打开模型文件夹」），然后刷新列表。获取渠道见目录内 README.txt。
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LlmSection({
  settings,
  save,
}: {
  settings: Record<string, string>;
  save: (key: string, value: string) => Promise<void>;
}) {
  const [local, setLocal] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    setLocal({
      llm_enabled: settings.llm_enabled ?? 'false',
      llm_base_url: settings.llm_base_url ?? 'https://api.deepseek.com',
      llm_api_key: settings.llm_api_key ?? '',
      llm_model: settings.llm_model ?? 'deepseek-chat',
    });
  }, [settings]);

  const update = (key: string, value: string) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  const commit = async (key: string, value: string) => {
    setSavingKey(key);
    await save(key, value);
    setSavingKey(null);
  };

  const enabled = local.llm_enabled === 'true';

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">LLM 配置</h3>
          <p className="text-xs text-slate-400 mt-0.5">支持自定义 OpenAI 兼容接口；Key 仅保存在本地数据库</p>
        </div>
        <button
          onClick={() => commit('llm_enabled', enabled ? 'false' : 'true')}
          className={`w-12 h-6 rounded-full transition-colors relative ${
            enabled ? 'bg-indigo-600' : 'bg-slate-300'
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              enabled ? 'left-6' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-xs text-slate-500">
          接口地址
          <input
            type="text"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            value={local.llm_base_url ?? ''}
            placeholder="https://api.deepseek.com"
            onChange={(e) => update('llm_base_url', e.target.value)}
            onBlur={(e) => commit('llm_base_url', e.target.value)}
          />
        </label>
        <label className="block text-xs text-slate-500">
          模型
          <input
            type="text"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            value={local.llm_model ?? ''}
            placeholder="deepseek-chat"
            onChange={(e) => update('llm_model', e.target.value)}
            onBlur={(e) => commit('llm_model', e.target.value)}
          />
        </label>
        <label className="block text-xs text-slate-500 sm:col-span-2">
          API Key
          <input
            type="password"
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            value={local.llm_api_key ?? ''}
            placeholder="sk-..."
            onChange={(e) => update('llm_api_key', e.target.value)}
            onBlur={(e) => commit('llm_api_key', e.target.value)}
          />
        </label>
      </div>

      {savingKey && <p className="text-xs text-emerald-600">正在保存…</p>}
    </div>
  );
}

const KEYS = [
  { key: 'notify_enabled', label: '提醒通知', hint: '到点任务进入通知队列（浏览器/Tauri 轮询弹出）' },
  { key: 'report_time', label: '日报发送时间', hint: '格式 HH:mm，如 21:00' },
  { key: 'report_to', label: '日报接收邮箱', hint: '163 邮箱地址' },
];

/** 联机共享设置（M23/M24）：配置团队节点地址、共享 token 与我的名字 */
function NetworkSection() {
  const [apiBase, setApiBase] = useState(() => localStorage.getItem('api-base') ?? 'http://127.0.0.1:3210');
  const [token, setToken] = useState(() => localStorage.getItem('team-token') ?? '');
  const [userName, setUserName] = useState(() => localStorage.getItem('user-name') ?? '');
  const [saved, setSaved] = useState(false);

  const save = () => {
    localStorage.setItem('api-base', apiBase.trim() || 'http://127.0.0.1:3210');
    localStorage.setItem('team-token', token.trim());
    localStorage.setItem('user-name', userName.trim());
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-medium">联机共享</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          连接到团队 Remainder 节点。节点侧需以 HOST=0.0.0.0 + TEAM_TOKEN 启动 server。
          修改后需重启应用生效。多人协作时「我的名字」用于团队身份识别（同名即同人，LAN 信任制）。
        </p>
      </div>
      <label className="block text-xs text-slate-500">
        节点地址
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="http://127.0.0.1:3210"
          value={apiBase}
          onChange={(e) => setApiBase(e.target.value)}
        />
      </label>
      <label className="block text-xs text-slate-500">
        我的名字（团队成员身份）
        <input
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="如：小武（知识条目作者、团队成员都以它识别你）"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
        />
      </label>
      <label className="block text-xs text-slate-500">
        共享 token（x-team-token）
        <input
          type="password"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="团队共享 token（单机留空）"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          className="rounded-lg bg-indigo-600 text-white text-xs px-3 py-1.5 hover:bg-indigo-700"
        >
          保存
        </button>
        {saved && <span className="text-xs text-emerald-600">已保存 ✓</span>}
        {apiBase !== 'http://127.0.0.1:3210' && (
          <button
            onClick={() => {
              setApiBase('http://127.0.0.1:3210');
              setToken('');
              setUserName('');
              localStorage.removeItem('api-base');
              localStorage.removeItem('team-token');
              localStorage.removeItem('user-name');
            }}
            className="rounded-lg bg-slate-100 text-slate-600 text-xs px-3 py-1.5 hover:bg-slate-200"
          >
            恢复单机
          </button>
        )}
      </div>
    </div>
  );
}

/** 个性化（M30 P1）：背景图上传 + 透明度/毛玻璃/填充模式，实时预览（背景层全应用生效） */
function PersonalizeSection() {
  const [cfg, setCfg] = useState<BgConfig>(loadBgConfig);
  const [hasImage, setHasImage] = useState<boolean | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/assets/background`, { method: 'HEAD' })
      .then((r) => setHasImage(r.ok))
      .catch(() => setHasImage(false));
  }, [cfg.ts]);

  const update = (patch: Partial<BgConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    saveBgConfig(next);
  };

  const upload = async (f: File) => {
    setUploading(true);
    try {
      await api.uploadBackground(f);
      update({ ts: Date.now(), enabled: true });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-medium">🎨 个性化背景</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          上传图片作为应用背景。图保持鲜艳，字靠「遮罩纱布」保证可读；改动实时生效。
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-lg bg-indigo-600 text-white text-xs px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-40"
        >
          {uploading ? '上传中…' : hasImage ? '更换图片' : '上传背景图'}
        </button>
        {hasImage && (
          <>
            <button
              onClick={() => update({ enabled: !cfg.enabled })}
              className={`rounded-lg text-xs px-3 py-1.5 ${cfg.enabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}
            >
              {cfg.enabled ? '背景已启用 ✓' : '背景已停用'}
            </button>
            <button
              onClick={async () => {
                await api.deleteBackground();
                setHasImage(false);
                update({ enabled: false });
              }}
              className="rounded-lg bg-slate-100 text-red-500 text-xs px-3 py-1.5 hover:bg-red-50"
            >
              清除
            </button>
          </>
        )}
      </div>
      {hasImage && cfg.enabled && (
        <>
          <label className="block text-xs text-slate-500">
            遮罩浓度 {Math.round(cfg.scrim * 100)}%<span className="text-slate-300">（越大字越清、图越淡）</span>
            <input
              type="range" min={60} max={95}
              value={Math.round(cfg.scrim * 100)}
              onChange={(e) => update({ scrim: Number(e.target.value) / 100 })}
              className="mt-1 w-full accent-indigo-600"
            />
          </label>
          <div className="flex gap-2 items-center text-xs text-slate-500">
            <span>遮罩颜色</span>
            <button
              onClick={() => update({ scrimDark: false })}
              className={`rounded-lg px-2.5 py-1 ${!cfg.scrimDark ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              白纱布（浅色图）
            </button>
            <button
              onClick={() => update({ scrimDark: true })}
              className={`rounded-lg px-2.5 py-1 ${cfg.scrimDark ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              黑纱布（深色图）
            </button>
          </div>
          <label className="block text-xs text-slate-500">
            图片变暗 {Math.round(cfg.dim * 100)}%<span className="text-slate-300">（图太亮时压一压）</span>
            <input
              type="range" min={0} max={60}
              value={Math.round(cfg.dim * 100)}
              onChange={(e) => update({ dim: Number(e.target.value) / 100 })}
              className="mt-1 w-full accent-indigo-600"
            />
          </label>
          <label className="block text-xs text-slate-500">
            图片灰度 {Math.round(cfg.grey * 100)}%<span className="text-slate-300">（图太花时去色）</span>
            <input
              type="range" min={0} max={100}
              value={Math.round(cfg.grey * 100)}
              onChange={(e) => update({ grey: Number(e.target.value) / 100 })}
              className="mt-1 w-full accent-indigo-600"
            />
          </label>
          <label className="block text-xs text-slate-500">
            毛玻璃 {cfg.blur}px
            <input
              type="range" min={0} max={20}
              value={cfg.blur}
              onChange={(e) => update({ blur: Number(e.target.value) })}
              className="mt-1 w-full accent-indigo-600"
            />
          </label>
          <label className="block text-xs text-slate-500">
            填充模式
            <select
              value={cfg.fit}
              onChange={(e) => update({ fit: e.target.value as BgConfig['fit'] })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="cover">铺满（cover）</option>
              <option value="contain">完整显示（contain）</option>
              <option value="fill">拉伸（fill）</option>
            </select>
          </label>
        </>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState('');

  const reload = useCallback(async () => {
    setSettings(await api.getSettings());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = async (key: string, value: string) => {
    await api.putSetting(key, value);
    setSaved(key);
    setTimeout(() => setSaved(''), 1500);
    reload();
  };

  const toggle = (key: string) => {
    const next = settings[key] === 'true' ? 'false' : 'true';
    save(key, next);
  };

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-4 bg-white border-b border-slate-200">
        <h2 className="font-semibold">设置</h2>
        <p className="text-xs text-slate-400 mt-0.5">本地 SQLite 持久化</p>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-4 max-w-2xl space-y-3">
        <PersonalizeSection />
        <PetSection />
        <NetworkSection />
        <LlmSection settings={settings} save={save} />
        {KEYS.map((k) => {
          const isBool = k.key === 'notify_enabled';
          const value = settings[k.key] ?? (isBool ? 'false' : '');
          return (
            <div key={k.key} className="rounded-xl bg-white border border-slate-200 p-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium">{k.label}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{k.hint}</p>
              </div>
              {isBool ? (
                <button
                  onClick={() => toggle(k.key)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${value === 'true' ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      value === 'true' ? 'left-6' : 'left-0.5'
                    }`}
                  />
                </button>
              ) : (
                <input
                  className="w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  value={value}
                  onChange={(e) => setSettings({ ...settings, [k.key]: e.target.value })}
                  onBlur={(e) => save(k.key, e.target.value)}
                />
              )}
              {saved === k.key && <span className="text-xs text-emerald-600">已保存</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
