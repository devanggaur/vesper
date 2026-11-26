import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Copy,
  Check,
  Users,
  BedDouble,
  MessageCircle,
  Sparkles,
  ThumbsUp,
  User,
} from 'lucide-react';
import { CollaboratorIdentity, TripNote, TripVote } from '../../types/travel';
import { BrandMark } from '../common/BrandMark';

interface GroupShareModalProps {
  tripTitle: string;
  destination: string;
  datesLabel: string;
  tripSlug: string | null;
  votes: TripVote[];
  notes: TripNote[];
  collaborator: CollaboratorIdentity | null;
  onSaveCollaboratorName: (name: string) => void;
  onAskCoPilotConsensus: () => void;
  onNotify: (msg: string) => void;
  onClose: () => void;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Lightweight Group Trip Share & Poll Modal:
 * Gives organizers 1-tap Trip Link, WhatsApp/iMessage Invite, and Direct Stay Poll Link
 * (`/t/:slug?view=stays`) so friends can vote & leave contextual notes with zero signup wall.
 */
export const GroupShareModal: React.FC<GroupShareModalProps> = ({
  tripTitle,
  destination,
  datesLabel,
  tripSlug,
  votes,
  notes,
  collaborator,
  onSaveCollaboratorName,
  onAskCoPilotConsensus,
  onNotify,
  onClose,
}) => {
  const [copiedKey, setCopiedKey] = useState<'trip' | 'invite' | 'stays' | null>(null);
  const [nameDraft, setNameDraft] = useState(collaborator?.name || '');

  const baseUrl =
    typeof window !== 'undefined'
      ? tripSlug
        ? `${window.location.origin}/t/${tripSlug}`
        : window.location.href.split('?')[0]
      : '';
  const staysPollUrl = baseUrl ? `${baseUrl}?view=stays` : '';
  const whatsappInvite = `Help pick our ${destination} stay & stops (${datesLabel}) on Vesper — vote with 1 tap, no signup needed:\n${staysPollUrl || baseUrl}`;

  const participants = useMemo(() => {
    const names = new Map<string, string>();
    votes.forEach((v) => names.set(v.voterKey, v.voterName));
    notes.forEach((n) => names.set(n.authorKey, n.authorName));
    if (collaborator) names.set(collaborator.key, collaborator.name);
    return Array.from(names.values());
  }, [votes, notes, collaborator]);

  const copyText = (key: 'trip' | 'invite' | 'stays', value: string, toastMsg: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    onNotify(toastMsg);
    window.setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1800);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1150] bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[490px] rounded-[26px] bg-[#FAF9F5] border border-black/[0.08] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06]">
          <div className="flex items-center gap-2.5">
            <BrandMark size={24} />
            <div>
              <h2 className="font-editorial text-[20px] font-medium text-[#14191F] leading-tight">
                Share &amp; Group Vote
              </h2>
              <p className="text-[11.5px] text-[#7B828A]">
                Friends can vote &amp; leave notes with just their name — no login required.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share modal"
            className="p-1.5 rounded-lg hover:bg-black/[0.05] text-[#5A626A] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          {/* Quick Share Actions */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() =>
                copyText('invite', whatsappInvite, 'Copied WhatsApp / iMessage invite')
              }
              className="w-full rounded-2xl bg-[#0E2034] hover:bg-[#17304D] px-4 py-3.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer shadow-xs"
              style={{ color: '#FFFFFF' }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/12 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold">
                    Copy WhatsApp / iMessage invite
                  </div>
                  <div className="text-[11.5px] text-white/75 truncate">
                    Pre-written poll prompt for {tripTitle}
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/15 text-[11.5px] font-semibold shrink-0">
                {copiedKey === 'invite' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </span>
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() =>
                  copyText(
                    'stays',
                    staysPollUrl,
                    'Copied Hotel Poll link (opens straight to Stays)'
                  )
                }
                className="rounded-2xl bg-white border border-black/[0.08] hover:border-[#0E2034] p-3 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <BedDouble className="w-4 h-4 text-[#C85A17] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold text-[#14191F] truncate">
                      Hotel Poll link
                    </div>
                    <div className="text-[11px] text-[#7B828A] truncate">Opens to Stays</div>
                  </div>
                </div>
                {copiedKey === 'stays' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[#7B828A] shrink-0" />
                )}
              </button>

              <button
                type="button"
                onClick={() => copyText('trip', baseUrl, 'Copied trip link')}
                className="rounded-2xl bg-white border border-black/[0.08] hover:border-[#0E2034] p-3 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Users className="w-4 h-4 text-[#0E2034] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold text-[#14191F] truncate">
                      Full trip link
                    </div>
                    <div className="text-[11px] text-[#7B828A] truncate">
                      {tripSlug ? `/t/${tripSlug}` : 'Current trip'}
                    </div>
                  </div>
                </div>
                {copiedKey === 'trip' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[#7B828A] shrink-0" />
                )}
              </button>
            </div>
          </div>

          {/* Group Activity Summary */}
          <div className="rounded-2xl bg-white border border-black/[0.07] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-[#14191F] inline-flex items-center gap-1.5">
                <ThumbsUp className="w-3.5 h-3.5 text-[#C85A17]" />
                <span>Group activity</span>
              </span>
              <span className="font-tabular text-[#7B828A]">
                {votes.length} {votes.length === 1 ? 'vote' : 'votes'} · {notes.length}{' '}
                {notes.length === 1 ? 'note' : 'notes'}
              </span>
            </div>

            {participants.length > 0 ? (
              <div className="flex items-center flex-wrap gap-1.5">
                {participants.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F3F2EC] text-[11.5px] font-medium text-[#14191F]"
                  >
                    <span className="w-4 h-4 rounded-full bg-[#0E2034] text-white text-[9px] font-bold flex items-center justify-center">
                      {getInitials(p)}
                    </span>
                    <span>{p}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-[#7B828A]">
                Tap 👍 on any hotel or timeline stop to kick off voting for your group.
              </p>
            )}

            {(votes.length > 0 || notes.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAskCoPilotConsensus();
                }}
                className="w-full mt-1 py-2 px-3 rounded-xl bg-[#F3F2EC] hover:bg-[#ECEAE2] text-[12px] font-semibold text-[#14191F] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#C85A17]" />
                <span>Ask Co-Pilot to build around group votes</span>
              </button>
            )}
          </div>

          {/* Your Voting Name */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!nameDraft.trim()) return;
              onSaveCollaboratorName(nameDraft.trim());
              onNotify(`Voting as ${nameDraft.trim()}`);
            }}
            className="rounded-2xl bg-[#F3F2EC]/80 border border-black/[0.06] p-3 flex items-center gap-2"
          >
            <User className="w-4 h-4 text-[#5A626A] shrink-0" />
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Your first name (shown on votes & notes)"
              maxLength={40}
              className="flex-1 bg-transparent text-[12.5px] text-[#14191F] placeholder:text-[#8A9097] focus:outline-none min-w-0"
            />
            <button
              type="submit"
              disabled={!nameDraft.trim() || nameDraft.trim() === collaborator?.name}
              className="px-3 py-1 rounded-full bg-white border border-black/[0.1] hover:border-[#0E2034] disabled:opacity-45 text-[11.5px] font-semibold text-[#14191F] cursor-pointer shrink-0"
            >
              Save
            </button>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
};

interface CollabNamePromptModalProps {
  actionLabel: string;
  onSubmitName: (name: string) => void;
  onClose: () => void;
}

/**
 * Tiny 1-field modal triggered once when an unnamed guest clicks Vote or Add Note.
 * Saves to localStorage and immediately executes their pending action — zero signup wall.
 */
export const CollabNamePromptModal: React.FC<CollabNamePromptModalProps> = ({
  actionLabel,
  onSubmitName,
  onClose,
}) => {
  const [name, setName] = useState('');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1200] bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.form
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSubmitName(name.trim());
        }}
        className="w-full max-w-[380px] rounded-[24px] bg-[#FAF9F5] border border-black/[0.08] shadow-2xl p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-editorial text-[21px] font-medium text-[#14191F] leading-tight">
              What’s your first name?
            </h3>
            <p className="text-[12px] text-[#7B828A] mt-0.5">
              So the group knows who {actionLabel} — no account needed.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-black/[0.05] text-[#5A626A] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Alex"
          maxLength={40}
          className="w-full rounded-xl bg-white border border-black/[0.12] px-3.5 py-2.5 text-[14px] text-[#14191F] focus:outline-none focus:border-[#0E2034]"
        />

        <button
          type="submit"
          disabled={!name.trim()}
          className="w-full py-2.5 rounded-full bg-[#0E2034] hover:bg-[#17304D] disabled:opacity-45 text-[13px] font-medium cursor-pointer"
          style={{ color: '#FFFFFF' }}
        >
          Continue
        </button>
      </motion.form>
    </motion.div>
  );
};
