import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { AppView, TripSummary } from './types/travel';
import { travelApi } from './services/travelApi';
import { supabaseBrowser } from './lib/supabaseClient';
import { LandingView } from './components/landing/LandingView';
import { WorkspaceView } from './components/workspace/WorkspaceView';
import { TripSidebar } from './components/common/TripSidebar';
import { AuthModal } from './components/common/AuthModal';
import { VesperTheme } from './components/common/ThemeSwitcher';

interface UserProfile {
  email: string;
  name?: string;
  avatarUrl?: string;
}

/** Extracts display profile (name + Google avatar) from a Supabase Auth user object. */
function extractUserProfile(
  user?: { email?: string; user_metadata?: Record<string, unknown> } | null
): UserProfile | null {
  if (!user?.email) return null;
  const meta = user.user_metadata || {};
  const name =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    undefined;
  const avatarUrl =
    (typeof meta.avatar_url === 'string' && meta.avatar_url) ||
    (typeof meta.picture === 'string' && meta.picture) ||
    undefined;
  return { email: user.email, name, avatarUrl };
}

/** Extracts a shareable trip slug from paths like `/t/lisbon-f97eb7`. */
function parseSlugFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/t\/([a-z0-9-]+)\/?$/i);
  return match ? match[1] : undefined;
}

/**
 * Root application shell managing:
 * 1. Top-level view transitions & clean shareable `/t/:slug` browser URLs
 * 2. Persisted Vesper theme (`twilight` | `nocturne` | `mediterranean`)
 * 3. Optional Supabase Auth session + automatic guest trip claiming on sign-in
 * 4. Saved trips drawer (`/api/trips`) and global toast notification bus
 */
export function App() {
  const initialPathSlug =
    typeof window !== 'undefined' ? parseSlugFromPath(window.location.pathname) : undefined;

  const [view, setView] = useState<AppView>(initialPathSlug ? 'workspace' : 'landing');
  const [theme, setTheme] = useState<VesperTheme>(() => {
    const saved =
      typeof window !== 'undefined' ? window.localStorage.getItem('vesper-theme') : null;
    if (saved === 'twilight' || saved === 'nocturne' || saved === 'mediterranean') return saved;
    return 'twilight';
  });

  const [initialPrompt, setInitialPrompt] = useState(
    'Hey, Vesper, plan a trip to Mexico City for a weekend on June 18th'
  );
  const [initialDates, setInitialDates] = useState('Jun 18 – 21 (3n)');
  const [initialTravelers, setInitialTravelers] = useState('2 adults');
  const [focusMode, setFocusMode] = useState<'flights' | 'stays' | 'activities' | undefined>(
    undefined
  );
  const [selectedTripId, setSelectedTripId] = useState<string | undefined>(undefined);
  const [selectedTripSlug, setSelectedTripSlug] = useState<string | undefined>(initialPathSlug);
  const activeTripIdRef = useRef<string | null>(null);

  const [workspaceKey, setWorkspaceKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const userProfileRef = useRef<UserProfile | null>(null);
  const [currentTripTitle, setCurrentTripTitle] = useState('Mexico City Modernist Weekend');
  const [recentTrips, setRecentTrips] = useState<TripSummary[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('vesper-theme', theme);
  }, [theme]);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3000);
  }, []);

  const refreshRecentTrips = useCallback(() => {
    travelApi
      .listTrips()
      .then((list) => setRecentTrips(list))
      .catch(() => {
        // Offline / static preview mode
      });
  }, []);

  useEffect(() => {
    refreshRecentTrips();
  }, [refreshRecentTrips]);

  // Listen to Supabase Auth session changes (including Google OAuth redirects) and claim active trip
  useEffect(() => {
    if (!supabaseBrowser) return;

    supabaseBrowser.auth.getSession().then(({ data }) => {
      const prof = extractUserProfile(data.session?.user);
      userProfileRef.current = prof;
      setUserProfile(prof);
    });

    const { data: listener } = supabaseBrowser.auth.onAuthStateChange((event, session) => {
      const prof = extractUserProfile(session?.user);
      userProfileRef.current = prof;
      setUserProfile(prof);

      if (event === 'SIGNED_IN' && prof) {
        notify(`Signed in as ${prof.name?.split(' ')[0] || prof.email}`);
      }

      if (prof && activeTripIdRef.current) {
        travelApi
          .claimTrip(activeTripIdRef.current)
          .catch(() => {})
          .finally(() => refreshRecentTrips());
      } else {
        refreshRecentTrips();
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [notify, refreshRecentTrips]);

  // Support browser Back / Forward across `/` and `/t/:slug`
  useEffect(() => {
    const onPopState = () => {
      const slug = parseSlugFromPath(window.location.pathname);
      if (slug) {
        setSelectedTripId(undefined);
        setSelectedTripSlug(slug);
        setWorkspaceKey((k) => k + 1);
        setView('workspace');
      } else {
        setSelectedTripId(undefined);
        setSelectedTripSlug(undefined);
        setView('landing');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleStartTrip = (
    prompt: string,
    mode?: 'flights' | 'stays' | 'activities',
    datesSummary?: string,
    travelers?: string
  ) => {
    setSelectedTripId(undefined);
    setSelectedTripSlug(undefined);
    activeTripIdRef.current = null;
    setInitialPrompt(prompt);
    setFocusMode(mode);
    if (datesSummary) setInitialDates(datesSummary);
    if (travelers) setInitialTravelers(travelers);
    setWorkspaceKey((k) => k + 1);
    setView('workspace');
  };

  const handleOpenSavedTrip = (tripId: string, slug?: string) => {
    setSelectedTripId(tripId);
    setSelectedTripSlug(undefined);
    setFocusMode(undefined);
    activeTripIdRef.current = tripId;
    if (slug && window.location.pathname !== `/t/${slug}`) {
      window.history.pushState({}, '', `/t/${slug}`);
    }
    setWorkspaceKey((k) => k + 1);
    setView('workspace');
  };

  const handleGoHome = () => {
    activeTripIdRef.current = null;
    setSelectedTripId(undefined);
    setSelectedTripSlug(undefined);
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
    setView('landing');
  };

  const handleTripLoaded = useCallback(
    (meta: { id: string; slug: string; title: string }) => {
      activeTripIdRef.current = meta.id;
      setCurrentTripTitle(meta.title);
      if (meta.slug && window.location.pathname !== `/t/${meta.slug}`) {
        window.history.replaceState({}, '', `/t/${meta.slug}`);
      }
      // If returning from Google OAuth redirect onto a guest trip, claim it seamlessly
      if (userProfileRef.current) {
        travelApi
          .claimTrip(meta.id)
          .catch(() => {})
          .finally(() => refreshRecentTrips());
      } else {
        refreshRecentTrips();
      }
    },
    [refreshRecentTrips]
  );

  const handleSignOut = async () => {
    if (!supabaseBrowser) return;
    await supabaseBrowser.auth.signOut();
    userProfileRef.current = null;
    setUserProfile(null);
    notify('Signed out of Vesper');
    refreshRecentTrips();
  };

  return (
    <div className="h-dvh w-screen overflow-hidden bg-[#F7F6F1]">
      <AnimatePresence mode="wait">
        {view === 'landing' ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.25 }}
            className="h-full w-full"
          >
            <LandingView
              theme={theme}
              userProfile={userProfile}
              onChangeTheme={setTheme}
              onStartTrip={handleStartTrip}
              onOpenSidebar={() => {
                refreshRecentTrips();
                setSidebarOpen(true);
              }}
              onOpenAuth={() => setAuthModalOpen(true)}
            />
          </motion.div>
        ) : (
          <motion.div
            key={`workspace-${workspaceKey}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="h-full w-full"
          >
            <WorkspaceView
              tripId={selectedTripId}
              tripSlug={selectedTripSlug}
              initialPrompt={initialPrompt}
              initialDates={initialDates}
              initialTravelers={initialTravelers}
              initialFocusMode={focusMode}
              theme={theme}
              onChangeTheme={setTheme}
              onOpenSidebar={() => {
                refreshRecentTrips();
                setSidebarOpen(true);
              }}
              onTripLoaded={handleTripLoaded}
              onTripTitleChange={(title) => {
                setCurrentTripTitle(title);
                refreshRecentTrips();
              }}
              onNotify={notify}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <TripSidebar
        isOpen={sidebarOpen}
        theme={theme}
        userProfile={userProfile}
        onChangeTheme={setTheme}
        onClose={() => setSidebarOpen(false)}
        currentTripTitle={currentTripTitle}
        recentTrips={recentTrips}
        onNewTrip={handleGoHome}
        onSelectTrip={handleOpenSavedTrip}
        onStartPrompt={(p) => handleStartTrip(p, undefined, initialDates, initialTravelers)}
        onOpenAuth={() => setAuthModalOpen(true)}
        onSignOut={handleSignOut}
      />

      <AnimatePresence>
        {authModalOpen && (
          <AuthModal
            onClose={() => setAuthModalOpen(false)}
            onSuccess={(email) => {
              notify(`Signed in as ${email}`);
              refreshRecentTrips();
            }}
          />
        )}
      </AnimatePresence>

      {/* Global Top Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-[64px] left-1/2 -translate-x-1/2 z-[1200] flex items-center gap-2 rounded-full bg-[#0E2034] px-4 py-2 text-[13px] font-medium shadow-xl pointer-events-none"
          >
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
