"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "../lib/supabase";

type View = "dashboard" | "notifications" | "ladder" | "challenges" | "matches" | "venues" | "scorer" | "admin" | "settings";
type AdminQueue = "decisions" | "results" | "deadlines" | "inactive";
type AdminSection = "operations" | "players" | "venues" | "league" | "audit" | "permissions";
type AdminTier = "full" | "manager" | "operations";
type PlayerProfileTab = "overview" | "activity" | "performance" | "account";
type PlayerStatus = "Active" | "Review" | "Inactive" | "Suspended" | "Secured" | "Removed";
type PlayerAdminAction = "secure" | "suspend" | "remove";
type AllowanceAdjustmentKind = "refusals-used" | "weekly-challenges" | "refusals-received";
type LocationAccessDuration = "30m" | "2h" | "4h" | "8h" | "until-off";
type PlayerSettingsTab = "account" | "profile" | "appearance" | "notifications" | "location" | "security";
type GuestOfficialRole = "Referee" | "Witness only";
type OfficialSource = "guest" | "league";
type MatchViewRole = "player" | "official" | "spectator";
type ScoreState = { playerOne: number; playerTwo: number; playerOneLegs: number; playerTwoLegs: number };
type VisitRecord = { id: number; player: string; scored: number; remaining: number; darts: number; leg: number; note: string; doubleAttempts?: number };
type NotificationCategory = "challenge" | "match" | "deadline" | "result" | "venue" | "account" | "league" | "admin";
type PlayerNotification = {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  time: string;
  read: boolean;
  priority: "normal" | "important" | "urgent";
  channels: string[];
};

type MatchArrangement = {
  opponent: string;
  date: string;
  time: string;
  venue: string;
  alternative: string;
  playerConfirmed: boolean;
  opponentConfirmed: boolean;
};

type GuestOfficialApplication = {
  name: string;
  phone: string;
  email: string;
  role: GuestOfficialRole;
  remember: boolean;
};

type NewPlayerApplication = {
  name: string;
  username: string;
  email: string;
  mobile: string;
  dateOfBirth: string;
  postcode: string;
  preferredArea: string;
  experience: string;
  average: string;
  handedness: string;
  accessibility: string;
  emergencyName: string;
  emergencyPhone: string;
};

type AdminInvitation = {
  player: string;
  tier: AdminTier;
  status: "Pending" | "Accepted" | "Declined";
};

type PlayerAllowanceRecord = {
  refusalsUsed: number;
  weeklyChallengeAdjustment: number;
  refusalsReceivedThisWeek: number;
};

type PlayerRow = {
  rank: number;
  name: string;
  played: number;
  won: number;
  lost: number;
  movement: number;
};

type VenueRecommendation = {
  id: string;
  submittedBy: string;
  name: string;
  address: string;
  postcode: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  boards: number;
  availability: string;
  facilities: string;
  notes: string;
  status: "Pending approval" | "Approved" | "Changes requested" | "Rejected";
};

type ApprovedVenue = {
  id: string;
  name: string;
  area: string;
  address: string;
  postcode: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  boards: number;
  availability: string;
  facilities: string;
  notes: string;
  latitude?: number;
  longitude?: number;
};

type VenueAttendance = {
  id: string;
  venueId: string;
  person: string;
  role: "Player" | "Referee" | "Witness" | "Social";
  date: string;
  startTime: string;
  endTime: string;
  note: string;
  status: "Planned" | "Checked in" | "Playing" | "Unavailable" | "Checked out";
};

const approvedVenues: ApprovedVenue[] = [];

const initialPlayers: PlayerRow[] = [];

const higherFinishRegistrationOrder: { name: string; lastPosition: number }[] = [];

const seasonRegistrations: { name: string; lastDivision: number; lastPosition: number; isNew: boolean; toppedUp: boolean; adminPaid: boolean }[] = [];

const initialPlayerStatuses: Record<string, PlayerStatus> = {};

const playerPerformance: Record<string, { average: string; checkout: number; maximums: number; bestLeg: number }> = {};

const potentialPayoutByPosition: Record<number, number> = {
  1: 248, 2: 198, 3: 160, 4: 132, 5: 110,
  6: 92, 7: 76, 8: 62, 9: 50, 10: 40,
};

const initialAuditLog: { id: string; when: string; organiser: string; action: string; subject: string; previous: string; next: string; reason: string }[] = [];

const statComparisons = [
  { label: "180s", personal: "—", division: "—", leader: "No result yet" },
  { label: "Highest checkout", personal: "—", division: "—", leader: "No result yet" },
  { label: "Highest average", personal: "—", division: "—", leader: "No result yet" },
  { label: "Least darts in a leg", personal: "—", division: "—", leader: "No result yet" },
];

const liveStatComparisons = statComparisons;

const liveMatchResults: { date: string; opponent: string; result: string; score: string; average: string; checkout: number; maximums: number }[] = [];

const liveScheduled: { id: string; time: string; home: string; away: string; venue: string; status: string; isLive: boolean }[] = [];

const adminCases: Record<AdminQueue, { id: string; category: string; subject: string; detail: string; options: string[]; notification?: { recipients: string; textAvailable: boolean } }[]> = {
  decisions: [],
  results: [],
  deadlines: [],
  inactive: [],
};

const caseWaitHours: Record<string, number> = {
  "result-p02": 91,
  "refusal-p08": 76,
  "response-p10": 57,
  "venue-sports-lounge": 49,
  "inactive-p09": 38,
  "dispute-p07": 31,
  "result-p01": 26,
  "deadline-p04": 21,
  "result-walkover": 17,
  "inactive-p10": 12,
  "deadline-p05": 6,
};

function Badge({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "red" | "cream" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

const DART_SCORES = Array.from(new Set([
  ...Array.from({ length: 20 }, (_, index) => index + 1),
  ...Array.from({ length: 20 }, (_, index) => (index + 1) * 2),
  ...Array.from({ length: 20 }, (_, index) => (index + 1) * 3),
  25,
  50,
]));
const CHECKOUT_DOUBLES = [...Array.from({ length: 20 }, (_, index) => (index + 1) * 2), 50];
const RESERVED_USERNAMES = ["dcuk.organiser", "anonymous06", "anonymous04", "leagueadmin"];
const OFFENSIVE_USERNAME_PARTS = ["fuck", "shit", "cunt", "bitch", "nazi", "racist"];

function usernameValidation(username: string, password = "") {
  const clean = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{4,24}$/.test(clean)) return "Use 4–24 letters, numbers, dots, underscores or hyphens.";
  if (RESERVED_USERNAMES.includes(clean)) return "That username is already in use.";
  if (OFFENSIVE_USERNAME_PARTS.some((part) => clean.includes(part))) return "That username is not permitted under the league conduct policy.";
  if (password && password.toLowerCase().includes(clean)) return "Your username cannot appear anywhere in your password.";
  return "";
}

function minimumCheckoutDarts(score: number) {
  if (CHECKOUT_DOUBLES.includes(score)) return 1;
  if (DART_SCORES.some((first) => CHECKOUT_DOUBLES.includes(score - first))) return 2;
  if (DART_SCORES.some((first) => DART_SCORES.some((second) => CHECKOUT_DOUBLES.includes(score - first - second)))) return 3;
  return null;
}

function visitScoreClass(score: number, note: string) {
  if (note === "Bust") return "visit-bust";
  if (note === "Miss" || score === 0) return "visit-miss";
  if (score === 180) return "visit-180";
  if (score >= 140) return "visit-140";
  if (score >= 100) return "visit-100";
  return "";
}

function VisitChips({ visits }: { visits: VisitRecord[] }) {
  return <>{visits.map((item) => <i className={visitScoreClass(item.scored, item.note)} key={item.id}>{item.note === "Bust" ? "×" : item.note === "Miss" || item.scored === 0 ? "o" : item.scored}</i>)}</>;
}

function getAdvisedLeagueStructure(playerCount: number) {
  if (playerCount < 12) return { divisions: [] as number[], waiting: playerCount, message: `${12 - playerCount} more registrations needed to form the minimum 12-player division.` };
  if (playerCount <= 20) return { divisions: [playerCount], waiting: 0, message: "One division is advised because no more than 20 players are registered." };
  if (playerCount <= 23) return { divisions: [20], waiting: playerCount - 20, message: "One 20-player division is advised. Fewer than 12 players remain, so they stay on the waiting list." };
  const divisionCount = Math.ceil(playerCount / 20);
  const baseSize = Math.floor(playerCount / divisionCount);
  const remainder = playerCount % divisionCount;
  const divisions = Array.from({ length: divisionCount }, (_, index) => baseSize + (index < remainder ? 1 : 0));
  return { divisions, waiting: 0, message: `${divisionCount} balanced divisions are advised, with no more than one player difference between them.` };
}

function calculateSeasonEndDate(startDate: string, divisionSizes: number[]) {
  if (!startDate || !divisionSizes.length) return "";
  const longestSeasonWeeks = Math.max(...divisionSizes) + 4;
  const end = new Date(`${startDate}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + longestSeasonWeeks * 7 - 1);
  return end.toISOString().slice(0, 10);
}

export default function Home() {
  const supabaseConfigured = isSupabaseConfigured();
  const supabase = useMemo(() => supabaseConfigured ? getSupabaseBrowserClient() : null, [supabaseConfigured]);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [remoteProfile, setRemoteProfile] = useState<any>(null);
  const [remoteProfiles, setRemoteProfiles] = useState<any[]>([]);
  const [remoteLeague, setRemoteLeague] = useState<any>(null);
  const [remoteMemberships, setRemoteMemberships] = useState<any[]>([]);
  const [remoteChallenges, setRemoteChallenges] = useState<any[]>([]);
  const [remoteMatches, setRemoteMatches] = useState<any[]>([]);
  const [remoteDivisions, setRemoteDivisions] = useState<any[]>([]);
  const [remoteError, setRemoteError] = useState("");
  const [view, setView] = useState<View>("dashboard");
  const [adminSection, setAdminSection] = useState<AdminSection>("operations");
  const [players, setPlayers] = useState<PlayerRow[]>(initialPlayers);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerStatusFilter, setPlayerStatusFilter] = useState<"All" | PlayerStatus>("All");
  const [selectedAdminPlayerName, setSelectedAdminPlayerName] = useState("");
  const [playerProfileTab, setPlayerProfileTab] = useState<PlayerProfileTab>("overview");
  const [playerStatuses, setPlayerStatuses] = useState<Record<string, PlayerStatus>>(initialPlayerStatuses);
  const [playerBalances, setPlayerBalances] = useState<Record<string, number>>(() => Object.fromEntries(players.map((player) => [player.name, 0])));
  const [playerNotes, setPlayerNotes] = useState<Record<string, string[]>>({});
  const [playerRestrictions, setPlayerRestrictions] = useState<Record<string, { type: "Secured" | "Suspended"; reason: string; weeks: number }>>({});
  const [playerAllowances, setPlayerAllowances] = useState<Record<string, PlayerAllowanceRecord>>(() => Object.fromEntries(initialPlayers.map((player) => [player.name, { refusalsUsed: 0, weeklyChallengeAdjustment: 0, refusalsReceivedThisWeek: 0 }])));
  const [allowanceAdjustment, setAllowanceAdjustment] = useState<{ playerName: string; kind: AllowanceAdjustmentKind; direction: 1 | -1 } | null>(null);
  const [playerAdminAction, setPlayerAdminAction] = useState<PlayerAdminAction | null>(null);
  const [deletePlayerTarget, setDeletePlayerTarget] = useState<PlayerRow | null>(null);
  const [matchResultsPlayerName, setMatchResultsPlayerName] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [challengeMode, setChallengeMode] = useState<"standard" | "power-play">("standard");
  const [powerPlayUsed, setPowerPlayUsed] = useState(false);
  const [powerPlayOpponent, setPowerPlayOpponent] = useState("");
  const [challengeSent, setChallengeSent] = useState(false);
  const [selectedOpponent, setSelectedOpponent] = useState("");
  const [outgoingOpponent, setOutgoingOpponent] = useState("");
  const [cancelOutgoingOpen, setCancelOutgoingOpen] = useState(false);
  const [incomingStatus, setIncomingStatus] = useState<"pending" | "accepted" | "alternative" | "refusal-review">("accepted");
  const [incomingAction, setIncomingAction] = useState<"alternative" | "refuse" | null>(null);
  const [withdrawRefusalOpen, setWithdrawRefusalOpen] = useState(false);
  const [schedulingOpen, setSchedulingOpen] = useState(false);
  const [matchArrangement, setMatchArrangement] = useState<MatchArrangement | null>(null);
  const [guestInviteOpen, setGuestInviteOpen] = useState(false);
  const [guestInviteRole, setGuestInviteRole] = useState<GuestOfficialRole>("Referee");
  const [officialSource, setOfficialSource] = useState<OfficialSource>("guest");
  const [leagueOfficialNominee, setLeagueOfficialNominee] = useState("Anonymous Player 01");
  const [leagueOfficialAccepted, setLeagueOfficialAccepted] = useState(false);
  const [guestAccessCode, setGuestAccessCode] = useState("");
  const [guestRegistrationOpen, setGuestRegistrationOpen] = useState(false);
  const [guestOfficial, setGuestOfficial] = useState<GuestOfficialApplication | null>(null);
  const [guestApprovals, setGuestApprovals] = useState({ player: false, opponent: false });
  const [scoringAccount, setScoringAccount] = useState("");
  const [scoringAccountApprovals, setScoringAccountApprovals] = useState({ player: false, opponent: false });
  const [guestFlowMessage, setGuestFlowMessage] = useState("");
  const [reminderMatch, setReminderMatch] = useState<(typeof liveScheduled)[number] | null>(null);
  const [reminderSet, setReminderSet] = useState(false);
  const [score, setScore] = useState({ playerOne: 501, playerTwo: 501, playerOneLegs: 0, playerTwoLegs: 0 });
  const [scoreHistory, setScoreHistory] = useState<{ score: ScoreState; thrower: "playerOne" | "playerTwo"; visits: VisitRecord[] }[]>([]);
  const [visitHistory, setVisitHistory] = useState<VisitRecord[]>([]);
  const [visit, setVisit] = useState("");
  const [pendingCheckout, setPendingCheckout] = useState<{ value: number; player: "playerOne" | "playerTwo"; darts?: 1 | 2 | 3 } | null>(null);
  const [pendingDoubleAttempt, setPendingDoubleAttempt] = useState<{ value: number; player: "playerOne" | "playerTwo"; remainingBefore: number; maximumAttempts: number } | null>(null);
  const [statsPlayer, setStatsPlayer] = useState<"playerOne" | "playerTwo" | null>(null);
  const [matchSummaryOpen, setMatchSummaryOpen] = useState(false);
  const [thrower, setThrower] = useState<"playerOne" | "playerTwo">("playerOne");
  const [matchLobbyOpen, setMatchLobbyOpen] = useState(true);
  const [matchViewRole, setMatchViewRole] = useState<MatchViewRole>("player");
  const [matchCheckIns, setMatchCheckIns] = useState({ gps: false });
  const [matchReady, setMatchReady] = useState({ player: false, opponent: false, official: false });
  const [matchBoard, setMatchBoard] = useState("Board 3");
  const [matchPaused, setMatchPaused] = useState(false);
  const [matchDisputeOpen, setMatchDisputeOpen] = useState(false);
  const [matchDispute, setMatchDispute] = useState("");
  const [scoreCorrectionOpen, setScoreCorrectionOpen] = useState(false);
  const [resultApprovals, setResultApprovals] = useState({ player: false, opponent: false, official: false });
  const [resultDisputed, setResultDisputed] = useState(false);
  const [matchHistoryOpen, setMatchHistoryOpen] = useState(false);
  const [resultSubmitted, setResultSubmitted] = useState(false);
  const [resultConfirmed, setResultConfirmed] = useState(false);
  const [liveMatchStarted, setLiveMatchStarted] = useState(false);
  const [adminQueue, setAdminQueue] = useState<AdminQueue>("decisions");
  const [adminOutcomes, setAdminOutcomes] = useState<Record<string, string>>({});
  const [pendingAdminAction, setPendingAdminAction] = useState<{ caseId: string; subject: string; action: string } | null>(null);
  const [priorityCase, setPriorityCase] = useState<{ queue: AdminQueue; caseId: string } | null>(null);
  const [priorityClock, setPriorityClock] = useState(() => Date.now());
  const [priorityClockStarted] = useState(() => Date.now());
  const [selectedAdminCaseId, setSelectedAdminCaseId] = useState("");
  const [notificationCase, setNotificationCase] = useState<{ caseId: string; subject: string; recipients: string; textAvailable: boolean } | null>(null);
  const [adminNotifications, setAdminNotifications] = useState<Record<string, string>>({});
  const [divisions, setDivisions] = useState<string[]>([]);
  const [playerDivisions, setPlayerDivisions] = useState<Record<string, string>>({});
  const [ladderOverrides, setLadderOverrides] = useState<Record<string, number>>({});
  const [seasonSettings, setSeasonSettings] = useState({ name: "", start: "", end: "", weeklyChallenges: 2, refusals: 4 });
  const [leagueLive, setLeagueLive] = useState(false);
  const [leaguePaused, setLeaguePaused] = useState(false);
  const [leagueStopped, setLeagueStopped] = useState(false);
  const [leagueControlAction, setLeagueControlAction] = useState<"pause" | "stop" | null>(null);
  const [leagueExtensionOpen, setLeagueExtensionOpen] = useState(false);
  const [registrationPayments, setRegistrationPayments] = useState<Record<string, { toppedUp: boolean; adminPaid: boolean }>>(() => Object.fromEntries(seasonRegistrations.map((player) => [player.name, { toppedUp: false, adminPaid: false }])));
  const [removedSeasonPlayers, setRemovedSeasonPlayers] = useState<string[]>([]);
  const [autoPlacements, setAutoPlacements] = useState<Record<string, { division: string; position: number; note: string }>>({});
  const [divisionStructureAccepted, setDivisionStructureAccepted] = useState(false);
  const [divisionPreviewOpen, setDivisionPreviewOpen] = useState(false);
  const [viewingDivision, setViewingDivision] = useState("");
  const [renameLeagueItem, setRenameLeagueItem] = useState<{ type: "league" | "division"; currentName: string } | null>(null);
  const [previewPlacements, setPreviewPlacements] = useState<Record<string, { division: string; position: number; note: string }>>({});
  const [previewRemovedPlayers, setPreviewRemovedPlayers] = useState<string[]>([]);
  const [auditLog, setAuditLog] = useState(initialAuditLog);
  const [leagueNotice, setLeagueNotice] = useState("");
  const [venueRecommendationOpen, setVenueRecommendationOpen] = useState(false);
  const [venueRecommendationSent, setVenueRecommendationSent] = useState(false);
  const [venueRecommendations, setVenueRecommendations] = useState<VenueRecommendation[]>([]);
  const [venueDecision, setVenueDecision] = useState<{ id: string; action: "Approved" | "Changes requested" | "Rejected" } | null>(null);
  const [organiserVenues, setOrganiserVenues] = useState<ApprovedVenue[]>(approvedVenues);
  const [organiserVenueOpen, setOrganiserVenueOpen] = useState(false);
  const [selectedVenueDetails, setSelectedVenueDetails] = useState<ApprovedVenue | VenueRecommendation | null>(null);
  const [attendanceRegistrationVenue, setAttendanceRegistrationVenue] = useState<ApprovedVenue | VenueRecommendation | null>(null);
  const [venueAttendances, setVenueAttendances] = useState<VenueAttendance[]>([]);
  const [invitedAttendanceIds, setInvitedAttendanceIds] = useState<string[]>([]);
  const [goingOutOpen, setGoingOutOpen] = useState(false);
  const [attendanceUpdateId, setAttendanceUpdateId] = useState("");
  const [gpsMessage, setGpsMessage] = useState("");
  const [playerSignedIn, setPlayerSignedIn] = useState(false);
  const [accountKind, setAccountKind] = useState<"player" | "organiser">("player");
  const [currentAdminTier, setCurrentAdminTier] = useState<AdminTier | null>(null);
  const [playerUsername, setPlayerUsername] = useState("anonymous06");
  const [usernameChangedThisSeason, setUsernameChangedThisSeason] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [adminRoleSearch, setAdminRoleSearch] = useState("");
  const [adminInvitations, setAdminInvitations] = useState<AdminInvitation[]>([]);
  const [pendingAdminInvite, setPendingAdminInvite] = useState<{ player: string; tier: AdminTier } | null>(null);
  const [pendingAdminRevoke, setPendingAdminRevoke] = useState<AdminInvitation | null>(null);
  const [loginView, setLoginView] = useState<"login" | "forgot" | "help">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberPlayer, setRememberPlayer] = useState(true);
  const [loginMessage, setLoginMessage] = useState("");
  const [newPlayerSignupOpen, setNewPlayerSignupOpen] = useState(false);
  const [newPlayerApplication, setNewPlayerApplication] = useState<NewPlayerApplication | null>(null);
  const [newPlayerDashboard, setNewPlayerDashboard] = useState(false);
  const [seasonRegistrationOpen, setSeasonRegistrationOpen] = useState(false);
  const [seasonRegistrationStep, setSeasonRegistrationStep] = useState<1 | 2 | 3>(1);
  const [lastSeasonTableOpen, setLastSeasonTableOpen] = useState(false);
  const [higherFinishersRegistered, setHigherFinishersRegistered] = useState(0);
  const [seasonDetailsConfirmed, setSeasonDetailsConfirmed] = useState(false);
  const [seasonPlacementConfirmed, setSeasonPlacementConfirmed] = useState(false);
  const [seasonAdminFeePaid, setSeasonAdminFeePaid] = useState(false);
  const [seasonRegistered, setSeasonRegistered] = useState(false);
  const [locationSetupOpen, setLocationSetupOpen] = useState(false);
  const [playerSettingsTab, setPlayerSettingsTab] = useState<PlayerSettingsTab>("account");
  const [playerTheme, setPlayerTheme] = useState<"dark" | "light" | "contrast">("dark");
  const [playerAccent, setPlayerAccent] = useState<"green" | "blue" | "red" | "gold">("green");
  const [compactLayout, setCompactLayout] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [accountSuspended, setAccountSuspended] = useState(false);
  const [currentSeasonEntryClosed, setCurrentSeasonEntryClosed] = useState(false);
  const [playerAccountAction, setPlayerAccountAction] = useState<"suspend" | "delete" | null>(null);
  const [notificationSettings, setNotificationSettings] = useState({ inApp: true, email: true, sms: true, challenges: true, matches: true, deadlines: true, results: true, venues: false, marketing: false, quietHours: true });
  const [notificationFilter, setNotificationFilter] = useState<"all" | "unread" | NotificationCategory>("all");
  const [playerNotifications, setPlayerNotifications] = useState<PlayerNotification[]>([]);
  const [playerDetails, setPlayerDetails] = useState({ email: "", mobile: "", address: "", emergencyName: "", emergencyPhone: "", displayName: "Anonymous Player 06" });
  const [locationReenableOpen, setLocationReenableOpen] = useState(false);
  const [locationAccessEnabled, setLocationAccessEnabled] = useState(false);
  const [locationAccessUntil, setLocationAccessUntil] = useState<number | null>(null);
  const [locationDuration, setLocationDuration] = useState<LocationAccessDuration>("until-off");
  const [locationPermissionMessage, setLocationPermissionMessage] = useState("");
  const [locationClock, setLocationClock] = useState(Date.now());
  const [pendingGpsAction, setPendingGpsAction] = useState<{ attendanceId: string; mode: "in" | "out" } | null>(null);

  const loadLiveLeague = useCallback(async () => {
    if (!supabase || !session?.user) return;
    const { data: me, error: profileError } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    if (profileError || !me) {
      setRemoteError(profileError?.message || "Your player profile is still being prepared. Please refresh in a moment.");
      return;
    }
    const directoryRequest = me.admin_tier
      ? supabase.from("profiles").select("id,username,display_name,status,admin_tier,is_player,test_credit_pence")
      : supabase.from("player_directory").select("*");
    const [{ data: directory }, { data: leagueRows }, { data: venueRows }, { data: notices }, { data: auditRows }] = await Promise.all([
      directoryRequest,
      supabase.from("leagues").select("*").in("status", ["scheduled", "live", "paused"]).order("starts_on", { ascending: false }).limit(1),
      supabase.from("venues").select("*").order("name"),
      supabase.from("notifications").select("*").eq("recipient_id", session.user.id).order("created_at", { ascending: false }).limit(100),
      me.admin_tier ? supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
    ]);
    const people = (directory || []) as any[];
    const activeLeague = (leagueRows || [])[0] || null;
    setRemoteProfile(me);
    setRemoteProfiles(people);
    setRemoteLeague(activeLeague);
    setPlayerSignedIn(true);
    setAccountKind(me.admin_tier ? "organiser" : "player");
    setCurrentAdminTier(me.admin_tier || null);
    setPlayerUsername(me.username);
    setPlayerDetails((old) => ({ ...old, displayName: me.display_name, email: me.email || session.user.email || "", mobile: me.mobile || "" }));
    setPlayerBalances((old) => ({ ...old, [me.display_name]: Number(me.test_credit_pence || 0) / 100 }));
    setAccountSuspended(me.status === "suspended");
    setOrganiserVenues(((venueRows || []) as any[]).filter((venue) => venue.status === "approved").map((venue) => ({ id: venue.id, name: venue.name, area: venue.postcode, address: venue.address, postcode: venue.postcode, contactName: "", contactPhone: "", contactEmail: "", boards: venue.boards || 1, availability: "Contact venue", facilities: "", notes: "Approved league venue" })));
    setPlayerNotifications(((notices || []) as any[]).map((notice) => ({ id: notice.id, title: notice.title, message: notice.message, category: notice.category, time: new Date(notice.created_at).toLocaleString("en-GB"), read: Boolean(notice.read_at), priority: notice.priority === "urgent" ? "urgent" : notice.priority === "important" ? "important" : "normal", channels: ["In-app"] })));
    setAuditLog(((auditRows || []) as any[]).map((entry) => ({ id: String(entry.id), when: new Date(entry.created_at).toLocaleString("en-GB"), organiser: people.find((person) => person.id === entry.actor_id)?.display_name || "Organiser", action: entry.action, subject: `${entry.subject_type}: ${entry.subject_id || "—"}`, previous: entry.detail?.before ? JSON.stringify(entry.detail.before) : "—", next: entry.detail?.after ? JSON.stringify(entry.detail.after) : JSON.stringify(entry.detail || {}), reason: entry.reason || "Recorded action" })));
    if (!activeLeague) {
      setRemoteMemberships([]); setRemoteChallenges([]); setRemoteMatches([]); setRemoteDivisions([]);
      setPlayers(people.filter((person) => person.is_player !== false).map((person, index) => ({ rank: index + 1, name: person.display_name, played: 0, won: 0, lost: 0, movement: 0 })));
      setSeasonSettings({ name: "", start: "", end: "", weeklyChallenges: 2, refusals: 4 });
      setLeagueLive(false); setLeaguePaused(false); setLeagueStopped(false); setSeasonRegistered(false); setDivisions([]);
      setRemoteError("");
      return;
    }
    const [{ data: memberships }, { data: challengeRows }, { data: matchRows }, { data: divisionRows }] = await Promise.all([
      supabase.from("league_players").select("*").eq("league_id", activeLeague.id).order("ladder_position"),
      supabase.from("challenges").select("*").eq("league_id", activeLeague.id).order("created_at", { ascending: false }),
      supabase.from("matches").select("*").eq("league_id", activeLeague.id).order("scheduled_at", { ascending: true }),
      supabase.from("divisions").select("*").eq("league_id", activeLeague.id).order("sort_order"),
    ]);
    const memberRows = (memberships || []) as any[];
    setRemoteMemberships(memberRows); setRemoteChallenges((challengeRows || []) as any[]); setRemoteMatches((matchRows || []) as any[]); setRemoteDivisions((divisionRows || []) as any[]);
    setPlayers(people.filter((person) => person.is_player !== false).map((person, index) => { const membership = memberRows.find((row) => row.player_id === person.id); return { rank: membership?.ladder_position || index + 1, name: person.display_name, played: membership?.played || 0, won: membership?.won || 0, lost: membership?.lost || 0, movement: 0 }; }));
    setPlayerStatuses(Object.fromEntries(people.map((person) => [person.display_name, ({ active: "Active", review: "Review", inactive: "Inactive", suspended: "Suspended", secured: "Secured", removed: "Removed" } as any)[person.status] || "Active"])));
    setPlayerBalances((old) => ({ ...old, ...Object.fromEntries(people.filter((person) => person.test_credit_pence !== undefined).map((person) => [person.display_name, Number(person.test_credit_pence || 0) / 100])) }));
    setPlayerDivisions(Object.fromEntries(memberRows.map((member) => [people.find((person) => person.id === member.player_id)?.display_name || member.player_id, (divisionRows || []).find((division: any) => division.id === member.division_id)?.name || "Unassigned"])));
    setLadderOverrides(Object.fromEntries(memberRows.map((member) => [people.find((person) => person.id === member.player_id)?.display_name || member.player_id, member.ladder_position || 0])));
    setPlayerAllowances(Object.fromEntries(memberRows.map((member) => [people.find((person) => person.id === member.player_id)?.display_name || member.player_id, { refusalsUsed: member.refusals_used || 0, weeklyChallengeAdjustment: 0, refusalsReceivedThisWeek: 0 }])));
    setDivisions(((divisionRows || []) as any[]).map((division) => division.name));
    setSeasonSettings({ name: activeLeague.season_name || activeLeague.name, start: activeLeague.starts_on, end: activeLeague.ends_on, weeklyChallenges: activeLeague.weekly_challenges || 2, refusals: 4 });
    setLeagueLive(activeLeague.status === "live"); setLeaguePaused(activeLeague.status === "paused"); setLeagueStopped(activeLeague.status === "stopped");
    const mine = memberRows.find((member) => member.player_id === me.id);
    setSeasonRegistered(Boolean(mine)); setPowerPlayUsed(Boolean(mine && mine.power_plays_used >= activeLeague.power_plays_per_player));
    setRemoteError("");
  }, [session, supabase]);

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setAuthReady(true); if (!nextSession) { setPlayerSignedIn(false); setRemoteProfile(null); } });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => { if (session) void loadLiveLeague(); }, [session, loadLiveLeague]);
  useEffect(() => {
    if (!supabase || !session) return;
    const channel = supabase.channel("dcuk-complete-ui").on("postgres_changes", { event: "*", schema: "public" }, () => { void loadLiveLeague(); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, session, loadLiveLeague]);
  const locationTimeRemaining = locationAccessUntil ? Math.max(0, locationAccessUntil - locationClock) : null;
  const locationStatusText = !locationAccessEnabled
    ? "Location off"
    : locationTimeRemaining === null
      ? "Location on · until switched off"
      : `Location on · ${Math.max(1, Math.ceil(locationTimeRemaining / 60_000))} min left`;
  const locationDashboardText = !locationAccessEnabled
    ? "Location inactive"
    : locationTimeRemaining === null
      ? "Location active · until turned off"
      : `Location active · ${Math.floor(locationTimeRemaining / 3_600_000)}h ${Math.max(1, Math.ceil((locationTimeRemaining % 3_600_000) / 60_000))}m remaining`;
  const proposedStartingPosition = higherFinishersRegistered + 1;
  const signedInPlayerName = remoteProfile?.display_name || (newPlayerApplication?.name || "Player");
  const officialAppointmentApproved = Boolean(guestOfficial && guestApprovals.player && guestApprovals.opponent && (officialSource === "guest" || leagueOfficialAccepted));
  const scoringAuthorityApproved = guestOfficial?.role === "Referee" || Boolean(scoringAccount && scoringAccountApprovals.player && scoringAccountApprovals.opponent);
  const guestOfficialApproved = Boolean(officialAppointmentApproved && scoringAuthorityApproved);
  const lobbyReady = Boolean(matchCheckIns.gps && matchReady.player && matchReady.opponent && matchReady.official && matchBoard);
  const currentPlayerCanScore = Boolean(guestOfficialApproved && ((matchViewRole === "official" && guestOfficial?.role === "Referee") || (matchViewRole === "player" && guestOfficial?.role === "Witness only" && scoringAccount === signedInPlayerName)));
  const readOnlyMatchView = matchViewRole === "spectator" || !currentPlayerCanScore;
  const officialMatchOpponent = matchArrangement?.opponent ?? "Anonymous Player 04";
  const currentLegNumber = score.playerOneLegs + score.playerTwoLegs + 1;
  const checkoutMinimum = minimumCheckoutDarts(score[thrower]);
  const checkoutDartOptions = checkoutMinimum ? ([1, 2, 3] as const).filter((darts) => darts >= checkoutMinimum) : [];
  const playerOneVisitHistory = visitHistory.filter((item) => item.player === signedInPlayerName);
  const opponentVisitHistory = visitHistory.filter((item) => item.player === officialMatchOpponent);
  const playerOneCurrentLegVisits = playerOneVisitHistory.filter((item) => item.leg === currentLegNumber);
  const opponentCurrentLegVisits = opponentVisitHistory.filter((item) => item.leg === currentLegNumber);
  const playerOneDartsThrown = playerOneVisitHistory.reduce((total, item) => total + item.darts, 0);
  const opponentDartsThrown = opponentVisitHistory.reduce((total, item) => total + item.darts, 0);
  const playerOneCurrentLegDarts = playerOneCurrentLegVisits.reduce((total, item) => total + item.darts, 0);
  const opponentCurrentLegDarts = opponentCurrentLegVisits.reduce((total, item) => total + item.darts, 0);
  const playerOneAverage = playerOneDartsThrown ? (playerOneVisitHistory.reduce((total, item) => total + (item.note === "Bust" ? 0 : item.scored), 0) / playerOneDartsThrown * 3).toFixed(2) : "—";
  const opponentAverage = opponentDartsThrown ? (opponentVisitHistory.reduce((total, item) => total + (item.note === "Bust" ? 0 : item.scored), 0) / opponentDartsThrown * 3).toFixed(2) : "—";
  const playerOneCurrentLegAverage = playerOneCurrentLegDarts ? (playerOneCurrentLegVisits.reduce((total, item) => total + (item.note === "Bust" ? 0 : item.scored), 0) / playerOneCurrentLegDarts * 3).toFixed(2) : "—";
  const opponentCurrentLegAverage = opponentCurrentLegDarts ? (opponentCurrentLegVisits.reduce((total, item) => total + (item.note === "Bust" ? 0 : item.scored), 0) / opponentCurrentLegDarts * 3).toFixed(2) : "—";
  function playerMatchStats(visits: VisitRecord[], legsWon: number) {
    const chronological = [...visits].reverse();
    const totalDarts = chronological.reduce((total, item) => total + item.darts, 0);
    const totalScored = chronological.reduce((total, item) => total + (item.note === "Bust" ? 0 : item.scored), 0);
    let firstNineDarts = 0;
    let firstNineScore = 0;
    for (const item of chronological) {
      if (firstNineDarts >= 9) break;
      const dartsUsed = Math.min(item.darts, 9 - firstNineDarts);
      firstNineScore += item.note === "Bust" ? 0 : item.scored * (dartsUsed / item.darts);
      firstNineDarts += dartsUsed;
    }
    const checkouts = chronological.filter((item) => item.note.startsWith("Checkout"));
    const attempts = chronological.reduce((total, item) => total + (item.doubleAttempts ?? 0), 0);
    const completedLegDarts = checkouts.map((checkout) => chronological.filter((item) => item.leg === checkout.leg).reduce((total, item) => total + item.darts, 0));
    return {
      legsWon,
      totalDarts,
      average: totalDarts ? (totalScored / totalDarts * 3).toFixed(2) : "—",
      firstNine: firstNineDarts ? (firstNineScore / firstNineDarts * 3).toFixed(2) : "—",
      highestCheckout: checkouts.length ? Math.max(...checkouts.map((item) => item.scored)) : "—",
      maximums: chronological.filter((item) => item.scored === 180 && item.note !== "Bust").length,
      scores140: chronological.filter((item) => item.scored >= 140 && item.scored < 180 && item.note !== "Bust").length,
      scores100: chronological.filter((item) => item.scored >= 100 && item.scored < 140 && item.note !== "Bust").length,
      checkouts: checkouts.length,
      attempts,
      checkoutPercent: attempts ? `${(checkouts.length / attempts * 100).toFixed(1)}%` : "—",
      bestLeg: completedLegDarts.length ? Math.min(...completedLegDarts) : "—",
    };
  }
  const playerOneMatchStats = playerMatchStats(playerOneVisitHistory, score.playerOneLegs);
  const opponentMatchStats = playerMatchStats(opponentVisitHistory, score.playerTwoLegs);
  const matchLegHistory = Array.from({ length: currentLegNumber }, (_, index) => {
    const leg = index + 1;
    const visits = visitHistory.filter((item) => item.leg === leg);
    const checkout = visits.find((item) => item.note.startsWith("Checkout"));
    return {
      leg,
      visits,
      playerOne: visits.filter((item) => item.player === signedInPlayerName),
      opponent: visits.filter((item) => item.player === officialMatchOpponent),
      winner: checkout?.player ?? (leg === currentLegNumber ? "In progress" : "Awaiting result"),
    };
  }).filter((leg) => leg.visits.length > 0);
  const scoringAuthorityLabel = guestOfficial?.role === "Referee" ? `${guestOfficial.name} · referee and scorer` : `${scoringAccount || "Player account not agreed"} · scoring account`;
  const matchComplete = score.playerOneLegs >= 4 || score.playerTwoLegs >= 4;
  const matchWinner = score.playerOneLegs >= 4 ? signedInPlayerName : score.playerTwoLegs >= 4 ? officialMatchOpponent : null;
  const leagueStructureLocked = leagueLive && !leaguePaused && !leagueStopped;
  const activeScheduled = leagueLive || leagueStopped ? liveScheduled : [];
  const activeMatchResults = leagueLive || leagueStopped ? liveMatchResults : [];
  const activeStatComparisons = leagueLive || leagueStopped ? liveStatComparisons : statComparisons;
  const unfinishedLiveMatchMayContinue = liveMatchStarted && !matchComplete && (leaguePaused || leagueStopped);
  const scoringAvailable = (leagueLive && !leaguePaused && !leagueStopped && liveMatchStarted) || unfinishedLiveMatchMayContinue || (guestOfficialApproved && liveMatchStarted);
  const liveLadderPlayers = useMemo(() => {
    if (!resultConfirmed || matchWinner !== signedInPlayerName) return players;
    return players
      .map((player) => player.name === signedInPlayerName ? { ...player, rank: Math.max(1, player.rank - 2), movement: 2 } : player.name === officialMatchOpponent ? { ...player, rank: player.rank + 2, movement: -2 } : player)
      .sort((a, b) => a.rank - b.rank);
  }, [resultConfirmed, matchWinner]);
  const myRemoteMembership = remoteMemberships.find((membership) => membership.player_id === remoteProfile?.id);
  const myLadderPosition = myRemoteMembership?.ladder_position || players.find((player) => player.name === signedInPlayerName)?.rank || 0;
  const heldBaselinePositions = players.filter((player) => player.rank >= 4 && player.rank <= 5 && ["Secured", "Suspended"].includes(playerStatuses[player.name])).length;
  const playerOneAllowance = playerAllowances[signedInPlayerName] ?? { refusalsUsed: 0, weeklyChallengeAdjustment: 0, refusalsReceivedThisWeek: 0 };
  const refusalRangeBonus = playerOneAllowance.refusalsReceivedThisWeek > 0 ? 1 : 0;
  const playerOneChallengesThisWeek = Math.max(0, seasonSettings.weeklyChallenges + playerOneAllowance.weeklyChallengeAdjustment);
  const playerOneNextWeekBonus = Math.floor(playerOneAllowance.refusalsReceivedThisWeek / 2);
  const dynamicEligibleOpponents = (leagueLive && !leaguePaused && !leagueStopped ? liveLadderPlayers : [])
    .filter((player) => player.rank >= Math.max(1, myLadderPosition - (remoteLeague?.challenge_reach || 2) - heldBaselinePositions - refusalRangeBonus) && player.rank < myLadderPosition && !["Secured", "Suspended", "Removed"].includes(playerStatuses[player.name]))
    .map((player) => ({ ...player, gap: `${myLadderPosition - player.rank} position${myLadderPosition - player.rank === 1 ? "" : "s"} above` }));
  const currentPlayerDivision = playerDivisions[signedInPlayerName];
  const powerPlayOpponents = (leagueLive && !leaguePaused && !leagueStopped ? liveLadderPlayers : [])
    .filter((player) => player.name !== signedInPlayerName && !["Secured", "Suspended", "Removed"].includes(playerStatuses[player.name]) && (!currentPlayerDivision || playerDivisions[player.name] === currentPlayerDivision))
    .map((player) => ({ ...player, gap: "Power Play · any position in your division" }));
  const challengeOpponentPool = challengeMode === "power-play" ? powerPlayOpponents : dynamicEligibleOpponents;
  const chosenOpponent = challengeOpponentPool.find((player) => player.name === selectedOpponent);
  const liveOutgoingChallenge = remoteChallenges.find((challenge) => challenge.challenger_id === remoteProfile?.id && ["pending", "accepted", "scheduled"].includes(challenge.status));
  const liveIncomingChallenge = remoteChallenges.find((challenge) => challenge.challenged_id === remoteProfile?.id && ["pending", "accepted", "scheduled"].includes(challenge.status));
  const liveOutgoingName = remoteProfiles.find((person) => person.id === liveOutgoingChallenge?.challenged_id)?.display_name || outgoingOpponent;
  const liveIncomingName = remoteProfiles.find((person) => person.id === liveIncomingChallenge?.challenger_id)?.display_name || "Player";
  const activeRemoteMatch = remoteMatches.find((match) => session && [match.player_one_id, match.player_two_id].includes(session.user.id) && ["arranging", "scheduled", "live", "awaiting_confirmation"].includes(match.status));
  const selectedAdminPlayer = players.find((player) => player.name === selectedAdminPlayerName);
  const selectedAdminRank = selectedAdminPlayer ? (ladderOverrides[selectedAdminPlayer.name] ?? 0) : 0;
  const selectedAllowance = playerAllowances[selectedAdminPlayerName] ?? { refusalsUsed: 0, weeklyChallengeAdjustment: 0, refusalsReceivedThisWeek: 0 };
  const refusalsUsed = selectedAllowance.refusalsUsed;
  const selectedWeeklyChallenges = Math.max(0, seasonSettings.weeklyChallenges + selectedAllowance.weeklyChallengeAdjustment);
  const selectedNextWeekBonus = Math.floor(selectedAllowance.refusalsReceivedThisWeek / 2);
  const secureMaxWeeks = Math.max(0, 4 - refusalsUsed);
  const filteredAdminPlayers = players.filter((player) => {
    const matchesSearch = player.name.toLowerCase().includes(playerSearch.trim().toLowerCase());
    const matchesStatus = playerStatusFilter === "All" || playerStatuses[player.name] === playerStatusFilter;
    return matchesSearch && matchesStatus;
  });
  const activeAdminCases: typeof adminCases = leagueLive ? adminCases : { decisions: [], results: [], deadlines: [], inactive: [] };
  const adminQueueTotals: Record<AdminQueue, number> = {
    decisions: activeAdminCases.decisions.length,
    results: activeAdminCases.results.length,
    deadlines: activeAdminCases.deadlines.length,
    inactive: activeAdminCases.inactive.length,
  };
  const resolvedByQueue = (queue: AdminQueue) => activeAdminCases[queue].filter((item) => adminOutcomes[item.id]).length;
  const outstandingByQueue = (queue: AdminQueue) => adminQueueTotals[queue] - resolvedByQueue(queue);
  const visibleOutstandingByQueue = (queue: AdminQueue) => activeAdminCases[queue].filter((item) => !adminOutcomes[item.id]).length;
  const elapsedQueueHours = Math.floor((priorityClock - priorityClockStarted) / 3_600_000);
  const activePriorityCases = (["decisions", "results", "deadlines", "inactive"] as AdminQueue[])
    .flatMap((queue) => activeAdminCases[queue].map((item) => ({ queue, caseId: item.id, waitHours: (caseWaitHours[item.id] ?? 0) + elapsedQueueHours })))
    .filter((priority) => !adminOutcomes[priority.caseId])
    .sort((a, b) => b.waitHours - a.waitHours)
    .slice(0, 5);
  const selectedPriorityCase = priorityCase ? activeAdminCases[priorityCase.queue].find((item) => item.id === priorityCase.caseId) : null;
  const selectedPriorityWait = priorityCase ? (caseWaitHours[priorityCase.caseId] ?? 0) + elapsedQueueHours : 0;
  const currentPortalPlayerName = accountKind === "organiser" ? (remoteProfile?.display_name || "League Organiser") : signedInPlayerName;
  const hasAdminAccess = accountKind === "organiser" || currentAdminTier !== null;
  const unreadNotifications = playerNotifications.filter((notification) => !notification.read);
  const visibleNotifications = playerNotifications.filter((notification) => notificationFilter === "all" || (notificationFilter === "unread" ? !notification.read : notification.category === notificationFilter));
  const currentPortalInitials = String(currentPortalPlayerName).split(" ").map((part: string) => part[0]).join("").slice(0, 2).toUpperCase();
  const portalProposedStartingPosition = newPlayerDashboard ? higherFinishersRegistered + 1 : proposedStartingPosition;
  const seasonRegistrationPool = newPlayerApplication
    ? [...seasonRegistrations, { name: newPlayerApplication.name, lastDivision: 0, lastPosition: 0, isNew: true, toppedUp: false, adminPaid: false }]
    : seasonRegistrations;
  const registeredSeasonNames = new Set([
    ...(seasonRegistered ? [currentPortalPlayerName] : []),
    ...higherFinishRegistrationOrder.slice(0, higherFinishersRegistered).map((player) => player.name),
  ]);
  const activeSeasonRegistrations = seasonRegistrationPool.filter((player) => registeredSeasonNames.has(player.name) && !removedSeasonPlayers.includes(player.name));
  const liveRegistrationPlacements = Object.fromEntries(
    [...activeSeasonRegistrations]
      .sort((a, b) => Number(a.isNew) - Number(b.isNew) || a.lastDivision - b.lastDivision || a.lastPosition - b.lastPosition || a.name.localeCompare(b.name))
      .map((player, index) => [player.name, { division: "Division 1", position: index + 1 }])
  ) as Record<string, { division: string; position: number }>;
  const liveRegistrationOrder = [...activeSeasonRegistrations].sort(
    (a, b) => (liveRegistrationPlacements[a.name]?.position ?? 999) - (liveRegistrationPlacements[b.name]?.position ?? 999)
  );
  const organiserRegistrationRows = [...seasonRegistrationPool].sort((a, b) => {
    const aRegistered = registeredSeasonNames.has(a.name) && !removedSeasonPlayers.includes(a.name);
    const bRegistered = registeredSeasonNames.has(b.name) && !removedSeasonPlayers.includes(b.name);
    if (aRegistered !== bRegistered) return aRegistered ? -1 : 1;
    if (aRegistered && bRegistered) {
      return (liveRegistrationPlacements[a.name]?.position ?? 999) - (liveRegistrationPlacements[b.name]?.position ?? 999);
    }
    return seasonRegistrationPool.indexOf(a) - seasonRegistrationPool.indexOf(b);
  });
  const allRegistrationFeesPaid = activeSeasonRegistrations.every((player) => registrationPayments[player.name].toppedUp && registrationPayments[player.name].adminPaid);
  const allRegisteredPlayersPlaced = activeSeasonRegistrations.every((player) => autoPlacements[player.name]);
  const advisedLeagueStructure = getAdvisedLeagueStructure(activeSeasonRegistrations.length);
  const waitingListCount = Object.values(autoPlacements).filter((placement) => placement.division === "Waiting list").length;
  const previewDivisionNames = [...new Set(Object.values(previewPlacements).map((placement) => placement.division))];
  const totalSeasonWeeks = useMemo(() => {
    if (!seasonSettings.start || !seasonSettings.end) return 0;
    const start = new Date(`${seasonSettings.start}T12:00:00Z`);
    const end = new Date(`${seasonSettings.end}T12:00:00Z`);
    const inclusiveDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
    return Math.ceil(inclusiveDays / 7);
  }, [seasonSettings.start, seasonSettings.end]);

  useEffect(() => {
    const timer = window.setInterval(() => setPriorityClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const end = calculateSeasonEndDate(seasonSettings.start, advisedLeagueStructure.divisions);
    setSeasonSettings((old) => old.end === end ? old : { ...old, end });
  }, [seasonSettings.start, removedSeasonPlayers.length]);

  useEffect(() => {
    const savedLocation = window.localStorage.getItem("dcuk-location-access");
    if (!savedLocation) return;
    try {
      const saved = JSON.parse(savedLocation) as { enabled: boolean; until: number | null };
      const stillActive = saved.enabled && (saved.until === null || saved.until > Date.now());
      if (stillActive) {
        setLocationAccessEnabled(true);
        setLocationAccessUntil(saved.until);
        setLocationDuration(saved.until === null ? "until-off" : "4h");
        setLocationClock(Date.now());
      } else {
        window.localStorage.removeItem("dcuk-location-access");
      }
    } catch {
      window.localStorage.removeItem("dcuk-location-access");
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setLocationClock(now);
      if (locationAccessUntil && now >= locationAccessUntil) {
        setLocationAccessEnabled(false);
        setLocationAccessUntil(null);
        window.localStorage.removeItem("dcuk-location-access");
        setLocationPermissionMessage("Timed location access has ended. You can turn it on again in Player settings.");
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [locationAccessUntil]);

  function formatWait(hours: number) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }

  function ordinal(value: number) {
    const remainder100 = value % 100;
    if (remainder100 >= 11 && remainder100 <= 13) return `${value}th`;
    return `${value}${value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th"}`;
  }

  function addAudit(action: string, subject: string, previous: string, next: string, reason: string) {
    setAuditLog((old) => [{ id: `audit-${Date.now()}`, when: "Just now", organiser: "Anonymous Player 06", action, subject, previous, next, reason }, ...old]);
    if (supabase && session && remoteProfile?.admin_tier) void supabase.from("audit_log").insert({ actor_id: session.user.id, action, subject_type: "app", subject_id: subject, detail: { before: previous, after: next }, reason });
  }

  async function saveSeasonToSupabase(next: { name: string; start: string; end: string; weeklyChallenges: number; refusals: number }) {
    if (!supabase || !session || !remoteProfile?.admin_tier) return;
    const payload = { name: "DartsCoachUK Official Ladder League", season_name: next.name, starts_on: next.start, ends_on: next.end, weekly_challenges: next.weeklyChallenges, status: "scheduled", registration_open: true, created_by: session.user.id };
    const result = remoteLeague
      ? await supabase.from("leagues").update(payload).eq("id", remoteLeague.id)
      : await supabase.from("leagues").insert(payload);
    if (result.error) throw result.error;
    await loadLiveLeague();
  }

  async function issueLiveChallenge(opponentName: string, powerPlay: boolean) {
    if (!supabase || !remoteLeague) return;
    const opponent = remoteProfiles.find((person) => person.display_name === opponentName);
    if (!opponent) throw new Error("That player could not be found in the live player directory.");
    const { error } = await supabase.rpc("issue_challenge", { target_player: opponent.id, target_league: remoteLeague.id, power_play: powerPlay });
    if (error) throw error;
    await loadLiveLeague();
  }

  async function adjustLiveBalance(playerName: string, pounds: number) {
    if (!supabase) return;
    const player = remoteProfiles.find((person) => person.display_name === playerName);
    if (!player) throw new Error("Player account not found.");
    const { error } = await supabase.rpc("adjust_test_balance", { target_player: player.id, amount: Math.round(pounds * 100), adjustment_reason: `Full-admin ${pounds > 0 ? "credit" : "debit"} from organiser dashboard` });
    if (error) throw error;
    await loadLiveLeague();
  }

  async function respondToLiveChallenge(challengeId: string, decision: "accept" | "refuse", reason?: string) {
    if (!supabase) return;
    const { error } = await supabase.rpc("respond_to_challenge", { target_challenge: challengeId, decision, reason_text: reason || null });
    if (error) throw error;
    await loadLiveLeague();
  }

  function useRecommendedStructure() {
    if (leagueStructureLocked) return;
    const advice = getAdvisedLeagueStructure(activeSeasonRegistrations.length);
    const nextDivisions = advice.divisions.map((_, index) => `Division ${index + 1}`);
    setDivisions(nextDivisions);
    setAutoPlacements({});
    setDivisionStructureAccepted(false);
    setPlayerDivisions((old) => ({ ...old, ...Object.fromEntries(activeSeasonRegistrations.map((player) => [player.name, "Unassigned"])) }));
    setLadderOverrides({});
    setSeasonSettings((old) => ({ ...old, end: calculateSeasonEndDate(old.start, advice.divisions) }));
    addAudit("Recommended structure selected", "New season divisions", divisions.length ? `${divisions.length} draft divisions` : "No structure", advice.divisions.length ? advice.divisions.map((size, index) => `Division ${index + 1}: ${size}`).join(" · ") : `${advice.waiting} waiting`, advice.message);
    setLeagueNotice(advice.divisions.length ? `Recommended structure selected: ${advice.divisions.map((size, index) => `Division ${index + 1} with ${size}`).join(", ")}.` : advice.message);
  }

  function openDivisionPreview(placements: Record<string, { division: string; position: number; note: string }>) {
    if (leagueStructureLocked) return;
    setPreviewPlacements(placements);
    setPreviewRemovedPlayers([]);
    setDivisionPreviewOpen(true);
  }

  function orderedRegisteredPlayers() {
    const registered = seasonRegistrationPool.filter((player) => registeredSeasonNames.has(player.name) && !removedSeasonPlayers.includes(player.name));
    return [
      ...registered.filter((player) => !player.isNew && player.lastDivision === 1 && player.lastPosition <= 9).sort((a, b) => a.lastPosition - b.lastPosition),
      ...registered.filter((player) => !player.isNew && player.lastDivision === 2 && player.lastPosition <= 3).sort((a, b) => a.lastPosition - b.lastPosition),
      ...registered.filter((player) => !player.isNew && player.lastDivision === 1 && player.lastPosition >= 10).sort((a, b) => a.lastPosition - b.lastPosition),
      ...registered.filter((player) => !player.isNew && player.lastDivision === 2 && player.lastPosition >= 4).sort((a, b) => a.lastPosition - b.lastPosition),
      ...registered.filter((player) => player.isNew),
    ];
  }

  function movePreviewPlayer(name: string, targetDivision: string) {
    if (leagueStructureLocked) return;
    setPreviewPlacements((old) => {
      const current = old[name];
      if (!current || current.division === targetDivision) return old;
      const next = { ...old };
      next[name] = {
        ...current,
        division: targetDivision,
        position: Object.values(old).filter((placement) => placement.division === targetDivision).length + 1,
        note: "Moved manually by organiser",
      };
      [current.division, targetDivision].forEach((division) => {
        Object.entries(next)
          .filter(([, placement]) => placement.division === division)
          .sort((a, b) => a[1].position - b[1].position)
          .forEach(([playerName], index) => { next[playerName] = { ...next[playerName], position: index + 1 }; });
      });
      return next;
    });
  }

  function reorderPreviewPlayer(name: string, direction: -1 | 1) {
    if (leagueStructureLocked) return;
    setPreviewPlacements((old) => {
      const current = old[name];
      if (!current) return old;
      const ordered = Object.entries(old)
        .filter(([, placement]) => placement.division === current.division)
        .sort((a, b) => a[1].position - b[1].position);
      const index = ordered.findIndex(([playerName]) => playerName === name);
      const swapIndex = index + direction;
      if (swapIndex < 0 || swapIndex >= ordered.length) return old;
      const swapName = ordered[swapIndex][0];
      return {
        ...old,
        [name]: { ...current, position: old[swapName].position, note: "Position adjusted manually" },
        [swapName]: { ...old[swapName], position: current.position },
      };
    });
  }

  function acceptDivisionPreview() {
    if (leagueStructureLocked) return;
    const accepted: Record<string, { division: string; position: number; note: string }> = {};
    const acceptedDivisions = [...new Set(Object.values(previewPlacements).map((placement) => placement.division))];
    acceptedDivisions.forEach((division) => {
      Object.entries(previewPlacements)
        .filter(([name, placement]) => placement.division === division && !previewRemovedPlayers.includes(name))
        .sort((a, b) => a[1].position - b[1].position)
        .forEach(([name, placement], index) => { accepted[name] = { ...placement, position: index + 1 }; });
    });
    setAutoPlacements(accepted);
    setDivisionStructureAccepted(true);
    setRemovedSeasonPlayers((old) => [...new Set([...old, ...previewRemovedPlayers])]);
    setPlayerDivisions((old) => ({ ...old, ...Object.fromEntries(Object.entries(accepted).map(([name, placement]) => [name, placement.division])) }));
    setLadderOverrides((old) => ({ ...old, ...Object.fromEntries(Object.entries(accepted).map(([name, placement]) => [name, placement.position])) }));
    setSeasonSettings((old) => ({ ...old, end: calculateSeasonEndDate(old.start, divisions.map((division) => Object.values(accepted).filter((placement) => placement.division === division).length)) }));
    addAudit("Division preview accepted", "New season registration", "Proposed placements", `${Object.keys(accepted).length} players assigned · ${previewRemovedPlayers.length} removed`, "Organiser reviewed and accepted autopopulated divisions");
    setLeagueNotice(`Division preview accepted. ${Object.keys(accepted).length} players assigned${previewRemovedPlayers.length ? ` and ${previewRemovedPlayers.length} removed` : ""}.`);
    setDivisionPreviewOpen(false);
    setPreviewRemovedPlayers([]);
  }

  function removeDivisionAndReflow(divisionToRemove: string) {
    if (leagueStructureLocked) return;
    const remaining = divisions.filter((division) => division !== divisionToRemove);
    if (remaining.length !== 1) {
      setDivisions(remaining);
      setAutoPlacements({});
      addAudit("Draft division removed", divisionToRemove, `${divisions.length} divisions`, `${remaining.length} divisions`, "Organiser division management");
      setLeagueNotice(`${divisionToRemove} removed. Autopopulate players again to rebuild the remaining divisions.`);
      return;
    }
    const placementOrder = orderedRegisteredPlayers();
    const remainingDivisionName = remaining[0];
    const active = placementOrder.slice(0, 20);
    const waiting = placementOrder.slice(20);
    const next: Record<string, { division: string; position: number; note: string }> = {};
    active.forEach((player, index) => {
      const promoted = !player.isNew && player.lastDivision === 2 && player.lastPosition <= 3;
      const relegated = !player.isNew && player.lastDivision === 1 && player.lastPosition >= 10;
      next[player.name] = { division: remainingDivisionName, position: index + 1, note: player.isNew ? "New player · bottom placement" : promoted ? "Promoted · above relegated players" : relegated ? "Relegated · below promoted players" : "Previous order retained" };
    });
    waiting.forEach((player, index) => { next[player.name] = { division: "Waiting list", position: index + 1, note: "Waiting list after division removal" }; });
    setDivisions([remainingDivisionName]);
    setAutoPlacements(next);
    setDivisionStructureAccepted(true);
    setPlayerDivisions((old) => ({ ...old, ...Object.fromEntries(Object.entries(next).map(([name, placement]) => [name, placement.division])) }));
    setLadderOverrides((old) => ({ ...old, ...Object.fromEntries(Object.entries(next).map(([name, placement]) => [name, placement.position])) }));
    setSeasonSettings((old) => ({ ...old, end: calculateSeasonEndDate(old.start, [active.length]) }));
    addAudit("Division removed and league reflowed", divisionToRemove, `${divisions.length} ${divisionStructureAccepted ? "accepted" : "draft"} divisions`, `${remainingDivisionName}: ${active.length} · Waiting list: ${waiting.length}`, "Remaining division filled to the rulebook maximum of 20 players");
    setLeagueNotice(`${divisionToRemove} removed from the ${divisionStructureAccepted ? "accepted" : "draft"} structure. ${remainingDivisionName} now contains ${active.length} players${waiting.length ? ` and ${waiting.length} players have moved to the waiting list` : ""}. Promotion and relegation order has been reapplied.`);
  }

  function autopopulateDivisions() {
    if (leagueStructureLocked) return;
    const registered = seasonRegistrationPool.filter((player) => registeredSeasonNames.has(player.name) && !removedSeasonPlayers.includes(player.name));
    const advice = getAdvisedLeagueStructure(registered.length);
    if (!divisions.length || !advice.divisions.length) {
      setLeagueNotice(advice.divisions.length ? "Use the recommended league division structure before autopopulating players." : advice.message);
      return;
    }
    const returning = registered.filter((player) => !player.isNew);
    const newcomers = registered.filter((player) => player.isNew);
    const divisionOneRetained = returning.filter((player) => player.lastDivision === 1 && player.lastPosition <= 9).sort((a, b) => a.lastPosition - b.lastPosition);
    const promoted = returning.filter((player) => player.lastDivision === 2 && player.lastPosition <= 3).sort((a, b) => a.lastPosition - b.lastPosition);
    const relegated = returning.filter((player) => player.lastDivision === 1 && player.lastPosition >= 10).sort((a, b) => a.lastPosition - b.lastPosition);
    const divisionTwoRetained = returning.filter((player) => player.lastDivision === 2 && player.lastPosition >= 4).sort((a, b) => a.lastPosition - b.lastPosition);
    if (divisions.length === 1) {
      const divisionName = divisions[0];
      const ordered = [...divisionOneRetained, ...promoted, ...relegated, ...divisionTwoRetained, ...newcomers];
      const activeCapacity = Math.min(20, ordered.length);
      const active = ordered.slice(0, activeCapacity);
      const waiting = ordered.slice(activeCapacity);
      const next: Record<string, { division: string; position: number; note: string }> = {};
      active.forEach((player, index) => { next[player.name] = { division: divisionName, position: index + 1, note: player.isNew ? "New player · bottom placement" : promoted.some((item) => item.name === player.name) ? "Promoted order applied" : relegated.some((item) => item.name === player.name) ? "Relegation order applied" : "Previous order retained" }; });
      waiting.forEach((player, index) => { next[player.name] = { division: "Waiting list", position: index + 1, note: "Waiting list after merged division reached 20" }; });
      openDivisionPreview(next);
      return;
    }
    const targetDivisionOne = advice.divisions[0] ?? Math.ceil(registered.length / divisions.length);
    const orderedOne = [...divisionOneRetained, ...promoted];
    const remainingDivisionTwo = [...divisionTwoRetained];
    while (orderedOne.length < targetDivisionOne && remainingDivisionTwo.length) orderedOne.push(remainingDivisionTwo.shift()!);
    const orderedTwo = [...relegated, ...remainingDivisionTwo, ...newcomers];
    const next: Record<string, { division: string; position: number; note: string }> = {};
    orderedOne.forEach((player, index) => { next[player.name] = { division: divisions[0], position: index + 1, note: player.lastDivision === 2 ? "Promoted" : "Previous order retained" }; });
    orderedTwo.forEach((player, index) => { next[player.name] = { division: divisions[1], position: index + 1, note: player.isNew ? "New player · bottom placement" : player.lastDivision === 1 ? "Relegated" : "Previous order retained" }; });
    openDivisionPreview(next);
  }

  function startLeagueNow() {
    const launchDivisions = divisions.length
      ? divisions
      : advisedLeagueStructure.divisions.map((_, index) => `Division ${index + 1}`);
    const fallbackDivisions = launchDivisions.length ? launchDivisions : ["Division 1"];
    const ordered = orderedRegisteredPlayers();
    const launchPlacements = Object.keys(autoPlacements).length ? autoPlacements : (() => {
      const next: Record<string, { division: string; position: number; note: string }> = {};
      let playerIndex = 0;
      fallbackDivisions.forEach((division, divisionIndex) => {
        const divisionSize = advisedLeagueStructure.divisions[divisionIndex] ?? Math.min(20, ordered.length - playerIndex);
        ordered.slice(playerIndex, playerIndex + divisionSize).forEach((player, positionIndex) => {
          next[player.name] = {
            division,
            position: positionIndex + 1,
            note: player.isNew ? "New player · bottom placement" : "Opening ladder position published",
          };
        });
        playerIndex += divisionSize;
      });
      ordered.slice(playerIndex).forEach((player, index) => {
        next[player.name] = { division: "Waiting list", position: index + 1, note: "Waiting for an active league place" };
      });
      return next;
    })();
    const today = new Date().toISOString().slice(0, 10);
    const launchEnd = seasonSettings.end || calculateSeasonEndDate(seasonSettings.start || today, fallbackDivisions.map((division) => Object.values(launchPlacements).filter((placement) => placement.division === division).length));

    setDivisions(fallbackDivisions);
    setAutoPlacements(launchPlacements);
    setDivisionStructureAccepted(true);
    setPlayerDivisions((old) => ({ ...old, ...Object.fromEntries(Object.entries(launchPlacements).map(([name, placement]) => [name, placement.division])) }));
    setLadderOverrides((old) => ({ ...old, ...Object.fromEntries(Object.entries(launchPlacements).map(([name, placement]) => [name, placement.position])) }));
    setSeasonSettings((old) => ({ ...old, name: old.name === "New ladder league" ? "2026 Official Ladder League" : old.name, start: old.start || today, end: launchEnd }));
    setLeagueLive(true);
    setLeaguePaused(false);
    setLeagueStopped(false);
    setLiveMatchStarted(false);
    setScore({ playerOne: 501, playerTwo: 501, playerOneLegs: 0, playerTwoLegs: 0 });
    setThrower("playerOne");
    setVisit("");
    setResultSubmitted(false);
    setResultConfirmed(false);
    setOutgoingOpponent("");
    setSelectedOpponent("");
    setChallengeSent(false);
    setIncomingStatus("pending");
    setAdminOutcomes({});
    setDivisionPreviewOpen(false);
    setRenameLeagueItem(null);
    setLeagueNotice("The league is live from day one. The opening ladder is published and players may now issue the season’s first challenges.");
    addAudit("League launched", seasonSettings.name === "New ladder league" ? "2026 Official Ladder League" : seasonSettings.name, "Pre-season setup", "Opening ladder live · no challenges or results", "Organiser selected Start League");
  }

  function datePlusOneWeek(date: string) {
    if (!date) return "";
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 7);
    return next.toISOString().slice(0, 10);
  }

  const title = useMemo(() => ({
    dashboard: "Player command centre",
    notifications: "Notification centre",
    ladder: "Division 1 ladder",
    challenges: "Challenge centre",
    matches: "Division match calendar",
    venues: "Authorised venues",
    scorer: "Live match scoreboard",
    admin: "Organiser control centre",
    settings: "Player settings",
  })[view], [view]);

  function selectedNotificationChannels() {
    return ["In-app", ...(notificationSettings.email ? ["Email"] : []), ...(notificationSettings.sms ? ["Text message"] : [])];
  }

  function addPlayerNotification(title: string, message: string, category: NotificationCategory, priority: PlayerNotification["priority"] = "normal", channels = selectedNotificationChannels()) {
    setPlayerNotifications((old) => [{
      id: `notice-${Date.now()}`,
      title,
      message,
      category,
      time: "Just now",
      read: false,
      priority,
      channels,
    }, ...old]);
  }

  function enterScore() {
    submitScore(Number(visit));
  }

  function submitScore(value: number, recordedDoubleAttempts?: number) {
    if (matchComplete || matchPaused || !currentPlayerCanScore) return;
    if (!Number.isInteger(value) || value < 0 || value > 180) return;
    const current = score[thrower];
    const next = current - value;
    const finishRange = (remaining: number) => remaining === 50 || (remaining >= 2 && remaining <= 40);
    const couldThrowAtDouble = finishRange(current) || finishRange(next);
    const checkoutDartsRequired = minimumCheckoutDarts(current);
    const maximumDoubleAttempts = checkoutDartsRequired ? 4 - checkoutDartsRequired : 0;
    if (next !== 0 && couldThrowAtDouble && maximumDoubleAttempts > 0 && recordedDoubleAttempts === undefined) {
      setPendingDoubleAttempt({ value, player: thrower, remainingBefore: finishRange(next) ? next : current, maximumAttempts: maximumDoubleAttempts });
      setVisit("");
      return;
    }
    const liveOpponent = remoteProfiles.find((person) => person.display_name === officialMatchOpponent);
    const liveMatch = remoteMatches.find((match) => session && liveOpponent && [match.player_one_id, match.player_two_id].includes(session.user.id) && [match.player_one_id, match.player_two_id].includes(liveOpponent.id) && ["scheduled", "live"].includes(match.status));
    if (supabase && liveMatch && next !== 0) void supabase.rpc("record_visit", { target_match: liveMatch.id, visit_score: value, darts: 3, double_attempt_count: recordedDoubleAttempts || 0 }).then(({ error }) => { if (error) setRemoteError(error.message); });
    setScoreHistory((old) => [...old, { score: { ...score }, thrower, visits: [...visitHistory] }]);
    const visitId = Date.now();
    if (next === 1 || next < 0) {
      setVisitHistory((old) => [{ id: visitId, player: thrower === "playerOne" ? signedInPlayerName : officialMatchOpponent, scored: value, remaining: current, darts: 3, leg: currentLegNumber, note: "Bust", doubleAttempts: recordedDoubleAttempts ?? 0 }, ...old].slice(0, 30));
      setThrower(thrower === "playerOne" ? "playerTwo" : "playerOne");
      setVisit("");
      return;
    }
    if (next === 0) {
      setPendingCheckout({ value, player: thrower });
      setVisit("");
      return;
    } else {
      setVisitHistory((old) => [{ id: visitId, player: thrower === "playerOne" ? signedInPlayerName : officialMatchOpponent, scored: value, remaining: next, darts: 3, leg: currentLegNumber, note: value === 0 ? "Miss" : value === 180 ? "180" : "Visit", doubleAttempts: recordedDoubleAttempts ?? 0 }, ...old].slice(0, 30));
      setScore((old) => ({ ...old, [thrower]: next }));
      setThrower(thrower === "playerOne" ? "playerTwo" : "playerOne");
    }
    setVisit("");
  }

  function confirmCheckout(darts: 1 | 2 | 3) {
    if (!pendingCheckout) return;
    const player = pendingCheckout.player;
    const nextLegNumber = score.playerOneLegs + score.playerTwoLegs + 2;
    const winningLegs = score[`${player}Legs` as "playerOneLegs" | "playerTwoLegs"] + 1;
    const liveOpponent = remoteProfiles.find((person) => person.display_name === officialMatchOpponent);
    const liveMatch = remoteMatches.find((match) => session && liveOpponent && [match.player_one_id, match.player_two_id].includes(session.user.id) && [match.player_one_id, match.player_two_id].includes(liveOpponent.id) && ["scheduled", "live"].includes(match.status));
    if (supabase && liveMatch) void supabase.rpc("record_visit", { target_match: liveMatch.id, visit_score: pendingCheckout.value, darts, double_attempt_count: 1 }).then(({ error }) => { if (error) setRemoteError(error.message); });
    setVisitHistory((old) => [{ id: Date.now(), player: player === "playerOne" ? signedInPlayerName : officialMatchOpponent, scored: pendingCheckout.value, remaining: 0, darts, leg: currentLegNumber, note: `Checkout · dart ${darts}`, doubleAttempts: 1 }, ...old].slice(0, 30));
    setScore((old) => ({ ...old, playerOne: 501, playerTwo: 501, [`${player}Legs`]: old[`${player}Legs` as "playerOneLegs" | "playerTwoLegs"] + 1 }));
    if (winningLegs < 4) setThrower(nextLegNumber % 2 === 1 ? "playerOne" : "playerTwo");
    if (winningLegs >= 4) setMatchSummaryOpen(true);
    setPendingCheckout(null);
  }

  function undoLastVisit(reason = "Immediate scoring correction") {
    const previous = scoreHistory.at(-1);
    if (!previous) return;
    const before = `${score.playerOne}-${score.playerTwo} · legs ${score.playerOneLegs}-${score.playerTwoLegs}`;
    setScore(previous.score);
    setThrower(previous.thrower);
    setVisitHistory(previous.visits);
    setScoreHistory((old) => old.slice(0, -1));
    setResultSubmitted(false);
    setResultApprovals({ player: false, opponent: false, official: false });
    addAudit("Match score corrected", `${signedInPlayerName} vs ${officialMatchOpponent}`, before, `${previous.score.playerOne}-${previous.score.playerTwo} · legs ${previous.score.playerOneLegs}-${previous.score.playerTwoLegs}`, reason);
  }

  function openChallenge(opponent = "", mode: "standard" | "power-play" = "standard") {
    setChallengeMode(mode);
    setSelectedOpponent(opponent);
    setChallengeSent(false);
    setChallengeOpen(true);
  }

  function signOutPlayer() {
    if (supabase) void supabase.auth.signOut();
    setPlayerSignedIn(false);
    setLocationSetupOpen(false);
    setLoginView("login");
    setLoginMessage("");
  }

  function enterPlayerSession(isNewPlayer = false) {
    const locationStillActive = locationAccessEnabled && (locationAccessUntil === null || locationAccessUntil > Date.now());
    setAccountKind("player");
    setCurrentAdminTier(null);
    setPendingAdminInvite(null);
    setPendingAdminRevoke(null);
    setNewPlayerDashboard(isNewPlayer);
    setNewPlayerSignupOpen(false);
    setView("dashboard");
    setLoginMessage("");
    setPlayerSignedIn(true);
    setLocationSetupOpen(!locationStillActive);
  }

  function locationDurationMilliseconds(duration: LocationAccessDuration) {
    return ({ "30m": 30 * 60_000, "2h": 2 * 3_600_000, "4h": 4 * 3_600_000, "8h": 8 * 3_600_000, "until-off": 0 })[duration];
  }

  function requestLocationAccess(duration: LocationAccessDuration, nextAction?: () => void) {
    setLocationPermissionMessage("Requesting permission from your device…");
    if (!navigator.geolocation) {
      setLocationPermissionMessage("Location is not supported on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(() => {
      const durationMs = locationDurationMilliseconds(duration);
      setLocationAccessEnabled(true);
      const accessUntil = durationMs ? Date.now() + durationMs : null;
      setLocationAccessUntil(accessUntil);
      setLocationClock(Date.now());
      window.localStorage.setItem("dcuk-location-access", JSON.stringify({ enabled: true, until: accessUntil }));
      setLocationSetupOpen(false);
      setLocationReenableOpen(false);
      setLocationPermissionMessage(duration === "until-off" ? "Location use is on until you turn it off." : "Location use is on for the selected time.");
      nextAction?.();
    }, (error) => {
      setLocationPermissionMessage(error.code === error.PERMISSION_DENIED ? "Permission was declined. You can allow location in your browser or phone settings and try again." : "Your location could not be confirmed. Check your device settings and try again.");
    }, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 });
  }

  function turnOffLocation() {
    setLocationAccessEnabled(false);
    setLocationAccessUntil(null);
    window.localStorage.removeItem("dcuk-location-access");
    setPendingGpsAction(null);
    setLocationPermissionMessage("Location use is off in this app.");
  }

  function openGoingOut() {
    if (!locationAccessEnabled || (locationAccessUntil !== null && locationAccessUntil <= Date.now())) {
      setLocationReenableOpen(true);
      setLocationPermissionMessage("");
      return;
    }
    setGoingOutOpen(true);
  }

  function gpsAttendance(attendanceId: string, mode: "in" | "out") {
    if (!locationAccessEnabled || (locationAccessUntil !== null && locationAccessUntil <= Date.now())) {
      setPendingGpsAction({ attendanceId, mode });
      setLocationReenableOpen(true);
      setLocationPermissionMessage("Turn location back on to use GPS check-in or check-out.");
      return;
    }
    const attendance = venueAttendances.find((entry) => entry.id === attendanceId);
    const venue = attendance ? organiserVenues.find((item) => item.id === attendance.venueId) : null;
    if (!attendance || !venue) return;
    if (!navigator.geolocation) {
      setGpsMessage("GPS location is not supported on this device.");
      return;
    }
    if (venue.latitude == null || venue.longitude == null) {
      setGpsMessage("This venue needs GPS coordinates added by the organiser before location check-in can be used.");
      return;
    }
    setGpsMessage("Checking your location…");
    navigator.geolocation.getCurrentPosition((position) => {
      const toRadians = (value: number) => value * Math.PI / 180;
      const earthRadius = 6_371_000;
      const latitudeDifference = toRadians(venue.latitude! - position.coords.latitude);
      const longitudeDifference = toRadians(venue.longitude! - position.coords.longitude);
      const a = Math.sin(latitudeDifference / 2) ** 2 + Math.cos(toRadians(position.coords.latitude)) * Math.cos(toRadians(venue.latitude!)) * Math.sin(longitudeDifference / 2) ** 2;
      const distance = Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
      if (mode === "in" && distance > 300) {
        setGpsMessage(`Check-in not completed: your device is approximately ${distance}m from ${venue.name}. You must be within 300m.`);
        return;
      }
      setVenueAttendances((old) => old.map((entry) => entry.id === attendanceId ? { ...entry, status: mode === "in" ? "Checked in" : "Checked out" } : entry));
      setGpsMessage(`${mode === "in" ? "Checked in" : "Checked out"} with GPS confirmation · approximately ${distance}m from the venue point.`);
    }, (error) => {
      setGpsMessage(error.code === error.PERMISSION_DENIED ? "Location permission was declined. Allow location access to use GPS check-in." : "Your location could not be confirmed. Please try again with GPS enabled.");
    }, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 });
  }

  function openAdminCase(queue: AdminQueue, caseId: string) {
    setAdminQueue(queue);
    setSelectedAdminCaseId(caseId);
    setTimeout(() => document.getElementById("admin-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  if (!supabaseConfigured) return <main className="login-shell"><section className="login-form-panel"><div className="player-login-card"><p>Deployment setup</p><h2>Supabase connection required</h2><span className="login-intro">Keep the existing Netlify environment variables and redeploy this GitHub build.</span></div></section></main>;
  if (!authReady) return <main className="login-shell"><section className="login-form-panel"><div className="player-login-card"><p>Secure player access</p><h2>Loading your league…</h2></div></section></main>;
  if (!playerSignedIn) {
    return (
      <main className="login-shell">
        <section className="login-brand-panel">
          <div className="login-brand-lockup"><span>DartsCoachUK</span><em>Official Ladder League</em></div>
          <div className="login-league-copy">
            <p>Clean installation · No active season</p>
            <h1>Your league.<br />Your challenge.</h1>
            <span>Players can create their accounts now. The organiser will publish the first season when it is ready.</span>
          </div>
          <div className="login-live-card"><Badge tone="cream">Pre-season</Badge><strong>No season created</strong><span>Player account creation is open</span></div>
        </section>
        <section className="login-form-panel">
          <div className="login-mobile-brand"><b>DartsCoachUK</b><span>Official Ladder League</span></div>
          {loginView === "login" && (
            <form className="player-login-card" onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const identity = String(data.get("identity")).trim().toLowerCase();
              const password = String(data.get("password")).trim();
              if (!identity || !password) {
                setLoginMessage("Enter your registered email, member ID or username and password.");
                return;
              }
              if (!supabase) return;
              setLoginMessage("Signing in…");
              const { error } = await supabase.auth.signInWithPassword({ email: identity, password });
              setLoginMessage(error ? error.message : "");
            }}>
              <p>Player portal</p><h2>Welcome back</h2><span className="login-intro">Sign in with the details registered to your league account.</span>
              <label>Email address<input name="identity" type="email" autoComplete="email" placeholder="player@example.com" /></label>
              <label>Password<div className="password-field"><input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" /><button type="button" onClick={() => setShowPassword((old) => !old)}>{showPassword ? "Hide" : "Show"}</button></div></label>
              <div className="login-options"><label><input type="checkbox" checked={rememberPlayer} onChange={(e) => setRememberPlayer(e.target.checked)} />Remember my member ID</label><button type="button" onClick={() => { setLoginView("forgot"); setLoginMessage(""); }}>Forgot password?</button></div>
              {loginMessage && <div className="login-message">{loginMessage}</div>}
              <button className="login-submit" type="submit">Sign in to the league <span>››</span></button>
              <div className="new-player-entry"><span>New to the DartsCoachUK ladder?</span><button type="button" onClick={() => { setNewPlayerSignupOpen(true); setLoginMessage(""); }}>Register as a new player</button></div>
              <div className="prototype-access"><small>Pre-season player access</small><span>Create an account now, then register when the organiser publishes a season.</span></div>
              <button className="login-help-link" type="button" onClick={() => { setLoginView("help"); setLoginMessage(""); }}>Having trouble accessing your account?</button>
            </form>
          )}
          {newPlayerSignupOpen && !newPlayerApplication && <div className="signup-sheet-backdrop" role="presentation">
            <aside className="signup-sheet" role="dialog" aria-modal="true" aria-labelledby="new-player-signup-title">
            <form className="player-login-card new-player-registration-card" onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const firstName = String(data.get("firstName") || "").trim();
              const lastName = String(data.get("lastName") || "").trim();
              const name = `${firstName} ${lastName}`.trim();
              const username = String(data.get("username") || "").trim().toLowerCase();
              const password = String(data.get("newPassword") || "");
              const confirmPassword = String(data.get("confirmPassword") || "");
              const usernameError = usernameValidation(username, password);
              if (usernameError) { setSignupError(usernameError); return; }
              if (password.length < 10) { setSignupError("Use a password containing at least 10 characters."); return; }
              if (password !== confirmPassword) { setSignupError("The two passwords do not match."); return; }
              const application: NewPlayerApplication = {
                name,
                username,
                email: String(data.get("email") || "").trim(),
                mobile: String(data.get("mobile") || "").trim(),
                dateOfBirth: String(data.get("dateOfBirth") || ""),
                postcode: String(data.get("postcode") || "").trim().toUpperCase(),
                preferredArea: String(data.get("preferredArea") || "").trim(),
                experience: String(data.get("experience") || ""),
                average: String(data.get("average") || "").trim(),
                handedness: String(data.get("handedness") || ""),
                accessibility: String(data.get("accessibility") || "").trim(),
                emergencyName: String(data.get("emergencyName") || "").trim(),
                emergencyPhone: String(data.get("emergencyPhone") || "").trim(),
              };
              if (!supabase) return;
              setSignupError("Creating your secure account…");
              const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
              const { data: signupData, error } = await supabase.auth.signUp({ email: application.email, password, options: { emailRedirectTo: siteUrl, data: { username: application.username, display_name: application.name, mobile: application.mobile } } });
              if (error) { setSignupError(error.message); return; }
              setSignupError("");
              setNewPlayerApplication(application);
              setPlayers((old) => [...old, { rank: old.length + 1, name, played: 0, won: 0, lost: 0, movement: 0 }]);
              setPlayerStatuses((old) => ({ ...old, [name]: "Active" }));
              setPlayerDivisions((old) => ({ ...old, [name]: "Unassigned" }));
              setPlayerAllowances((old) => ({ ...old, [name]: { refusalsUsed: 0, weeklyChallengeAdjustment: 0, refusalsReceivedThisWeek: 0 } }));
              setPlayerUsername(username);
              setRegistrationPayments((old) => ({ ...old, [name]: { toppedUp: false, adminPaid: false } }));
              setPlayerBalances((old) => ({ ...old, [name]: 0 }));
              setRemovedSeasonPlayers((old) => old.filter((playerName) => playerName !== name));
              setAutoPlacements({});
              if (signupData.session) await loadLiveLeague();
            }}>
              <button className="login-back" type="button" onClick={() => setNewPlayerSignupOpen(false)}>← Close signup sheet</button>
              <p>New league player</p><h2 id="new-player-signup-title">Create your account</h2><span className="login-intro">Complete this signup sheet to create free access to the player dashboard. No season is currently available for registration.</span>
              <fieldset className="new-player-form-section"><legend>Player details</legend><div className="new-player-form-grid"><label>First name<input name="firstName" autoComplete="given-name" required /></label><label>Last name<input name="lastName" autoComplete="family-name" required /></label><label>Date of birth<input name="dateOfBirth" type="date" required /></label><label>Mobile number<input name="mobile" type="tel" autoComplete="tel" required /></label><label className="form-wide">Email address<input name="email" type="email" autoComplete="email" required /></label><label>Home postcode<input name="postcode" autoComplete="postal-code" required /></label><label>Preferred playing area<input name="preferredArea" placeholder="e.g. Tamworth or Stafford" required /></label></div></fieldset>
              <fieldset className="new-player-form-section"><legend>Login details</legend><div className="new-player-form-grid"><label className="form-wide">Unique username<input name="username" autoComplete="username" minLength={4} maxLength={24} pattern="[A-Za-z0-9._-]+" placeholder="Choose a unique public username" required /><small>Checked against every account and the offensive-language filter.</small></label><label>Password<input name="newPassword" type="password" autoComplete="new-password" minLength={10} required /></label><label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></label></div><div className="settings-info-note">Your username must not appear anywhere within your password.</div>{signupError && <div className="login-message">{signupError}</div>}</fieldset>
              <fieldset className="new-player-form-section"><legend>Darts profile</legend><div className="new-player-form-grid"><label>Playing experience<select name="experience" required defaultValue=""><option value="" disabled>Select experience</option><option>New to competitive darts</option><option>Pub or local league</option><option>Super League or county</option><option>Tour or open-event experience</option></select></label><label>Estimated three-dart average<input name="average" type="number" min="1" max="130" step="0.1" placeholder="Optional" /></label><label>Throwing hand<select name="handedness" required defaultValue=""><option value="" disabled>Select</option><option>Right-handed</option><option>Left-handed</option><option>Prefer not to say</option></select></label><label>Accessibility or medical information<textarea name="accessibility" placeholder="Optional information relevant to safe match arrangements" /></label></div></fieldset>
              <fieldset className="new-player-form-section"><legend>Emergency contact</legend><div className="new-player-form-grid"><label>Contact name<input name="emergencyName" required /></label><label>Contact number<input name="emergencyPhone" type="tel" required /></label></div></fieldset>
              <div className="new-player-declarations"><label><input type="checkbox" required /> I confirm the information supplied is accurate.</label><label><input type="checkbox" required /> I agree to follow the Official Ladder League rules and organiser decisions.</label><label><input type="checkbox" required /> I consent to match results and league statistics being displayed to league members.</label></div>
              <div className="prototype-access"><small>No payment required</small><span>Creating a player account is free. Once inside the dashboard, the player can top up their account and choose whether to register for the upcoming season.</span></div>
              <button className="login-submit" type="submit">Create player account</button>
            </form>
            </aside>
          </div>}
          {newPlayerSignupOpen && newPlayerApplication && <div className="signup-sheet-backdrop" role="presentation">
            <aside className="signup-sheet signup-sheet-confirmation" role="dialog" aria-modal="true" aria-labelledby="new-player-success-title">
            <section className="player-login-card new-player-success-card">
              <button className="login-back" type="button" onClick={() => setNewPlayerSignupOpen(false)}>← Close signup sheet</button>
              <p>Player account created</p><h2 id="new-player-success-title">Welcome, {newPlayerApplication.name}</h2><span className="login-intro">{session ? "Your player account is ready. You can enter the dashboard without paying or joining a season." : "Check your email to confirm your account, then return here and sign in."}</span>
              <div className="new-player-success-mark">✓</div>
              <dl><div><dt>Username</dt><dd>@{newPlayerApplication.username}</dd></div><div><dt>Account status</dt><dd>Active</dd></div><div><dt>Season status</dt><dd>Not registered</dd></div><div><dt>Account balance</dt><dd>£0.00</dd></div></dl>
              <div className="login-message login-success">From the dashboard you can add funds in £1, £5 or £10 increments, then register for the season when you are ready.</div>
              <button className="login-submit" type="button" onClick={() => session ? enterPlayerSession(true) : (setNewPlayerSignupOpen(false), setNewPlayerApplication(null), setLoginView("login"))}>{session ? "Continue to dashboard" : "Return to sign in"}</button>
            </section>
            </aside>
          </div>}
          {loginView === "forgot" && (
            <form className="player-login-card" onSubmit={async (e) => {
              e.preventDefault();
              const identity = String(new FormData(e.currentTarget).get("identity")).trim();
              if (!identity || !supabase) { setLoginMessage("Enter your registered email address."); return; }
              const { error } = await supabase.auth.resetPasswordForEmail(identity, { redirectTo: process.env.NEXT_PUBLIC_SITE_URL || window.location.origin });
              setLoginMessage(error ? error.message : "If that account is registered, password reset instructions have been sent.");
            }}>
              <button className="login-back" type="button" onClick={() => { setLoginView("login"); setLoginMessage(""); }}>← Back to sign in</button><p>Account recovery</p><h2>Reset your password</h2><span className="login-intro">We’ll send recovery instructions to the contact details held on your player account.</span>
              <label>Email address or member ID<input name="identity" autoComplete="username" placeholder="Email address or member ID" /></label>
              {loginMessage && <div className="login-message login-success">{loginMessage}</div>}
              <button className="login-submit" type="submit">Send reset instructions</button>
            </form>
          )}
          {loginView === "help" && (
            <section className="player-login-card">
              <button className="login-back" type="button" onClick={() => setLoginView("login")}>← Back to sign in</button><p>Account support</p><h2>Can’t access your account?</h2><span className="login-intro">For security, league organisers can confirm your member ID, unlock a secured account or start a password reset. They cannot view your password.</span>
              <div className="login-support-options"><article><b>Account locked</b><span>Wait 15 minutes after repeated attempts, then try again.</span></article><article><b>Changed email or phone?</b><span>Ask an organiser to verify and update your player record.</span></article><article><b>New player?</b><span>Your organiser will issue access after registration and payment checks are complete.</span></article></div>
              <button className="login-submit" type="button" onClick={() => setLoginMessage("Support request prepared for the league organiser.")}>Contact league organiser</button>
              {loginMessage && <div className="login-message login-success">{loginMessage}</div>}
            </section>
          )}
          <footer className="login-footer"><span>Secure player access</span><i /> <span>DartsCoachUK Official Ladder League</span></footer>
        </section>
      </main>
    );
  }

  return (
    <main className={`app-shell theme-${playerTheme} accent-${playerAccent} ${compactLayout ? "compact-layout" : ""} ${reducedMotion ? "reduced-motion" : ""}`}>
      <header className="topbar">
        <button className="brand" onClick={() => setView("dashboard")}>
          <span>DartsCoachUK</span> <em>Official Ladder League</em>
        </button>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {[
            ["dashboard", "◉", "Dashboard"],
            ["notifications", "●", `Notifications${unreadNotifications.length ? ` (${unreadNotifications.length})` : ""}`],
            ["ladder", "▥", "Ladder"],
            ["challenges", "⚔", "Challenges"],
            ["matches", "□", "Matches"],
            ["venues", "⌂", "Venues"],
            ["scorer", "●", "Live"],
            ["admin", "◆", "Organiser"],
            ["settings", "⚙", "Settings"],
          ].filter(([id]) => accountKind === "organiser" ? id === "admin" : id !== "admin" || hasAdminAccess).map(([id, icon, label]) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id as View)}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>
        <button className={`profile-chip ${view === "settings" ? "active" : ""}`} onClick={() => { if (accountKind === "organiser") return; setView("settings"); setLocationPermissionMessage(""); }} aria-label={accountKind === "organiser" ? "Organiser-only account" : "Open player settings"}><span>{currentPortalInitials}</span><b>{accountKind === "organiser" ? "Admin" : currentPortalPlayerName.split(" ")[0]}</b></button>
      </header>

      <aside className="side-panel">
        <div className="avatar">{currentPortalInitials}</div>
        <h2>{currentPortalPlayerName}</h2>
        <p>{accountKind === "organiser" ? "Admin-only account" : "Player profile"}</p>
        <div className="rail-rule" />
        <small>{accountKind === "organiser" ? "Permission tier" : leagueLive ? "Live league" : "League setup"}</small>
        <strong>{accountKind === "organiser" ? "Full access" : leagueLive ? (playerDivisions[signedInPlayerName] || "Awaiting placement") : "No division assigned"}</strong>
        {accountKind === "player" && <><div className="rail-metric"><span>Position</span><b>{leagueLive ? (ladderOverrides[signedInPlayerName] || "—") : "—"}</b></div>
        <div className="rail-metric"><span>Season record</span><b>{leagueLive ? `${myRemoteMembership?.won || 0}W / ${myRemoteMembership?.lost || 0}L` : "0W / 0L"}</b></div>
        <div className="rail-metric"><span>Season average</span><b>{leagueLive ? "68.4" : "—"}</b></div>
        <div className="qualification">
          <span>Payout qualification</span>
          <div><i style={{ width: leagueLive ? "14%" : "0%" }} /></div>
          <b>{leagueLive ? "2 matches completed · Week 3" : "League not launched"}</b>
        </div></>}
        <button className="side-panel-logout" onClick={signOutPlayer}>{accountKind === "organiser" ? "Sign out organiser" : "Log out"}</button>
      </aside>

      <section className="content">
        {remoteError && <div className="login-message"><span>{remoteError}</span><button type="button" onClick={() => setRemoteError("")}>Dismiss</button></div>}
        {accountKind === "player" && view === "dashboard" && (
          <section className="dashboard-notification-banner" aria-label="Latest notifications">
            <div className="notification-banner-head">
              <span><i>●</i><b>{unreadNotifications.length} unread notification{unreadNotifications.length === 1 ? "" : "s"}</b></span>
              <button onClick={() => setView("notifications")}>Open notification centre</button>
            </div>
            <div className="notification-banner-list">
              {(unreadNotifications.length ? unreadNotifications : playerNotifications).slice(0, 3).map((notification) => (
                <article key={notification.id} className={`priority-${notification.priority}`}>
                  <span className="notification-category">{notification.category}</span>
                  <div><b>{notification.title}</b><small>{notification.message}</small></div>
                  <time>{notification.time}</time>
                  {!notification.read && <button aria-label={`Mark ${notification.title} as read`} onClick={() => setPlayerNotifications((old) => old.map((item) => item.id === notification.id ? { ...item, read: true } : item))}>✓</button>}
                </article>
              ))}
            </div>
          </section>
        )}
        {accountKind === "player" && view === "dashboard" && (
          <section className="going-out-card dashboard-going-out panel">
            <div><p>Venue availability</p><h3>I’m going out</h3><span>Register a venue visit or manage your live status.</span></div>
            <div className="going-out-summary">{venueAttendances.filter((entry) => entry.person === "Anonymous Player 06" && entry.status !== "Checked out").length ? <><Badge>{venueAttendances.filter((entry) => entry.person === "Anonymous Player 06" && entry.status !== "Checked out").length} active plan</Badge><small>Check in, check out or update your role from the venue list.</small></> : <><Badge tone="cream">No active plan</Badge><small>Add a venue visit for this week.</small></>}<em className={locationAccessEnabled ? "location-on" : "location-off"}>{locationStatusText}</em></div>
            <button onClick={openGoingOut}>I’m going out</button>
          </section>
        )}
        <div className="section-heading">
          <div>
            <p>{leagueStopped ? "Season stopped" : leaguePaused ? "League temporarily paused" : leagueLive ? `${seasonSettings.name} · Week 3` : "League setup · No active season"}</p>
            <h1>{title}</h1>
          </div>
          <div className="heading-status-stack"><div className={`dashboard-location-status ${locationAccessEnabled ? "active" : "inactive"}`}><i>⌖</i><span>{locationDashboardText}</span></div><Badge tone={leagueStopped ? "red" : leagueLive && !leaguePaused ? "green" : "cream"}>{leagueStopped ? "League stopped" : leaguePaused ? "League paused" : leagueLive ? "League live" : "League not live"}</Badge></div>
        </div>

        {view === "dashboard" && (
          <div className="dashboard-grid">
            {Boolean(seasonSettings.name) && (!leagueLive || !seasonRegistered) && <section className={`season-registration-card panel ${seasonRegistered ? "registration-complete" : ""}`}>
              <div className="registration-main-row">
                <div className="registration-season-mark"><span>{seasonRegistered ? "✓" : new Date(seasonSettings.start || Date.now()).getFullYear().toString().slice(-2)}</span><small>Upcoming<br />season</small></div>
                <div className="registration-status-copy"><div className="registration-received-line"><div><p>{seasonRegistered ? "Registration received" : "Upcoming season"}</p><h3>{seasonRegistered ? `You’re registered, ${currentPortalPlayerName.split(" ")[0]}` : "Registration is now open"}</h3></div>{seasonRegistered && <span className="registered-proposed-position"><small>Proposed start</small><b>{ordinal(portalProposedStartingPosition)}</b><em>Division 1</em></span>}</div><span>{seasonRegistered ? "Your entry is awaiting final division confirmation from the organisers." : "Top up when ready, then confirm your details and pay the £10 league fee while retaining at least £10 for challenges."}</span></div>
                <div className="registration-date"><small>Season starts</small><b>{seasonSettings.start ? new Date(`${seasonSettings.start}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "To be announced"}</b><span>{seasonRegistered ? "Final ladder confirmed after registration closes" : `Register when ready · proposed ${ordinal(portalProposedStartingPosition)}`}</span></div>
                <div className="registration-header-actions"><button disabled={currentSeasonEntryClosed} title={currentSeasonEntryClosed ? "Self-suspension closed your entry for this season. You may register again next season." : ""} onClick={() => { setSeasonRegistrationStep(seasonRegistered ? 3 : 1); setSeasonRegistrationOpen(true); }}>{currentSeasonEntryClosed ? "Available next season" : seasonRegistered ? "View registration" : "Register for season"}</button>{seasonRegistered && <button className="small-table-button" onClick={() => setLastSeasonTableOpen(true)}>Last season’s table · re-registrations</button>}</div>
              </div>
              {currentSeasonEntryClosed && <div className="season-entry-closed"><b>Current-season entry closed</b><span>Your account may be reactivated at any time, but league registration will remain unavailable until the next season.</span></div>}
              {!seasonRegistered && <div className="registration-placement-inline">
                <div className="live-placement-position"><small>Live proposed starting position</small><b>{ordinal(portalProposedStartingPosition)}</b><span>Division 1</span></div>
                <div className="live-placement-detail"><div className="inline-placement-head"><div><h4>Registration-based placement</h4><p>{seasonRegistered ? "Updates whenever another returning player registers." : "Current preview if you registered now."}</p></div><Badge tone={seasonRegistered ? "green" : "cream"}>{seasonRegistered ? "Registered" : "Preview"}</Badge></div><div className="registered-ahead">{higherFinishersRegistered ? higherFinishRegistrationOrder.slice(0, higherFinishersRegistered).map((player) => <span key={player.name}><b>#{player.lastPosition}</b>{player.name}<small>Registered ahead</small></span>) : <span className="no-one-ahead">No higher-finishing returning players have registered yet.</span>}</div></div>
                <div className="placement-live-actions"><small>{higherFinishersRegistered + (seasonRegistered ? 1 : 0)} returning player{higherFinishersRegistered + (seasonRegistered ? 1 : 0) === 1 ? "" : "s"} registered</small><button disabled>Positions update from live registrations</button><button className="query-table-button" onClick={() => setLastSeasonTableOpen(true)}>View last season table</button></div>
              </div>}
            </section>}

            <section className="hero panel">
              <div>
                <p>{leagueLive ? `Week ${remoteLeague?.week_number || 1} is live, ${currentPortalPlayerName.split(" ")[0]}` : seasonRegistered ? `Registration complete, ${currentPortalPlayerName.split(" ")[0]}` : remoteLeague ? `Register for ${remoteLeague.season_name}, ${currentPortalPlayerName.split(" ")[0]}` : `Welcome, ${currentPortalPlayerName.split(" ")[0]} — no season is currently open`}</p>
                <div className="hero-rank"><span>Division <b>{leagueLive ? (playerDivisions[signedInPlayerName]?.replace(/\D/g, "") || "—") : "—"}</b></span><i /><span>Position <b>{leagueLive ? (ladderOverrides[signedInPlayerName] || "—") : "—"}</b></span></div>
              </div>
              <button className="primary-cta" disabled={!leagueLive || leaguePaused || leagueStopped} title={!leagueLive ? "Start the league first" : leaguePaused ? "The league is paused" : ""} onClick={() => openChallenge()}>Challenge player <span>››</span></button>
            </section>

            <section className={`power-play-card ${powerPlayUsed ? "used" : "available"}`} aria-label={`Power Play ${powerPlayUsed ? "used" : "available"}`}>
              <div className="power-play-emblem"><span>⚡</span>{powerPlayUsed && <i aria-hidden="true">×</i>}</div>
              <div className="power-play-copy"><p>Season privilege</p><h3>Power Play</h3><strong>{powerPlayUsed ? "Used this season" : "One prestigious challenge available"}</strong><small>{powerPlayUsed ? "Your Power Play renews when the next season begins." : "Challenge any active player at any position in your own division. This is extra to your weekly allowance."}</small></div>
              <button disabled={powerPlayUsed || !leagueLive || leaguePaused || leagueStopped || Boolean(powerPlayOpponent)} onClick={() => openChallenge("", "power-play")}>{powerPlayUsed ? "Power Play used" : leagueLive ? "Use Power Play" : "Available when league starts"}</button>
            </section>

            <div className="kpi-row">
              <article className="kpi"><span>▣</span><div><small>Balance</small><b>£{(playerBalances[currentPortalPlayerName] ?? 0).toFixed(2)}</b><em>{newPlayerDashboard ? "Top up before season registration" : "Two match fees paid"}</em></div></article>
              <article className="kpi"><span>◇</span><div><small>Refusals remaining</small><b>{leagueLive ? Math.max(0, seasonSettings.refusals - playerOneAllowance.refusalsUsed) : "—"}</b><em>{leagueLive ? `${playerOneAllowance.refusalsUsed} used this season` : "Starts when league launches"}</em></div></article>
              <article className="kpi"><span>▦</span><div><small>Season progress</small><b>{leagueLive ? `Week ${remoteLeague?.week_number || 1}` : "—"}</b><em>{leagueLive ? `${Math.max(0, totalSeasonWeeks - (remoteLeague?.week_number || 1))} weeks remaining · Ends ${seasonSettings.end}` : "Not configured"}</em></div></article>
              <article className="kpi"><span>⚔</span><div><small>Challenges available</small><b>{leagueLive ? playerOneChallengesThisWeek : "—"}</b><em>{leagueLive ? (playerOneNextWeekBonus ? `This week · +${playerOneNextWeekBonus} scheduled next week` : "This week") : "League not live"}</em></div></article>
            </div>

            <section className="ladder-card panel">
              <div className="panel-title"><h3>League ladder</h3><button disabled={!leagueLive && !hasAdminAccess} onClick={() => leagueLive ? setView("ladder") : (setView("admin"), setAdminSection("league"))}>{leagueLive ? "View all" : hasAdminAccess ? "Set up" : "Await organiser"}</button></div>
              <div className="table-head"><span>#</span><span>Player</span><span>P</span><span>W</span><span>L</span></div>
              {leagueLive || leagueStopped ? liveLadderPlayers.slice(0, 7).map((player) => {
                return <button className={`table-row ${player.name === signedInPlayerName ? "me" : ""}`} key={player.name} onClick={() => setView("ladder")}><b>{player.rank}</b><span>{player.name}</span><i>{player.played}</i><i>{player.won}</i><i>{player.lost}</i></button>;
              }) : <div className="empty-state"><b>＋</b><span>No live ladder</span><small>Create a division, assign players and launch the league.</small></div>}
            </section>

            <section className="match-card panel">
              <div className="panel-title"><h3>Upcoming match</h3><Badge tone={activeScheduled.length ? "green" : "cream"}>{activeScheduled.length ? "Confirmed" : leagueLive ? "None arranged" : "No league"}</Badge></div>
              {activeScheduled.length ? <><div className="versus"><div>{activeScheduled[0].home}<strong>Home</strong></div><b>VS</b><div>{activeScheduled[0].away}<strong>Away</strong></div></div><ul><li>{activeScheduled[0].time}</li><li>{activeScheduled[0].venue}</li><li>Official awaiting confirmation</li></ul></> : <div className="empty-state"><b>◎</b><span>No match arranged</span><small>{leagueLive ? "The calendar will update after players issue and accept the first challenges." : "Challenges can be prepared now and played once the season begins."}</small></div>}
              <button className="outline-button" onClick={() => setView("matches")}>View match calendar</button>
            </section>

            <section className="stats-board panel">
              <div className="panel-title"><h3>Performance board</h3><span className="key">{leagueLive ? "After two completed matches · You / Division best" : "Begins after league launch"}</span></div>
              <div className="stat-grid">
                {activeStatComparisons.map((stat) => (
                  <article className="comparison" key={stat.label}>
                    <h4>{stat.label}</h4>
                    <div><span><small>You</small><b>{stat.personal}</b></span><i /><span><small>Division best</small><b>{stat.division}</b></span></div>
                    <p>{stat.leader}</p>
                  </article>
                ))}
              </div>
            </section>

          </div>
        )}

        {view === "notifications" && accountKind === "player" && (
          <div className="notification-centre">
            <section className="notification-summary panel">
              <div><small>Player inbox</small><b>{unreadNotifications.length}</b><span>Unread notification{unreadNotifications.length === 1 ? "" : "s"}</span></div>
              <div><small>History</small><b>{playerNotifications.length}</b><span>Total notifications retained</span></div>
              <div><small>Current delivery</small><b>{selectedNotificationChannels().length}</b><span>{selectedNotificationChannels().join(" · ")}</span></div>
              <button disabled={!unreadNotifications.length} onClick={() => setPlayerNotifications((old) => old.map((item) => ({ ...item, read: true })))}>Mark all as read</button>
            </section>
            <section className="notification-history panel">
              <div className="notification-history-head">
                <div><p>Complete notification history</p><h3>All league messages</h3><span>Every in-app notice remains here even after it has been read.</span></div>
                <button onClick={() => { setView("settings"); setPlayerSettingsTab("notifications"); }}>Contact preferences</button>
              </div>
              <nav className="notification-filters" aria-label="Notification filters">
                {([["all", "All"], ["unread", "Unread"], ["challenge", "Challenges"], ["match", "Matches"], ["deadline", "Deadlines"], ["result", "Results"], ["venue", "Venues"], ["league", "League"]] as const).map(([id, label]) => <button key={id} className={notificationFilter === id ? "active" : ""} onClick={() => setNotificationFilter(id)}>{label}</button>)}
              </nav>
              <div className="notification-history-list">
                {visibleNotifications.length ? visibleNotifications.map((notification) => (
                  <article key={notification.id} className={`${notification.read ? "read" : "unread"} priority-${notification.priority}`}>
                    <span className="notification-status-dot" />
                    <div className="notification-history-copy">
                      <span className="notification-category">{notification.category}</span>
                      <h4>{notification.title}</h4>
                      <p>{notification.message}</p>
                      <div className="notification-delivery">{notification.channels.map((channel) => <em key={channel}>{channel}</em>)}</div>
                    </div>
                    <time>{notification.time}</time>
                    <div className="notification-history-actions">
                      <button onClick={() => setPlayerNotifications((old) => old.map((item) => item.id === notification.id ? { ...item, read: !item.read } : item))}>{notification.read ? "Mark unread" : "Mark read"}</button>
                      <button className="remove-notification" onClick={() => setPlayerNotifications((old) => old.filter((item) => item.id !== notification.id))}>Remove</button>
                    </div>
                  </article>
                )) : <div className="empty-state"><b>✓</b><span>No notifications in this view</span><small>Choose another filter to see more history.</small></div>}
              </div>
            </section>
          </div>
        )}

        {view === "ladder" && (
          <section className="panel full-view">
            <div className="panel-title"><h3>Official current standings</h3><span>{leagueLive ? "Published live ladder · Division 1" : "No league has been launched"}</span></div>
            <div className="full-table">
              <div className="full-table-head"><span>Position</span><span>Player</span><span>Played</span><span>Won</span><span>Lost</span><span>Movement</span></div>
              {leagueLive || leagueStopped ? liveLadderPlayers.map((player) => {
                return <div key={player.name} className={player.name === signedInPlayerName ? "highlight" : ""}><b>#{player.rank}</b><strong>{player.name}</strong><span>{player.played}</span><span>{player.won}</span><span>{player.lost}</span><em>{player.movement > 0 ? `▲ ${player.movement}` : player.movement < 0 ? `▼ ${Math.abs(player.movement)}` : "—"}</em></div>;
              }) : <div className="empty-state"><b>＋</b><span>No division or ladder is live</span><small>The organiser must configure and launch the first league.</small></div>}
            </div>
          </section>
        )}

        {view === "challenges" && (
          <div className="challenge-columns">
            <section className="panel action-panel challenge-section">
              <div className="challenge-section-head"><p>Outgoing</p><Badge tone={liveOutgoingName ? "cream" : "green"}>{liveOutgoingName ? "Active" : "None active"}</Badge></div>
              <h2>Your challenges</h2>
              {liveOutgoingName ? (
                <div className="challenge-summary">
                  <strong>You challenged {liveOutgoingName}</strong>
                  <dl><div><dt>Status</dt><dd>{liveOutgoingChallenge?.status || "Awaiting response"}</dd></div><div><dt>Respond by</dt><dd>{liveOutgoingChallenge?.response_due_at ? new Date(liveOutgoingChallenge.response_due_at).toLocaleString("en-GB") : "3 days after issue"}</dd></div><div><dt>Fee</dt><dd>£2 when played</dd></div></dl>
                  <div className="rule-note">This is now your one active outgoing challenge. It will appear here until accepted, refused, cancelled or completed.</div>
                  <button className="cancel-request" onClick={() => setCancelOutgoingOpen(true)}>Cancel outgoing request</button>
                </div>
              ) : <div className="empty-state"><b>↗</b><span>No outgoing challenge</span><small>Select an eligible opponent to issue one.</small></div>}
              {powerPlayOpponent && <div className="challenge-summary power-play-outgoing"><Badge tone="cream">Power Play</Badge><strong>You challenged {powerPlayOpponent}</strong><dl><div><dt>Status</dt><dd>Awaiting reply</dd></div><div><dt>Allowance</dt><dd>Extra season challenge</dd></div></dl><div className="rule-note">This Power Play has been used and does not reduce your normal weekly challenge allowance.</div></div>}
            </section>

            <section className="panel action-panel challenge-section">
              <div className="challenge-section-head"><p>Incoming</p><Badge tone={liveIncomingChallenge?.status === "pending" ? "red" : "cream"}>{!liveIncomingChallenge ? "None" : liveIncomingChallenge.status === "pending" ? "Reply required" : liveIncomingChallenge.status}</Badge></div>
              <h2>Incoming challenges</h2>
              {!liveIncomingChallenge ? <div className="empty-state"><b>↙</b><span>No incoming challenge</span><small>New challenges will appear here after the first league begins.</small></div> : <div className="challenge-summary"><strong>{liveIncomingName} challenged you</strong><dl><div><dt>Issued</dt><dd>{new Date(liveIncomingChallenge.created_at).toLocaleString("en-GB")}</dd></div><div><dt>Reply by</dt><dd>{new Date(liveIncomingChallenge.response_due_at).toLocaleString("en-GB")}</dd></div><div><dt>Type</dt><dd>{liveIncomingChallenge.is_power_play ? "Power Play" : "Normal challenge"}</dd></div></dl>
                {liveIncomingChallenge.status === "pending" && <div className="incoming-buttons"><button type="button" onClick={async () => { try { await respondToLiveChallenge(liveIncomingChallenge.id, "accept"); setIncomingStatus("accepted"); } catch (error) { setRemoteError(error instanceof Error ? error.message : "Challenge response failed."); } }}>Accept</button><button type="button" onClick={() => setIncomingAction("alternative")}>Offer alternative</button><button type="button" className="caution" onClick={() => setIncomingAction("refuse")}>Refuse</button></div>}
                {incomingStatus === "accepted" && <><div className="rule-note">Challenge accepted. Agree the date, time and authorised venue next, then confirm a referee or witness before scoring can open.</div><button type="button" className="schedule-match-button" onClick={() => setSchedulingOpen(true)}>{matchArrangement ? "Review match arrangement" : "Arrange this match"}</button><button type="button" className="cancel-request" onClick={() => { setIncomingStatus("pending"); setMatchArrangement(null); setGuestOfficial(null); setGuestAccessCode(""); setGuestApprovals({ player: false, opponent: false }); setLeagueOfficialAccepted(false); setScoringAccount(""); setScoringAccountApprovals({ player: false, opponent: false }); }}>Undo acceptance</button></>}
                {incomingStatus === "alternative" && <><div className="rule-note">Your alternative arrangement has been sent to Anonymous Player 07.</div><button type="button" className="cancel-request" onClick={() => setIncomingStatus("pending")}>Withdraw alternative</button></>}
                {incomingStatus === "refusal-review" && <><div className="rule-note">Your refusal is awaiting an organiser decision. You can withdraw it if circumstances have changed.</div><button type="button" className="cancel-request" onClick={() => setWithdrawRefusalOpen(true)}>Cancel refusal</button></>}
              </div>}
            </section>

            <section className="panel action-panel challenge-section">
              <div className="challenge-section-head"><p>Eligible</p><Badge tone={leagueLive && !leaguePaused ? "green" : "cream"}>{leagueLive && !leaguePaused ? `${dynamicEligibleOpponents.length} players` : "Unavailable"}</Badge></div>
              <h2>Challenge up the ladder</h2>
              {leagueLive && !leaguePaused ? dynamicEligibleOpponents.map((opponent) => <div className="opponent" key={opponent.name}><span><b>#{opponent.rank}</b><strong>{opponent.name}</strong><small>{opponent.gap}</small></span><button disabled={Boolean(outgoingOpponent)} onClick={() => openChallenge(opponent.name)}>Challenge</button></div>) : <div className="empty-state"><b>⚔</b><span>No eligible opponents</span><small>Challenge eligibility begins after players are assigned to a live division.</small></div>}
              <div className="rule-note">{leagueLive ? `You have ${playerOneChallengesThisWeek} challenges available this week and £8.00 available.${refusalRangeBonus ? " A refused challenge has temporarily expanded your eligible range by one ladder position." : ""}${playerOneNextWeekBonus ? ` Two refusals this week have awarded ${playerOneNextWeekBonus} extra challenge${playerOneNextWeekBonus > 1 ? "s" : ""} for next week.` : ""}` : "No weekly allowance or refusal entitlement is active until the league is launched."}</div>
            </section>
          </div>
        )}

        {view === "matches" && (
          <div className="matches-shell">
            {matchArrangement && <section className="panel match-arrangement-centre">
              <header><div><p>Accepted challenge workflow</p><h2>Anonymous Player 06 vs {matchArrangement.opponent}</h2><span>{matchArrangement.date} · {matchArrangement.time} · {matchArrangement.venue}</span></div><Badge tone={guestOfficialApproved ? "green" : matchArrangement.opponentConfirmed ? "cream" : "red"}>{guestOfficialApproved ? "Ready to score" : matchArrangement.opponentConfirmed ? "Official required" : "Player confirmation"}</Badge></header>
              <div className="match-workflow-progress">
                <span className="done"><b>1</b><em>Challenge accepted</em></span>
                <span className={matchArrangement.opponentConfirmed ? "done" : "current"}><b>2</b><em>Date & venue</em></span>
                <span className={guestOfficialApproved ? "done" : matchArrangement.opponentConfirmed ? "current" : ""}><b>3</b><em>Official approved</em></span>
                <span className={guestOfficialApproved ? "current" : ""}><b>4</b><em>Scoring access</em></span>
              </div>
              <div className="arrangement-grid">
                <article><small>Match arrangement</small><b>{matchArrangement.date} at {matchArrangement.time}</b><span>{matchArrangement.venue}</span><em>{matchArrangement.alternative || "Both players may suggest alternatives before final confirmation."}</em><button onClick={() => setSchedulingOpen(true)}>Edit arrangement</button></article>
                <article><small>Player confirmations</small><div className="confirmation-people"><span><b>Anonymous Player 06</b><Badge>Confirmed</Badge></span><span><b>{matchArrangement.opponent}</b><Badge tone={matchArrangement.opponentConfirmed ? "green" : "cream"}>{matchArrangement.opponentConfirmed ? "Confirmed" : "Awaiting"}</Badge></span></div>{!matchArrangement.opponentConfirmed && <button onClick={() => { setMatchArrangement((old) => old ? { ...old, opponentConfirmed: true } : old); setGuestFlowMessage(`${matchArrangement.opponent} confirmed the proposed date, time and venue.`); }}>Prototype: opponent confirms</button>}</article>
                <article><small>Referee or witness</small>{guestOfficial ? <><b>{guestOfficial.name}</b><span>{guestOfficial.role} · {officialSource === "league" ? "registered league player" : "one-time guest"}</span><div className="official-approval-row"><Badge tone={guestApprovals.player ? "green" : "cream"}>Anonymous Player 06 {guestApprovals.player ? "accepted" : "to review"}</Badge><Badge tone={guestApprovals.opponent ? "green" : "cream"}>{matchArrangement.opponent.split(" ")[0]} {guestApprovals.opponent ? "accepted" : "to review"}</Badge>{officialSource === "league" && <Badge tone={leagueOfficialAccepted ? "green" : "cream"}>{guestOfficial.name.split(" ")[0]} {leagueOfficialAccepted ? "accepted" : "notified"}</Badge>}</div></> : <><b>No official confirmed</b><span>Nominate a registered league player or generate one-time guest access.</span></>}<button disabled={!matchArrangement.opponentConfirmed} onClick={() => { setGuestInviteOpen(true); setGuestFlowMessage(""); setOfficialSource("guest"); }}>{guestOfficial ? "Replace official" : "Appoint referee or witness"}</button></article>
              </div>
              {guestOfficial && !officialAppointmentApproved && <div className="guest-approval-notice"><div><p>Official nomination notification</p><b>{guestOfficial.name} has been nominated as {guestOfficial.role.toLowerCase()}</b><span>{officialSource === "league" ? "Notifications sent to both players and the nominated league player." : "Guest details submitted · both players must accept before access opens."}</span></div><div><button disabled={guestApprovals.player} onClick={() => setGuestApprovals((old) => ({ ...old, player: true }))}>{guestApprovals.player ? "Anonymous Player 06 accepted" : "Anonymous Player 06: accept"}</button><button disabled={guestApprovals.opponent} onClick={() => setGuestApprovals((old) => ({ ...old, opponent: true }))}>{guestApprovals.opponent ? `${matchArrangement.opponent.split(" ")[0]} accepted` : `${matchArrangement.opponent.split(" ")[0]}: accept`}</button>{officialSource === "league" && <button disabled={leagueOfficialAccepted} onClick={() => setLeagueOfficialAccepted(true)}>{leagueOfficialAccepted ? `${guestOfficial.name.split(" ")[0]} accepted` : `${guestOfficial.name.split(" ")[0]}: accept role`}</button>}<button className="reject-official" onClick={() => { setGuestOfficial(null); setGuestApprovals({ player: false, opponent: false }); setLeagueOfficialAccepted(false); setGuestAccessCode(""); setScoringAccount(""); setScoringAccountApprovals({ player: false, opponent: false }); setGuestFlowMessage("Official nomination rejected. Choose a replacement."); }}>Reject</button></div></div>}
              {officialAppointmentApproved && guestOfficial?.role === "Witness only" && !scoringAuthorityApproved && <div className="scoring-account-agreement"><div><p>Witness-only scoring decision</p><b>Both players must agree which player account will score</b><span>The selected player can enter scores. The other player and {guestOfficial.name} will have read-only access.</span></div><label>Scoring account<select value={scoringAccount} onChange={(e) => { setScoringAccount(e.target.value); setScoringAccountApprovals({ player: false, opponent: false }); }}><option value="">Choose a player</option><option>Anonymous Player 06</option><option>{matchArrangement.opponent}</option></select></label>{scoringAccount && <div className="scoring-agreement-actions"><button disabled={scoringAccountApprovals.player} onClick={() => setScoringAccountApprovals((old) => ({ ...old, player: true }))}>{scoringAccountApprovals.player ? "Anonymous Player 06 agreed" : "Anonymous Player 06: agree"}</button><button disabled={scoringAccountApprovals.opponent} onClick={() => setScoringAccountApprovals((old) => ({ ...old, opponent: true }))}>{scoringAccountApprovals.opponent ? `${matchArrangement.opponent.split(" ")[0]} agreed` : `${matchArrangement.opponent.split(" ")[0]}: agree`}</button></div>}</div>}
              {guestOfficialApproved && <div className="scoring-unlocked"><div><b>✓ Match access configured</b><span>{guestOfficial?.role === "Referee" ? `${guestOfficial.name} is the referee and sole scorer. Both players have read-only scoreboards.` : `${scoringAccount} controls scoring. The other player and ${guestOfficial?.name} have read-only scoreboards.`} Complete match-day check-in before scoring opens.</span></div><button onClick={() => setMatchLobbyOpen(true)}>Open match lobby</button></div>}
              {guestFlowMessage && <div className="workflow-message">{guestFlowMessage}</div>}
            </section>}
            <section className="panel full-view">
              <div className="panel-title"><h3>League match calendar</h3><Badge tone={leagueLive ? "green" : "cream"}>{leagueLive ? `${activeScheduled.length} scheduled` : matchArrangement ? "1 being arranged" : "No active league"}</Badge></div>
              <div className="schedule-list">
                {matchArrangement && <article className="workflow-calendar-row"><time>{matchArrangement.date}<small>{matchArrangement.time}</small></time><div><strong>Anonymous Player 06</strong><b>VS</b><strong>{matchArrangement.opponent}</strong></div><p>{matchArrangement.venue}</p><Badge tone={guestOfficialApproved ? "green" : "cream"}>{guestOfficialApproved ? "Confirmed" : "Arranging"}</Badge><button onClick={() => setSchedulingOpen(true)}>Manage</button></article>}
                {activeScheduled.map((m) => <article key={m.id}><time>{m.time}</time><div><strong>{m.home}</strong><b>VS</b><strong>{m.away}</strong></div><p>{m.venue}</p><Badge tone={m.isLive ? "red" : m.status === "Confirmed" ? "green" : "cream"}>{m.status}</Badge><button disabled={(leaguePaused || leagueStopped) && !m.isLive} onClick={() => { if (m.isLive) { setLiveMatchStarted(true); setView("scorer"); } else { setReminderMatch(m); setReminderSet(false); } }}>{m.isLive ? (leaguePaused || leagueStopped ? "Finish live" : "Watch live") : "Watch"}</button></article>)}
                {!activeScheduled.length && !matchArrangement && <div className="empty-state"><b>◷</b><span>No matches have been arranged</span><small>The calendar will populate when players begin accepting challenges.</small></div>}
              </div>
            </section>
          </div>
        )}

        {view === "venues" && (
          <section className="venue-directory">
            <header className="panel venue-hero"><div><p>Match locations</p><h2>Authorised venues</h2><span>Only organiser-approved venues can be selected for official ladder matches.</span></div><button className="primary-cta" onClick={() => { setVenueRecommendationSent(false); setVenueRecommendationOpen(true); }}>Recommend a venue</button></header>
            <div className="venue-rule-note"><b>Approval standard</b><span>Every venue must have a correctly installed dartboard, regulation oche, suitable lighting and a safe playing area.</span></div>
            <div className="venue-card-grid">
              {organiserVenues.map((venue) => {
                const attending = venueAttendances.filter((entry) => entry.venueId === venue.id);
                return <article className="panel venue-card clickable-venue-card" key={venue.id} role="button" tabIndex={0} onClick={() => setSelectedVenueDetails(venue)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedVenueDetails(venue); }}><div className="panel-title"><h3>{venue.name}</h3><Badge>Approved</Badge></div><strong>{venue.area}</strong><span>{venue.boards} match boards</span><small>{venue.availability}</small><p>{venue.facilities}</p><div className="venue-attendance-count"><b>{attending.length}</b><span>{attending.length === 1 ? "person" : "people"} registered as attending</span></div><button onClick={(e) => { e.stopPropagation(); setSelectedVenueDetails(venue); }}>View venue and attendees</button></article>;
              })}
              {venueRecommendations.filter((venue) => venue.submittedBy === "Anonymous Player 06").map((venue) => <article className="panel venue-card recommended-card" key={venue.id}><div className="panel-title"><h3>{venue.name}</h3><Badge tone={venue.status === "Approved" ? "green" : venue.status === "Rejected" ? "red" : "cream"}>{venue.status}</Badge></div><strong>Your recommendation</strong><span>{venue.postcode} · {venue.boards} boards</span><small>{venue.availability}</small><p>{venue.status === "Changes requested" ? "The organiser has requested updated information." : "Track the organiser’s decision here."}</p></article>)}
            </div>
          </section>
        )}

        {view === "scorer" && (
          <section className="scoreboard panel">
            <div className="live-heading">
              <Badge tone={matchComplete ? "green" : matchPaused ? "cream" : scoringAvailable ? "red" : "cream"}>{matchComplete ? "Match complete" : matchPaused ? "Match paused" : unfinishedLiveMatchMayContinue ? "Finishing live match" : scoringAvailable ? "Live scoring" : "Scorer locked"}</Badge>
              <span>{unfinishedLiveMatchMayContinue ? "League closed to new activity · live match may finish" : liveMatchStarted ? "Official league match" : leagueLive ? "Ready for the first accepted challenge" : "Start the league to activate scoring"}{(liveMatchStarted || matchComplete) ? ` · ${matchComplete ? `Final: ${score.playerOneLegs}–${score.playerTwoLegs}` : `Leg ${score.playerOneLegs + score.playerTwoLegs + 1}`}` : ""}</span>
            </div>
            {guestOfficialApproved && <><div className="match-role-preview"><span><small>Prototype participant view</small><b>Check every match-day permission</b></span><div>{(["player", "official", "spectator"] as MatchViewRole[]).map((role) => <button className={matchViewRole === role ? "active" : ""} key={role} onClick={() => setMatchViewRole(role)}>{role === "player" ? "Anonymous Player 06" : role === "official" ? guestOfficial?.role ?? "Official" : "Spectator"}</button>)}</div></div><div className="score-access-banner"><span><small>{matchViewRole === "spectator" ? "Public live view" : "Scoring authority"}</small><b>{matchViewRole === "spectator" ? "No private player information shown" : scoringAuthorityLabel}</b></span><Badge tone={currentPlayerCanScore ? "green" : "cream"}>{currentPlayerCanScore ? "You can score" : "Your view is read only"}</Badge></div></>}
            {(liveMatchStarted || matchComplete) && <div className="score-players">
              <article className={thrower === "playerOne" ? "throwing" : ""}><small>Challenger</small><h2>Anonymous Player 06</h2><button className="open-score-stats" onClick={() => setStatsPlayer("playerOne")}>Full stats</button><div className="score-card-main"><div className="big-score">{score.playerOne}</div><div className="score-box-visits">{playerOneCurrentLegVisits.slice(0, 6).map((item) => <span className={visitScoreClass(item.scored, item.note)} key={item.id}>{item.note === "Bust" ? "×" : item.note === "Miss" || item.scored === 0 ? "o" : item.scored}</span>)}</div></div><footer><span className="legs-won"><b>{score.playerOneLegs}</b><small>Legs</small></span><span className="overall-average"><b>{playerOneAverage}</b><small>Overall avg</small></span><span className="leg-metrics"><small>Leg darts</small><b>{playerOneCurrentLegDarts}</b><small>Leg avg</small><b>{playerOneCurrentLegAverage}</b></span></footer></article>
              <div className="race"><span>Best of 7</span><b>{score.playerOneLegs} — {score.playerTwoLegs}</b><small>First to 4</small></div>
              <article className={thrower === "playerTwo" ? "throwing" : ""}><small>Defender</small><h2>{officialMatchOpponent}</h2><button className="open-score-stats" onClick={() => setStatsPlayer("playerTwo")}>Full stats</button><div className="score-card-main"><div className="big-score">{score.playerTwo}</div><div className="score-box-visits">{opponentCurrentLegVisits.slice(0, 6).map((item) => <span className={visitScoreClass(item.scored, item.note)} key={item.id}>{item.note === "Bust" ? "×" : item.note === "Miss" || item.scored === 0 ? "o" : item.scored}</span>)}</div></div><footer><span className="legs-won"><b>{score.playerTwoLegs}</b><small>Legs</small></span><span className="overall-average"><b>{opponentAverage}</b><small>Overall avg</small></span><span className="leg-metrics"><small>Leg darts</small><b>{opponentCurrentLegDarts}</b><small>Leg avg</small><b>{opponentCurrentLegAverage}</b></span></footer></article>
              {statsPlayer && (() => { const stats = statsPlayer === "playerOne" ? playerOneMatchStats : opponentMatchStats; const name = statsPlayer === "playerOne" ? "Anonymous Player 06" : officialMatchOpponent; return <div className="score-stats-popover"><button className="close" onClick={() => setStatsPlayer(null)}>×</button><p>Live match statistics</p><h2>{name}</h2><div className="score-stats-grid"><span><small>Total darts</small><b>{stats.totalDarts}</b></span><span><small>Match average</small><b>{stats.average}</b></span><span><small>First 9 average</small><b>{stats.firstNine}</b></span><span><small>Highest checkout</small><b>{stats.highestCheckout}</b></span><span><small>180s</small><b>{stats.maximums}</b></span><span><small>140+</small><b>{stats.scores140}</b></span><span><small>100+</small><b>{stats.scores100}</b></span><span><small>Legs won</small><b>{stats.legsWon}</b></span><span><small>Darts at double</small><b>{stats.attempts}</b></span><span><small>Checkouts</small><b>{stats.checkouts}</b></span><span><small>Checkout rate</small><b>{stats.checkoutPercent}</b></span><span><small>Best leg</small><b>{stats.bestLeg}</b></span></div></div>; })()}
            </div>}
            {!scoringAvailable && !matchComplete ? <div className="empty-state"><b>●</b><span>{leaguePaused ? "No live match is in progress" : leagueStopped ? "This season has ended" : leagueLive ? "No match is live yet" : "Live scoring is not active"}</span><small>{leaguePaused ? "New matches cannot begin until the organiser resumes the league." : leagueStopped ? "The final scoreboard and confirmed season records remain available in the results areas." : leagueLive ? "When a challenge is accepted and its match begins, the official scorer and spectator scoreboard will open here." : "Start the league from the organiser area to activate official match scoring and spectator viewing."}</small></div> : !matchComplete ? (
              readOnlyMatchView ? <div className="read-only-scoreboard"><b>{matchViewRole === "spectator" ? "Live spectator scoreboard" : "Read-only live scoreboard"}</b><span>{matchViewRole === "spectator" ? `Watching live from ${matchArrangement?.venue ?? "the authorised venue"}. Current thrower, recent visits, averages, 180s and highest checkout update here without exposing private details.` : guestOfficial?.role === "Referee" ? `${guestOfficial.name} is entering all scores as the appointed referee.` : `${scoringAccount} is the agreed scoring account.`} {matchViewRole !== "spectator" && "You can follow every visit but cannot alter the score from this account."}</span></div> : <><div className="dartconnect-input"><div className="quick-scores"><small>Quick score · submits immediately</small>{[26, 41, 45, 60, 81, 85, 100, 121, 140, 180].map((value) => <button key={value} disabled={matchPaused} onClick={() => submitScore(value)}>{value}</button>)}{checkoutDartOptions.length > 0 && <div className="finish-buttons"><span>{score[thrower]} finish</span>{checkoutDartOptions.map((darts) => <button key={darts} onClick={() => { setScoreHistory((old) => [...old, { score: { ...score }, thrower, visits: [...visitHistory] }]); setPendingCheckout({ value: score[thrower], player: thrower, darts }); }}>Dart {darts}</button>)}</div>}</div><div className="number-pad"><div className="score-display"><span>{thrower === "playerOne" ? "Anonymous Player 06" : officialMatchOpponent}</span><b>{visit || "0"}</b><small>visit score</small></div>{[1,2,3,4,5,6,7,8,9].map((number) => <button key={number} disabled={matchPaused || visit.length >= 3} onClick={() => setVisit((old) => `${old}${number}`)}>{number}</button>)}<button className="key-clear" disabled={matchPaused} onClick={() => { setVisit(""); submitScore(0); }}>Miss</button><button disabled={matchPaused || visit.length >= 3} onClick={() => setVisit((old) => `${old}0`)}>0</button><button className="key-delete" disabled={matchPaused || !visit} onClick={() => setVisit((old) => old.slice(0, -1))}>⌫</button><button className="key-enter" disabled={matchPaused || !visit || Number(visit) > 180} onClick={enterScore}>Enter {visit || "score"}</button></div></div><div className="score-control-bar"><button disabled={!scoreHistory.length} onClick={() => undoLastVisit()}>Undo</button><button disabled={!scoreHistory.length} onClick={() => setScoreCorrectionOpen(true)}>Correct</button><button onClick={() => setMatchPaused((old) => !old)}>{matchPaused ? "Resume" : "Pause"}</button><button className="dispute-control" onClick={() => { setMatchPaused(true); setMatchDisputeOpen(true); }}>Dispute</button></div><div className="match-score-history"><header><span><small>Match record</small><b>Scores and legs</b></span><Badge tone="cream">{matchLegHistory.length} leg{matchLegHistory.length === 1 ? "" : "s"} tracked</Badge></header>{matchLegHistory.length ? matchLegHistory.map((leg) => <article key={leg.leg}><b>Leg {leg.leg}</b><span><small>Anonymous Player 06</small>{leg.playerOne.length ? <span className="history-visit-chips"><VisitChips visits={leg.playerOne} /></span> : "—"}</span><span><small>{officialMatchOpponent.split(" ")[0]}</small>{leg.opponent.length ? <span className="history-visit-chips"><VisitChips visits={leg.opponent} /></span> : "—"}</span><strong>{leg.winner}</strong></article>) : <p>Score history will appear after the first visit.</p>}</div></>
            ) : (
              <div className="match-complete">
                <p>Official match result</p>
                <h2>{matchWinner} wins {score.playerOneLegs}–{score.playerTwoLegs}</h2>
                <span>Scoring is locked. Both players and the appointed {guestOfficial?.role.toLowerCase()} must approve the result before the ladder and statistics update.</span>
                {!resultSubmitted ? (
                  <button onClick={() => setResultSubmitted(true)}>Send result for approval</button>
                ) : !resultConfirmed && !resultDisputed ? (
                  <><div className="result-approval-grid"><button disabled={resultApprovals.player} onClick={() => setResultApprovals((old) => ({ ...old, player: true }))}>{resultApprovals.player ? `${signedInPlayerName} approved` : `${signedInPlayerName}: approve`}</button><button disabled={resultApprovals.opponent} onClick={() => setResultApprovals((old) => ({ ...old, opponent: true }))}>{resultApprovals.opponent ? `${officialMatchOpponent.split(" ")[0]} approved` : `${officialMatchOpponent.split(" ")[0]}: approve`}</button><button disabled={resultApprovals.official} onClick={() => setResultApprovals((old) => ({ ...old, official: true }))}>{resultApprovals.official ? `${guestOfficial?.name.split(" ")[0]} approved` : `${guestOfficial?.name.split(" ")[0]}: approve`}</button></div><button disabled={!resultApprovals.player || !resultApprovals.opponent || !resultApprovals.official} onClick={async () => { if (supabase && activeRemoteMatch) { const { error } = await supabase.rpc("confirm_match_result", { target_match: activeRemoteMatch.id }); if (error) { setRemoteError(error.message); return; } } setResultConfirmed(true); setLiveMatchStarted(false); addAudit("Live result confirmed", `${matchWinner} vs ${matchWinner === signedInPlayerName ? officialMatchOpponent : signedInPlayerName}`, "Awaiting approvals", `${score.playerOneLegs}–${score.playerTwoLegs} · ladder, balances and statistics updated`, `${guestOfficial?.name} and both players approved · match access expired`); }}>Confirm result & update league</button><button className="result-dispute-button" onClick={() => setResultDisputed(true)}>Disagree with result</button></>
                ) : resultDisputed ? (
                  <div className="result-escalated"><b>Result sent to organiser</b><span>The score and ladder are frozen. The organiser queue now contains this dispute with the match audit trail.</span></div>
                ) : <Badge>Ladder updated</Badge>}
                <button className="view-final-history" onClick={() => setMatchHistoryOpen(true)}>View match history</button>
                <button className="view-final-stats" onClick={() => setMatchSummaryOpen(true)}>View full match statistics</button>
                <button className="reset-test" onClick={() => { setScore({ playerOne: 501, playerTwo: 501, playerOneLegs: 0, playerTwoLegs: 0 }); setThrower("playerOne"); setResultSubmitted(false); setResultConfirmed(false); setResultDisputed(false); setResultApprovals({ player: false, opponent: false, official: false }); setVisitHistory([]); setScoreHistory([]); setLiveMatchStarted(leagueLive); setVisit(""); setPendingCheckout(null); setPendingDoubleAttempt(null); setMatchHistoryOpen(false); setMatchSummaryOpen(false); }}>Reset test match</button>
              </div>
            )}
          </section>
        )}

        {view === "admin" && hasAdminAccess && (
          <div className="admin-shell">
            <nav className="admin-section-nav" aria-label="Organiser sections">
              <button className={adminSection === "operations" ? "active" : ""} onClick={() => { setAdminSection("operations"); setSelectedAdminPlayerName(""); }}>Operations</button>
              {currentAdminTier !== "operations" && <button className={adminSection === "players" ? "active" : ""} onClick={() => setAdminSection("players")}>Player management</button>}
              {currentAdminTier !== "operations" && <button className={adminSection === "venues" ? "active" : ""} onClick={() => { setAdminSection("venues"); setSelectedAdminPlayerName(""); }}>Venues <small>{venueRecommendations.filter((venue) => venue.status === "Pending approval").length}</small></button>}
              {currentAdminTier === "full" && <button className={adminSection === "league" ? "active" : ""} onClick={() => { setAdminSection("league"); setSelectedAdminPlayerName(""); }}>League & divisions</button>}
              <button className={adminSection === "audit" ? "active" : ""} onClick={() => { setAdminSection("audit"); setSelectedAdminPlayerName(""); }}>Audit history <small>{auditLog.length}</small></button>
              {currentAdminTier === "full" && <button className={adminSection === "permissions" ? "active" : ""} onClick={() => { setAdminSection("permissions"); setSelectedAdminPlayerName(""); }}>Admin permissions</button>}
            </nav>

            {adminSection === "operations" ? (
              <div className="admin-grid">
                {[
                  ["decisions", "Awaiting decisions", "1 refusal review · 1 dispute · 1 venue"],
                  ["results", "Results to confirm", "Witness or organiser confirmation required"],
                  ["deadlines", "Deadline warnings", "Responses and match deadlines approaching"],
                  ["inactive", "Inactive players", "Approaching four weeks without activity"],
                ].map(([key, label, note]) => {
                  const queue = key as AdminQueue;
                  const resolved = resolvedByQueue(queue);
                  return <article className={`panel admin-kpi ${adminQueue === key ? "selected" : ""}`} key={label}><small>{label}</small><b>{outstandingByQueue(queue)}</b><p>{resolved ? `${resolved} resolved · ${note}` : note}</p><button onClick={() => setAdminQueue(queue)}>Review queue</button></article>;
                })}
                <section className="panel admin-queue"><div className="panel-title"><div><h3>Priority organiser queue</h3><p>Five longest-waiting unresolved issues</p></div><Badge tone={activePriorityCases.length ? "red" : "green"}>{activePriorityCases.length ? `${activePriorityCases.length} shown` : "All clear"}</Badge></div>
                  {activePriorityCases.length ? activePriorityCases.map((priority) => {
                    const item = activeAdminCases[priority.queue].find((adminCase) => adminCase.id === priority.caseId)!;
                    return <div key={item.id}><b>{item.category}</b><span>{item.subject} · {item.detail}</span><time dateTime={`PT${priority.waitHours}H`}><small>Waiting</small>{formatWait(priority.waitHours)}</time><button onClick={() => setPriorityCase({ queue: priority.queue, caseId: priority.caseId })}>Review</button></div>;
                  }) : <div className="priority-clear"><b>✓</b><span>No priority organiser issues are awaiting action.</span></div>}
                </section>
                <section className="panel admin-workspace" id="admin-workspace">
                  <div className="panel-title"><div><p>Active workspace</p><h3>{adminQueue === "decisions" ? "Decisions and approvals" : adminQueue === "results" ? "Result confirmations" : adminQueue === "deadlines" ? "Deadline management" : "Inactive player management"}</h3></div><Badge tone="cream">{visibleOutstandingByQueue(adminQueue)} active</Badge></div>
                  <div className="admin-case-list">
                    {activeAdminCases[adminQueue].map((item) => (
                      <article key={item.id} className={`${adminOutcomes[item.id] ? "resolved" : ""} ${selectedAdminCaseId === item.id ? "selected-case" : ""}`}>
                        <div><small>{item.category}</small><strong>{item.subject}</strong><span>{item.detail}</span>{adminNotifications[item.id] && <em>Resolved by notification · Sent via {adminNotifications[item.id]}</em>}</div>
                        {adminOutcomes[item.id] ? (
                          <div className="admin-outcome"><Badge>Recorded</Badge><b>{adminOutcomes[item.id]}</b><button onClick={() => setAdminOutcomes((old) => { const next = { ...old }; delete next[item.id]; return next; })}>Reopen</button></div>
                        ) : (
                          <div className="admin-actions">{item.notification && <button className="notify-players" onClick={() => setNotificationCase({ caseId: item.id, subject: item.subject, recipients: item.notification!.recipients, textAvailable: item.notification!.textAvailable })}>Notify players</button>}{item.options.map((option) => <button key={option} className={/Reject|Remove|invalid|Dismiss|Cancel/.test(option) ? "caution" : ""} onClick={() => setPendingAdminAction({ caseId: item.id, subject: item.subject, action: option })}>{option}</button>)}</div>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            ) : adminSection === "venues" ? (
              <section className="venue-management">
                <header className="panel league-header"><div><p>Venue governance</p><h2>Authorised venues</h2><span>Review player recommendations and maintain the approved match-location directory.</span></div><div className="venue-header-actions"><Badge tone="cream">{venueRecommendations.filter((venue) => venue.status === "Pending approval").length} awaiting approval</Badge><button onClick={() => setOrganiserVenueOpen(true)}>Add venue</button></div></header>
                <div className="venue-admin-grid">
                  <section className="panel venue-register"><div className="panel-title"><h3>Approved venue register</h3><Badge>{organiserVenues.length + venueRecommendations.filter((venue) => venue.status === "Approved").length} active</Badge></div>{[...organiserVenues, ...venueRecommendations.filter((venue) => venue.status === "Approved")].map((venue) => <article key={venue.id}><div><strong>{venue.name}</strong><span>{"area" in venue ? venue.area : venue.postcode} · {venue.boards} boards</span></div><Badge>Approved</Badge><button onClick={() => setSelectedVenueDetails(venue)}>View details</button></article>)}</section>
                  <section className="panel venue-approvals"><div className="panel-title"><h3>Player recommendations</h3><Badge tone={venueRecommendations.some((venue) => venue.status === "Pending approval") ? "red" : "green"}>{venueRecommendations.filter((venue) => venue.status === "Pending approval").length} pending</Badge></div>
                    {venueRecommendations.map((venue) => <article key={venue.id} className={venue.status !== "Pending approval" ? "venue-resolved" : ""}><div className="venue-approval-head"><div><small>Submitted by {venue.submittedBy}</small><strong>{venue.name}</strong><span>{venue.address} · {venue.postcode}</span></div><Badge tone={venue.status === "Approved" ? "green" : venue.status === "Rejected" ? "red" : "cream"}>{venue.status}</Badge></div><div className="venue-facts"><span><b>Contact</b>{venue.contactName}<br />{venue.contactPhone}<br />{venue.contactEmail}</span><span><b>Capacity</b>{venue.boards} boards<br />{venue.availability}</span><span><b>Facilities</b>{venue.facilities}</span></div>{venue.notes && <p>{venue.notes}</p>}{venue.status === "Pending approval" && <div className="venue-decision-actions"><button onClick={() => setVenueDecision({ id: venue.id, action: "Approved" })}>Approve venue</button><button onClick={() => setVenueDecision({ id: venue.id, action: "Changes requested" })}>Request changes</button><button className="caution" onClick={() => setVenueDecision({ id: venue.id, action: "Rejected" })}>Reject</button></div>}</article>)}
                  </section>
                </div>
              </section>
            ) : adminSection === "league" ? (
              <section className="league-management">
                <header className="panel league-header"><div><p>League structure</p><h2>{seasonSettings.name || "No season created"}</h2><span>{leagueStructureLocked ? "The published structure is locked while the league is live." : leaguePaused ? "The league is paused. Organisers may now make audited structural changes." : leagueStopped ? "The league is stopped. Final structural records may be adjusted." : "Complete the setup manually or use Start League to create a fully live prototype season."}</span></div><div className="league-launch"><Badge tone={leagueStopped ? "red" : leagueLive && !leaguePaused ? "green" : "cream"}>{leagueStopped ? "League stopped" : leaguePaused ? "League paused" : leagueLive ? "League live · locked" : seasonSettings.name ? "Draft season" : "No season"}</Badge><button className="rename-league-button" disabled={leagueStructureLocked} onClick={() => setRenameLeagueItem({ type: "league", currentName: seasonSettings.name })}>Rename league</button>{leagueStructureLocked && <button className="extend-league-button" onClick={() => setLeagueExtensionOpen(true)}>Extend by 1 week</button>}{leagueLive && !leagueStopped && <button className="pause-league-button" onClick={() => { if (leaguePaused) { setLeaguePaused(false); addAudit("League resumed", seasonSettings.name, "Paused", "Live", "Organiser resumed league activity"); setLeagueNotice(`${seasonSettings.name} has resumed. League and division alterations are locked again.`); } else { setLeagueControlAction("pause"); } }}>{leaguePaused ? "Resume league" : "Pause league"}</button>}{(leagueLive || leaguePaused) && !leagueStopped && <button className="stop-league-button" onClick={() => setLeagueControlAction("stop")}>Stop league</button>}<button className="start-league-button" disabled={leagueLive || leagueStopped || !seasonSettings.name || !seasonSettings.start || !divisions.length || !players.length} title={leagueStopped ? "This season has been stopped" : "Publishes the current setup and activates every league area"} onClick={startLeagueNow}>Start league</button></div></header>
                {leagueNotice && <div className="league-notice"><b>✓ Updated</b><span>{leagueNotice}</span><button onClick={() => setLeagueNotice("")}>×</button></div>}
                {leagueStructureLocked && <div className="league-lock-notice"><b>🔒 League structure locked</b><span>Season settings, divisions, placements, payments and registration changes are read-only while the league is live. Pause or stop the league to make alterations. A one-week extension remains available for extenuating circumstances.</span></div>}
                <div className="league-kpis"><article className="panel"><small>Live divisions</small><b>{leagueLive ? divisions.length : 0}</b><span>{divisions.length} draft division(s)</span></article><article className="panel"><small>Current prize fund</small><b>£0</b><span>No projection until launch</span></article><article className="panel"><small>Weekly allowance</small><b>{seasonSettings.weeklyChallenges}</b><span>Draft rule</span></article><article className="panel"><small>Refusal limit</small><b>{seasonSettings.refusals}</b><span>Draft rule</span></article></div>
                <div className="league-grid">
                  <form className={`panel league-card ${leagueStructureLocked ? "locked-card" : ""}`} onSubmit={async (e) => { e.preventDefault(); if (leagueStructureLocked) return; const data = new FormData(e.currentTarget); const previous = `${seasonSettings.start} to ${seasonSettings.end} · ${seasonSettings.weeklyChallenges} challenges · ${seasonSettings.refusals} refusals`; const next = { name: String(data.get("seasonName")), start: String(data.get("start")), end: String(data.get("end")), weeklyChallenges: Number(data.get("weeklyChallenges")), refusals: Number(data.get("refusals")) }; setSeasonSettings(next); try { await saveSeasonToSupabase(next); addAudit("Season settings updated", next.name, previous, `${next.start} to ${next.end} · ${next.weeklyChallenges} challenges · ${next.refusals} refusals`, String(data.get("reason"))); setLeagueNotice("Season saved to the live league database. Player registration is now available."); } catch (error) { setLeagueNotice(error instanceof Error ? error.message : "The season could not be saved."); } }}>
                    <div className="panel-title"><h3>Season settings</h3><Badge tone="cream">Live rules</Badge></div>
                    <fieldset disabled={leagueStructureLocked}>
                    <label>Season name<input name="seasonName" defaultValue={seasonSettings.name} required /></label>
                    <div className="league-form-row"><label>Start date<input name="start" type="date" value={seasonSettings.start} onChange={(e) => setSeasonSettings((old) => ({ ...old, start: e.target.value, end: calculateSeasonEndDate(e.target.value, advisedLeagueStructure.divisions) }))} required /></label><label>End date · calculated<input name="end" type="date" value={seasonSettings.end} readOnly required /><small>Largest division size plus four weeks, ending on the final day of the last league week.</small></label></div>
                    <div className="league-form-row"><label>Weekly challenges<input name="weeklyChallenges" type="number" min="1" max="5" defaultValue={seasonSettings.weeklyChallenges} required /></label><label>Season refusals<input name="refusals" type="number" min="0" max="8" defaultValue={seasonSettings.refusals} required /></label></div>
                    <label>Reason for change<textarea name="reason" required placeholder="Required for the organiser audit record…" /></label><button type="submit">Save season settings</button>
                    </fieldset>
                  </form>
                  <section className={`panel league-card ${leagueStructureLocked ? "locked-card" : ""}`}><div className="panel-title"><h3>Division management</h3><Badge tone="cream">{divisions.length} active</Badge></div>
                    <div className="structure-advice">
                      <div className="structure-advice-head"><div><small>Advised league structure</small><b>{activeSeasonRegistrations.length} registered players</b></div><Badge>{advisedLeagueStructure.divisions.length ? `${advisedLeagueStructure.divisions.length} division${advisedLeagueStructure.divisions.length > 1 ? "s" : ""}` : "Waiting"}</Badge></div>
                      <div className="advised-divisions">{advisedLeagueStructure.divisions.map((size, index) => <span key={index}><b>Division {index + 1}</b><strong>{size}</strong><small>players · {size + 4} weeks</small></span>)}{advisedLeagueStructure.waiting > 0 && <span className="waiting-advice"><b>Waiting list</b><strong>{advisedLeagueStructure.waiting}</strong><small>players</small></span>}</div>
                      <p>{advisedLeagueStructure.message}</p>
                      <button className="use-structure-button" disabled={leagueStructureLocked || !advisedLeagueStructure.divisions.length} onClick={useRecommendedStructure}>Use recommended structure</button>
                    </div>
                    <div className="autopopulate-rule"><b>Promotion and relegation setup</b><span>Promote the top three and relegate the bottom three. Their starting-order changes remain in force if divisions merge. Returning players retain relative order, withdrawals close automatically, and new players enter last.</span><div className="placement-action-buttons"><button disabled={leagueStructureLocked || !divisions.length} onClick={autopopulateDivisions}>Autopopulate players and positions</button><button className="manual-edit-button" disabled={leagueStructureLocked || !Object.keys(autoPlacements).length} onClick={() => openDivisionPreview(autoPlacements)}>Edit placements manually</button></div></div>
                    <div className="division-list">
                      {[...divisions, ...(waitingListCount ? ["Waiting list"] : [])].map((division) => {
                        const isWaitingList = division === "Waiting list";
                        const assignedCount = Object.values(autoPlacements).filter((placement) => placement.division === division).length;
                        return <article key={division} className={isWaitingList ? "waiting-list-row" : ""}><div><b>{division}</b><span>{assignedCount || "No"} assigned players</span></div><Badge tone={isWaitingList || leaguePaused ? "cream" : leagueStopped ? "red" : leagueLive || divisionStructureAccepted ? "green" : "cream"}>{isWaitingList ? "Waiting" : leagueStopped ? "Stopped" : leaguePaused ? "Paused" : leagueLive ? "Live" : divisionStructureAccepted ? "Accepted" : "Draft"}</Badge>{!isWaitingList && <button className="rename-division-button" disabled={leagueStructureLocked} onClick={() => setRenameLeagueItem({ type: "division", currentName: division })}>Rename</button>}<button className="view-division-players" onClick={() => setViewingDivision(division)}>View players</button>{!isWaitingList && <button disabled={leagueStructureLocked} onClick={() => removeDivisionAndReflow(division)}>Remove</button>}</article>;
                      })}
                    </div>
                    {!divisions.length && <div className="empty-state"><b>＋</b><span>No divisions created</span><small>Add the first division below.</small></div>}
                    <form className="add-division" onSubmit={(e) => { e.preventDefault(); if (leagueStructureLocked) return; const input = e.currentTarget.elements.namedItem("divisionName") as HTMLInputElement; const divisionName = input.value.trim(); if (!divisionName) return; setDivisions((old) => old.includes(divisionName) ? old : [...old, divisionName]); addAudit("Division created", divisionName, "Not present", "Active division", "New league division"); setLeagueNotice(`${divisionName} created.`); input.value = ""; }}><input name="divisionName" placeholder="New division name…" required disabled={leagueStructureLocked} /><button type="submit" disabled={leagueStructureLocked}>Add division</button></form>
                  </section>
                  <section className={`panel league-card league-wide registration-placement ${leagueStructureLocked ? "locked-card" : ""}`}>
                    <div className="panel-title"><div><h3>Player placement</h3><p>Live upcoming-season registration register</p></div><Badge tone={activeSeasonRegistrations.length ? "green" : "cream"}>{activeSeasonRegistrations.length} registered</Badge></div>
                    <div className="registration-summary"><span><b>{activeSeasonRegistrations.filter((player) => !player.isNew).length}</b> returning</span><span><b>{activeSeasonRegistrations.filter((player) => player.isNew).length}</b> new players</span><span><b>{activeSeasonRegistrations.filter((player) => registrationPayments[player.name].toppedUp && registrationPayments[player.name].adminPaid).length}</b> fully paid</span><span><b>{seasonRegistrationPool.filter((player) => !registeredSeasonNames.has(player.name)).length}</b> awaiting registration</span></div>
                    <section className="live-registration-order">
                      <header><div><small>Live starting order</small><h4>New-season registrations</h4><p>Completed registrations rise here automatically in their current proposed starting position.</p></div><Badge tone={liveRegistrationOrder.length ? "green" : "cream"}>{liveRegistrationOrder.length} placed</Badge></header>
                      {liveRegistrationOrder.length ? <div className="live-registration-list">
                        {liveRegistrationOrder.map((player) => {
                          const position = liveRegistrationPlacements[player.name];
                          const payment = registrationPayments[player.name];
                          return <article key={player.name}><b className="live-registration-rank">{position?.position ?? "—"}</b><div><strong>{player.name}</strong><span>{player.isNew ? "New league player · starts after returning players" : `Last season: Division ${player.lastDivision} · ${ordinal(player.lastPosition)}`}</span></div><Badge tone={player.isNew ? "cream" : "green"}>{player.isNew ? "New player" : "Returning"}</Badge><span className="live-registration-payment">{payment.toppedUp && payment.adminPaid ? "✓ Account and fee ready" : payment.adminPaid ? "Fee paid · top-up due" : "Payment checks due"}</span><strong className="live-registration-position">{position ? `${position.division} · ${ordinal(position.position)}` : "Awaiting placement"}</strong></article>;
                        })}
                      </div> : <div className="live-registration-empty">No completed registrations yet. Players will appear here as soon as their registration is received.</div>}
                    </section>
                    <div className="registration-table">
                      <div className="registration-head"><span>Player</span><span>Last season</span><span>Registration</span><span>Account top-up</span><span>Admin fee</span><span>Proposed placement</span><span>Action</span></div>
                      {organiserRegistrationRows.map((player) => {
                        const removed = removedSeasonPlayers.includes(player.name);
                        const registered = registeredSeasonNames.has(player.name) && !removed;
                        const payment = registrationPayments[player.name];
                        const placement = autoPlacements[player.name];
                        const livePlacement = liveRegistrationPlacements[player.name];
                        return <article key={player.name} className={`${player.isNew ? "new-registration" : ""} ${removed ? "withdrawn-registration" : ""} ${!registered && !removed ? "awaiting-registration" : ""}`}><strong>{player.name}{player.isNew && <Badge>New player</Badge>}</strong><span>{player.isNew ? "No previous season" : `Division ${player.lastDivision} · finished ${ordinal(player.lastPosition)}`}</span><Badge tone={removed ? "red" : registered ? "green" : "cream"}>{removed ? "Removed" : registered ? "Registered" : "Awaiting"}</Badge><button disabled={leagueStructureLocked || !registered} className={payment.toppedUp ? "paid" : "unpaid"} onClick={() => setRegistrationPayments((old) => ({ ...old, [player.name]: { ...old[player.name], toppedUp: !old[player.name].toppedUp } }))}>{payment.toppedUp ? "✓ Topped up" : registered ? "Mark top-up paid" : "Not registered"}</button><button disabled={leagueStructureLocked || !registered} className={payment.adminPaid ? "paid" : "unpaid"} onClick={() => setRegistrationPayments((old) => ({ ...old, [player.name]: { ...old[player.name], adminPaid: !old[player.name].adminPaid } }))}>{payment.adminPaid ? "✓ £10 paid" : registered ? "Mark £10 paid" : "Not registered"}</button><span className="placement-result">{placement ? <><b>{placement.division} · {placement.position}</b><small>{placement.note}</small></> : livePlacement ? <><b>{livePlacement.division} · {ordinal(livePlacement.position)}</b><small>Live proposal from registrations so far</small></> : "Awaiting registration"}</span><button disabled={leagueStructureLocked || (!registered && !removed)} className="remove-registration" onClick={() => { setRemovedSeasonPlayers((old) => removed ? old.filter((name) => name !== player.name) : [...old, player.name]); setAutoPlacements({}); addAudit(removed ? "Season registration restored" : "Player removed from season", player.name, removed ? "Removed" : "Registered", removed ? "Registered" : "Removed", "Organiser season registration adjustment"); }}>{removed ? "Restore" : "Remove"}</button></article>;
                      })}
                    </div>
                  </section>
                </div>
              </section>
            ) : adminSection === "permissions" ? (
              <section className="admin-permissions-page">
                <header className="panel league-header"><div><p>Full-admin control</p><h2>Admin permissions</h2><span>Search registered players, choose a permission tier and send an invitation. Access begins only after the player accepts.</span></div><Badge>Full access only</Badge></header>
                <div className="panel admin-tier-guide"><article><b>Full access</b><span>Complete organiser control, including league setup, money and granting roles.</span></article><article><b>League manager</b><span>All organiser areas except league setup, monetary controls and role grants.</span></article><article><b>Operations & audit</b><span>Operations queues and audit history only.</span></article></div>
                <section className="panel admin-role-search"><label>Search registered players<input type="search" value={adminRoleSearch} onChange={(e) => setAdminRoleSearch(e.target.value)} placeholder="Search by player name…" /></label><div>{players.filter((player) => player.name.toLowerCase().includes(adminRoleSearch.toLowerCase())).slice(0, 6).map((player) => { const invite = adminInvitations.find((item) => item.player === player.name); return <article key={player.name}><label><input type="checkbox" checked={Boolean(invite)} readOnly /><span><b>{player.name}</b><small>{invite ? `${invite.tier} access · ${invite.status}` : "Registered player · no admin access"}</small></span></label><select defaultValue="manager" aria-label={`Admin tier for ${player.name}`} id={`tier-${player.name.replaceAll(" ", "-")}`}><option value="full">Full access</option><option value="manager">League manager</option><option value="operations">Operations & audit</option></select><button disabled={Boolean(invite)} onClick={() => { const select = document.getElementById(`tier-${player.name.replaceAll(" ", "-")}`) as HTMLSelectElement; setPendingAdminInvite({ player: player.name, tier: select.value as AdminTier }); }}>{invite ? invite.status : "Offer admin role"}</button></article>; })}</div></section>
                {adminInvitations.length > 0 && <section className="panel admin-invite-register"><div className="panel-title"><h3>Role invitations</h3><Badge tone="cream">{adminInvitations.filter((item) => item.status === "Pending").length} pending</Badge></div>{adminInvitations.map((invite) => <article key={invite.player}><b>{invite.player}</b><span>{invite.tier === "full" ? "Full access" : invite.tier === "manager" ? "League manager" : "Operations & audit"}</span><Badge tone={invite.status === "Accepted" ? "green" : "cream"}>{invite.status}</Badge><div className="admin-invite-actions">{invite.status === "Pending" && <button onClick={() => { setAdminInvitations((old) => old.map((item) => item.player === invite.player ? { ...item, status: "Accepted" } : item)); if (invite.player === currentPortalPlayerName) { setCurrentAdminTier(invite.tier); setAdminSection("operations"); } addAudit("Admin role accepted", invite.player, "Invitation pending", `${invite.tier} access active`, "Player accepted in-app admin invitation"); }}>Prototype: player accepts</button>}{accountKind === "organiser" && <button className="revoke-admin-button" onClick={() => setPendingAdminRevoke(invite)}>{invite.status === "Pending" ? "Cancel offer" : "Remove privileges"}</button>}</div></article>)}</section>}
              </section>
            ) : adminSection === "audit" ? (
              <section className="audit-history">
                <header className="panel league-header"><div><p>Organiser accountability</p><h2>Audit history</h2><span>Permanent record of league, player, match and financial adjustments.</span></div><Badge tone="cream">{auditLog.length} entries</Badge></header>
                <div className="panel audit-controls"><label>Search audit history<input type="search" placeholder="Player, action or reason…" /></label><label>Category<select><option>All actions</option><option>League settings</option><option>Players</option><option>Payments</option><option>Results</option></select></label><button onClick={() => setLeagueNotice("Audit export prepared for download.")}>Export audit report</button></div>
                <div className="panel audit-table"><div className="audit-head"><span>When</span><span>Action</span><span>Subject</span><span>Previous</span><span>New value</span><span>Reason</span><span>Organiser</span></div>{auditLog.map((entry) => <article key={entry.id}><time>{entry.when}</time><strong>{entry.action}</strong><b>{entry.subject}</b><span>{entry.previous}</span><span className="audit-new">{entry.next}</span><span>{entry.reason}</span><span>{entry.organiser}</span></article>)}</div>
              </section>
            ) : selectedAdminPlayer ? (
              <section className="player-admin-profile">
                <button className="back-directory" onClick={() => { setSelectedAdminPlayerName(""); setNoteDraft(""); }}>← Back to player directory</button>
                <header className="panel player-profile-header">
                  <div className="player-admin-avatar">{selectedAdminPlayer.name.split(" ").map((part) => part[0]).join("")}</div>
                  <div className="player-profile-identity"><p>Registered player account</p><h2>{selectedAdminPlayer.name}</h2><span>{playerDivisions[selectedAdminPlayer.name] === "Unassigned" ? "Awaiting league assignment" : `${playerDivisions[selectedAdminPlayer.name]} draft placement`}</span></div>
                  <div className="player-header-financials" aria-label="Current player account and league position">
                    <span><small>Current balance</small><b>£{playerBalances[selectedAdminPlayer.name].toFixed(2)}</b></span>
                    <span><small>Position</small><b>{selectedAdminRank || "—"}</b></span>
                    <span><small>Potential payout</small><b>{leagueLive && selectedAdminRank ? `£${(potentialPayoutByPosition[selectedAdminRank] ?? 0).toFixed(2)}` : "—"}</b></span>
                  </div>
                  <Badge tone={playerStatuses[selectedAdminPlayer.name] === "Active" ? "green" : playerStatuses[selectedAdminPlayer.name] === "Review" ? "cream" : "red"}>{playerStatuses[selectedAdminPlayer.name]}</Badge>
                </header>
                <nav className="profile-tabs" aria-label="Player profile sections">
                  {([["overview", "Overview"], ["activity", "League activity"], ["performance", "Performance"], ["account", "Account & admin"]] as [PlayerProfileTab, string][]).map(([id, label]) => <button key={id} className={playerProfileTab === id ? "active" : ""} onClick={() => setPlayerProfileTab(id)}>{label}</button>)}
                </nav>

                {playerProfileTab === "overview" && <div className="profile-panel-grid">
                  <section className="panel profile-card"><div className="panel-title"><h3>Player details</h3><Badge tone="cream">Verified</Badge></div><dl><div><dt>Email</dt><dd>{selectedAdminPlayer.name.toLowerCase().replace(" ", ".")}@example.invalid</dd></div><div><dt>Mobile</dt><dd>07••• ••• {String(1200 + selectedAdminPlayer.rank * 37).slice(-4)}</dd></div><div><dt>Home area</dt><dd>Staffordshire</dd></div><div><dt>Joined</dt><dd>12 January 2026</dd></div></dl></section>
                  <section className="panel profile-card"><div className="panel-title"><h3>League status</h3></div><label>Player status<select value={playerStatuses[selectedAdminPlayer.name]} onChange={(e) => setPlayerStatuses((old) => ({ ...old, [selectedAdminPlayer.name]: e.target.value as PlayerStatus }))}><option>Active</option><option>Review</option><option>Inactive</option><option>Suspended</option></select></label><dl><div><dt>Division</dt><dd>Division 1</dd></div><div><dt>Refusals used</dt><dd>{selectedAllowance.refusalsUsed} of {seasonSettings.refusals}</dd></div><div><dt>Payout eligible</dt><dd>Qualification begins with season</dd></div></dl><p className="prototype-note">All allowance adjustments require an organiser reason and are retained in the audit history.</p></section>
                </div>}

                {playerProfileTab === "activity" && <div className="profile-panel-grid">
                  <section className="panel profile-card"><div className="panel-title"><h3>Season activity</h3></div><div className="profile-stat-row"><span><small>Played</small><b>0</b></span><span><small>Won</small><b>0</b></span><span><small>Lost</small><b>0</b></span><span><small>Win rate</small><b>—</b></span></div></section>
                  <section className="panel profile-card"><div className="panel-title"><h3>Challenge record</h3></div><dl><div><dt>Challenges issued</dt><dd>0</dd></div><div><dt>Weekly allowance</dt><dd>{selectedWeeklyChallenges}</dd></div><div><dt>Refused challenges received</dt><dd>{selectedAllowance.refusalsReceivedThisWeek}</dd></div><div><dt>Refusals remaining</dt><dd>{Math.max(0, seasonSettings.refusals - selectedAllowance.refusalsUsed)}</dd></div><div><dt>Next-week bonus</dt><dd>{selectedNextWeekBonus ? `+${selectedNextWeekBonus}` : "None"}</dd></div></dl></section>
                  <section className="panel profile-card profile-wide"><div className="panel-title"><h3>Recent organiser activity</h3></div><div className="profile-timeline"><div><time>2 days ago</time><span>Match result confirmed and ladder updated</span></div><div><time>8 days ago</time><span>Challenge arrangement accepted</span></div><div><time>15 days ago</time><span>Payment account topped up by £10.00</span></div></div></section>
                </div>}

                {playerProfileTab === "performance" && <div className="profile-panel-grid">
                  <section className="panel profile-card profile-wide"><div className="panel-title"><h3>Verified season performance</h3><Badge tone="cream">Awaiting first result</Badge></div><div className="performance-admin-grid"><article><small>Three-dart average</small><b>—</b><span>Division best —</span></article><article><small>Highest checkout</small><b>—</b><span>Division best —</span></article><article><small>180s</small><b>0</b><span>Division best 0</span></article><article><small>Least darts in a leg</small><b>—</b><span>Division best —</span></article></div></section>
                  <section className="panel profile-card profile-wide"><div className="panel-title"><h3>Result review</h3></div><p className="profile-copy">All performance figures are linked to confirmed match records. Manual statistical corrections will be added with the audit-controlled adjustment tools.</p><button className="profile-action" onClick={() => setMatchResultsPlayerName(selectedAdminPlayer.name)}>View all match results</button></section>
                </div>}

                {playerProfileTab === "account" && <div className="profile-panel-grid">
                  {currentAdminTier === "full" ? <section className="panel profile-card payment-account-card"><div className="panel-title"><h3>Payment account</h3><Badge tone="cream">Test balance</Badge></div><div className="account-balance">£{(playerBalances[selectedAdminPlayer.name] || 0).toFixed(2)}</div><small className="action-label">Increase balance</small><div className="balance-actions balance-three">{[1, 5, 10].map((amount) => <button key={amount} onClick={async () => { try { await adjustLiveBalance(selectedAdminPlayer.name, amount); addAudit("Player account credited", selectedAdminPlayer.name, "Previous live balance", `+£${amount.toFixed(2)}`, `Manual £${amount} test credit`); } catch (error) { setRemoteError(error instanceof Error ? error.message : "Balance update failed."); } }}>+ £{amount}</button>)}</div><small className="action-label">Debit balance</small><div className="balance-actions balance-three debit-actions">{[1, 5, 10].map((amount) => <button key={amount} disabled={(playerBalances[selectedAdminPlayer.name] || 0) < amount} onClick={async () => { try { await adjustLiveBalance(selectedAdminPlayer.name, -amount); addAudit("Player account debited", selectedAdminPlayer.name, "Previous live balance", `−£${amount.toFixed(2)}`, `Manual £${amount} test debit`); } catch (error) { setRemoteError(error instanceof Error ? error.message : "Balance update failed."); } }}>− £{amount}</button>)}</div><p className="prototype-note">Every test-balance adjustment is written to the live audit history.</p></section> : <section className="panel profile-card permission-lock-card"><h3>Monetary controls restricted</h3><p>Only a full-access administrator may view or alter player balances.</p></section>}
                  <section className="panel profile-card allowance-adjustment-card">
                    <div className="panel-title"><h3>Challenge & refusal adjustments</h3><Badge tone="cream">Audit controlled</Badge></div>
                    <div className="allowance-adjustment-row"><div><small>Official refusals used</small><b>{selectedAllowance.refusalsUsed}</b><span>{Math.max(0, seasonSettings.refusals - selectedAllowance.refusalsUsed)} remaining this season</span></div><div><button disabled={selectedAllowance.refusalsUsed === 0} onClick={() => setAllowanceAdjustment({ playerName: selectedAdminPlayer.name, kind: "refusals-used", direction: -1 })}>− 1</button><button onClick={() => setAllowanceAdjustment({ playerName: selectedAdminPlayer.name, kind: "refusals-used", direction: 1 })}>+ 1</button></div></div>
                    <div className="allowance-adjustment-row"><div><small>Challenges available this week</small><b>{selectedWeeklyChallenges}</b><span>{selectedAllowance.weeklyChallengeAdjustment === 0 ? "Standard weekly allowance" : `${selectedAllowance.weeklyChallengeAdjustment > 0 ? "+" : ""}${selectedAllowance.weeklyChallengeAdjustment} organiser adjustment · resets next week`}</span></div><div><button disabled={selectedWeeklyChallenges === 0} onClick={() => setAllowanceAdjustment({ playerName: selectedAdminPlayer.name, kind: "weekly-challenges", direction: -1 })}>− 1</button><button onClick={() => setAllowanceAdjustment({ playerName: selectedAdminPlayer.name, kind: "weekly-challenges", direction: 1 })}>+ 1</button></div></div>
                    <div className="allowance-adjustment-row"><div><small>Challenges refused this week</small><b>{selectedAllowance.refusalsReceivedThisWeek}</b><span>{selectedAllowance.refusalsReceivedThisWeek ? `Eligible range expanded by one position${selectedNextWeekBonus ? ` · +${selectedNextWeekBonus} challenge next week` : ""}` : "No refusal compensation active"}</span></div><div><button disabled={selectedAllowance.refusalsReceivedThisWeek === 0} onClick={() => setAllowanceAdjustment({ playerName: selectedAdminPlayer.name, kind: "refusals-received", direction: -1 })}>− 1</button><button onClick={() => setAllowanceAdjustment({ playerName: selectedAdminPlayer.name, kind: "refusals-received", direction: 1 })}>+ 1</button></div></div>
                    <p className="prototype-note">A refused challenge opens one additional ladder position to the challenger. Two refusals in the same week award one extra challenge for the following week. Manual challenge adjustments expire at the next weekly reset.</p>
                  </section>
                  <section className="panel profile-card player-administration-card"><div className="panel-title"><h3>Player administration</h3><Badge tone={playerStatuses[selectedAdminPlayer.name] === "Active" ? "green" : "red"}>{playerStatuses[selectedAdminPlayer.name]}</Badge></div>
                    {playerRestrictions[selectedAdminPlayer.name] && <div className="restriction-summary"><b>Position held · {playerRestrictions[selectedAdminPlayer.name].type}</b><span>{playerRestrictions[selectedAdminPlayer.name].reason} · {playerRestrictions[selectedAdminPlayer.name].weeks} week(s)</span></div>}
                    <div className="player-admin-actions">
                      <button disabled={secureMaxWeeks === 0 || ["Secured", "Suspended", "Removed"].includes(playerStatuses[selectedAdminPlayer.name])} onClick={() => setPlayerAdminAction("secure")}>Secure position</button>
                      <button disabled={["Secured", "Suspended", "Removed"].includes(playerStatuses[selectedAdminPlayer.name])} onClick={() => setPlayerAdminAction("suspend")}>Suspend</button>
                      <button className="caution" disabled={playerStatuses[selectedAdminPlayer.name] === "Removed"} onClick={() => setPlayerAdminAction("remove")}>Remove player</button>
                      {["Secured", "Suspended", "Inactive", "Removed"].includes(playerStatuses[selectedAdminPlayer.name]) && <button className="reactivate" onClick={() => { setPlayerStatuses((old) => ({ ...old, [selectedAdminPlayer.name]: "Active" })); setPlayerRestrictions((old) => { const next = { ...old }; delete next[selectedAdminPlayer.name]; return next; }); }}>Reactivate player</button>}
                      {currentAdminTier === "full" && <button className="danger-button" onClick={() => setDeletePlayerTarget(selectedAdminPlayer)}>Delete player account</button>}
                    </div>
                    <p className="prototype-note">Secured or suspended positions remain fixed. Eligible players below them temporarily gain one extra upward challenge place.</p>
                  </section>
                  <section className="panel profile-card organiser-notes-card"><div className="panel-title"><h3>Organiser notes</h3><Badge tone="cream">{(playerNotes[selectedAdminPlayer.name] ?? []).length}</Badge></div><form className="player-note-form" onSubmit={(e) => { e.preventDefault(); if (!noteDraft.trim()) return; setPlayerNotes((old) => ({ ...old, [selectedAdminPlayer.name]: [...(old[selectedAdminPlayer.name] ?? []), noteDraft.trim()] })); setNoteDraft(""); }}><label>Private note<textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Add a note visible only to league organisers…" required /></label><button type="submit">Add note</button></form>{(playerNotes[selectedAdminPlayer.name] ?? []).map((note, index) => <div className="saved-player-note" key={`${note}-${index}`}><small>Anonymous Player 06 · just now</small><span>{note}</span></div>)}</section>
                </div>}
              </section>
            ) : (
              <section className="player-directory">
                <header className="panel directory-header"><div><p>Organiser records</p><h2>Player directory</h2><span>View league activity, performance, payments and administration for every member.</span></div><Badge tone="cream">{filteredAdminPlayers.length} players</Badge></header>
                <div className="panel directory-filters"><label>Search players<input type="search" value={playerSearch} onChange={(e) => setPlayerSearch(e.target.value)} placeholder="Search by player name…" /></label><label>Status<select value={playerStatusFilter} onChange={(e) => setPlayerStatusFilter(e.target.value as "All" | PlayerStatus)}><option>All</option><option>Active</option><option>Review</option><option>Inactive</option><option>Suspended</option><option>Secured</option><option>Removed</option></select></label><label>Division<select defaultValue="Division 1"><option>Division 1</option><option disabled>All divisions — coming soon</option></select></label></div>
                <div className="player-directory-list">
                  {filteredAdminPlayers.map((player) => <article className="panel player-directory-row" key={player.name}><div className="player-admin-avatar">{player.name.split(" ").map((part) => part[0]).join("")}</div><div><strong>{player.name}</strong><span>{playerDivisions[player.name]}{ladderOverrides[player.name] ? ` · Draft position ${ladderOverrides[player.name]}` : ""}</span></div><div className="directory-record"><small>Record</small><b>0W · 0L</b></div><div className="directory-record"><small>Average</small><b>—</b></div><Badge tone={playerStatuses[player.name] === "Active" ? "green" : playerStatuses[player.name] === "Review" ? "cream" : "red"}>{playerStatuses[player.name]}</Badge><div className="directory-actions"><button onClick={() => { setSelectedAdminPlayerName(player.name); setPlayerProfileTab("overview"); setNoteDraft(""); }}>View profile</button><button className="remove-league-player" disabled={playerStatuses[player.name] === "Removed"} onClick={() => { setSelectedAdminPlayerName(player.name); setPlayerProfileTab("account"); setPlayerAdminAction("remove"); }}>Remove from league</button></div></article>)}
                  {!filteredAdminPlayers.length && <div className="panel directory-empty">{players.length ? "No players match these filters." : "No player accounts have been created yet."}</div>}
                </div>
              </section>
            )}
          </div>
        )}
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {([["dashboard", "Home"], ["notifications", `Alerts${unreadNotifications.length ? ` ${unreadNotifications.length}` : ""}`], ["ladder", "Ladder"], ["challenges", "Challenge"], ["venues", "Venues"], ["admin", "Admin"], ["settings", "Settings"]] as [View, string][]).filter(([id]) => accountKind === "organiser" ? id === "admin" : id !== "admin" || hasAdminAccess).map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}
      </nav>

      {divisionPreviewOpen && (
        <div className="modal-backdrop" onClick={() => setDivisionPreviewOpen(false)}>
          <section className="challenge-modal division-preview-modal" role="dialog" aria-modal="true" aria-labelledby="division-preview-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" onClick={() => setDivisionPreviewOpen(false)}>×</button>
            <p>Autopopulated league proposal</p><h2 id="division-preview-title">Review divisions and starting positions</h2>
            <div className="rule-note">Move players between divisions or the waiting list, and use the arrows to adjust their position. Removing a player greys them out until undone. Nothing changes in the league until this preview is accepted.</div>
            <div className="division-preview-columns">
              {previewDivisionNames.map((division) => (
                <section className="preview-division" key={division}>
                  <header><div><small>Proposed division</small><h3>{division}</h3></div><Badge tone="cream">{Object.entries(previewPlacements).filter(([name, placement]) => placement.division === division && !previewRemovedPlayers.includes(name)).length} active</Badge></header>
                  <div className="preview-player-list">
                    {Object.entries(previewPlacements).filter(([, placement]) => placement.division === division).sort((a, b) => a[1].position - b[1].position).map(([name, placement]) => {
                      const removed = previewRemovedPlayers.includes(name);
                      const adjustedPosition = Object.entries(previewPlacements).filter(([otherName, other]) => other.division === division && other.position <= placement.position && !previewRemovedPlayers.includes(otherName)).length;
                      const divisionPlayers = Object.entries(previewPlacements).filter(([, item]) => item.division === division).sort((a, b) => a[1].position - b[1].position);
                      const rowIndex = divisionPlayers.findIndex(([playerName]) => playerName === name);
                      return <article key={name} className={removed ? "preview-removed" : ""}><b>{removed ? "—" : adjustedPosition}</b><span><strong>{name}</strong><small>{placement.note}</small></span><select aria-label={`Move ${name}`} value={placement.division} disabled={removed} onChange={(e) => movePreviewPlayer(name, e.target.value)}>{[...divisions, "Waiting list"].map((option) => { const full = option !== "Waiting list" && option !== placement.division && Object.values(previewPlacements).filter((item) => item.division === option).length >= 20; return <option key={option} disabled={full}>{option}{full ? " · full" : ""}</option>; })}</select><div className="preview-order-buttons"><button aria-label={`Move ${name} up`} disabled={removed || rowIndex === 0} onClick={() => reorderPreviewPlayer(name, -1)}>↑</button><button aria-label={`Move ${name} down`} disabled={removed || rowIndex === divisionPlayers.length - 1} onClick={() => reorderPreviewPlayer(name, 1)}>↓</button></div><button className="preview-remove" disabled={removed} onClick={() => setPreviewRemovedPlayers((old) => [...old, name])}>Remove</button><button className="preview-undo" disabled={!removed} onClick={() => setPreviewRemovedPlayers((old) => old.filter((playerName) => playerName !== name))}>Undo</button></article>;
                    })}
                  </div>
                </section>
              ))}
            </div>
            <div className="preview-summary"><span><b>{Object.keys(previewPlacements).length - previewRemovedPlayers.length}</b> players will be assigned</span><span><b>{previewRemovedPlayers.length}</b> proposed removals</span></div>
            <div className="button-pair"><button className="primary-small" onClick={acceptDivisionPreview}>Accept league placements</button><button className="outline-button" onClick={() => { setDivisionPreviewOpen(false); setPreviewRemovedPlayers([]); }}>Cancel preview</button></div>
          </section>
        </div>
      )}

      {viewingDivision && (
        <div className="modal-backdrop" onClick={() => setViewingDivision("")}>
          <section className="challenge-modal division-players-modal" role="dialog" aria-modal="true" aria-labelledby="division-players-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" onClick={() => setViewingDivision("")}>×</button>
            <p>League placement</p><h2 id="division-players-title">{viewingDivision} players</h2>
            <div className="division-player-window">
              {Object.entries(autoPlacements)
                .filter(([, placement]) => placement.division === viewingDivision)
                .sort((a, b) => a[1].position - b[1].position)
                .map(([name, placement]) => <article key={name}><b>{placement.position}</b><span><strong>{name}</strong><small>{placement.note}</small></span>{seasonRegistrationPool.find((player) => player.name === name)?.isNew && <Badge>New player</Badge>}</article>)}
              {!Object.values(autoPlacements).some((placement) => placement.division === viewingDivision) && <div className="empty-state"><b>◎</b><span>No players assigned yet</span><small>Use autopopulate to create the proposed ladder order.</small></div>}
            </div>
            <button className="outline-button" onClick={() => setViewingDivision("")}>Close player list</button>
          </section>
        </div>
      )}

      {renameLeagueItem && (
        <div className="modal-backdrop" onClick={() => setRenameLeagueItem(null)}>
          <form className="challenge-modal rename-league-modal" role="dialog" aria-modal="true" aria-labelledby="rename-league-title" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            if (leagueStructureLocked) { setRenameLeagueItem(null); return; }
            const newName = String(new FormData(e.currentTarget).get("newName")).trim();
            if (!newName || newName === renameLeagueItem.currentName) { setRenameLeagueItem(null); return; }
            if (renameLeagueItem.type === "league") {
              setSeasonSettings((old) => ({ ...old, name: newName }));
              addAudit("League renamed", renameLeagueItem.currentName, renameLeagueItem.currentName, newName, leaguePaused ? "Organiser adjustment while league paused" : leagueStopped ? "Organiser adjustment after league stopped" : "Pre-season organiser adjustment");
            } else {
              const oldName = renameLeagueItem.currentName;
              setDivisions((old) => old.map((division) => division === oldName ? newName : division));
              setAutoPlacements((old) => Object.fromEntries(Object.entries(old).map(([name, placement]) => [name, placement.division === oldName ? { ...placement, division: newName } : placement])));
              setPreviewPlacements((old) => Object.fromEntries(Object.entries(old).map(([name, placement]) => [name, placement.division === oldName ? { ...placement, division: newName } : placement])));
              setPlayerDivisions((old) => Object.fromEntries(Object.entries(old).map(([name, division]) => [name, division === oldName ? newName : division])));
              setViewingDivision((old) => old === oldName ? newName : old);
              addAudit("Division renamed", oldName, oldName, newName, leaguePaused ? "Organiser adjustment while league paused" : leagueStopped ? "Organiser adjustment after league stopped" : "Pre-season organiser adjustment");
            }
            setLeagueNotice(`${renameLeagueItem.currentName} renamed to ${newName}.`);
            setRenameLeagueItem(null);
          }}>
            <button type="button" className="close" onClick={() => setRenameLeagueItem(null)}>×</button>
            <p>{leaguePaused ? "Paused-league adjustment" : leagueStopped ? "Stopped-league adjustment" : "Pre-season naming"}</p><h2 id="rename-league-title">Rename {renameLeagueItem.type}</h2>
            <label>New name<input name="newName" defaultValue={renameLeagueItem.currentName} autoFocus required /></label>
            <div className="rule-note">Names may be changed before launch or while the league is paused or stopped. Division player assignments and placements will update automatically and the change will be audited.</div>
            <button className="primary-cta" type="submit">Save new name</button>
          </form>
        </div>
      )}

      {leagueExtensionOpen && (
        <div className="modal-backdrop" onClick={() => setLeagueExtensionOpen(false)}>
          <form className="challenge-modal league-control-modal extension-modal" role="dialog" aria-modal="true" aria-labelledby="league-extension-title" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            if (!leagueStructureLocked) return;
            const reason = String(new FormData(e.currentTarget).get("reason")).trim();
            const previousEnd = seasonSettings.end;
            const extendedEnd = datePlusOneWeek(previousEnd);
            if (!reason || !extendedEnd) return;
            setSeasonSettings((old) => ({ ...old, end: extendedEnd }));
            addAudit("League extended by one week", seasonSettings.name, previousEnd, extendedEnd, reason);
            setLeagueNotice(`League extended by one week for extenuating circumstances. The new finishing date is ${extendedEnd}. Weekly challenge and refusal allowances have not changed.`);
            setLeagueExtensionOpen(false);
          }}>
            <button type="button" className="close" onClick={() => setLeagueExtensionOpen(false)}>×</button>
            <p>Extenuating circumstances</p><h2 id="league-extension-title">Extend the live league by one week?</h2>
            <div className="extension-date-review"><span><small>Current end date</small><b>{seasonSettings.end}</b></span><strong>→</strong><span><small>New end date</small><b>{datePlusOneWeek(seasonSettings.end)}</b></span></div>
            <div className="rule-note">This is the only alteration permitted while the league remains live. It changes the official finishing date by exactly seven days and does not add challenge or refusal allowances.</div>
            <label>Reason for extension<textarea name="reason" required placeholder="Record the extenuating circumstances…" /></label>
            <label className="extension-confirm"><input type="checkbox" required /><span>I confirm that the new finishing date is correct.</span></label>
            <button className="primary-cta" type="submit">Confirm 1-week extension</button>
            <button type="button" className="reset-test" onClick={() => setLeagueExtensionOpen(false)}>Cancel</button>
          </form>
        </div>
      )}

      {leagueControlAction && (
        <div className="modal-backdrop" onClick={() => setLeagueControlAction(null)}>
          <form className="challenge-modal league-control-modal" role="dialog" aria-modal="true" aria-labelledby="league-control-title" onClick={(e) => e.stopPropagation()} onSubmit={async (e) => {
            e.preventDefault();
            const reason = String(new FormData(e.currentTarget).get("reason")).trim();
            if (supabase && remoteLeague) { const { error } = await supabase.from("leagues").update({ status: leagueControlAction === "pause" ? "paused" : "stopped" }).eq("id", remoteLeague.id); if (error) { setRemoteError(error.message); return; } }
            if (leagueControlAction === "pause") {
              setLeaguePaused(true);
              addAudit("League paused", seasonSettings.name, "Live", "Paused", reason);
              setLeagueNotice(`${seasonSettings.name} has been paused. New challenges and matches are unavailable, but games already live may finish and update the ladder.`);
            } else {
              setLeagueStopped(true);
              setLeaguePaused(false);
              setLeagueLive(false);
              addAudit("League stopped", seasonSettings.name, leaguePaused ? "Paused" : "Live", "Stopped", reason);
              setLeagueNotice(`${seasonSettings.name} has been stopped. No new activity can begin, but games already live may finish and update the final ladder.`);
            }
            setLeagueControlAction(null);
          }}>
            <button type="button" className="close" onClick={() => setLeagueControlAction(null)}>×</button>
            <p>League control</p><h2 id="league-control-title">{leagueControlAction === "pause" ? "Pause this league?" : "Stop this league permanently?"}</h2>
            <div className={leagueControlAction === "stop" ? "refusal-warning" : "rule-note"}>{leagueControlAction === "pause" ? "Pausing prevents new challenges and new matches. Any game already live may be completed, confirmed and applied to the ladder. The organiser can resume the league at any time." : "Stopping closes the current season to new activity and cannot be undone. Any game already live may still finish, be confirmed and update the final ladder; all records remain available."}</div>
            <label>Reason<textarea name="reason" required placeholder={leagueControlAction === "pause" ? "Explain why the league is being paused…" : "Record why the league is being stopped…"} /></label>
            <button className={leagueControlAction === "stop" ? "danger-button" : "primary-cta"} type="submit">{leagueControlAction === "pause" ? "Confirm pause" : "Confirm stop league"}</button>
            <button type="button" className="reset-test" onClick={() => setLeagueControlAction(null)}>Go back</button>
          </form>
        </div>
      )}

      {schedulingOpen && (
        <div className="modal-backdrop" onClick={() => setSchedulingOpen(false)}>
          <form className="challenge-modal scheduling-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-match-title" onClick={(e) => e.stopPropagation()} onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const selectedVenue = organiserVenues.find((venue) => venue.name === String(data.get("venue")));
            if (supabase && activeRemoteMatch && selectedVenue) { const when = new Date(`${data.get("date")}T${data.get("time")}`).toISOString(); const { error } = await supabase.rpc("schedule_match", { target_match: activeRemoteMatch.id, when_to_play: when, target_venue: selectedVenue.id }); if (error) { setRemoteError(error.message); return; } }
            setMatchArrangement({
              opponent: liveIncomingName,
              date: String(data.get("date")),
              time: String(data.get("time")),
              venue: String(data.get("venue")),
              alternative: String(data.get("alternative")),
              playerConfirmed: true,
              opponentConfirmed: matchArrangement?.opponentConfirmed ?? false,
            });
            setIncomingStatus("accepted");
            setSchedulingOpen(false);
            setView("matches");
            setGuestFlowMessage(`Your proposed arrangement has been sent to ${liveIncomingName} for confirmation.`);
            addAudit("Match arrangement proposed", `${signedInPlayerName} vs ${liveIncomingName}`, "Challenge accepted", `${String(data.get("date"))} ${String(data.get("time"))} · ${String(data.get("venue"))}`, "Player submitted date, time and authorised venue");
          }}>
            <button type="button" className="close" onClick={() => setSchedulingOpen(false)}>×</button>
            <p>Challenge-to-match scheduling</p><h2 id="schedule-match-title">Arrange {signedInPlayerName} vs {liveIncomingName}</h2>
            <span className="modal-intro">Submit a suitable date, time and authorised venue. The opponent must confirm the arrangement before an official can be appointed.</span>
            <div className="scheduling-form-grid"><label>Match date<input name="date" type="date" defaultValue={matchArrangement?.date || ""} required /></label><label>Start time<input name="time" type="time" defaultValue={matchArrangement?.time || ""} required /></label><label className="schedule-wide">Authorised venue<select name="venue" defaultValue={matchArrangement?.venue || ""} required><option value="">No authorised venues added</option>{organiserVenues.map((venue) => <option key={venue.id}>{venue.name}</option>)}</select></label><label className="schedule-wide">Other suitable options or availability<textarea name="alternative" defaultValue={matchArrangement?.alternative} placeholder="Add alternative availability after venues have been approved…" /></label></div>
            <div className="scheduling-deadline"><span><small>Arrangement deadline</small><b>Within 7 days of acceptance</b></span><span><small>Match deadline</small><b>Within the current challenge window</b></span></div>
            <button className="primary-cta" type="submit">{matchArrangement ? "Update arrangement" : "Send proposed arrangement"}</button>
          </form>
        </div>
      )}

      {guestInviteOpen && (
        <div className="modal-backdrop" onClick={() => setGuestInviteOpen(false)}>
          <section className="challenge-modal guest-invite-modal" role="dialog" aria-modal="true" aria-labelledby="guest-invite-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" onClick={() => setGuestInviteOpen(false)}>×</button>
            <p>One-time match access</p><h2 id="guest-invite-title">Invite a guest official</h2>
            {!guestAccessCode ? <><span className="modal-intro">Choose a non-registered guest or nominate another registered league player. A referee is always the scorer. A witness-only appointment requires both players to agree which player account will score.</span><div className="official-source-picker"><button className={officialSource === "guest" ? "selected" : ""} onClick={() => setOfficialSource("guest")}><b>Guest official</b><span>Generate QR and one-time code</span></button><button className={officialSource === "league" ? "selected" : ""} onClick={() => setOfficialSource("league")}><b>League player</b><span>Send app notifications—no code</span></button></div><label>Official role<select value={guestInviteRole} onChange={(e) => { setGuestInviteRole(e.target.value as GuestOfficialRole); setScoringAccount(""); setScoringAccountApprovals({ player: false, opponent: false }); }}><option>Referee</option><option>Witness only</option></select></label>{officialSource === "guest" ? <><div className="guest-permissions"><b>{guestInviteRole === "Referee" ? "Referee controls scoring" : "Witness has read-only access"}</b><span>{guestInviteRole === "Referee" ? "The referee enters every score; both players receive read-only scoreboards." : "Both players must agree which player account enters scores; the other player and witness remain read only."}</span></div><button className="primary-cta" onClick={() => { setGuestAccessCode("DCUK-7K4P"); setGuestOfficial(null); setGuestApprovals({ player: false, opponent: false }); setLeagueOfficialAccepted(false); }}>Generate QR and access code</button></> : <><label>Registered league player<select value={leagueOfficialNominee} onChange={(e) => setLeagueOfficialNominee(e.target.value)}>{players.filter((player) => !["Anonymous Player 06", matchArrangement?.opponent].includes(player.name)).map((player) => <option key={player.name}>{player.name}</option>)}</select></label><div className="guest-permissions"><b>No access code required</b><span>Anonymous Player 06, {matchArrangement?.opponent} and {leagueOfficialNominee} will each receive an in-app notification. The appointment activates only after everyone accepts.</span></div><button className="primary-cta" onClick={() => { const nominee: GuestOfficialApplication = { name: leagueOfficialNominee, phone: "", email: "", role: guestInviteRole, remember: true }; setOfficialSource("league"); setGuestOfficial(nominee); setGuestApprovals({ player: false, opponent: false }); setLeagueOfficialAccepted(false); setScoringAccount(""); setScoringAccountApprovals({ player: false, opponent: false }); setGuestInviteOpen(false); setGuestFlowMessage(`Nomination notifications sent to Anonymous Player 06, ${matchArrangement?.opponent} and ${leagueOfficialNominee}.`); addAudit("League player nominated as official", leagueOfficialNominee, "No official appointed", `${guestInviteRole} · awaiting all approvals`, "Notifications sent to both players and nominated official"); }}>Send nomination notifications</button></>}</> : <><div className="guest-invite-output"><div className="prototype-qr" aria-label="Prototype guest invitation QR code"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><div><small>Match access code</small><b>{guestAccessCode}</b><span>Anonymous Player 06 vs {matchArrangement?.opponent}<br />{guestInviteRole}<br />Expires after the match or if cancelled</span></div></div><div className="guest-link-row"><button onClick={() => setGuestFlowMessage(`Invitation link copied for ${guestAccessCode}.`)}>Copy invitation link</button><button onClick={() => setGuestFlowMessage(`QR invitation ${guestAccessCode} ready to share.`)}>Share QR</button><button className="open-guest-form" onClick={() => { setGuestInviteOpen(false); setGuestRegistrationOpen(true); }}>Prototype: scan and open form</button></div><div className="rule-note">The QR contains a random match invitation token only. Registered league-player nominations do not generate a code.</div></>}
          </section>
        </div>
      )}

      {guestRegistrationOpen && (
        <div className="modal-backdrop guest-portal-backdrop" onClick={() => setGuestRegistrationOpen(false)}>
          <form className="challenge-modal guest-registration-modal" role="dialog" aria-modal="true" aria-labelledby="guest-registration-title" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const application: GuestOfficialApplication = { name: String(data.get("name")), phone: String(data.get("phone")), email: String(data.get("email")), role: guestInviteRole, remember: data.get("remember") === "yes" };
            setOfficialSource("guest");
            setGuestOfficial(application);
            setGuestApprovals({ player: false, opponent: false });
            setLeagueOfficialAccepted(false);
            setScoringAccount("");
            setScoringAccountApprovals({ player: false, opponent: false });
            setGuestRegistrationOpen(false);
            setView("matches");
            setGuestFlowMessage(`${application.name} registered successfully. Approval notifications were sent to Anonymous Player 06 and ${matchArrangement?.opponent}.`);
            addAudit("Guest official registered", application.name, `Invitation ${guestAccessCode}`, `${application.role} · awaiting both players`, application.remember ? "Guest chose to save verified details for future invitations" : "One-time guest access only");
          }}>
            <div className="guest-portal-brand"><b>DartsCoachUK</b><span>Guest official access</span></div>
            <button type="button" className="close" onClick={() => setGuestRegistrationOpen(false)}>×</button>
            <p>Invitation {guestAccessCode}</p><h2 id="guest-registration-title">Register for this match</h2>
            <div className="guest-match-summary"><b>Anonymous Player 06 vs {matchArrangement?.opponent}</b><span>{matchArrangement?.date} · {matchArrangement?.time}<br />{matchArrangement?.venue}</span><Badge tone="cream">{guestInviteRole}</Badge></div>
            <div className="guest-details-grid"><label>Full name<input name="name" required placeholder="Your full name" /></label><label>Mobile number<input name="phone" type="tel" required placeholder="For match verification" /></label><label className="guest-wide">Email address<input name="email" type="email" required placeholder="For your one-time access link" /></label></div>
            <label className="guest-consent"><input type="checkbox" required /><span>I confirm that I am willing and able to act as the selected official for this match.</span></label>
            <label className="guest-consent save-guest"><input type="checkbox" name="remember" value="yes" /><span><b>Save my verified details</b><small>Use email or text verification next time instead of completing this form again.</small></span></label>
            <div className="rule-note">Submitting this form notifies both players. Scoring access remains locked until both players accept you.</div>
            <button className="primary-cta" type="submit">Send to both players for approval</button>
          </form>
        </div>
      )}

      {challengeOpen && (
        <div className="modal-backdrop" onClick={() => setChallengeOpen(false)}>
          <form className={`challenge-modal ${challengeMode === "power-play" ? "power-play-modal" : ""}`} onClick={(e) => e.stopPropagation()} onSubmit={async (e) => { e.preventDefault(); if (chosenOpponent) { try { await issueLiveChallenge(chosenOpponent.name, challengeMode === "power-play"); if (challengeMode === "power-play") { setPowerPlayOpponent(chosenOpponent.name); setPowerPlayUsed(true); } else setOutgoingOpponent(chosenOpponent.name); setChallengeSent(true); } catch (error) { setRemoteError(error instanceof Error ? error.message : "The challenge could not be issued."); } } }}>
            <button type="button" className="close" onClick={() => setChallengeOpen(false)}>×</button>
            {!challengeSent ? <>
              <p>{challengeMode === "power-play" ? "Once-per-season privilege" : "Official ladder challenge"}</p><h2>{challengeMode === "power-play" ? "Use your Power Play" : "Choose who to challenge"}</h2>
              {challengeMode === "power-play" && <div className="power-play-modal-note"><b>⚡ Any level. Your division.</b><span>This extra challenge does not use one of your regular weekly challenges. Once issued, your Power Play is spent for this season.</span></div>}
              <fieldset className="opponent-picker">
                <legend>{challengeMode === "power-play" ? "All active players in your division" : "Eligible players"}</legend>
                {challengeOpponentPool.map((player) => (
                  <label className={selectedOpponent === player.name ? "selected" : ""} key={player.name}>
                    <input type="radio" name="opponent" value={player.name} checked={selectedOpponent === player.name} onChange={() => setSelectedOpponent(player.name)} required />
                    <b>{player.rank}</b><span><strong>{player.name}</strong><small>{player.gap}</small></span><Badge>{challengeMode === "power-play" ? "Power Play" : "Eligible"}</Badge>
                  </label>
                ))}
              </fieldset>
              {chosenOpponent && <div className="eligibility"><Badge>Selected</Badge><span>Position {chosenOpponent.rank} · {chosenOpponent.gap.toLowerCase()}</span></div>}
              <label>Suggested date and time<input type="datetime-local" required /></label>
              <label>Potential venue<select defaultValue=""><option value="">No authorised venues added</option>{organiserVenues.map((venue) => <option key={venue.id}>{venue.name}</option>)}<option>Suggest a new venue</option></select></label>
              <label>Proposed referee or witness<select><option>Anonymous Player 03</option><option>Anonymous Player 01</option><option>Invite someone else</option></select></label>
              <label>Alternative arrangement<textarea placeholder="Offer another suitable date, time or venue…" /></label>
              <div className="financial-note"><b>£2 challenge fee</b><span>Available balance after match: £6.00</span></div>
              <button className="primary-cta" type="submit" disabled={!chosenOpponent}>Issue {challengeMode === "power-play" ? "Power Play " : ""}challenge to {chosenOpponent?.name ?? "selected player"}</button>
            </> : <div className="success"><b>✓</b><h2>{challengeMode === "power-play" ? "Power Play issued" : "Challenge issued"}</h2><p>{chosenOpponent?.name} has three days to respond. {challengeMode === "power-play" ? "Your once-per-season Power Play is now marked as used and your weekly allowance is unchanged." : "This challenge will only use your weekly allowance if it is accepted or officially awarded."}</p><button type="button" className="outline-button" onClick={() => { setChallengeOpen(false); setChallengeSent(false); setView("challenges"); }}>View challenge centre</button></div>}
          </form>
        </div>
      )}

      {matchResultsPlayerName && (
        <div className="modal-backdrop" onClick={() => setMatchResultsPlayerName("")}>
          <section className="challenge-modal results-window" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" onClick={() => setMatchResultsPlayerName("")}>×</button>
            <p>Confirmed league record</p><h2>{matchResultsPlayerName} · all match results</h2>
            <div className="results-table"><div><b>Date</b><b>Opponent</b><b>Result</b><b>Score</b><b>Average</b><b>HC</b><b>180s</b></div>{activeMatchResults.map((result) => <div key={`${result.date}-${result.opponent}`}><span>{result.date}</span><strong>{result.opponent}</strong><Badge tone={result.result === "Won" ? "green" : "red"}>{result.result}</Badge><span>{result.score}</span><span>{result.average}</span><span>{result.checkout}</span><span>{result.maximums}</span></div>)}</div>
            {!activeMatchResults.length && <div className="empty-state"><b>◎</b><span>No match results yet</span><small>Confirmed results will appear here after the season begins.</small></div>}
            <button className="outline-button" onClick={() => setMatchResultsPlayerName("")}>Close results</button>
          </section>
        </div>
      )}

      {allowanceAdjustment && (
        <div className="modal-backdrop" onClick={() => setAllowanceAdjustment(null)}>
          <form className="challenge-modal allowance-adjustment-modal" role="dialog" aria-modal="true" aria-labelledby="allowance-adjustment-title" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            const reason = String(new FormData(e.currentTarget).get("reason")).trim();
            if (!reason) return;
            const current = playerAllowances[allowanceAdjustment.playerName] ?? { refusalsUsed: 0, weeklyChallengeAdjustment: 0, refusalsReceivedThisWeek: 0 };
            const field = allowanceAdjustment.kind === "refusals-used" ? "refusalsUsed" : allowanceAdjustment.kind === "weekly-challenges" ? "weeklyChallengeAdjustment" : "refusalsReceivedThisWeek";
            const beforeValue = current[field];
            const minimum = allowanceAdjustment.kind === "weekly-challenges" ? -seasonSettings.weeklyChallenges : 0;
            const afterValue = Math.max(minimum, beforeValue + allowanceAdjustment.direction);
            const nextRecord = { ...current, [field]: afterValue };
            setPlayerAllowances((old) => ({ ...old, [allowanceAdjustment.playerName]: nextRecord }));
            if (allowanceAdjustment.kind === "weekly-challenges") {
              const beforeAllowance = seasonSettings.weeklyChallenges + beforeValue;
              const afterAllowance = seasonSettings.weeklyChallenges + afterValue;
              addAudit("Weekly challenge allowance adjusted", allowanceAdjustment.playerName, `${beforeAllowance} available`, `${afterAllowance} available`, `${reason} · Temporary adjustment expires at the next weekly reset`);
            } else if (allowanceAdjustment.kind === "refusals-used") {
              addAudit("Official refusal record adjusted", allowanceAdjustment.playerName, `${beforeValue} refusals used`, `${afterValue} refusals used`, reason);
            } else {
              const nextWeekBonus = Math.floor(afterValue / 2);
              addAudit("Refused challenge compensation adjusted", allowanceAdjustment.playerName, `${beforeValue} refusals received this week`, `${afterValue} refusals received · range +1${nextWeekBonus ? ` · next week +${nextWeekBonus} challenge` : ""}`, reason);
            }
            setAllowanceAdjustment(null);
          }}>
            <button type="button" className="close" onClick={() => setAllowanceAdjustment(null)}>×</button>
            <p>Extenuating circumstances</p>
            <h2 id="allowance-adjustment-title">{allowanceAdjustment.direction > 0 ? "Add" : "Subtract"} one {allowanceAdjustment.kind === "refusals-used" ? "official refusal" : allowanceAdjustment.kind === "weekly-challenges" ? "weekly challenge" : "refused challenge received"}</h2>
            <div className="allowance-change-summary"><b>{allowanceAdjustment.playerName}</b><span>{allowanceAdjustment.kind === "weekly-challenges" ? "This adjustment applies only to the current league week and automatically returns to the normal allowance at the weekly reset." : allowanceAdjustment.kind === "refusals-received" ? "The first refusal expands the player’s challenge range by one ladder position. Two in the same week create one additional challenge for the following week." : "This changes the player’s official seasonal refusal record and may change their remaining refusal allowance."}</span></div>
            <label>Reason for adjustment<textarea name="reason" required placeholder="Explain the extenuating circumstances and why this correction is required…" /></label>
            <button className="primary-cta" type="submit">Confirm audited adjustment</button>
            <button type="button" className="reset-test" onClick={() => setAllowanceAdjustment(null)}>Cancel</button>
          </form>
        </div>
      )}

      {playerAdminAction && selectedAdminPlayer && (
        <div className="modal-backdrop" onClick={() => setPlayerAdminAction(null)}>
          <form className="challenge-modal restriction-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            if (playerAdminAction === "remove") {
              setPlayerStatuses((old) => ({ ...old, [selectedAdminPlayer.name]: "Removed" }));
              setPlayerRestrictions((old) => { const next = { ...old }; delete next[selectedAdminPlayer.name]; return next; });
              setRemovedSeasonPlayers((old) => old.includes(selectedAdminPlayer.name) ? old : [...old, selectedAdminPlayer.name]);
              setAutoPlacements({});
              addAudit("Player removed from league", selectedAdminPlayer.name, "Registered", "Removed", String(data.get("reason")));
            } else {
              const type = playerAdminAction === "secure" ? "Secured" : "Suspended";
              setPlayerStatuses((old) => ({ ...old, [selectedAdminPlayer.name]: type }));
              setPlayerRestrictions((old) => ({ ...old, [selectedAdminPlayer.name]: { type, reason: String(data.get("reason")), weeks: Number(data.get("weeks")) } }));
            }
            setPlayerAdminAction(null);
          }}>
            <button type="button" className="close" onClick={() => setPlayerAdminAction(null)}>×</button>
            <p>Player administration</p><h2>{playerAdminAction === "secure" ? "Secure ladder position" : playerAdminAction === "suspend" ? "Suspend for investigation" : "Remove player"}</h2>
            <div className="eligibility"><Badge tone="cream">Player</Badge><span>{selectedAdminPlayer.name} · position {selectedAdminPlayer.rank}</span></div>
            <label>Reason<select name="reason" required defaultValue=""><option value="" disabled>Select a reason</option>{(playerAdminAction === "secure" ? ["Holiday", "Illness or injury", "Family emergency", "Work commitments", "Other approved absence"] : playerAdminAction === "suspend" ? ["Safeguarding investigation", "Conduct investigation", "Match integrity review", "Payment or account review", "Other investigation"] : ["Player request", "League rule breach", "Non-payment", "Extended inactivity", "Other organiser decision"]).map((reason) => <option key={reason}>{reason}</option>)}</select></label>
            {playerAdminAction !== "remove" && <label>Duration<select name="weeks" required>{Array.from({ length: playerAdminAction === "secure" ? secureMaxWeeks : 4 }, (_, index) => index + 1).map((weeks) => <option key={weeks} value={weeks}>{weeks} week{weeks > 1 ? "s" : ""}</option>)}</select></label>}
            <label>Organiser notes<textarea placeholder="Record supporting details and the review date…" /></label>
            <div className="rule-note">{playerAdminAction === "secure" ? `Maximum ${secureMaxWeeks} week(s): four-week allowance reduced by ${refusalsUsed} refusal(s). The player’s ladder position is held.` : playerAdminAction === "suspend" ? "Suspension is limited to four weeks while the investigation takes place. The player’s ladder position is held." : "The player will be removed from active challenge eligibility. This prototype can reactivate the record if needed."}</div>
            <button className={playerAdminAction === "remove" ? "danger-button" : "primary-cta"} type="submit">Confirm {playerAdminAction}</button>
          </form>
        </div>
      )}

      {deletePlayerTarget && currentAdminTier === "full" && (
        <div className="modal-backdrop" onClick={() => setDeletePlayerTarget(null)}>
          <form className="challenge-modal restriction-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const confirmation = String(data.get("confirm") || "").trim().toUpperCase();
            const reason = String(data.get("reason") || "").trim();
            if (confirmation !== "DELETE" || reason.length < 5) return;
            const playerName = deletePlayerTarget.name;
            addAudit("Player account permanently deleted", playerName, "Player account present", "Account and active access removed", reason);
            setPlayers((old) => old.filter((player) => player.name !== playerName).map((player, index) => ({ ...player, rank: index + 1 })));
            setPlayerStatuses((old) => { const next = { ...old }; delete next[playerName]; return next; });
            setPlayerBalances((old) => { const next = { ...old }; delete next[playerName]; return next; });
            setPlayerNotes((old) => { const next = { ...old }; delete next[playerName]; return next; });
            setPlayerRestrictions((old) => { const next = { ...old }; delete next[playerName]; return next; });
            setPlayerAllowances((old) => { const next = { ...old }; delete next[playerName]; return next; });
            setPlayerDivisions((old) => { const next = { ...old }; delete next[playerName]; return next; });
            setRegistrationPayments((old) => { const next = { ...old }; delete next[playerName]; return next; });
            setRemovedSeasonPlayers((old) => old.filter((name) => name !== playerName));
            setAdminInvitations((old) => old.filter((invite) => invite.player !== playerName));
            setSelectedAdminPlayerName("");
            setDeletePlayerTarget(null);
          }}>
            <button type="button" className="close" onClick={() => setDeletePlayerTarget(null)}>×</button>
            <p>Full-admin account control</p>
            <h2>Permanently delete {deletePlayerTarget.name}?</h2>
            <div className="rule-note">This removes the player’s account access, registration, placement, permissions, test balance and current organiser records. The deletion event remains in the audit history. This cannot be undone.</div>
            <label>Reason for permanent deletion<textarea name="reason" required minLength={5} placeholder="Record why this account must be deleted…" /></label>
            <label>Type DELETE to confirm<input name="confirm" required autoComplete="off" /></label>
            <button className="danger-button" type="submit">Permanently delete player account</button>
            <button type="button" className="reset-test" onClick={() => setDeletePlayerTarget(null)}>Cancel</button>
          </form>
        </div>
      )}

      {cancelOutgoingOpen && (
        <div className="modal-backdrop" onClick={() => setCancelOutgoingOpen(false)}>
          <section className="challenge-modal confirm-cancel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" onClick={() => setCancelOutgoingOpen(false)}>×</button>
            <p>Cancel outgoing challenge</p>
            <h2>Cancel request to {outgoingOpponent}?</h2>
            <div className="rule-note">This will remove the outgoing request and restore the eligible challenge buttons. No challenge fee or weekly challenge allowance will be used.</div>
            <div className="button-pair">
              <button className="danger-button" onClick={() => { setOutgoingOpponent(""); setSelectedOpponent(""); setChallengeSent(false); setCancelOutgoingOpen(false); }}>Yes, cancel request</button>
              <button className="outline-button" onClick={() => setCancelOutgoingOpen(false)}>Keep challenge</button>
            </div>
          </section>
        </div>
      )}

      {withdrawRefusalOpen && (
        <div className="modal-backdrop" onClick={() => setWithdrawRefusalOpen(false)}>
          <section className="challenge-modal confirm-cancel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" onClick={() => setWithdrawRefusalOpen(false)}>×</button>
            <p>Withdraw refusal request</p>
            <h2>Have circumstances changed?</h2>
            <div className="rule-note">Withdrawing now will remove the pending refusal from the organiser’s review queue and return this challenge to the response stage. No refusal will be recorded.</div>
            <div className="button-pair">
              <button className="primary-small" onClick={() => { setIncomingStatus("pending"); setWithdrawRefusalOpen(false); }}>Yes, withdraw refusal</button>
              <button className="outline-button" onClick={() => setWithdrawRefusalOpen(false)}>Keep refusal request</button>
            </div>
          </section>
        </div>
      )}

      {pendingAdminAction && (
        <div className="modal-backdrop" onClick={() => setPendingAdminAction(null)}>
          <form className="challenge-modal admin-decision-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); setAdminOutcomes((old) => ({ ...old, [pendingAdminAction.caseId]: pendingAdminAction.action })); setPendingAdminAction(null); }}>
            <button type="button" className="close" onClick={() => setPendingAdminAction(null)}>×</button>
            <p>Organiser action</p>
            <h2>{pendingAdminAction.action}</h2>
            <div className="eligibility"><Badge tone="cream">Case</Badge><span>{pendingAdminAction.subject}</span></div>
            <label>Decision notes (optional)<textarea placeholder="Record the reason, evidence considered or any instructions to the players…" /></label>
            <div className="rule-note">This action will be added to the organiser audit record. The prototype lets you reopen it if a correction is needed.</div>
            <button className={/Reject|Remove|invalid|Dismiss|Cancel/.test(pendingAdminAction.action) ? "danger-button" : "primary-cta"} type="submit">Confirm: {pendingAdminAction.action}</button>
            <button type="button" className="reset-test" onClick={() => setPendingAdminAction(null)}>Go back</button>
          </form>
        </div>
      )}

      {selectedPriorityCase && priorityCase && (
        <div className="modal-backdrop" onClick={() => setPriorityCase(null)}>
          <section className="challenge-modal priority-review-modal" role="dialog" aria-modal="true" aria-labelledby="priority-case-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" aria-label="Close priority case" onClick={() => setPriorityCase(null)}>×</button>
            <p>Priority organiser case</p>
            <h2 id="priority-case-title">{selectedPriorityCase.category}</h2>
            <div className="priority-case-summary">
              <div className="priority-modal-status"><Badge tone="red">Action required</Badge><time dateTime={`PT${selectedPriorityWait}H`}>Waiting {formatWait(selectedPriorityWait)}</time></div>
              <strong>{selectedPriorityCase.subject}</strong>
              <span>{selectedPriorityCase.detail}</span>
            </div>
            <h3>Choose how to resolve this issue</h3>
            <div className="admin-actions priority-modal-actions">
              {selectedPriorityCase.options.map((option) => (
                <button key={option} className={/Reject|Remove|invalid|Dismiss|Cancel/.test(option) ? "caution" : ""} onClick={() => { setPriorityCase(null); setPendingAdminAction({ caseId: selectedPriorityCase.id, subject: selectedPriorityCase.subject, action: option }); }}>{option}</button>
              ))}
            </div>
            <button type="button" className="reset-test" onClick={() => { openAdminCase(priorityCase.queue, priorityCase.caseId); setPriorityCase(null); }}>Open in full queue</button>
          </section>
        </div>
      )}

      {seasonRegistrationOpen && (
        <div className="modal-backdrop" onClick={() => setSeasonRegistrationOpen(false)}>
          <section className="challenge-modal season-registration-modal" role="dialog" aria-modal="true" aria-labelledby="season-registration-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" aria-label="Close season registration" onClick={() => setSeasonRegistrationOpen(false)}>×</button>
            <div className="registration-modal-head"><div><p>Autumn 2026 season</p><h2 id="season-registration-title">{seasonRegistered ? "Registration confirmed" : "Register for the upcoming season"}</h2></div><Badge tone={seasonRegistered ? "green" : "cream"}>{seasonRegistered ? "Submitted" : `Step ${seasonRegistrationStep} of 3`}</Badge></div>
            {!seasonRegistered && <div className="registration-progress" aria-label={`Registration step ${seasonRegistrationStep} of 3`}><i className={seasonRegistrationStep >= 1 ? "active" : ""} /><i className={seasonRegistrationStep >= 2 ? "active" : ""} /><i className={seasonRegistrationStep >= 3 ? "active" : ""} /></div>}

            {!seasonRegistered && seasonRegistrationStep === 1 && (
              <form onSubmit={(e) => { e.preventDefault(); setSeasonDetailsConfirmed(true); setSeasonRegistrationStep(2); }}>
                <p className="registration-step-label">1 · Confirm player details</p><span className="modal-intro">Check the information held on your league account. Changes will be sent to the organisers with your registration.</span>
                <div className="venue-form-grid"><label>Full name<input name="name" defaultValue={currentPortalPlayerName} required /></label><label>Member ID<input name="memberId" defaultValue={newPlayerDashboard ? "Issued on account creation" : "MEMBER-0001"} readOnly /></label><label>Email address<input name="email" type="email" defaultValue={newPlayerDashboard ? newPlayerApplication?.email : "player06@example.invalid"} required /></label><label>Mobile number<input name="mobile" type="tel" defaultValue={newPlayerDashboard ? newPlayerApplication?.mobile : "00000 000 000"} required /></label><label className="venue-form-wide">Home area<input name="area" defaultValue={newPlayerDashboard ? newPlayerApplication?.preferredArea : ""} required /></label></div>
                <label className="registration-confirm-check"><input type="checkbox" required /><span>I confirm these details are correct and may be used for league administration and match notifications.</span></label>
                <button className="primary-cta" type="submit">Confirm details and continue</button>
              </form>
            )}

            {!seasonRegistered && seasonRegistrationStep === 2 && (
              <form onSubmit={(e) => { e.preventDefault(); setSeasonPlacementConfirmed(true); setSeasonRegistrationStep(3); }}>
                <p className="registration-step-label">2 · Confirm ladder placement</p><span className="modal-intro">{newPlayerDashboard ? "As a new league player, you will enter after all registered returning players in the lowest available division or waiting list." : "Your proposed place applies the promotion, relegation and returning-player rules. Organisers will confirm the final structure after registration closes."}</span>
                <div className="placement-comparison"><article><small>{newPlayerDashboard ? "League history" : "Last season finish"}</small><strong>{newPlayerDashboard ? "New player" : "Division 1"}</strong><b>{newPlayerDashboard ? "—" : "6th"}</b><span>{newPlayerDashboard ? "No previous ladder position" : "Official final position"}</span>{!newPlayerDashboard && <button type="button" className="query-position-button" onClick={() => setLastSeasonTableOpen(true)}>Query · view final table</button>}</article><i>→</i><article className="proposed"><small>Proposed new start</small><strong>Division 1</strong><b>{ordinal(portalProposedStartingPosition)}</b><span>{newPlayerDashboard ? "After registered returning players" : `Based on ${higherFinishersRegistered + 1} registration${higherFinishersRegistered ? "s" : ""} so far`}</span></article></div>
                <div className="rule-note">{newPlayerDashboard ? "New players are always placed below returning players. The proposed position can move as further registrations arrive or if the organiser creates a waiting list." : "This live proposal only includes players registered so far. If a returning player who finished above you registers later, they are inserted ahead and your proposed position moves down. Promotion and relegation order remains protected."}</div>
                <label className="registration-confirm-check"><input type="checkbox" required /><span>{newPlayerDashboard ? "I acknowledge that I will begin after returning players in the lowest available division or waiting list." : "I confirm that my last-season finish is correct and acknowledge the proposed starting position."}</span></label>
                <div className="registration-nav-actions"><button type="button" className="outline-button" onClick={() => setSeasonRegistrationStep(1)}>Back</button><button className="primary-cta" type="submit">Confirm position and continue</button></div>
              </form>
            )}

            {!seasonRegistered && seasonRegistrationStep === 3 && (
              <section>
                <p className="registration-step-label">3 · Prepare payment account</p><span className="modal-intro">Registration requires a £10 league fee and at least £10 remaining in your account for challenge fees. Your balance must therefore reach £20 before the league fee can be paid.</span>
                <div className="registration-account-balance"><div><small>Current account balance</small><b>£{(playerBalances[currentPortalPlayerName] ?? 0).toFixed(2)}</b><em>{seasonAdminFeePaid ? `£${(playerBalances[currentPortalPlayerName] ?? 0).toFixed(2)} available for challenges` : `£${Math.max(0, 20 - (playerBalances[currentPortalPlayerName] ?? 0)).toFixed(2)} more needed to register`}</em></div><Badge tone={seasonAdminFeePaid ? "green" : (playerBalances[currentPortalPlayerName] ?? 0) >= 20 ? "green" : "cream"}>{seasonAdminFeePaid ? "Challenge funds ready" : (playerBalances[currentPortalPlayerName] ?? 0) >= 20 ? "Ready to pay" : "Top-up required"}</Badge></div>
                <small className="action-label">Top up account</small><div className="balance-actions balance-three registration-topups">{[1, 5, 10].map((amount) => <button type="button" key={amount} onClick={() => { setPlayerBalances((old) => ({ ...old, [currentPortalPlayerName]: (old[currentPortalPlayerName] ?? 0) + amount })); setRegistrationPayments((old) => ({ ...old, [currentPortalPlayerName]: { ...(old[currentPortalPlayerName] ?? { toppedUp: false, adminPaid: false }), toppedUp: true } })); }}>+ £{amount}</button>)}</div>
                <article className={`season-fee-line ${seasonAdminFeePaid ? "paid" : ""}`}><div><small>Upcoming season league fee</small><strong>£10.00</strong><span>£10 must remain available for challenges after payment</span></div>{seasonAdminFeePaid ? <Badge>Paid</Badge> : <button type="button" disabled={(playerBalances[currentPortalPlayerName] ?? 0) < 20} onClick={() => { setPlayerBalances((old) => ({ ...old, [currentPortalPlayerName]: (old[currentPortalPlayerName] ?? 0) - 10 })); setSeasonAdminFeePaid(true); setRegistrationPayments((old) => ({ ...old, [currentPortalPlayerName]: { ...(old[currentPortalPlayerName] ?? { toppedUp: false, adminPaid: false }), adminPaid: true } })); }}>Pay £10 league fee</button>}</article>
                <div className="registration-check-summary"><span className={seasonDetailsConfirmed ? "done" : ""}>✓ Details confirmed</span><span className={seasonPlacementConfirmed ? "done" : ""}>✓ Position acknowledged</span><span className={seasonAdminFeePaid ? "done" : ""}>✓ £10 fee paid</span><span className={seasonAdminFeePaid && (playerBalances[currentPortalPlayerName] ?? 0) >= 10 ? "done" : ""}>✓ £10 challenge funds</span></div>
                <div className="registration-nav-actions"><button type="button" className="outline-button" onClick={() => setSeasonRegistrationStep(2)}>Back</button><button className="primary-cta" type="button" disabled={!seasonDetailsConfirmed || !seasonPlacementConfirmed || !seasonAdminFeePaid || (playerBalances[currentPortalPlayerName] ?? 0) < 10} onClick={async () => { if (!supabase || !remoteLeague) return; const { error } = await supabase.rpc("register_for_league", { target_league: remoteLeague.id }); if (error) { setSettingsMessage(error.message); return; } setSeasonRegistered(true); setSeasonRegistrationOpen(false); addAudit("Season registration submitted", currentPortalPlayerName, "Not registered", `Registered · proposed Division 1 ${ordinal(portalProposedStartingPosition)}`, "Player confirmed details and position, paid £10 league fee and retained £10 challenge balance"); await loadLiveLeague(); }}>Complete season registration</button></div>
              </section>
            )}

            {seasonRegistered && <div className="registration-success"><b>✓</b><h3>Entry received</h3><p>{currentPortalPlayerName} is registered for the Autumn 2026 Official Ladder League.</p><div><span><small>Proposed division</small><strong>Division 1</strong></span><span><small>Live proposed position</small><strong>{ordinal(portalProposedStartingPosition)}</strong></span><span><small>League fee</small><strong>Paid · £10.00</strong></span><span><small>Challenge balance</small><strong>£{(playerBalances[currentPortalPlayerName] ?? 0).toFixed(2)}</strong></span></div><em>This position will update as more players register. At least £10 remains available for challenges.</em><button className="primary-cta" onClick={() => setSeasonRegistrationOpen(false)}>Return to dashboard</button></div>}
          </section>
        </div>
      )}

      {lastSeasonTableOpen && (
        <div className="modal-backdrop table-query-backdrop" onClick={() => setLastSeasonTableOpen(false)}>
          <section className="challenge-modal last-season-table-modal" role="dialog" aria-modal="true" aria-labelledby="last-season-table-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" aria-label="Close last season table" onClick={() => setLastSeasonTableOpen(false)}>×</button><p>Position query</p><h2 id="last-season-table-title">Last season’s final Division 1 table</h2><span className="modal-intro">The official finish order is used to place returning players as they register. Only registered players appear in the live proposed ladder.</span>
            <div className="last-season-table"><header><span>Finish</span><span>Player</span><span>Played</span><span>W–L</span><span>Registration</span></header>{players.map((player) => {
              const higherIndex = higherFinishRegistrationOrder.findIndex((entry) => entry.name === player.name);
              const registered = player.name === "Anonymous Player 06" ? seasonRegistered : higherIndex >= 0 && higherIndex < higherFinishersRegistered;
              return <article key={player.name} className={player.name === "Anonymous Player 06" ? "current-player" : ""}><b>#{player.rank}</b><strong>{player.name}{player.name === "Anonymous Player 06" && <small>You</small>}</strong><span>{player.played}</span><span>{player.won}–{player.lost}</span><Badge tone={registered ? "green" : "cream"}>{registered ? "Registered" : "Not yet"}</Badge></article>;
            })}</div>
            <div className="query-explanation"><div><b>How Anonymous Player 06’s live position is calculated</b><span>Anonymous Player 06 finished 6th. His proposal is {ordinal(proposedStartingPosition)} because {higherFinishersRegistered === 0 ? "none of the five players who finished above him has registered yet" : `${higherFinishersRegistered} higher-finishing player${higherFinishersRegistered === 1 ? " has" : "s have"} registered`}. Players who finished below Anonymous Player 06 cannot move ahead of him through registration order.</span></div>{seasonRegistered && <button disabled={higherFinishersRegistered >= higherFinishRegistrationOrder.length} onClick={() => setHigherFinishersRegistered((old) => Math.min(higherFinishRegistrationOrder.length, old + 1))}>{higherFinishersRegistered >= higherFinishRegistrationOrder.length ? "All higher players registered" : `Prototype: register ${higherFinishRegistrationOrder[higherFinishersRegistered].name}`}</button>}</div>
            <button className="primary-cta" onClick={() => setLastSeasonTableOpen(false)}>Close final table</button>
          </section>
        </div>
      )}

      {locationSetupOpen && (
        <div className="modal-backdrop">
          <section className="challenge-modal location-modal" role="dialog" aria-modal="true" aria-labelledby="location-setup-title" onClick={(e) => e.stopPropagation()}>
            <p>Finish signing in</p>
            <h2 id="location-setup-title">Allow location for venue visits?</h2>
            <span className="modal-intro">DartsCoachUK uses your location only when you ask to check in or out of an authorised venue. Your exact location is not shown to other members.</span>
            <div className="location-benefits"><span><b>✓</b> Confirm arrival at an authorised venue</span><span><b>✓</b> Check out when you leave</span><span><b>✓</b> Control access at any time in Player settings</span></div>
            <label className="location-duration">Keep location use on for
              <select value={locationDuration} onChange={(e) => setLocationDuration(e.target.value as LocationAccessDuration)}>
                <option value="30m">30 minutes</option><option value="2h">2 hours</option><option value="4h">4 hours</option><option value="8h">8 hours</option><option value="until-off">Until I turn it off</option>
              </select>
            </label>
            {locationPermissionMessage && <div className="gps-message">{locationPermissionMessage}</div>}
            <div className="location-actions"><button className="primary-cta" onClick={() => requestLocationAccess(locationDuration)}>Allow location</button><button className="outline-button" onClick={() => { turnOffLocation(); setLocationSetupOpen(false); }}>Not now</button></div>
            <small className="device-permission-note">Your phone or browser controls the underlying permission and may show its own confirmation.</small>
          </section>
        </div>
      )}

      {view === "settings" && (
        <section className="player-settings-page">
          <section className="panel player-settings-centre" aria-labelledby="player-settings-title">
            <header className="settings-centre-head"><div><p>Player settings</p><h2 id="player-settings-title">Your account</h2><span>Manage your league account, preferences, privacy and security.</span></div><div className="settings-player-chip"><b>{currentPortalInitials}</b><span><strong>{currentPortalPlayerName}</strong><small>{accountSuspended ? "Account suspended" : "Active player account"}</small></span></div></header>
            <div className="settings-centre-layout">
              <nav className="settings-tabs" aria-label="Player setting sections">
                {([["account", "£", "Account & money"], ["profile", "●", "Personal details"], ["appearance", "◐", "Appearance"], ["notifications", "◉", "Notifications"], ["location", "⌖", "GPS & privacy"], ["security", "◆", "Security & account"]] as [PlayerSettingsTab, string, string][]).map(([id, icon, label]) => <button key={id} className={playerSettingsTab === id ? "active" : ""} onClick={() => { setPlayerSettingsTab(id); setSettingsMessage(""); }}><i>{icon}</i><span>{label}</span></button>)}
                <button className="settings-signout" onClick={signOutPlayer}>Sign out</button>
              </nav>
              <div className="settings-panel">
                {settingsMessage && <div className="settings-save-message">{settingsMessage}</div>}
                {playerSettingsTab === "account" && <section><div className="settings-section-title"><div><small>Payment account</small><h3>Balance and transactions</h3></div><Badge tone={accountSuspended ? "cream" : "green"}>{accountSuspended ? "Balance held" : "Active"}</Badge></div>{accountSuspended && <div className="held-balance-note"><b>£{(playerBalances[currentPortalPlayerName] ?? 0).toFixed(2)} held in your account</b><span>This unspent balance remains yours and can still be withdrawn below. Money already paid into the league is non-refundable.</span></div>}<div className="settings-wallet"><span><small>Available balance</small><b>£{(playerBalances[currentPortalPlayerName] ?? 0).toFixed(2)}</b><em>Only this unspent wallet balance is withdrawable. League, admin, entry and challenge fees already paid are not refunded.</em></span><div><small>Add money</small><nav>{[1, 5, 10].map((amount) => <button key={`add-${amount}`} disabled={accountSuspended} title={accountSuspended ? "Reactivate your account before adding money" : ""} onClick={() => { setPlayerBalances((old) => ({ ...old, [currentPortalPlayerName]: (old[currentPortalPlayerName] ?? 0) + amount })); setSettingsMessage(`£${amount.toFixed(2)} added to your account.`); }}>+ £{amount}</button>)}</nav><small>Withdraw money</small><nav className="withdraw-actions">{[1, 5, 10].map((amount) => <button key={`withdraw-${amount}`} disabled={(playerBalances[currentPortalPlayerName] ?? 0) < amount} onClick={() => { setPlayerBalances((old) => ({ ...old, [currentPortalPlayerName]: Math.max(0, (old[currentPortalPlayerName] ?? 0) - amount) })); setSettingsMessage(`£${amount.toFixed(2)} withdrawal requested from your unspent balance.`); }}>− £{amount}</button>)}</nav></div></div><div className="settings-info-row"><article><b>Payment method</b><span>Card ending •••• 2026</span><button onClick={() => setSettingsMessage("Payment-method update opened for verification.")}>Change</button></article><article><b>Transaction history</b><span>Credits, withdrawals and non-refundable league payments</span><button onClick={() => setSettingsMessage("Full transaction history opened.")}>View history</button></article></div><label className="settings-toggle"><span><b>Low-balance warning</b><small>Alert me when my balance drops below £5.</small></span><input type="checkbox" defaultChecked /></label></section>}
                {playerSettingsTab === "profile" && <form onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); const nextUsername = String(data.get("username") || playerUsername).trim().toLowerCase(); if (nextUsername !== playerUsername) { const error = usernameValidation(nextUsername); if (error) { setSettingsMessage(error); return; } if (leagueLive) { setSettingsMessage("Usernames cannot be changed while the league is live."); return; } if (usernameChangedThisSeason) { setSettingsMessage("You have already changed your username this season."); return; } setPlayerUsername(nextUsername); setUsernameChangedThisSeason(true); } setPlayerDetails({ displayName: String(data.get("displayName")), email: String(data.get("email")), mobile: String(data.get("mobile")), address: String(data.get("address")), emergencyName: String(data.get("emergencyName")), emergencyPhone: String(data.get("emergencyPhone")) }); setSettingsMessage(nextUsername !== playerUsername ? "Personal details and username saved. Your next username change becomes available next season." : "Personal details saved."); }}><div className="settings-section-title"><div><small>Player profile</small><h3>Personal details</h3></div><Badge tone="cream">Private</Badge></div><div className="settings-form-grid"><label>Display name<input name="displayName" defaultValue={newPlayerDashboard ? currentPortalPlayerName : playerDetails.displayName} required /></label><label>Member ID<input value={newPlayerDashboard ? "New account" : "MEMBER-0001"} readOnly /></label><label>Username<input name="username" key={playerUsername} defaultValue={playerUsername} disabled={leagueLive || usernameChangedThisSeason} pattern="[A-Za-z0-9._-]+" minLength={4} maxLength={24} /><small>{leagueLive ? "Locked while the league is live" : usernameChangedThisSeason ? "Changed once this season" : "May be changed once this season"}</small></label><label>Email address<input name="email" type="email" defaultValue={newPlayerDashboard ? newPlayerApplication?.email : playerDetails.email} required /></label><label>Mobile number<input name="mobile" type="tel" defaultValue={newPlayerDashboard ? newPlayerApplication?.mobile : playerDetails.mobile} required /></label><label className="settings-wide">Home address or area<textarea name="address" defaultValue={newPlayerDashboard ? newPlayerApplication?.preferredArea : playerDetails.address} required /></label><label>Emergency contact<input name="emergencyName" defaultValue={newPlayerDashboard ? newPlayerApplication?.emergencyName : playerDetails.emergencyName} required /></label><label>Emergency number<input name="emergencyPhone" type="tel" defaultValue={newPlayerDashboard ? newPlayerApplication?.emergencyPhone : playerDetails.emergencyPhone} required /></label></div><div className="settings-info-note">Usernames must be unique, pass the conduct filter and cannot be changed while a league is live. Changing your name, date of birth or identity information may require organiser verification.</div><button className="settings-primary" type="submit">Save personal details</button></form>}
                {playerSettingsTab === "appearance" && <section><div className="settings-section-title"><div><small>Personalise the app</small><h3>Theme and colours</h3></div></div><h4 className="settings-choice-label">Site theme</h4><div className="theme-choice-grid">{([["dark", "Dark", "Original dark league styling"], ["light", "Light", "Bright background and dark panels"], ["contrast", "High contrast", "Stronger borders and larger contrast"]] as const).map(([id, label, copy]) => <button key={id} className={playerTheme === id ? "selected" : ""} onClick={() => setPlayerTheme(id)}><i className={`theme-preview theme-preview-${id}`} /><b>{label}</b><span>{copy}</span></button>)}</div><h4 className="settings-choice-label">Accent colour</h4><div className="accent-choice-grid">{([["green", "Ladder green"], ["blue", "Board blue"], ["red", "Double red"], ["gold", "Champion gold"]] as const).map(([id, label]) => <button key={id} className={playerAccent === id ? "selected" : ""} onClick={() => setPlayerAccent(id)}><i className={`accent-dot accent-dot-${id}`} />{label}</button>)}</div><label className="settings-toggle"><span><b>Compact dashboard</b><small>Reduce spacing to show more information at once.</small></span><input type="checkbox" checked={compactLayout} onChange={(e) => setCompactLayout(e.target.checked)} /></label><label className="settings-toggle"><span><b>Reduce motion</b><small>Turn off non-essential animations and transitions.</small></span><input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} /></label><button className="settings-primary" onClick={() => setSettingsMessage("Appearance preferences saved.")}>Save appearance</button></section>}
                {playerSettingsTab === "notifications" && <section><div className="settings-section-title"><div><small>Communication preferences</small><h3>Notifications</h3></div><button className="settings-history-link" onClick={() => setView("notifications")}>View notification history</button></div><h4 className="settings-choice-label">Delivery channels</h4>{([["inApp", "In-app notifications", "Required — displayed on your dashboard and retained in the Notification Centre"], ["email", "Email", "League notices and match updates"], ["sms", "Text message", "Urgent deadlines and match changes"]] as const).map(([key, label, copy]) => <label className="settings-toggle" key={key}><span><b>{label}</b><small>{copy}</small></span><input type="checkbox" checked={key === "inApp" ? true : notificationSettings[key]} disabled={key === "inApp"} onChange={(e) => setNotificationSettings((old) => ({ ...old, [key]: e.target.checked }))} /></label>)}<h4 className="settings-choice-label">Notify me about</h4>{([["challenges", "New challenges and responses"], ["matches", "Match reminders and live starts"], ["deadlines", "Response and match deadlines"], ["results", "Results, standings and personal records"], ["venues", "Venue approvals and local availability"], ["marketing", "DartsCoachUK news and offers"]] as const).map(([key, label]) => <label className="settings-toggle compact-toggle" key={key}><span><b>{label}</b></span><input type="checkbox" checked={notificationSettings[key]} onChange={(e) => setNotificationSettings((old) => ({ ...old, [key]: e.target.checked }))} /></label>)}<label className="settings-toggle"><span><b>Quiet hours · 22:00–08:00</b><small>Urgent organiser notices will still be delivered.</small></span><input type="checkbox" checked={notificationSettings.quietHours} onChange={(e) => setNotificationSettings((old) => ({ ...old, quietHours: e.target.checked }))} /></label><button className="settings-primary" onClick={() => setSettingsMessage("Notification preferences saved. In-app history remains active; email and text delivery will follow these selections.")}>Save notifications</button></section>}
                {playerSettingsTab === "location" && <section><div className="settings-section-title"><div><small>Location controls</small><h3>GPS and privacy</h3></div><Badge tone={locationAccessEnabled ? "green" : "cream"}>{locationAccessEnabled ? "Enabled" : "Disabled"}</Badge></div><div className="location-status-card"><strong>{locationStatusText}</strong><span>GPS is only used for authorised-venue check-in and check-out. Exact coordinates are never shown to other players.</span></div>{locationAccessEnabled ? <button className="caution-wide" onClick={turnOffLocation}>Turn off location use</button> : <><label className="location-duration">Turn location use on for<select value={locationDuration} onChange={(e) => setLocationDuration(e.target.value as LocationAccessDuration)}><option value="30m">30 minutes</option><option value="2h">2 hours</option><option value="4h">4 hours</option><option value="8h">8 hours</option><option value="until-off">Until I turn it off</option></select></label><button className="settings-primary" onClick={() => requestLocationAccess(locationDuration)}>Turn on location</button></>}{locationPermissionMessage && <div className="gps-message">{locationPermissionMessage}</div>}<label className="settings-toggle"><span><b>Show venue availability</b><small>Allow members to see when you have registered that you will be at a venue.</small></span><input type="checkbox" defaultChecked /></label><label className="settings-toggle"><span><b>Allow challenge-first requests</b><small>Show a quick challenge button when you are checked in as an available player.</small></span><input type="checkbox" defaultChecked /></label><div className="settings-info-note">You can also remove the underlying permission from your phone or browser settings.</div></section>}
                {playerSettingsTab === "security" && <section><div className="settings-section-title"><div><small>Account protection</small><h3>Security and access</h3></div><Badge tone="green">Protected</Badge></div><div className="settings-info-row security-actions"><article><b>Password</b><span>Last changed 64 days ago</span><button onClick={() => setSettingsMessage("Password-change verification sent.")}>Change password</button></article><article><b>Two-step verification</b><span>{twoFactorEnabled ? "Enabled for sign-in" : "Add extra account protection"}</span><button onClick={() => { setTwoFactorEnabled((old) => !old); setSettingsMessage(twoFactorEnabled ? "Two-step verification disabled." : "Two-step verification enabled."); }}>{twoFactorEnabled ? "Turn off" : "Set up"}</button></article><article><b>Signed-in devices</b><span>1 current device</span><button onClick={() => setSettingsMessage("Other signed-in sessions have been removed.")}>Sign out others</button></article><article><b>Download my data</b><span>Account, matches and league activity</span><button onClick={() => setSettingsMessage("Your data export is being prepared.")}>Request export</button></article></div>{currentSeasonEntryClosed && <div className="settings-season-lock"><b>Not eligible for the current season</b><span>Reactivating restores your account and dashboard, but you cannot register for this league again until the next season.</span></div>}<div className="settings-danger-zone"><h4>Account controls</h4><p>Self-suspension during a live season removes you from that season immediately and prevents re-registration until the next season. Your unspent wallet balance is held and remains withdrawable. Account deletion automatically refunds only that remaining wallet balance; money already paid into the league is non-refundable.</p><div><button className="suspend-account-button" onClick={() => setPlayerAccountAction("suspend")}>{accountSuspended ? "Reactivate my account" : "Suspend my account"}</button><button className="delete-account-button" onClick={() => setPlayerAccountAction("delete")}>Delete my account</button></div></div></section>}
              </div>
            </div>
          </section>
        </section>
      )}

      {playerAccountAction && (
        <div className="modal-backdrop nested-settings-modal" onClick={() => setPlayerAccountAction(null)}>
          <form className="challenge-modal account-action-confirm" role="dialog" aria-modal="true" aria-labelledby="account-action-title" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            if (playerAccountAction === "delete" && String(data.get("confirm")).toUpperCase() !== "DELETE") return;
            const reason = String(data.get("reason"));
            if (playerAccountAction === "suspend") {
              if (accountSuspended) {
                setAccountSuspended(false);
                setPlayerStatuses((old) => ({ ...old, [currentPortalPlayerName]: "Active" }));
                setSettingsMessage(currentSeasonEntryClosed ? "Account reactivated. Your dashboard is available, but current-season entry remains closed until next season." : "Account reactivated.");
                addAudit("Player self-reactivated account", currentPortalPlayerName, "Account suspended", currentSeasonEntryClosed ? "Account active · current-season entry closed" : "Account active", reason);
              } else {
                const removedDuringSeason = leagueLive && !leagueStopped;
                setAccountSuspended(true);
                setPlayerStatuses((old) => ({ ...old, [currentPortalPlayerName]: "Suspended" }));
                if (removedDuringSeason) {
                  setCurrentSeasonEntryClosed(true);
                  setSeasonRegistered(false);
                  setRemovedSeasonPlayers((old) => old.includes(currentPortalPlayerName) ? old : [...old, currentPortalPlayerName]);
                }
                setSettingsMessage(removedDuringSeason ? `Account suspended and removed from the current season. £${(playerBalances[currentPortalPlayerName] ?? 0).toFixed(2)} remains held and withdrawable; re-entry opens next season.` : `Account suspended. £${(playerBalances[currentPortalPlayerName] ?? 0).toFixed(2)} remains held and withdrawable.`);
                addAudit("Player self-suspended account", currentPortalPlayerName, seasonRegistered ? "Active current-season player" : "Active account", removedDuringSeason ? "Removed from current season · eligible next season" : "Account suspended", reason);
              }
            } else {
              const refundableBalance = playerBalances[currentPortalPlayerName] ?? 0;
              setPlayerBalances((old) => ({ ...old, [currentPortalPlayerName]: 0 }));
              addAudit("Player deleted account", currentPortalPlayerName, `Wallet balance £${refundableBalance.toFixed(2)}`, `£${refundableBalance.toFixed(2)} automatic wallet refund · account closed`, `${reason}. League payments already made remain non-refundable.`);
              setPlayerSignedIn(false);
              setLoginMessage(`Account deleted. £${refundableBalance.toFixed(2)} of unspent wallet funds has been automatically refunded to your saved payment method. Money already paid into the league is non-refundable.`);
            }
            setPlayerAccountAction(null);
          }}>
            <button type="button" className="close" onClick={() => setPlayerAccountAction(null)}>×</button><p>Account confirmation</p><h2 id="account-action-title">{playerAccountAction === "delete" ? "Delete your account?" : accountSuspended ? "Reactivate your account?" : "Suspend your account?"}</h2><div className="rule-note">{playerAccountAction === "delete" ? "This permanently removes dashboard access. Your remaining unspent wallet balance is refunded automatically; league, admin, entry and challenge fees already paid are not refundable. Match, payment and audit records may be retained where required." : accountSuspended ? currentSeasonEntryClosed ? "Your account and dashboard will reactivate, but your removal from the current season remains in force. You may register again when the following season opens." : "Your account will reactivate and normal access will be restored." : "Suspending your account removes you from the current season immediately. You will not be able to re-register until the following season, even if you reactivate your account earlier. Your unspent wallet balance will be held and remains available to withdraw."}</div>{playerAccountAction === "delete" && <div className="account-refund-summary"><small>Automatic wallet refund</small><b>£{(playerBalances[currentPortalPlayerName] ?? 0).toFixed(2)}</b><span>Returned to your saved payment method. Previously paid league monies are excluded and remain non-refundable.</span></div>}<label>Reason<textarea name="reason" required placeholder="Tell the organisers why you are making this request…" /></label>{playerAccountAction === "delete" && <label>Type DELETE to confirm<input name="confirm" required autoComplete="off" /></label>}<div className="button-pair"><button className={playerAccountAction === "delete" ? "danger-button" : "primary-small"} type="submit">{playerAccountAction === "delete" ? `Delete account & refund £${(playerBalances[currentPortalPlayerName] ?? 0).toFixed(2)}` : accountSuspended ? "Reactivate account only" : "Suspend & leave season"}</button><button className="outline-button" type="button" onClick={() => setPlayerAccountAction(null)}>Go back</button></div>
          </form>
        </div>
      )}

      {pendingAdminInvite && (
        <div className="modal-backdrop" onClick={() => setPendingAdminInvite(null)}>
          <section className="challenge-modal admin-role-confirm" role="dialog" aria-modal="true" aria-labelledby="admin-role-confirm-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" onClick={() => setPendingAdminInvite(null)}>×</button><p>Admin permission invitation</p><h2 id="admin-role-confirm-title">Offer a role to {pendingAdminInvite.player}?</h2>
            <div className="rule-note">{pendingAdminInvite.tier === "full" ? "Full access gives complete control, including league setup, monetary controls and granting roles." : pendingAdminInvite.tier === "manager" ? "League manager access excludes league setup, monetary controls and granting roles." : "Operations & audit access is limited to organiser queues and audit history."}</div>
            <p className="modal-intro">The player receives an in-app notification and has no organiser access until they accept. The invitation and acceptance are retained in the audit history.</p>
            <div className="button-pair"><button className="primary-small" onClick={() => { setAdminInvitations((old) => [...old.filter((item) => item.player !== pendingAdminInvite.player), { ...pendingAdminInvite, status: "Pending" }]); addAudit("Admin role offered", pendingAdminInvite.player, "Player access only", `${pendingAdminInvite.tier} admin invitation pending`, "Full administrator confirmed permission invitation"); setPendingAdminInvite(null); }}>Confirm and notify player</button><button className="outline-button" onClick={() => setPendingAdminInvite(null)}>Cancel</button></div>
          </section>
        </div>
      )}

      {pendingAdminRevoke && (
        <div className="modal-backdrop" onClick={() => setPendingAdminRevoke(null)}>
          <section className="challenge-modal admin-role-confirm" role="dialog" aria-modal="true" aria-labelledby="admin-revoke-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" onClick={() => setPendingAdminRevoke(null)}>×</button><p>Admin-only security action</p><h2 id="admin-revoke-title">{pendingAdminRevoke.status === "Pending" ? "Cancel this admin invitation?" : "Remove administrator privileges?"}</h2>
            <div className="rule-note">{pendingAdminRevoke.player} will {pendingAdminRevoke.status === "Pending" ? "no longer be able to accept this invitation" : "immediately lose the Organiser tab and every administrator function"}. Their player account and league participation are unaffected.</div>
            <label>Reason for removal<textarea id="admin-revoke-reason" required placeholder="Required for the audit history…" /></label>
            <div className="button-pair"><button className="danger-button" onClick={() => { const reason = (document.getElementById("admin-revoke-reason") as HTMLTextAreaElement)?.value.trim(); if (!reason) return; const revoked = pendingAdminRevoke; setAdminInvitations((old) => old.filter((item) => item.player !== revoked.player)); if (revoked.player === currentPortalPlayerName && accountKind === "player") { setCurrentAdminTier(null); setView("dashboard"); } addAudit("Admin privileges removed", revoked.player, `${revoked.tier} · ${revoked.status}`, "Player access only", reason); setPendingAdminRevoke(null); }}>Confirm removal</button><button className="outline-button" onClick={() => setPendingAdminRevoke(null)}>Keep access</button></div>
          </section>
        </div>
      )}

      {locationReenableOpen && (
        <div className="modal-backdrop" onClick={() => { setLocationReenableOpen(false); setPendingGpsAction(null); }}>
          <section className="challenge-modal location-modal" role="dialog" aria-modal="true" aria-labelledby="location-reenable-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" aria-label="Close location request" onClick={() => { setLocationReenableOpen(false); setPendingGpsAction(null); }}>×</button>
            <p>Location is off</p><h2 id="location-reenable-title">{pendingGpsAction ? "Location is needed for GPS confirmation" : "Turn location back on before going out"}</h2>
            <span className="modal-intro">{pendingGpsAction ? "Choose how long the app may use location, then return to your venue and press the GPS button again." : "Choose how long location use should stay active. It will switch off automatically when the time ends."}</span>
            <label className="location-duration">Keep location use on for<select value={locationDuration} onChange={(e) => setLocationDuration(e.target.value as LocationAccessDuration)}><option value="30m">30 minutes</option><option value="2h">2 hours</option><option value="4h">4 hours</option><option value="8h">8 hours</option><option value="until-off">Until I turn it off</option></select></label>
            {locationPermissionMessage && <div className="gps-message">{locationPermissionMessage}</div>}
            <div className="location-actions"><button className="primary-cta" onClick={() => requestLocationAccess(locationDuration, () => { if (!pendingGpsAction) setGoingOutOpen(true); else setGpsMessage("Location is enabled. Press the GPS check-in or check-out button again."); setPendingGpsAction(null); })}>Allow and continue</button><button className="outline-button" onClick={() => { setLocationReenableOpen(false); setPendingGpsAction(null); }}>Cancel</button></div>
          </section>
        </div>
      )}

      {goingOutOpen && (
        <div className="modal-backdrop" onClick={() => setGoingOutOpen(false)}>
          <form className="challenge-modal going-out-modal" role="dialog" aria-modal="true" aria-labelledby="going-out-title" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const venue = organiserVenues.find((item) => item.id === String(data.get("venueId")));
            if (!venue) return;
            setVenueAttendances((old) => [{
              id: `attend-${Date.now()}`,
              venueId: venue.id,
              person: "Anonymous Player 06",
              role: String(data.get("role")) as VenueAttendance["role"],
              date: String(data.get("date")),
              startTime: String(data.get("startTime")),
              endTime: String(data.get("endTime")),
              note: String(data.get("note")),
              status: "Planned",
            }, ...old]);
            setGoingOutOpen(false);
          }}>
            <button type="button" className="close" aria-label="Close going out form" onClick={() => setGoingOutOpen(false)}>×</button><p>Player plans</p><h2 id="going-out-title">I’m going out</h2><span className="modal-intro">Register where you will be so players can challenge you and match officials can be requested more easily.</span>
            <div className="venue-form-grid"><label className="venue-form-wide">Authorised venue<select name="venueId" required defaultValue=""><option value="" disabled>Choose a venue</option>{organiserVenues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name} · {venue.area}</option>)}</select></label><label>What are you available for?<select name="role" required><option value="Player">Player — available to challenge</option><option>Referee</option><option>Witness</option><option value="Social">Socialising only</option></select></label><label>Date<input name="date" type="date" required /></label><label>Arriving at<input name="startTime" type="time" required /></label><label>Leaving at<input name="endTime" type="time" required /></label><label className="venue-form-wide">Note<textarea name="note" required placeholder="For example: available for one challenge, able to referee until 9pm, or just meeting friends…" /></label></div>
            <div className="role-visibility-note"><b>Your selected status controls what others can request</b><span>Players receive a Challenge first button. Referees and witnesses receive an invitation button. Social visits are shown for information only.</span></div><button className="primary-cta" type="submit">Add my venue plan</button>
          </form>
        </div>
      )}

      {attendanceUpdateId && (() => {
        const attendance = venueAttendances.find((entry) => entry.id === attendanceUpdateId);
        if (!attendance) return null;
        return <div className="modal-backdrop" onClick={() => setAttendanceUpdateId("")}>
          <form className="challenge-modal attendance-update-modal" role="dialog" aria-modal="true" aria-labelledby="attendance-update-title" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            setVenueAttendances((old) => old.map((entry) => entry.id === attendance.id ? { ...entry, role: String(data.get("role")) as VenueAttendance["role"], status: String(data.get("status")) as VenueAttendance["status"], note: String(data.get("note")) } : entry));
            setAttendanceUpdateId("");
          }}>
            <button type="button" className="close" aria-label="Close status update" onClick={() => setAttendanceUpdateId("")}>×</button><p>Live venue status</p><h2 id="attendance-update-title">Update while you’re out</h2><span className="modal-intro">If somebody challenges you in person, mark yourself as playing so other members know you are temporarily unavailable.</span><div className="venue-form-grid"><label>Available as<select name="role" defaultValue={attendance.role}><option value="Player">Player — available to challenge</option><option>Referee</option><option>Witness</option><option value="Social">Socialising only</option></select></label><label>Current status<select name="status" defaultValue={attendance.status}><option>Planned</option><option>Checked in</option><option>Playing</option><option>Unavailable</option><option>Checked out</option></select></label><label className="venue-form-wide">Current note<textarea name="note" defaultValue={attendance.note} required /></label></div><div className="role-visibility-note"><b>Playing and unavailable statuses pause new requests</b><span>Members can still see that you are at the venue, but challenge and official-invitation buttons will be hidden until you change your status again.</span></div><button className="primary-cta" type="submit">Update live status</button>
          </form>
        </div>;
      })()}

      {selectedVenueDetails && (
        <div className="modal-backdrop" onClick={() => setSelectedVenueDetails(null)}>
          <section className="challenge-modal venue-details-modal" role="dialog" aria-modal="true" aria-labelledby="venue-details-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" aria-label="Close venue details" onClick={() => setSelectedVenueDetails(null)}>×</button><p>Approved venue register</p><h2 id="venue-details-title">{selectedVenueDetails.name}</h2>
            <div className="venue-detail-grid"><span><small>Address</small><b>{selectedVenueDetails.address}</b><em>{selectedVenueDetails.postcode}</em></span><span><small>Boards</small><b>{selectedVenueDetails.boards}</b><em>Available match boards</em></span><span><small>Availability</small><b>{selectedVenueDetails.availability}</b></span><span><small>Venue contact</small><b>{selectedVenueDetails.contactName}</b><em>{selectedVenueDetails.contactPhone}<br />{selectedVenueDetails.contactEmail}</em></span><span className="venue-detail-wide"><small>Facilities and access</small><b>{selectedVenueDetails.facilities}</b></span></div>
            <div className="venue-attendee-section"><div className="panel-title"><div><h3>Who will be there</h3><p>Players and available match officials</p></div><button onClick={() => { setAttendanceRegistrationVenue(selectedVenueDetails); setSelectedVenueDetails(null); }}>Register that I’ll be there</button></div>
              {venueAttendances.filter((entry) => entry.venueId === selectedVenueDetails.id).length ? venueAttendances.filter((entry) => entry.venueId === selectedVenueDetails.id).map((entry) => <article key={entry.id}><div className="attendee-identity"><Badge tone={entry.role === "Player" ? "green" : "cream"}>{entry.role === "Social" ? "Socialising" : entry.role}</Badge><strong>{entry.person}</strong><span>{entry.date} · {entry.startTime}–{entry.endTime}</span><small>{entry.note}</small><em className={`attendance-status status-${entry.status.toLowerCase().replaceAll(" ", "-")}`}>{entry.status}</em></div>{entry.person === "Anonymous Player 06" ? <div className="own-attendance-actions"><button onClick={() => { setAttendanceUpdateId(entry.id); setGpsMessage(""); }}>Update status</button>{entry.status !== "Checked in" && entry.status !== "Checked out" && <button onClick={() => gpsAttendance(entry.id, "in")}>GPS check in</button>}{entry.status === "Checked in" && <button onClick={() => gpsAttendance(entry.id, "out")}>GPS check out</button>}<button className="caution" onClick={() => setVenueAttendances((old) => old.filter((item) => item.id !== entry.id))}>Cancel</button></div> : entry.status === "Playing" || entry.status === "Unavailable" || entry.status === "Checked out" ? <span className="social-only-label">{entry.status}</span> : entry.role === "Player" ? <button onClick={() => { setSelectedVenueDetails(null); openChallenge(entry.person); }}>Challenge first</button> : entry.role === "Social" ? <span className="social-only-label">Socialising only</span> : <button disabled={invitedAttendanceIds.includes(entry.id)} onClick={() => setInvitedAttendanceIds((old) => [...old, entry.id])}>{invitedAttendanceIds.includes(entry.id) ? "Invitation sent" : `Invite as ${entry.role.toLowerCase()}`}</button>}</article>) : <div className="empty-attendance"><b>○</b><span>Nobody has registered for this venue yet.</span></div>}
              {gpsMessage && <div className="gps-message">{gpsMessage}</div>}
            </div><button className="outline-button" onClick={() => setSelectedVenueDetails(null)}>Close details</button>
          </section>
        </div>
      )}

      {attendanceRegistrationVenue && (
        <div className="modal-backdrop" onClick={() => setAttendanceRegistrationVenue(null)}>
          <form className="challenge-modal attendance-modal" role="dialog" aria-modal="true" aria-labelledby="attendance-title" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            setVenueAttendances((old) => [{
              id: `attend-${Date.now()}`,
              venueId: attendanceRegistrationVenue.id,
              person: "Anonymous Player 06",
              role: String(data.get("role")) as VenueAttendance["role"],
              date: String(data.get("date")),
              startTime: String(data.get("startTime")),
              endTime: String(data.get("endTime")),
              note: String(data.get("note")),
              status: "Planned",
            }, ...old]);
            setSelectedVenueDetails(attendanceRegistrationVenue);
            setAttendanceRegistrationVenue(null);
          }}>
            <button type="button" className="close" aria-label="Close attendance registration" onClick={() => setAttendanceRegistrationVenue(null)}>×</button><p>Venue availability</p><h2 id="attendance-title">I’ll be at {attendanceRegistrationVenue.name}</h2><span className="modal-intro">Let other members know when you are available for a challenge, to referee, to witness, or are simply socialising.</span><div className="venue-form-grid"><label>Register as<select name="role" required><option value="Player">Player — available to challenge</option><option>Referee</option><option>Witness</option><option value="Social">Socialising only</option></select></label><label>Date<input name="date" type="date" required /></label><label>Available from<input name="startTime" type="time" required /></label><label>Available until<input name="endTime" type="time" required /></label><label className="venue-form-wide">Availability note<textarea name="note" required placeholder="For example: available for one challenge, happy to referee two matches, or just meeting friends…" /></label></div><div className="rule-note">This availability will be visible to league members viewing the venue. You can cancel it later.</div><button className="primary-cta" type="submit">Register my availability</button>
          </form>
        </div>
      )}

      {organiserVenueOpen && (
        <div className="modal-backdrop" onClick={() => setOrganiserVenueOpen(false)}>
          <form className="challenge-modal venue-recommendation-modal" role="dialog" aria-modal="true" aria-labelledby="organiser-add-venue-title" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            if (!data.get("safe") || !data.get("oche") || !data.get("lighting")) return;
            const venue: ApprovedVenue = {
              id: `approved-${Date.now()}`,
              name: String(data.get("name")),
              area: String(data.get("area")),
              address: String(data.get("address")),
              postcode: String(data.get("postcode")),
              contactName: String(data.get("contactName")),
              contactPhone: String(data.get("contactPhone")),
              contactEmail: String(data.get("contactEmail")),
              boards: Number(data.get("boards")),
              availability: String(data.get("availability")),
              facilities: [...data.getAll("facilities").map(String), String(data.get("additionalFacilities") || "").trim()].filter(Boolean).join(" · ") || "No additional facilities selected",
              notes: String(data.get("notes")),
            };
            setOrganiserVenues((old) => [venue, ...old]);
            addAudit("Venue added by organiser", venue.name, "Not registered", "Approved venue", String(data.get("reason")));
            setOrganiserVenueOpen(false);
          }}>
            <button type="button" className="close" aria-label="Close add venue form" onClick={() => setOrganiserVenueOpen(false)}>×</button><p>Organiser venue control</p><h2 id="organiser-add-venue-title">Add an authorised venue</h2><span className="modal-intro">Organiser-added venues enter the approved register immediately.</span>
            <div className="venue-form-grid"><label>Venue name<input name="name" required /></label><label>Town or area<input name="area" required /></label><label>Postcode<input name="postcode" required /></label><label>Available dartboards<input name="boards" type="number" min="1" max="30" required /></label><label className="venue-form-wide">Full address<input name="address" required /></label><label>Venue contact name<input name="contactName" required /></label><label>Contact phone<input name="contactPhone" type="tel" required /></label><label>Contact email<input name="contactEmail" type="email" required /></label><label>Match availability<input name="availability" required /></label>
              <fieldset className="venue-facilities venue-form-wide"><legend>Facilities and access</legend><div>{["Free parking", "Paid parking", "Disabled parking", "Step-free access", "Accessible toilet", "Public transport nearby", "Refreshments", "Hot food", "Licensed bar", "Wi-Fi", "Seating for spectators", "Practice board"].map((facility) => <label key={facility}><input name="facilities" type="checkbox" value={facility} /> {facility}</label>)}</div><label className="additional-facilities">Additional facilities or access information<textarea name="additionalFacilities" /></label></fieldset>
              <label className="venue-form-wide">Organiser notes<textarea name="notes" /></label><label className="venue-form-wide">Reason for adding venue<textarea name="reason" required placeholder="Required for the audit history…" /></label></div>
            <fieldset className="venue-compliance"><legend>Required playing conditions confirmed</legend><label><input name="oche" type="checkbox" required /> Correctly installed board and regulation oche</label><label><input name="lighting" type="checkbox" required /> Suitable board lighting</label><label><input name="safe" type="checkbox" required /> Safe and suitable playing area</label></fieldset>
            <button className="primary-cta" type="submit">Add to approved venue register</button>
          </form>
        </div>
      )}

      {venueRecommendationOpen && (
        <div className="modal-backdrop" onClick={() => setVenueRecommendationOpen(false)}>
          <form className="challenge-modal venue-recommendation-modal" role="dialog" aria-modal="true" aria-labelledby="recommend-venue-title" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            if (!data.get("safe") || !data.get("oche") || !data.get("lighting")) return;
            const recommendation: VenueRecommendation = {
              id: `venue-${Date.now()}`,
              submittedBy: "Anonymous Player 06",
              name: String(data.get("name")),
              address: String(data.get("address")),
              postcode: String(data.get("postcode")),
              contactName: String(data.get("contactName")),
              contactPhone: String(data.get("contactPhone")),
              contactEmail: String(data.get("contactEmail")),
              boards: Number(data.get("boards")),
              availability: String(data.get("availability")),
              facilities: [...data.getAll("facilities").map(String), String(data.get("additionalFacilities") || "").trim()].filter(Boolean).join(" · ") || "No additional facilities selected",
              notes: String(data.get("notes")),
              status: "Pending approval",
            };
            setVenueRecommendations((old) => [recommendation, ...old]);
            addAudit("Venue recommended by player", recommendation.name, "Not registered", "Pending organiser approval", `${recommendation.address} · submitted by Anonymous Player 06`);
            setVenueRecommendationSent(true);
          }}>
            <button type="button" className="close" aria-label="Close venue recommendation" onClick={() => setVenueRecommendationOpen(false)}>×</button>
            {!venueRecommendationSent ? <><p>Player venue proposal</p><h2 id="recommend-venue-title">Recommend a new venue</h2><span className="modal-intro">Complete as much information as possible. The venue cannot be used for an official match until an organiser approves it.</span>
              <div className="venue-form-grid"><label>Venue name<input name="name" required /></label><label>Postcode<input name="postcode" required /></label><label className="venue-form-wide">Full address<input name="address" required /></label><label>Venue contact name<input name="contactName" required /></label><label>Contact phone<input name="contactPhone" type="tel" required /></label><label>Contact email<input name="contactEmail" type="email" required /></label><label>Available dartboards<input name="boards" type="number" min="1" max="30" required /></label><label className="venue-form-wide">Match availability<input name="availability" placeholder="Days and suitable playing times…" required /></label>
                <fieldset className="venue-facilities venue-form-wide"><legend>Facilities and access</legend><div>{["Free parking", "Paid parking", "Disabled parking", "Step-free access", "Accessible toilet", "Public transport nearby", "Refreshments", "Hot food", "Licensed bar", "Wi-Fi", "Seating for spectators", "Practice board"].map((facility) => <label key={facility}><input name="facilities" type="checkbox" value={facility} /> {facility}</label>)}</div><label className="additional-facilities">Additional facilities or access information<textarea name="additionalFacilities" placeholder="Add anything relevant that is not listed above…" /></label></fieldset>
                <label className="venue-form-wide">Additional venue information<textarea name="notes" placeholder="Venue charges, booking process or anything else the organiser should know…" /></label></div>
              <fieldset className="venue-compliance"><legend>Required playing conditions</legend><label><input name="oche" type="checkbox" required /> Correctly installed board and regulation oche</label><label><input name="lighting" type="checkbox" required /> Suitable board lighting</label><label><input name="safe" type="checkbox" required /> Safe and suitable playing area</label></fieldset>
              <button className="primary-cta" type="submit">Send to organiser for approval</button>
            </> : <div className="success"><b>✓</b><h2>Recommendation sent</h2><p>The venue is now awaiting organiser approval. You can track its status in the Venues area.</p><button type="button" className="outline-button" onClick={() => setVenueRecommendationOpen(false)}>View venue directory</button></div>}
          </form>
        </div>
      )}

      {venueDecision && (() => {
        const venue = venueRecommendations.find((item) => item.id === venueDecision.id);
        if (!venue) return null;
        return <div className="modal-backdrop" onClick={() => setVenueDecision(null)}>
          <form className="challenge-modal" role="dialog" aria-modal="true" aria-labelledby="venue-decision-title" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            const reason = String(new FormData(e.currentTarget).get("reason"));
            setVenueRecommendations((old) => old.map((item) => item.id === venue.id ? { ...item, status: venueDecision.action } : item));
            setAdminOutcomes((old) => ({ ...old, [venue.id]: venueDecision.action }));
            addAudit(`Venue ${venueDecision.action.toLowerCase()}`, venue.name, "Pending approval", venueDecision.action, reason);
            setVenueDecision(null);
          }}>
            <button type="button" className="close" aria-label="Close venue decision" onClick={() => setVenueDecision(null)}>×</button><p>Organiser venue decision</p><h2 id="venue-decision-title">{venueDecision.action}: {venue.name}</h2><label>Decision reason<textarea name="reason" required placeholder={venueDecision.action === "Approved" ? "Record the checks completed and approval basis…" : venueDecision.action === "Changes requested" ? "Explain which information or venue changes are required…" : "Record why this venue cannot be authorised…"} /></label><div className="rule-note">The decision will update the player’s venue status and be added to the audit history.</div><button className={venueDecision.action === "Rejected" ? "danger-button" : "primary-cta"} type="submit">Confirm {venueDecision.action.toLowerCase()}</button><button className="reset-test" type="button" onClick={() => setVenueDecision(null)}>Go back</button>
          </form>
        </div>;
      })()}

      {matchLobbyOpen && matchArrangement && guestOfficial && (
        <div className="modal-backdrop" onClick={() => setMatchLobbyOpen(false)}>
          <section className="challenge-modal match-lobby-modal" role="dialog" aria-modal="true" aria-labelledby="match-lobby-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" onClick={() => setMatchLobbyOpen(false)}>×</button>
            <p>Match-day control</p><h2 id="match-lobby-title">Match lobby</h2>
            <div className="lobby-match-summary"><span><small>Fixture</small><b>Anonymous Player 06 vs {matchArrangement.opponent}</b></span><span><small>Venue</small><b>{matchArrangement.venue}</b></span><span><small>Start</small><b>{matchArrangement.date} · {matchArrangement.time}</b></span></div>
            <div className="lobby-grid">
              <section><h3>GPS attendance confirmation</h3><div className={`gps-lobby-check ${matchCheckIns.gps ? "complete" : ""}`}><span><b>{matchCheckIns.gps ? "All participants are at the venue" : "Confirm everyone is at the venue"}</b><small>{matchCheckIns.gps ? `GPS confirms Anonymous Player 06, ${matchArrangement.opponent.split(" ")[0]} and ${guestOfficial.name.split(" ")[0]} at ${matchArrangement.venue}.` : "Venue location and participant attendance have not been confirmed."}</small></span><em>{matchCheckIns.gps ? "✓ GPS verified" : "Not verified"}</em></div><button className="gps-refresh-button" onClick={() => setMatchCheckIns({ gps: true })}>{matchCheckIns.gps ? "Refresh GPS confirmation" : "Confirm with GPS"}</button></section>
              <section><h3>Match setup</h3><label>Board or lane<select value={matchBoard} onChange={(e) => setMatchBoard(e.target.value)}><option>Board 1</option><option>Board 2</option><option>Board 3</option><option>Board 4</option></select></label><div className="lobby-authority"><small>Scoring authority</small><b>{scoringAuthorityLabel}</b><span>{guestOfficial.role === "Referee" ? "Both player accounts are read only." : `${scoringAccount} can score; the other player and witness are read only.`}</span></div>{([["player", "Anonymous Player 06 ready"], ["opponent", `${matchArrangement.opponent.split(" ")[0]} ready`], ["official", `${guestOfficial.name.split(" ")[0]} ready`]] as const).map(([key, label]) => <button key={key} className={matchReady[key] ? "complete" : ""} onClick={() => setMatchReady((old) => ({ ...old, [key]: !old[key] }))}><span><b>{label}</b><small>{matchReady[key] ? "Confirmed and ready" : "Confirmation required"}</small></span><em>{matchReady[key] ? "✓" : "Ready"}</em></button>)}</section>
            </div>
            <div className={`lobby-gate ${lobbyReady ? "ready" : ""}`}><span><b>{lobbyReady ? "Everyone is ready" : "Match start is locked"}</b><small>{lobbyReady ? "GPS attendance, venue, board and all three Ready confirmations are complete." : "Confirm the venue by GPS and ask both players and the official to press Ready."}</small></span><button disabled={!lobbyReady} onClick={() => { setLiveMatchStarted(true); setMatchLobbyOpen(false); setMatchViewRole(guestOfficial.role === "Referee" ? "official" : scoringAccount === "Anonymous Player 06" ? "player" : "spectator"); setView("scorer"); addAudit("Match started", `Anonymous Player 06 vs ${matchArrangement.opponent}`, "Scheduled", `Live · ${matchBoard}`, `${guestOfficial.name} checked in as ${guestOfficial.role}`); }}>Start match</button></div>
            <button className="lobby-problem" onClick={() => { setMatchLobbyOpen(false); setMatchDisputeOpen(true); }}>Report a match-day problem</button>
          </section>
        </div>
      )}

      {matchHistoryOpen && (
        <div className="modal-backdrop" onClick={() => setMatchHistoryOpen(false)}>
          <section className="challenge-modal match-history-modal" role="dialog" aria-modal="true" aria-labelledby="match-history-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" onClick={() => setMatchHistoryOpen(false)}>×</button>
            <p>Official match record</p><h2 id="match-history-title">Anonymous Player 06 vs {officialMatchOpponent}</h2>
            <div className="history-result-summary"><span><small>Result</small><b>{score.playerOneLegs}–{score.playerTwoLegs}</b></span><span><small>Anonymous Player 06 average</small><b>{playerOneAverage}</b></span><span><small>{officialMatchOpponent.split(" ")[0]} average</small><b>{opponentAverage}</b></span></div>
            <div className="modal-leg-history">{matchLegHistory.map((leg) => <article key={leg.leg}><header><b>Leg {leg.leg}</b><span>{leg.winner}</span></header><div><small>Anonymous Player 06</small><span className="history-visit-chips">{leg.playerOne.length ? <VisitChips visits={leg.playerOne} /> : "—"}</span></div><div><small>{officialMatchOpponent.split(" ")[0]}</small><span className="history-visit-chips">{leg.opponent.length ? <VisitChips visits={leg.opponent} /> : "—"}</span></div></article>)}</div>
            <button className="outline-button" onClick={() => setMatchHistoryOpen(false)}>Close history</button>
          </section>
        </div>
      )}

      {matchSummaryOpen && (
        <div className="modal-backdrop match-summary-backdrop" onClick={() => setMatchSummaryOpen(false)}>
          <section className="challenge-modal match-summary-modal" role="dialog" aria-modal="true" aria-labelledby="match-summary-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" onClick={() => setMatchSummaryOpen(false)}>×</button>
            <p>Official final statistics</p><h2 id="match-summary-title">{matchWinner ?? "Match summary"} · {score.playerOneLegs}–{score.playerTwoLegs}</h2>
            <div className="final-stat-comparison">
              <header><b>Anonymous Player 06</b><span>Statistic</span><b>{officialMatchOpponent}</b></header>
              {([
                ["Legs won", playerOneMatchStats.legsWon, opponentMatchStats.legsWon],
                ["Total darts", playerOneMatchStats.totalDarts, opponentMatchStats.totalDarts],
                ["Match average", playerOneMatchStats.average, opponentMatchStats.average],
                ["First 9 average", playerOneMatchStats.firstNine, opponentMatchStats.firstNine],
                ["Highest checkout", playerOneMatchStats.highestCheckout, opponentMatchStats.highestCheckout],
                ["Best leg", playerOneMatchStats.bestLeg, opponentMatchStats.bestLeg],
                ["180s", playerOneMatchStats.maximums, opponentMatchStats.maximums],
                ["140+", playerOneMatchStats.scores140, opponentMatchStats.scores140],
                ["100+", playerOneMatchStats.scores100, opponentMatchStats.scores100],
                ["Darts at double", playerOneMatchStats.attempts, opponentMatchStats.attempts],
                ["Checkouts", playerOneMatchStats.checkouts, opponentMatchStats.checkouts],
                ["Checkout rate", playerOneMatchStats.checkoutPercent, opponentMatchStats.checkoutPercent],
              ] as const).map(([label, playerOneValue, opponentValue]) => <div key={label}><b>{playerOneValue}</b><span>{label}</span><b>{opponentValue}</b></div>)}
            </div>
            <div className="final-stat-actions"><button className="outline-button" onClick={() => { setMatchSummaryOpen(false); setMatchHistoryOpen(true); }}>View match history</button><button className="primary-cta" onClick={() => setMatchSummaryOpen(false)}>Close statistics</button></div>
          </section>
        </div>
      )}

      {pendingCheckout && (
        <div className="modal-backdrop checkout-confirm-backdrop">
          <section className="challenge-modal checkout-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-confirm-title">
            <p>Leg checkout</p><h2 id="checkout-confirm-title">Which dart checked out?</h2>
            <div className="checkout-confirm-score"><small>{pendingCheckout.player === "playerOne" ? "Anonymous Player 06" : officialMatchOpponent}</small><b>{pendingCheckout.value}</b><span>game shot</span></div>
            {pendingCheckout.darts ? <div className="checkout-selected-confirm"><span>Checkout recorded on</span><b>Dart {pendingCheckout.darts}</b><button onClick={() => confirmCheckout(pendingCheckout.darts!)}>Confirm game shot</button></div> : <div className="checkout-dart-buttons">{([1, 2, 3] as const).filter((darts) => darts >= (minimumCheckoutDarts(pendingCheckout.value) ?? 3)).map((darts) => <button key={darts} onClick={() => confirmCheckout(darts)}><b>Dart {darts}</b><span>{darts === 1 ? "First dart" : darts === 2 ? "Second dart" : "Third dart"}</span></button>)}</div>}
            <div className="rule-note">The selected checkout dart is used for the live average and least-darts leg record.</div>
            <button className="reset-test" onClick={() => { setPendingCheckout(null); setScoreHistory((old) => old.slice(0, -1)); }}>Go back</button>
          </section>
        </div>
      )}

      {pendingDoubleAttempt && (
        <div className="modal-backdrop double-attempt-backdrop">
          <section className="challenge-modal double-attempt-modal" role="dialog" aria-modal="true" aria-labelledby="double-attempt-title">
            <p>Checkout opportunity</p><h2 id="double-attempt-title">How many darts were thrown at double?</h2>
            <div className="checkout-confirm-score"><small>{pendingDoubleAttempt.player === "playerOne" ? "Anonymous Player 06" : officialMatchOpponent}</small><b>{pendingDoubleAttempt.remainingBefore}</b><span>double opportunity during this visit</span></div>
            <div className="checkout-dart-buttons double-attempt-buttons">{[0, 1, 2, 3].map((darts) => <button key={darts} disabled={darts > pendingDoubleAttempt.maximumAttempts} onClick={() => { const pending = pendingDoubleAttempt; setPendingDoubleAttempt(null); submitScore(pending.value, darts); }}><b>{darts}</b><span>{darts > pendingDoubleAttempt.maximumAttempts ? "Not possible in this visit" : darts === 0 ? "No dart at double" : `${darts} dart${darts === 1 ? "" : "s"} at double`}</span></button>)}</div>
            <div className="rule-note">A maximum of {pendingDoubleAttempt.maximumAttempts} dart{pendingDoubleAttempt.maximumAttempts === 1 ? "" : "s"} at double was possible from this visit. Impossible selections remain visible but cannot be pressed.</div>
          </section>
        </div>
      )}

      {scoreCorrectionOpen && (
        <div className="modal-backdrop" onClick={() => setScoreCorrectionOpen(false)}>
          <form className="challenge-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); undoLastVisit(String(data.get("reason"))); setScoreCorrectionOpen(false); }}>
            <button type="button" className="close" onClick={() => setScoreCorrectionOpen(false)}>×</button><p>Audited correction</p><h2>Correct the last visit</h2>
            <div className="rule-note">The previous score state will be restored. The reason, old score and corrected score are retained in the match audit trail.</div>
            <label>Reason for correction<select name="reason" required defaultValue=""><option value="" disabled>Choose a reason</option><option>Score entered incorrectly</option><option>Wrong player selected</option><option>Bust recorded incorrectly</option><option>Checkout entered incorrectly</option><option>Other agreed correction</option></select></label>
            <button className="primary-cta" type="submit">Restore previous score</button>
          </form>
        </div>
      )}

      {matchDisputeOpen && (
        <div className="modal-backdrop" onClick={() => setMatchDisputeOpen(false)}>
          <form className="challenge-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); const detail = String(data.get("detail")); setMatchDispute(detail); setMatchPaused(true); setMatchDisputeOpen(false); addAudit("Live match dispute raised", `Anonymous Player 06 vs ${officialMatchOpponent}`, "Match live", "Paused · organiser review required", detail); }}>
            <button type="button" className="close" onClick={() => setMatchDisputeOpen(false)}>×</button><p>Match protection</p><h2>Pause and report a problem</h2>
            <label>Problem type<select required><option>Score disagreement</option><option>Playing conditions</option><option>Player conduct</option><option>Official unavailable</option><option>Technical problem</option><option>Other</option></select></label>
            <label>What happened?<textarea name="detail" required placeholder="Give the organiser enough detail to review the issue…" /></label>
            <div className="rule-note">Submitting this report pauses scoring, preserves the current score and sends the full match audit trail to the organiser queue.</div>
            <button className="danger-button" type="submit">Pause match and escalate</button>
          </form>
        </div>
      )}

      {matchDispute && matchPaused && !matchDisputeOpen && (
        <div className="match-dispute-toast"><b>Match paused for organiser review</b><span>{matchDispute}</span><button onClick={() => { setMatchPaused(false); setMatchDispute(""); addAudit("Live match resumed", `Anonymous Player 06 vs ${officialMatchOpponent}`, "Paused for review", "Live scoring restored", "Prototype organiser resolution"); }}>Prototype: organiser resolves</button></div>
      )}

      {notificationCase && (
        <div className="modal-backdrop" onClick={() => setNotificationCase(null)}>
          <form className="challenge-modal notification-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const channels = ["In-app", ...data.getAll("channel").map(String)];
            const message = String(data.get("message") || "");
            setAdminNotifications((old) => ({ ...old, [notificationCase.caseId]: channels.join(", ") }));
            setAdminOutcomes((old) => ({ ...old, [notificationCase.caseId]: "Resolved by notification" }));
            if (notificationCase.recipients.includes("Anonymous Player 06") || notificationCase.recipients.includes(currentPortalPlayerName)) {
              addPlayerNotification(notificationCase.subject, message, "deadline", "urgent", channels);
            }
            setNotificationCase(null);
          }}>
            <button type="button" className="close" onClick={() => setNotificationCase(null)}>×</button>
            <p>Deadline notification</p>
            <h2>Notify affected players</h2>
            <div className="eligibility"><Badge tone="cream">Recipients</Badge><span>{notificationCase.recipients}</span></div>
            <fieldset className="channel-picker">
              <legend>Delivery channels</legend>
              <label><input type="checkbox" checked disabled /><span><b>In-app notification</b><small>Always displayed on the dashboard and retained in notification history.</small></span></label>
              <label className={!notificationSettings.email ? "unavailable" : ""}><input type="checkbox" name="channel" value="Email" defaultChecked={notificationSettings.email} disabled={!notificationSettings.email} /><span><b>Email</b><small>{notificationSettings.email ? "Selected by the player." : "Turned off in the player’s contact preferences."}</small></span></label>
              <label className={!notificationCase.textAvailable || !notificationSettings.sms ? "unavailable" : ""}><input type="checkbox" name="channel" value="Text message" defaultChecked={notificationCase.textAvailable && notificationSettings.sms} disabled={!notificationCase.textAvailable || !notificationSettings.sms} /><span><b>Text message</b><small>{!notificationCase.textAvailable ? "Unavailable — no verified mobile number." : notificationSettings.sms ? "Selected by the player." : "Turned off in the player’s contact preferences."}</small></span></label>
            </fieldset>
            <label>Message<textarea name="message" required defaultValue={`Reminder: action is required for ${notificationCase.subject}. Please open the DartsCoachUK Official Ladder League app for details.`} /></label>
            <div className="rule-note">Prototype only: this records the selected delivery channels but does not send a real email or text message.</div>
            <button className="primary-cta" type="submit">Send notification</button>
          </form>
        </div>
      )}

      {incomingAction && (
        <div className="modal-backdrop" onClick={() => setIncomingAction(null)}>
          <form className="challenge-modal incoming-modal" onClick={(e) => e.stopPropagation()} onSubmit={async (e) => { e.preventDefault(); if (incomingAction === "refuse" && liveIncomingChallenge) { const data = new FormData(e.currentTarget); try { await respondToLiveChallenge(liveIncomingChallenge.id, "refuse", `${data.get("reason")}: ${data.get("details")}`); } catch (error) { setRemoteError(error instanceof Error ? error.message : "Challenge response failed."); return; } } setIncomingStatus(incomingAction === "alternative" ? "alternative" : "refusal-review"); setIncomingAction(null); }}>
            <button type="button" className="close" onClick={() => setIncomingAction(null)}>×</button>
            {incomingAction === "alternative" ? <>
              <p>Incoming challenge</p><h2>Suggest an alternative</h2>
              <label>Alternative date and time<input type="datetime-local" required /></label>
              <label>Alternative venue<select required><option value="">No authorised venues added</option>{organiserVenues.map((venue) => <option key={venue.id}>{venue.name}</option>)}</select></label>
              <label>Message to Anonymous Player 07<textarea required placeholder="Explain the alternative arrangement…" /></label>
              <div className="rule-note">Offering a reasonable alternative is an attempt to arrange the match and is not an immediate refusal.</div>
              <button className="primary-cta" type="submit">Send alternative</button>
            </> : <>
              <p>Refusal request</p><h2>Refuse this challenge</h2>
              <label>Reason<select name="reason" required defaultValue=""><option value="" disabled>Select a reason</option><option>Holiday</option><option>Illness</option><option>Injury</option><option>Family emergency</option><option>Work commitments</option><option>Personal commitments</option><option>Transport problems</option><option>Cannot agree a suitable date</option><option>Other reason</option></select></label>
              <label>Additional details<textarea name="details" required placeholder="Give the organiser enough information to review the refusal…" /></label>
              <div className="refusal-warning"><b>This may use one of your four refusals</b><span>Holidays, illness and emergencies are included. The organiser must confirm whether this becomes an official refusal.</span></div>
              <button className="danger-button" type="submit">Submit refusal for review</button>
            </>}
          </form>
        </div>
      )}

      {reminderMatch && (
        <div className="modal-backdrop" onClick={() => setReminderMatch(null)}>
          <section className="challenge-modal reminder-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" onClick={() => setReminderMatch(null)}>×</button>
            {!reminderSet ? <>
              <p>Match not live yet</p>
              <h2>{reminderMatch.home} vs {reminderMatch.away}</h2>
              <div className="reminder-details"><span><b>Scheduled</b>{reminderMatch.time}</span><span><b>Venue</b>{reminderMatch.venue}</span></div>
              <p className="reminder-copy">This match has not started, so the live scoreboard is not available. Would you like an in-app notification as soon as scoring begins?</p>
              <button className="primary-cta" onClick={() => { setReminderSet(true); addPlayerNotification("Live match alert set", `You will be notified when ${reminderMatch.home} vs ${reminderMatch.away} begins.`, "match"); }}>Notify me when live</button>
              <button className="reset-test" onClick={() => setReminderMatch(null)}>Not now</button>
            </> : <div className="success"><b>✓</b><h2>Notification set</h2><p>We’ll alert you when {reminderMatch.home} vs {reminderMatch.away} goes live. You have not been redirected to another match.</p><button className="outline-button" onClick={() => setReminderMatch(null)}>Return to matches</button></div>}
          </section>
        </div>
      )}
    </main>
  );
}
