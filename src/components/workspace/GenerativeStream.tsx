import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  ArrowUp,
  BedDouble,
  ChevronDown,
  Compass,
  Loader2,
  Menu,
  Mic,
  Plane,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Square,
} from 'lucide-react';
import {
  ActivityItem,
  ChatMessage,
  CollabEntityKind,
  DiscoverSection,
  FareClass,
  FlightOption,
  HotelItem,
  LoyaltyProgramEntry,
  PlaceItem,
  RoadTripConfig,
  TripDayMeta,
  TripMode,
  TripNote,
  TripSavedItem,
  TripVote,
} from '../../types/travel';
import { BrandMark } from '../common/BrandMark';
import { TasteCard, TasteProfile } from './TasteCard';
import { MobileChatCalibration } from './MobileChatCalibration';
import { ActivityCarousel, ChatHotelCarousel, PlaceCarousel } from './DiscoverCarousels';
import { CanvasBookings } from './CanvasBookings';
import { EditorialSheetTarget } from './ContextualEditorialSheet';
import { renderInlineBold, renderRichChatContent } from '../../utils/format';
import { useVoiceDictation } from '../../hooks/useVoiceDictation';

export interface StreamBookingWidget {
  id: string;
  kind: 'stays' | 'flights';
  town?: string | null;
  introText: string;
}

interface GenerativeStreamProps {
  destination: string;
  datesLabel: string;
  travelersLabel: string;
  liveTripSlug: string | null;
  days: TripDayMeta[];
  tripMode: TripMode;
  roadTrip: RoadTripConfig | null;
  roadTripDefaults: {
    startCity: string;
    transportMode: 'drive_home' | 'fly_drive';
    overnightTowns?: string[];
  } | null;
  homeAirport?: string;
  onChangeHomeAirport?: (airport: string) => void;
  loyaltyPrograms: LoyaltyProgramEntry[];
  onOpenLoyaltyWallet?: (category: 'hotel' | 'airline') => void;
  // Calibration & catalog
  tasteCalibrated: boolean;
  tasteProfile: TasteProfile | null;
  savedDefaultTaste?: TasteProfile | null;
  isComposingCatalog: boolean;
  activitiesTitle: string;
  activities: ActivityItem[];
  sectionsToRender: DiscoverSection[];
  hotels: HotelItem[];
  // Items, collab & selection
  savedItems: TripSavedItem[];
  savedRefIds: Set<string>;
  likedIds: Set<string>;
  votes: TripVote[];
  notes: TripNote[];
  voterKey?: string;
  showGroupCollab: boolean;
  sheetTarget: EditorialSheetTarget | null;
  // Summoned inline booking widgets & active town
  streamWidgets: StreamBookingWidget[];
  activeBookingsTown: string | null;
  onChangeActiveBookingsTown: (town: string | null) => void;
  onSummonWidget: (kind: 'stays' | 'flights', town?: string | null) => void;
  // Conversation stream state
  messages: ChatMessage[];
  streamingText: string | null;
  thinkingLabel: string | null;
  statusStep: string | null;
  // Handlers
  onOpenSidebar: () => void;
  onGoHome: () => void;
  onOpenShareModal: () => void;
  onRetuneTaste: () => void;
  onSubmitTaste: (profile: TasteProfile) => void;
  onToggleLike: (id: string) => void;
  onToggleSavePlace: (place: PlaceItem) => void;
  onOpenActivity: (act: ActivityItem) => void;
  onSelectPlace: (place: PlaceItem) => void;
  onOpenHotel: (hotel: HotelItem, openRooms?: boolean) => void;
  onAddFlights: (outbound: FlightOption, inbound: FlightOption, fare: FareClass) => void;
  onOpenCheckout: () => void;
  onVote?: (entityId: string, kind: CollabEntityKind, vote: 'up' | 'down' | 'clear') => void;
  onHoverId: (id: string | null) => void;
  onOrganizeItinerary: () => void;
  onSend: (text: string) => void;
}

const VOICE_DEMO_TEXT =
  'Organize my saved places into a coherent itinerary with minimal travel time';

/**
 * Unified Odessia-inspired `Ask Vesper` Generative Stream (Left 50% on Desktop, Tab 1 on Mobile).
 * Interleaves warm Vesper editorial conversation directly with interactive Taste Calibration,
 * swipeable Activity & Place carousels, live Google Hotels search + filters, and live Google
 * Flights search + filters — eliminating the split-brain gap between chat and UI.
 */
export const GenerativeStream: React.FC<GenerativeStreamProps> = ({
  destination,
  datesLabel,
  travelersLabel,
  liveTripSlug,
  days,
  tripMode,
  roadTrip,
  roadTripDefaults,
  homeAirport = 'San Francisco (SFO)',
  onChangeHomeAirport,
  loyaltyPrograms,
  onOpenLoyaltyWallet,
  tasteCalibrated,
  tasteProfile,
  savedDefaultTaste,
  isComposingCatalog,
  activitiesTitle,
  activities,
  sectionsToRender,
  hotels,
  savedItems,
  savedRefIds,
  likedIds,
  votes,
  notes,
  voterKey,
  showGroupCollab,
  sheetTarget,
  streamWidgets,
  activeBookingsTown,
  onChangeActiveBookingsTown,
  onSummonWidget,
  messages,
  streamingText,
  thinkingLabel,
  statusStep,
  onOpenSidebar,
  onGoHome,
  onOpenShareModal,
  onRetuneTaste,
  onSubmitTaste,
  onToggleLike,
  onToggleSavePlace,
  onOpenActivity,
  onSelectPlace,
  onOpenHotel,
  onAddFlights,
  onOpenCheckout,
  onVote,
  onHoverId,
  onOrganizeItinerary,
  onSend,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [topicMenuOpen, setTopicMenuOpen] = useState(false);
  const topicMenuRef = useRef<HTMLDivElement>(null);
  const discoverAnchorRef = useRef<HTMLDivElement>(null);
  const widgetRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const streamEndRef = useRef<HTMLDivElement>(null);
  const voice = useVoiceDictation({ demoPhrase: VOICE_DEMO_TEXT, barCount: 28 });

  const isDriveFromHome = tripMode === 'roadtrip' && roadTrip?.transportMode !== 'fly_drive';

  // Close topic dropdown on outside click
  useEffect(() => {
    if (!topicMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (topicMenuRef.current && !topicMenuRef.current.contains(e.target as Node)) {
        setTopicMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [topicMenuOpen]);

  // Smoothly scroll to newly summoned booking widgets
  const prevWidgetCountRef = useRef(streamWidgets.length);
  useEffect(() => {
    if (streamWidgets.length > prevWidgetCountRef.current) {
      const latest = streamWidgets[streamWidgets.length - 1];
      if (latest) {
        window.setTimeout(() => {
          widgetRefs.current[latest.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
      }
    }
    prevWidgetCountRef.current = streamWidgets.length;
  }, [streamWidgets]);

  // Smoothly keep bottom in view during active streaming / new chat turns
  const prevMsgCountRef = useRef(messages.length);
  useEffect(() => {
    if (streamingText || thinkingLabel || messages.length > prevMsgCountRef.current) {
      streamEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length, streamingText, thinkingLabel]);

  // Partition messages cleanly:
  // - Initial welcome pair (init-u / init-a) sits at top before calibration
  // - Taste kickoff assistant message (taste-a-*) sits right above Discover carousels
  // - All subsequent conversational turns sit cleanly after Discover + summoned widgets
  const introMessages: ChatMessage[] = [];
  let kickoffAssistantMsg: ChatMessage | null = null;
  const followUpMessages: ChatMessage[] = [];

  for (const msg of messages) {
    const isCalibrationLog =
      msg.role === 'user' &&
      Boolean(
        msg.id.startsWith('taste-u-') ||
          (msg.text &&
            (/^(Calibrated|Road trip)\s*·/.test(msg.text) ||
              /pace\s*·\s*(Smart|Elevated|Iconic)\s+style$/i.test(msg.text)))
      );
    if (isCalibrationLog) continue; // Rendered as clean inline pill below

    if (msg.id === 'init-u' || msg.id === 'init-a') {
      introMessages.push(msg);
    } else if (msg.id.startsWith('taste-a-') && !kickoffAssistantMsg) {
      kickoffAssistantMsg = msg;
    } else {
      followUpMessages.push(msg);
    }
  }

  const renderMessage = (msg: ChatMessage) => {
    if (msg.role === 'user') {
      return (
        <div key={msg.id} className="flex justify-end">
          <div className="max-w-[85%] rounded-[18px] rounded-tr-md bg-[#ECEAE2] px-4 py-2.5 text-[13.5px] leading-relaxed text-[#14191F]">
            {msg.text}
          </div>
        </div>
      );
    }
    return (
      <div key={msg.id} className="space-y-3">
        {msg.blocks?.map((block, bIdx) => {
          if (block.type === 'text') {
            return <div key={bIdx}>{renderRichChatContent(block.content)}</div>;
          }
          if (block.type === 'bullets') {
            return (
              <div key={bIdx} className="space-y-2.5 text-[13.5px] leading-[1.6] text-[#2C333A]">
                {block.intro && renderRichChatContent(block.intro)}
                <ul className="space-y-1.5 pl-0.5">
                  {block.items.map((it, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-[8px] w-1.5 h-1.5 rounded-full bg-[#C85A17] shrink-0" />
                      <span className="flex-1">{renderInlineBold(it)}</span>
                    </li>
                  ))}
                </ul>
                {block.outro && renderRichChatContent(block.outro)}
              </div>
            );
          }
          if (block.type === 'hotels' && block.hotels.length > 0) {
            return (
              <div key={bIdx} className="pt-1.5 pb-0.5">
                <ChatHotelCarousel
                  title={block.title}
                  datesLabel={block.datesLabel || datesLabel}
                  nights={block.nights}
                  destination={destination}
                  hotels={block.hotels}
                  likedIds={likedIds}
                  onToggleLike={onToggleLike}
                  onOpenHotel={onOpenHotel}
                  onHoverId={onHoverId}
                  onOpenAllStays={() => jumpToWidget('stays')}
                />
              </div>
            );
          }
          if (block.type === 'places' && block.places.length > 0) {
            return (
              <div key={bIdx} className="pt-1.5 pb-0.5">
                <PlaceCarousel
                  title={block.title}
                  places={block.places}
                  compact
                  savedRefIds={savedRefIds}
                  likedIds={likedIds}
                  onToggleSave={onToggleSavePlace}
                  onToggleLike={onToggleLike}
                  onSelectPlace={onSelectPlace}
                  onHoverId={onHoverId}
                />
              </div>
            );
          }
          if (block.type === 'suggestions') {
            return (
              <div key={bIdx} className="space-y-1.5 pt-1">
                {block.items.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => onSend(suggestion)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white hover:border-[#0E2034] border border-black/[0.08] text-left text-[12.5px] font-medium text-[#14191F] transition-all cursor-pointer group"
                  >
                    <span className="truncate pr-2">{suggestion}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#7B828A] group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </button>
                ))}
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  };

  const contextChips =
    sheetTarget?.kind === 'hotel'
      ? ['Is it quiet for a light sleeper?', 'How close is it to my planned stops?']
      : sheetTarget?.kind === 'place'
      ? [`Best time to visit ${sheetTarget.item.name}?`, 'Suggest a great dinner spot nearby']
      : sheetTarget?.kind === 'activity'
      ? ['What pairs well nearby after this?', 'Organize my itinerary into days']
      : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let text = inputValue.trim();
    if (voice.isRecording) {
      const spoken = await voice.stopRecording();
      if (spoken) text = spoken;
      else return;
    }
    if (!text) return;
    setInputValue('');
    voice.reset();
    onSend(text);
  };

  const jumpToWidget = (kind: 'stays' | 'flights') => {
    setTopicMenuOpen(false);
    const existing = [...streamWidgets].reverse().find((w) => w.kind === kind);
    if (existing && widgetRefs.current[existing.id]) {
      widgetRefs.current[existing.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      onSummonWidget(kind);
    }
  };

  const activeHeaderLabel =
    streamWidgets.length > 0
      ? streamWidgets[streamWidgets.length - 1].kind === 'flights'
        ? `Flights · ${destination || 'Trip'}`
        : `Stays · ${destination || 'Trip'}`
      : destination
      ? `Exploring ${destination}`
      : 'Ask Vesper';

  return (
    <div className="h-full flex flex-col bg-[#F7F6F1] min-w-0">
      {/* Unified Top Masthead with Odessia-style Topic Jump Menu */}
      <header className="shrink-0 h-[56px] px-3.5 sm:px-5 flex items-center justify-between gap-2 border-b border-black/[0.06] bg-[#F7F6F1]">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="p-1.5 -ml-1 rounded-lg hover:bg-black/[0.05] text-[#14191F] cursor-pointer shrink-0"
            aria-label="Open menu"
          >
            <Menu className="w-[18px] h-[18px]" strokeWidth={1.8} />
          </button>

          <button
            type="button"
            onClick={onGoHome}
            title="Back to Vesper home"
            aria-label="Return to Vesper home"
            className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-black/[0.04] transition-colors cursor-pointer shrink-0"
          >
            <BrandMark size={25} className="shrink-0" />
            <span className="font-editorial text-[20px] font-medium text-[#14191F] leading-none hidden sm:inline">
              Vesper
            </span>
          </button>

          <span className="text-black/15 hidden sm:inline">/</span>

          {/* Topic Jump Dropdown (lets you jump straight to Discover, Stays, or Flights in 1 click) */}
          <div ref={topicMenuRef} className="relative min-w-0">
            <button
              type="button"
              onClick={() => setTopicMenuOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full hover:bg-black/[0.04] text-[13px] font-semibold text-[#14191F] transition-colors cursor-pointer max-w-[200px] sm:max-w-[240px]"
            >
              <span className="truncate">{activeHeaderLabel}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-[#5A626A] shrink-0 transition-transform ${
                  topicMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {topicMenuOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-60 rounded-2xl bg-white border border-black/[0.1] shadow-xl p-1.5 z-50 space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setTopicMenuOpen(false);
                    discoverAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#FAF9F5] text-left text-[12.5px] font-medium text-[#14191F] cursor-pointer"
                >
                  <Compass className="w-4 h-4 text-[#C85A17]" />
                  <span>Places &amp; Experiences</span>
                </button>
                <button
                  type="button"
                  onClick={() => jumpToWidget('stays')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#FAF9F5] text-left text-[12.5px] font-medium text-[#14191F] cursor-pointer"
                >
                  <BedDouble className="w-4 h-4 text-[#C85A17]" />
                  <span>{tripMode === 'roadtrip' ? 'Overnight Stays' : 'Boutique Stays'}</span>
                </button>
                {!isDriveFromHome && (
                  <button
                    type="button"
                    onClick={() => jumpToWidget('flights')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#FAF9F5] text-left text-[12.5px] font-medium text-[#14191F] cursor-pointer"
                  >
                    <Plane className="w-4 h-4 text-[#C85A17]" />
                    <span>Round-Trip Flights</span>
                  </button>
                )}
                {tasteCalibrated && (
                  <div className="pt-1 mt-1 border-t border-black/[0.06]">
                    <button
                      type="button"
                      onClick={() => {
                        setTopicMenuOpen(false);
                        onRetuneTaste();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#FAF9F5] text-left text-[12.5px] font-medium text-[#5A626A] cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Retune trip taste</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Share & Group Poll Pill */}
        <div className="flex items-center gap-1.5 shrink-0">
          {liveTripSlug && (
            <button
              type="button"
              onClick={onOpenShareModal}
              title="Share trip & group vote"
              aria-label="Share trip and group vote"
              className="relative h-8 px-2.5 rounded-full bg-white hover:bg-black/[0.04] border border-black/[0.09] inline-flex items-center gap-1.5 text-[12px] font-medium text-[#2C333A] transition-colors cursor-pointer shrink-0"
            >
              <Share2 className="w-3.5 h-3.5 text-[#5A626A]" />
              <span className="hidden sm:inline">Share</span>
              {votes.length + notes.length > 0 && (
                <span className="font-tabular min-w-[16px] h-[16px] px-1 rounded-full bg-[#C85A17] text-white text-[10px] font-bold flex items-center justify-center">
                  {votes.length + notes.length}
                </span>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Main Scrollable Generative Conversation + Interactive Widgets Stream */}
      <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar px-4 sm:px-6 py-5">
        {!tasteCalibrated ? (
          <div className="max-w-[680px] mx-auto w-full h-full flex flex-col">
            {/* Mobile (< 1024px): Thumb-friendly conversational calibration */}
            <div className="lg:hidden h-full">
              <MobileChatCalibration
                destination={destination}
                dates={datesLabel}
                detectedTripMode={tripMode}
                initialStartCity={
                  roadTripDefaults?.startCity ||
                  homeAirport?.replace(/\s*\([A-Z]{3}\)\s*$/, '') ||
                  ''
                }
                initialTransportMode={roadTripDefaults?.transportMode || 'drive_home'}
                initialProfile={tasteProfile || savedDefaultTaste}
                onSubmit={onSubmitTaste}
              />
            </div>

            {/* Desktop (>= 1024px): Welcome exchange + Inline Taste Calibration Card inside stream */}
            <div className="hidden lg:block space-y-5 pb-10">
              {introMessages.map(renderMessage)}
              {thinkingLabel && introMessages.length === 0 && (
                <div className="text-[13px] font-medium thinking-shimmer">{thinkingLabel}</div>
              )}
              <TasteCard
                destination={destination}
                dates={datesLabel}
                detectedTripMode={tripMode}
                initialStartCity={
                  roadTripDefaults?.startCity ||
                  homeAirport?.replace(/\s*\([A-Z]{3}\)\s*$/, '') ||
                  ''
                }
                initialTransportMode={roadTripDefaults?.transportMode || 'drive_home'}
                initialProfile={tasteProfile || savedDefaultTaste}
                onSubmit={onSubmitTaste}
              />
            </div>
          </div>
        ) : (
          <div className="max-w-[700px] mx-auto w-full space-y-7 pb-10">
            {/* 1. Opening Prompt + Vesper Welcome */}
            {introMessages.length > 0 && (
              <div className="space-y-4">{introMessages.map(renderMessage)}</div>
            )}

            {/* 2. Quiet Centered Taste Calibration Pill + Retune */}
            {tasteProfile && (
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ECEAE2]/85 border border-black/[0.06] text-[11.5px] font-medium text-[#5A626A]">
                  <span>
                    {tasteProfile.travelers} · {tasteProfile.pace} pace · {tasteProfile.splurge} style
                  </span>
                </span>
                <button
                  type="button"
                  onClick={onRetuneTaste}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full hover:bg-black/[0.05] text-[11.5px] font-medium text-[#5A626A] hover:text-[#14191F] transition-colors cursor-pointer"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>Retune</span>
                </button>
              </div>
            )}

            {/* 3. Composing Skeleton OR Interleaved Vesper Kickoff + Discover Carousels */}
            <div ref={discoverAnchorRef} className="space-y-7 scroll-mt-4">
              {isComposingCatalog ? (
                <div className="space-y-5">
                  <div className="rounded-[20px] bg-white border border-black/[0.08] p-4 flex items-center gap-3 shadow-2xs">
                    <Loader2 className="w-5 h-5 animate-spin text-[#C85A17] shrink-0" />
                    <div>
                      <div className="text-[14px] font-semibold text-[#14191F]">
                        Curating {destination || 'your trip'} around your taste...
                      </div>
                      <div className="text-[12px] text-[#7B828A]">
                        Pulling verified places, real photography, ratings &amp; stays.
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {[1, 2].map((card) => (
                      <div
                        key={card}
                        className="h-[240px] rounded-[20px] bg-white border border-black/[0.07] skeleton-pulse"
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* Vesper's warm 2-paragraph editorial kickoff note (without duplicate suggestions) */}
                  {kickoffAssistantMsg && (
                    <div className="space-y-3">
                      {kickoffAssistantMsg.blocks
                        ?.filter((b) => b.type !== 'suggestions')
                        .map((block, bIdx) =>
                          block.type === 'text' ? (
                            <div key={bIdx}>{renderRichChatContent(block.content)}</div>
                          ) : null
                        )}
                    </div>
                  )}

                  {/* Curated Activities & Guided Experiences */}
                  {activities.length > 0 && (
                    <ActivityCarousel
                      title={activitiesTitle}
                      activities={activities.slice(0, 5)}
                      likedIds={likedIds}
                      onToggleLike={onToggleLike}
                      onOpenActivity={onOpenActivity}
                      onHoverId={onHoverId}
                    />
                  )}

                  {/* Curated Place Carousels (Museums, Architecture, Dining, Landmarks) */}
                  {sectionsToRender
                    .filter((sec) => sec.places.length > 0)
                    .map((sec) => (
                      <PlaceCarousel
                        key={sec.key}
                        title={sec.title}
                        intro={sec.intro}
                        places={sec.places}
                        savedRefIds={savedRefIds}
                        likedIds={likedIds}
                        onToggleSave={onToggleSavePlace}
                        onToggleLike={onToggleLike}
                        onSelectPlace={onSelectPlace}
                        onHoverId={onHoverId}
                      />
                    ))}

                  {/* Odessia-Style Next-Step Action Stack inside the Stream */}
                  <div className="rounded-[20px] bg-white border border-black/[0.08] divide-y divide-black/[0.06] overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      onClick={() => jumpToWidget('stays')}
                      className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#FAF9F5] transition-colors text-left cursor-pointer group"
                    >
                      <span className="inline-flex items-center gap-2.5 text-[13px] font-medium text-[#14191F]">
                        <BedDouble className="w-4 h-4 text-[#C85A17]" />
                        <span>
                          {tripMode === 'roadtrip'
                            ? `Find overnight stays along ${destination}`
                            : `Find boutique stays in ${destination}`}
                        </span>
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#7B828A] group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </button>

                    {!isDriveFromHome && (
                      <button
                        type="button"
                        onClick={() => jumpToWidget('flights')}
                        className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#FAF9F5] transition-colors text-left cursor-pointer group"
                      >
                        <span className="inline-flex items-center gap-2.5 text-[13px] font-medium text-[#14191F]">
                          <Plane className="w-4 h-4 text-[#C85A17]" />
                          <span>
                            Find flights from {homeAirport.replace(/\s*\([A-Z]{3}\)\s*$/, '')} to{' '}
                            {destination}
                          </span>
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#7B828A] group-hover:translate-x-0.5 transition-transform shrink-0" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={onOrganizeItinerary}
                      className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#FAF9F5] transition-colors text-left cursor-pointer group"
                    >
                      <span className="inline-flex items-center gap-2.5 text-[13px] font-medium text-[#14191F]">
                        <Sparkles className="w-4 h-4 text-[#C85A17]" />
                        <span>Organize my {destination} itinerary into days</span>
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#7B828A] group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* 4. Summoned Live Interactive Booking Widgets (Hotels / Flights right inside the stream!) */}
            {streamWidgets.map((widget) => (
              <div
                key={widget.id}
                ref={(el) => {
                  widgetRefs.current[widget.id] = el;
                }}
                className="space-y-4 pt-2 border-t border-black/[0.06] scroll-mt-4"
              >
                <div>{renderRichChatContent(widget.introText)}</div>
                <CanvasBookings
                  subTab={widget.kind}
                  onChangeSubTab={(nextTab) => {
                    if (nextTab !== widget.kind) jumpToWidget(nextTab);
                  }}
                  homeAirport={homeAirport}
                  onChangeHomeAirport={onChangeHomeAirport}
                  loyaltyPrograms={loyaltyPrograms}
                  onOpenLoyaltyWallet={onOpenLoyaltyWallet}
                  destination={destination}
                  datesLabel={datesLabel}
                  travelers={travelersLabel}
                  days={days}
                  tripMode={tripMode}
                  roadTrip={roadTrip}
                  activeTown={widget.town ?? activeBookingsTown}
                  onChangeActiveTown={onChangeActiveBookingsTown}
                  hotels={hotels}
                  items={savedItems}
                  likedIds={likedIds}
                  votes={votes}
                  notes={notes}
                  voterKey={voterKey}
                  onVote={showGroupCollab ? onVote : undefined}
                  onOpenSharePoll={showGroupCollab ? onOpenShareModal : undefined}
                  onToggleLike={onToggleLike}
                  onOpenHotel={onOpenHotel}
                  onAddFlights={onAddFlights}
                  onOpenCheckout={onOpenCheckout}
                  onHoverId={onHoverId}
                />
              </div>
            ))}

            {/* 5. Ongoing Conversational Turns with Ask Vesper */}
            {followUpMessages.length > 0 && (
              <div className="space-y-4 pt-2 border-t border-black/[0.06]">
                {followUpMessages.map(renderMessage)}
              </div>
            )}

            {/* Live Streaming Tokens & Tool Status */}
            {streamingText && renderRichChatContent(streamingText, { trailingCursor: true })}
            {thinkingLabel && (
              <div className="text-[13px] font-medium thinking-shimmer">{thinkingLabel}</div>
            )}
            {statusStep && (
              <div className="flex items-center gap-2 py-1">
                <BrandMark size={20} className="animate-pulse shrink-0" />
                <span className="text-[12.5px] font-medium thinking-shimmer">{statusStep}</span>
              </div>
            )}

            <div ref={streamEndRef} className="h-2" />
          </div>
        )}
      </div>

      {/* Pinned Floating Bottom Composer ("Ask Vesper anything...") */}
      {tasteCalibrated && (
        <div className="shrink-0 px-3.5 sm:px-6 pt-2 pb-3 lg:pb-4 bg-gradient-to-t from-[#F7F6F1] via-[#F7F6F1]/95 to-transparent space-y-2">
          <div className="max-w-[700px] mx-auto w-full space-y-2">
            {sheetTarget && contextChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {contextChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => onSend(chip)}
                    className="px-2.5 py-1 rounded-full bg-white hover:border-[#0E2034] border border-black/[0.09] text-[11.5px] font-medium text-[#2C333A] transition-colors cursor-pointer shadow-2xs"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="rounded-[20px] bg-white border border-black/[0.1] px-4 py-2.5 shadow-[0_8px_28px_rgba(14,32,52,0.08)]"
            >
              {voice.isRecording || voice.isTranscribing ? (
                <div className="space-y-2">
                  <div className="text-[12.5px] text-[#14191F] line-clamp-2 min-h-[18px]">
                    {voice.isTranscribing ? (
                      <span className="thinking-shimmer text-[#5A626A]">Transcribing...</span>
                    ) : voice.transcript ? (
                      voice.transcript
                    ) : (
                      <span className="text-[#7B828A]">Listening...</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={voice.isTranscribing}
                      onClick={async () => {
                        const spoken = await voice.stopRecording();
                        if (spoken) {
                          setInputValue((prev) => (prev.trim() ? `${prev.trim()} ${spoken}` : spoken));
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2 h-7 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-200/80 text-rose-700 text-[11px] font-medium cursor-pointer disabled:opacity-50"
                      title="Stop listening and fill input"
                    >
                      <Square className="w-2.5 h-2.5 fill-rose-600 text-rose-600" />
                      <span>Stop</span>
                    </button>
                    <div className="flex-1 flex items-center justify-end gap-[2px] h-5 overflow-hidden">
                      {voice.waveBars.map((h, i) => (
                        <motion.span
                          key={i}
                          animate={{ height: h }}
                          transition={{ duration: 0.08 }}
                          className="w-[2px] rounded-full bg-[#C85A17]/80 shrink-0"
                        />
                      ))}
                    </div>
                    <button
                      type="submit"
                      disabled={voice.isTranscribing}
                      className="w-8 h-8 rounded-full bg-[#0E2034] flex items-center justify-center cursor-pointer disabled:opacity-50"
                      style={{ color: '#FFFFFF' }}
                      title="Send voice message"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {voice.error && (
                    <div className="text-[11.5px] text-rose-600 bg-rose-50/80 border border-rose-200/70 rounded-lg px-2.5 py-1">
                      {voice.error}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => {
                        if (voice.error) voice.clearError();
                        setInputValue(e.target.value);
                      }}
                      placeholder={
                        sheetTarget
                          ? `Ask Vesper about ${
                              sheetTarget.kind === 'activity' ? 'this experience' : sheetTarget.item.name
                            }...`
                          : `Ask Vesper anything about ${destination || 'your trip'}...`
                      }
                      className="flex-1 bg-transparent text-[13.5px] text-[#14191F] placeholder:text-[#7B828A] focus:outline-none min-w-0"
                    />
                    <button
                      type="button"
                      onClick={() => voice.startRecording()}
                      className="w-8 h-8 rounded-full hover:bg-black/[0.05] flex items-center justify-center text-[#5A626A] hover:text-[#14191F] transition-colors cursor-pointer shrink-0"
                      title="Voice input"
                      aria-label="Voice input"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                    <button
                      type="submit"
                      disabled={!inputValue.trim()}
                      className="w-8 h-8 rounded-full bg-[#0E2034] hover:bg-[#17304D] disabled:opacity-35 flex items-center justify-center transition-all cursor-pointer shrink-0"
                      style={{ color: '#FFFFFF' }}
                      aria-label="Send message"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
