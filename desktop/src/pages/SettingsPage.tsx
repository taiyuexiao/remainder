import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

const isTauri = '__TAURI_INTERNALS__' in window;

function PetSection() {
  const [sizeIdx, setSizeIdx] = useState(() => Number(localStorage.getItem('pet-size') ?? 0));
  if (!isTauri) return null;

  const changeSize = async (idx: number) => {
    setSizeIdx(idx);
    localStorage.setItem('pet-size', String(idx));
    const { emit } = await import('@tauri-apps/api/event');
    await emit('pet-resize', idx);
  };

  const showPet = async () => {
    const { getAllWindows } = await import('@tauri-apps/api/window');
    const pet = (await getAllWindows()).find((w) => w.label === 'pet');
    if (pet) await pet.show();
  };

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4">
      <h3 className="text-sm font-medium">桌宠（蕾米埃尔）</h3>
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
        <PetSection />
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
