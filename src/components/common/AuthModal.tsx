import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Mail, Lock, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { supabaseBrowser } from '../../lib/supabaseClient';

interface AuthModalProps {
  onClose: () => void;
  onSuccess: (email: string) => void;
}

/** Official 4-color Google "G" mark for the primary SSO button. */
const GoogleMark: React.FC = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

/**
 * Frictionless Supabase Auth modal with 1-click Google SSO as primary sign-in,
 * plus Magic Link and Email/Password fallbacks. Never blocks guest trip planning.
 */
export const AuthModal: React.FC<AuthModalProps> = ({ onClose, onSuccess }) => {
  const [mode, setMode] = useState<'magic' | 'signin' | 'signup'>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  const handleGoogleSignIn = async () => {
    if (!supabaseBrowser) {
      setError('Supabase Auth is not configured in environment variables.');
      return;
    }
    setGoogleLoading(true);
    setError(null);
    try {
      const { error: err } = await supabaseBrowser.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.href,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });
      if (err) throw err;
    } catch (err) {
      setGoogleLoading(false);
      setError((err as Error)?.message || 'Unable to start Google sign-in.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseBrowser) {
      setError('Supabase Auth is not configured in environment variables.');
      return;
    }
    const cleanEmail = email.trim();
    if (!cleanEmail) return;

    setLoading(true);
    setError(null);

    try {
      if (mode === 'magic') {
        const { error: err } = await supabaseBrowser.auth.signInWithOtp({
          email: cleanEmail,
          options: { emailRedirectTo: window.location.href },
        });
        if (err) throw err;
        setMagicSent(true);
      } else if (mode === 'signin') {
        const { data, error: err } = await supabaseBrowser.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (err) throw err;
        onSuccess(data.user?.email || cleanEmail);
        onClose();
      } else {
        const { data, error: err } = await supabaseBrowser.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: window.location.href },
        });
        if (err) throw err;
        if (data.session) {
          onSuccess(data.user?.email || cleanEmail);
          onClose();
        } else {
          setMagicSent(true);
        }
      }
    } catch (err) {
      setError((err as Error)?.message || 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[1200] bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[430px] rounded-[26px] bg-[#FAF9F5] border border-black/[0.08] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06]">
          <div className="flex items-center gap-2.5">
            <BrandMark size={26} />
            <span className="font-editorial text-[21px] font-medium text-[#14191F]">
              Save your trips
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/[0.05] text-[#5A626A] cursor-pointer"
            aria-label="Close sign in"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {magicSent ? (
            <div className="text-center space-y-3 py-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-editorial text-[24px] font-medium text-[#14191F]">
                Check your inbox
              </h3>
              <p className="text-[13px] text-[#5A626A] leading-relaxed">
                We sent a sign-in link to <strong className="text-[#14191F]">{email}</strong>. Click
                it to sync your Vesper trips across devices.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full mt-2 py-2.5 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[13.5px] font-medium cursor-pointer"
              >
                Back to Vesper
              </button>
            </div>
          ) : (
            <>
              <p className="text-[13px] text-[#5A626A] leading-relaxed">
                Sign in to sync your saved itineraries, share trip links with co-travelers, and pick
                up anywhere.
              </p>

              {/* Primary 1-Click Google SSO */}
              <button
                type="button"
                disabled={googleLoading || loading}
                onClick={handleGoogleSignIn}
                className="w-full py-3 px-4 rounded-full bg-white hover:bg-[#F3F2EC] border border-black/[0.12] text-[#14191F] text-[13.5px] font-semibold flex items-center justify-center gap-2.5 shadow-2xs transition-all cursor-pointer disabled:opacity-60"
              >
                {googleLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#5A626A]" />
                    <span>Connecting to Google...</span>
                  </>
                ) : (
                  <>
                    <GoogleMark />
                    <span>Continue with Google</span>
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-[1px] bg-black/[0.08]" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-[#8A9097]">
                  or with email
                </span>
                <div className="flex-1 h-[1px] bg-black/[0.08]" />
              </div>

              {/* Email Auth Mode Toggle */}
              <div className="grid grid-cols-3 gap-1 rounded-full bg-[#ECEAE2] p-1">
                {(
                  [
                    { id: 'magic', label: 'Magic link' },
                    { id: 'signin', label: 'Sign in' },
                    { id: 'signup', label: 'Create account' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setMode(t.id);
                      setError(null);
                    }}
                    className={`py-1.5 rounded-full text-[12px] font-medium transition-all cursor-pointer ${
                      mode === t.id
                        ? 'bg-[#0E2034] shadow-2xs'
                        : 'text-[#5A626A] hover:text-[#14191F]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div className="space-y-1.5">
                  <label className="text-[11.5px] font-semibold text-[#5A626A]">Email</label>
                  <div className="flex items-center gap-2 rounded-xl bg-white border border-black/[0.1] px-3 py-2.5 focus-within:border-[#0E2034]">
                    <Mail className="w-4 h-4 text-[#7B828A] shrink-0" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-transparent text-[13.5px] text-[#14191F] placeholder:text-[#8A9097] focus:outline-none"
                    />
                  </div>
                </div>

                {mode !== 'magic' && (
                  <div className="space-y-1.5">
                    <label className="text-[11.5px] font-semibold text-[#5A626A]">Password</label>
                    <div className="flex items-center gap-2 rounded-xl bg-white border border-black/[0.1] px-3 py-2.5 focus-within:border-[#0E2034]">
                      <Lock className="w-4 h-4 text-[#7B828A] shrink-0" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        className="w-full bg-transparent text-[13.5px] text-[#14191F] placeholder:text-[#8A9097] focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-[12px] text-rose-600">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="w-full py-3 rounded-full bg-[#0E2034] hover:bg-[#17304D] disabled:opacity-60 text-[13.5px] font-medium flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Working...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {mode === 'magic'
                          ? 'Send magic link'
                          : mode === 'signin'
                          ? 'Sign in'
                          : 'Create account'}
                      </span>
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
