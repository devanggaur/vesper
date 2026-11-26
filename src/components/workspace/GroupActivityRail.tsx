import React, { useMemo } from 'react';
import {
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Sparkles,
  ArrowRight,
  BedDouble,
  MapPin,
  Ticket,
  Users,
} from 'lucide-react';
import {
  ActivityItem,
  HotelItem,
  PlaceItem,
  TripNote,
  TripVote,
} from '../../types/travel';
import { getInitials } from './GroupShareModal';

interface GroupActivityRailProps {
  destination: string;
  ownerName?: string | null;
  votes: TripVote[];
  notes: TripNote[];
  hotels: HotelItem[];
  places: PlaceItem[];
  activities: ActivityItem[];
  onInspectEntity: (entityId: string, kind: 'hotel' | 'place' | 'activity') => void;
  onPlanOwnTrip: () => void;
}

/**
 * Right-hand editorial rail shown to shared guests when the "Group rail" layout is active.
 * Replaces the organizer's AI Co-Pilot with a live read/react summary of top-voted stays,
 * stops, and everyone's contextual 1-line notes — at $0 AI cost.
 */
export const GroupActivityRail: React.FC<GroupActivityRailProps> = ({
  destination,
  ownerName,
  votes,
  notes,
  hotels,
  places,
  activities,
  onInspectEntity,
  onPlanOwnTrip,
}) => {
  const resolveEntityName = (
    entityId: string,
    kind: 'hotel' | 'place' | 'activity'
  ): string => {
    if (kind === 'hotel') {
      return hotels.find((h) => h.id === entityId)?.name || 'Hotel stay';
    }
    if (kind === 'activity') {
      return activities.find((a) => a.id === entityId)?.title || 'Experience';
    }
    return places.find((p) => p.id === entityId)?.name || 'Saved stop';
  };

  const participants = useMemo(() => {
    const map = new Map<string, string>();
    votes.forEach((v) => map.set(v.voterKey, v.voterName));
    notes.forEach((n) => map.set(n.authorKey, n.authorName));
    return Array.from(map.values());
  }, [votes, notes]);

  const rankedVotes = useMemo(() => {
    const grouped = new Map<
      string,
      {
        entityId: string;
        kind: 'hotel' | 'place' | 'activity';
        name: string;
        up: TripVote[];
        down: TripVote[];
      }
    >();
    for (const v of votes) {
      const cur = grouped.get(v.entityId) || {
        entityId: v.entityId,
        kind: v.entityKind,
        name: resolveEntityName(v.entityId, v.entityKind),
        up: [],
        down: [],
      };
      if (v.vote === 'up') cur.up.push(v);
      else cur.down.push(v);
      grouped.set(v.entityId, cur);
    }
    return Array.from(grouped.values()).sort(
      (a, b) => b.up.length - a.up.length || a.down.length - b.down.length
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [votes, hotels, places, activities]);

  const recentNotes = useMemo(
    () =>
      [...notes]
        .reverse()
        .map((n) => ({
          ...n,
          entityName: resolveEntityName(n.entityId, n.entityKind),
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, hotels, places, activities]
  );

  const KindIcon = ({ kind }: { kind: 'hotel' | 'place' | 'activity' }) =>
    kind === 'hotel' ? (
      <BedDouble className="w-3.5 h-3.5 text-[#C85A17] shrink-0" />
    ) : kind === 'activity' ? (
      <Ticket className="w-3.5 h-3.5 text-[#C85A17] shrink-0" />
    ) : (
      <MapPin className="w-3.5 h-3.5 text-[#C85A17] shrink-0" />
    );

  return (
    <div className="h-full flex flex-col bg-[#FAF9F5]">
      {/* Rail Header */}
      <div className="shrink-0 h-[56px] px-4 flex items-center justify-between border-b border-black/[0.06]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-full bg-[#ECEAE2] flex items-center justify-center text-[#0E2034] shrink-0">
            <Users className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-[#14191F] leading-tight">
              Group Votes &amp; Notes
            </div>
            <div className="text-[11px] text-[#7B828A] truncate">
              {ownerName ? `${ownerName}’s ${destination} trip` : `Shared ${destination} trip`}
            </div>
          </div>
        </div>
        <span className="font-tabular text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#ECEAE2] text-[#2C333A] shrink-0">
          {votes.length}v · {notes.length}n
        </span>
      </div>

      {/* Scrollable Group Feed */}
      <div className="flex-1 overflow-y-auto thin-scrollbar px-4 py-4 space-y-5">
        {/* Participants */}
        {participants.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7B828A]">
              Chimed in ({participants.length})
            </div>
            <div className="flex items-center flex-wrap gap-1.5">
              {participants.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-black/[0.07] text-[11.5px] font-medium text-[#14191F]"
                >
                  <span className="w-4 h-4 rounded-full bg-[#0E2034] text-white text-[9px] font-bold flex items-center justify-center">
                    {getInitials(name)}
                  </span>
                  <span>{name}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Top-Voted Leaderboard */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7B828A]">
              Top-voted picks
            </span>
          </div>

          {rankedVotes.length === 0 ? (
            <div className="rounded-2xl bg-white border border-dashed border-black/[0.12] p-4 text-[12.5px] text-[#5A626A] leading-relaxed">
              No votes yet — tap <strong className="text-[#14191F]">👍</strong> on any stay or stop
              to weigh in for the group.
            </div>
          ) : (
            <div className="space-y-2">
              {rankedVotes.map((entry, idx) => (
                <button
                  key={entry.entityId}
                  type="button"
                  onClick={() => onInspectEntity(entry.entityId, entry.kind)}
                  className="w-full rounded-2xl bg-white border border-black/[0.07] hover:border-[#0E2034]/35 p-3 text-left transition-all cursor-pointer space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <KindIcon kind={entry.kind} />
                      <span className="text-[13px] font-semibold text-[#14191F] truncate">
                        {entry.name}
                      </span>
                    </div>
                    {idx === 0 && entry.up.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-[#0E2034] text-white text-[10px] font-semibold shrink-0">
                        Leading
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11.5px]">
                    <div className="flex items-center gap-2">
                      {entry.up.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <ThumbsUp className="w-3 h-3" />
                          <span>{entry.up.length}</span>
                        </span>
                      )}
                      {entry.down.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-rose-600 font-semibold">
                          <ThumbsDown className="w-3 h-3" />
                          <span>{entry.down.length}</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[#7B828A] truncate">
                      {entry.up.map((v) => v.voterName).join(', ')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Contextual Notes Feed */}
        <div className="space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7B828A]">
            Recent group notes
          </div>

          {recentNotes.length === 0 ? (
            <div className="rounded-2xl bg-white border border-dashed border-black/[0.12] p-4 text-[12.5px] text-[#5A626A] leading-relaxed">
              Open any hotel or stop to leave a quick 1-line note for the organizer.
            </div>
          ) : (
            <div className="space-y-2">
              {recentNotes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onInspectEntity(n.entityId, n.entityKind)}
                  className="w-full rounded-2xl bg-white border border-black/[0.07] hover:border-[#0E2034]/35 p-3 text-left transition-all cursor-pointer space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#7B828A]">
                    <span className="inline-flex items-center gap-1 font-medium text-[#C85A17] truncate">
                      <MessageSquare className="w-3 h-3 shrink-0" />
                      <span className="truncate">{n.entityName}</span>
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#0E2034] text-white text-[9.5px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {getInitials(n.authorName)}
                    </span>
                    <p className="text-[12.5px] text-[#2C333A] leading-snug">
                      <strong className="text-[#14191F] mr-1">{n.authorName}</strong>
                      {n.body}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Viral CTA */}
      <div className="shrink-0 p-4 border-t border-black/[0.06] bg-[#F7F6F1]">
        <button
          type="button"
          onClick={onPlanOwnTrip}
          className="w-full py-2.5 px-4 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[12.5px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          style={{ color: '#FFFFFF' }}
        >
          <Sparkles className="w-3.5 h-3.5 text-[#E5A95C]" />
          <span>Plan your own trip on Vesper</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
