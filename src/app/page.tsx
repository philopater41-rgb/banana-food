'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { Lock, User as UserIcon, AlertTriangle, KeyRound, CheckCircle2, ArrowRight, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { user, setUser } = useAppStore();

  // Mode: 'LOGIN' | 'CHANGE_PASSWORD'
  const [mode, setMode] = useState<'LOGIN' | 'CHANGE_PASSWORD'>('LOGIN');

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Change password form state
  const [changeUser, setChangeUser] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If user is already logged in, redirect them
    if (user) {
      if (user.role === 'ADMIN') {
        router.push('/admin');
      } else {
        router.push('/pos');
      }
    }
  }, [user, router]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'فشل تسجيل الدخول');
      }

      setUser(data.user);
      if (data.user.role === 'ADMIN') {
        router.push('/admin');
      } else {
        router.push('/pos');
      }
    } catch (err: any) {
      setError(
        err.message === 'Invalid username or password'
          ? 'اسم المستخدم أو الباسورد غلط، اتأكد واكتبهم صح يا غالي'
          : err.message || 'حصلت مشكلة في الدخول، جرب تاني'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!changeUser.trim()) {
      setError('يرجى إدخال اسم المستخدم');
      return;
    }
    if (!currentPassword) {
      setError('يرجى إدخال كلمة المرور الحالية');
      return;
    }
    if (!newPassword) {
      setError('يرجى إدخال كلمة المرور الجديدة');
      return;
    }
    if (newPassword.length < 3) {
      setError('كلمة المرور الجديدة يجب ألا تقل عن 3 أحرف');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('كلمة المرور الجديدة وتأكيدها غير متطابقين');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: changeUser.trim(),
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'فشل تغيير كلمة المرور');
      }

      setSuccess('تم تغيير كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول بها.');
      // Pre-fill username into login form
      setUsername(changeUser.trim());
      setPassword('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Auto switch to login after 1.8s
      setTimeout(() => {
        setMode('LOGIN');
      }, 1800);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء تغيير كلمة المرور');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#090d16] px-4 py-8 relative overflow-hidden" dir="rtl">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md glass-panel rounded-2xl p-7 z-10 relative shadow-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl">
        {/* Logo & Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-24 h-24 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-3 overflow-hidden relative border border-white/20 p-1">
            <img 
              src="/banana-logo.jpg" 
              alt="Banana Food Logo" 
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-300 to-green-400">
            بانانا فود - Banana Food
          </h1>
          <p className="text-xs text-emerald-300/80 font-medium mt-1">محل خضار وفاكهة - نظام إدارة المبيعات</p>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 flex items-start gap-2.5 text-xs font-medium leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-start gap-2.5 text-xs font-medium leading-relaxed">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {/* LOGIN MODE */}
        {mode === 'LOGIN' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold tracking-wide text-gray-300 mb-1.5">
                اسم المستخدم (Username)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                  <UserIcon className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl py-3 pl-10 pr-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors text-right text-sm"
                  placeholder="admin / hossam / ragheb / cashier"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold tracking-wide text-gray-300 mb-1.5">
                كلمة المرور (Password)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl py-3 pl-10 pr-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors text-right text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 text-white font-bold rounded-xl hover:from-emerald-600 hover:to-green-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20 text-sm cursor-pointer"
            >
              {loading ? 'جاري الدخول...' : 'الدخول إلى النظام'}
            </button>

            <div className="pt-3 text-center border-t border-white/5">
              <button
                type="button"
                onClick={() => {
                  setMode('CHANGE_PASSWORD');
                  setError('');
                  setSuccess('');
                  setChangeUser(username || '');
                }}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold transition-colors hover:underline inline-flex items-center gap-1.5 cursor-pointer py-1"
              >
                <KeyRound className="w-3.5 h-3.5" />
                تغيير كلمة المرور الخاصة بك؟
              </button>
            </div>
          </form>
        )}

        {/* CHANGE PASSWORD MODE */}
        {mode === 'CHANGE_PASSWORD' && (
          <form onSubmit={handleChangePasswordSubmit} className="space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-1">
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-sm">
                <ShieldCheck className="w-4 h-4" />
                <span>تغيير كلمة المرور</span>
              </div>
              <span className="text-[11px] text-gray-400">يلزم إدخال الباسورد الحالي</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                اسم المستخدم (Username)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                  <UserIcon className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  required
                  value={changeUser}
                  onChange={(e) => setChangeUser(e.target.value)}
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl py-2.5 pl-10 pr-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors text-right text-sm"
                  placeholder="اسم المستخدم المراد تغيير باسورده..."
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                كلمة المرور الحالية (Current Password)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl py-2.5 pl-10 pr-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors text-right text-sm"
                  placeholder="الباسورد الحالي للتأكيد..."
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                كلمة المرور الجديدة (New Password)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                  <KeyRound className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl py-2.5 pl-10 pr-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors text-right text-sm"
                  placeholder="اكتب كلمة المرور الجديدة..."
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                تأكيد كلمة المرور الجديدة
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                  <KeyRound className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl py-2.5 pl-10 pr-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors text-right text-sm"
                  placeholder="أعد كتابة كلمة المرور الجديدة..."
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-1 py-3 bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 text-white font-bold rounded-xl hover:from-emerald-600 hover:to-green-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20 text-sm cursor-pointer"
            >
              {loading ? 'جاري الحفظ...' : 'تأكيد وحفظ كلمة المرور الجديدة'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('LOGIN');
                setError('');
                setSuccess('');
              }}
              className="w-full py-2.5 bg-slate-800/80 hover:bg-slate-700/80 text-gray-300 hover:text-white rounded-xl text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 border border-white/10"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              الرجوع لتسجيل الدخول
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
