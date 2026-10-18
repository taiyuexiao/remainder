import { useState, type FormEvent } from 'react';
import { api, setAuthSession } from '../api/client';

export default function AuthPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('spl');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') {
        await api.register({
          username: username.trim(),
          email: email.trim() || undefined,
          password,
          inviteCode: inviteCode.trim() || undefined,
        });
        const session = await api.login({ identifier: username.trim(), password });
        setAuthSession(session);
      } else {
        const session = await api.login({ identifier: identifier.trim(), password });
        setAuthSession(session);
      }
      onLoggedIn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-slate-100 px-5">
      <div className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-xl border border-slate-200">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900">Remainder</h1>
          <p className="text-sm text-slate-500 mt-1">登录后同步你的任务、文档和知识库</p>
        </div>
        <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 mb-5 text-sm">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`rounded-md py-1.5 ${mode === 'login' ? 'bg-white shadow-sm font-medium' : 'text-slate-500'}`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`rounded-md py-1.5 ${mode === 'register' ? 'bg-white shadow-sm font-medium' : 'text-slate-500'}`}
          >
            注册
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === 'login' ? (
            <label className="block">
              <span className="text-sm text-slate-600">用户名或邮箱</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-[var(--brand)]"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoFocus
              />
            </label>
          ) : (
            <>
              <label className="block">
                <span className="text-sm text-slate-600">用户名</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-[var(--brand)]"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-600">邮箱（可选）</span>
                <input
                  type="email"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-[var(--brand)]"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-600">邀请码</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-[var(--brand)]"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="已有账号时必填"
                />
              </label>
            </>
          )}
          <label className="block">
            <span className="text-sm text-slate-600">密码</span>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-[var(--brand)]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            disabled={busy}
            className="w-full rounded-lg bg-[var(--brand)] py-2.5 text-white font-medium hover:bg-[var(--brand-hover)] disabled:opacity-60"
          >
            {busy ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
