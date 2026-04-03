import AsyncStorage from '@react-native-async-storage/async-storage';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Constants from 'expo-constants';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable as RNPressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
  type PressableProps,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { auth, db } from './src/firebase';

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null = null;
const focusNotificationRuntime = {
  dndEnabled: false,
  focusRunning: false,
};

function isExpoGoAndroidRuntime() {
  return Platform.OS === 'android'
    && (Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo');
}

function getNotificationsModule(): NotificationsModule | null {
  if (isExpoGoAndroidRuntime()) return null;
  if (notificationsModule) return notificationsModule;

  const loaded = require('expo-notifications') as NotificationsModule;
  loaded.setNotificationHandler({
    handleNotification: async () => {
      const dndActive = focusNotificationRuntime.dndEnabled && focusNotificationRuntime.focusRunning;
      return {
      shouldShowBanner: !dndActive,
      shouldShowList: !dndActive,
      shouldPlaySound: !dndActive,
      shouldSetBadge: false,
      };
    },
  });

  notificationsModule = loaded;
  return notificationsModule;
}

const SYNC_COLLECTION = 'syncSnapshots';
const LOCAL_CACHE_KEY = 'productivity_mobile_snapshot_cache_v2';
const MOBILE_SYNC_STATE_PREFIX = 'productivity_mobile_sync_state_v2';
const DAILY_NOTIFICATION_ID_KEY = 'productivity_mobile_daily_notification_id';
const SMART_REMINDER_SETTINGS_KEY = 'productivity_mobile_smart_reminder_settings_v1';
const SMART_REMINDER_NOTIFICATION_IDS_KEY = 'productivity_mobile_smart_reminder_notification_ids_v1';
const TASK_REMINDER_NOTIFICATION_IDS_KEY = 'productivity_mobile_task_reminder_notification_ids_v1';
const ANDROID_NOTIFICATION_CHANNEL_ID = 'daily-reminders-v2';
const ANDROID_INTERACTION_CHANNEL_ID = 'interaction-feedback-v2';
const ANDROID_FOCUS_SILENT_CHANNEL_ID = 'focus-session-silent';
const INTERACTION_NOTIFICATION_COOLDOWN_MS = 2500;
const CLICK_VIBRATION_MS = 8;
const FOCUS_STATE_SYNC_INTERVAL_SECONDS = 10;
const REMINDER_LEAD_MINUTES_OPTIONS = [10, 15, 30, 60, 120, 180, 1440] as const;
const SMART_REMINDER_LOOKAHEAD_DAYS = 10;
const SMART_REMINDER_MAX_PER_CATEGORY = 20;

const COLORS = {
  bgPrimary: '#0f0f23',
  bgSecondary: '#1a1a2e',
  bgCard: '#1e1e3f',
  bgInput: '#252550',
  border: '#2a2a4a',
  borderLight: '#3a3a5a',
  textPrimary: '#ffffff',
  textSecondary: '#a0a0b8',
  textMuted: '#6b6b80',
  primary: '#6366f1',
  primaryDark: '#4f46e5',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#06b6d4',
};

let lastPressFeedbackAt = 0;

function triggerPressFeedback() {
  if (Platform.OS === 'web') return;
  if (focusNotificationRuntime.dndEnabled && focusNotificationRuntime.focusRunning) return;
  const now = Date.now();
  if (now - lastPressFeedbackAt < 25) return;
  lastPressFeedbackAt = now;
  Vibration.vibrate(CLICK_VIBRATION_MS);
}

function Pressable(props: PressableProps) {
  const { onPress, onLongPress, ...rest } = props;

  return (
    <RNPressable
      {...rest}
      onPress={(event) => {
        triggerPressFeedback();
        onPress?.(event);
      }}
      onLongPress={(event) => {
        triggerPressFeedback();
        onLongPress?.(event);
      }}
    />
  );
}

type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
type TaskStatus = 'not-started' | 'in-progress' | 'completed';
type ReminderCategory = 'tasks' | 'schedule' | 'challenges';
type ChallengeType = 'daily' | 'weekly' | 'custom';
type ChallengeStatus = 'active' | 'completed';
type GoalCategory = 'academic' | 'skill' | 'project' | 'career' | 'personal' | 'other';
type GoalStatus = 'active' | 'completed' | 'paused' | 'abandoned';
type GoalTrackingType = 'milestones' | 'focus_hours' | 'tasks_completed' | 'website_minutes';
type FocusSessionStatus = 'active' | 'completed' | 'stopped';
type HubScheduleType = 'school' | 'personal';
type HubScheduleRecurrence = 'daily' | 'weekly' | 'monthly' | null;
type ScheduleView = 'school' | 'personal' | 'combined';
type ScheduleCalendarMode = 'month' | 'week';

interface ReminderCategorySetting {
  enabled: boolean;
  leadMinutes: number;
}

interface SmartReminderSettings {
  tasks: ReminderCategorySetting;
  schedule: ReminderCategorySetting;
  challenges: ReminderCategorySetting;
}

interface SmartReminderDraft {
  category: ReminderCategory;
  itemKey: string;
  title: string;
  body: string;
  triggerAtMs: number;
}

interface TaskReminderDraft {
  taskId: string;
  itemKey: string;
  title: string;
  body: string;
  triggerAtMs: number;
}

const DEFAULT_SMART_REMINDER_SETTINGS: SmartReminderSettings = {
  tasks: { enabled: true, leadMinutes: 60 },
  schedule: { enabled: true, leadMinutes: 30 },
  challenges: { enabled: false, leadMinutes: 120 },
};

type AppTab =
  | 'dashboard'
  | 'today'
  | 'schedule'
  | 'tasks'
  | 'goals'
  | 'revisions'
  | 'challenges'
  | 'focus'
  | 'analytics'
  | 'sync'
  | 'notifications';

interface HubTask {
  id: string;
  title: string;
  description: string;
  linkUrl: string | null;
  dueDate: string | null;
  dueTime: string | null;
  reminderMinutes: number | null;
  priority: TaskPriority;
  status: TaskStatus;
  category: string;
  tags: string[];
  linkedGoalId: string | null;
  isRecurring: boolean;
  repeatType: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface HubChallenge {
  id: string;
  metric: string;
  type: ChallengeType;
  options: Record<string, unknown>;
  title: string;
  customTitle: boolean;
  description: string;
  targetProgress: number;
  currentProgress: number;
  currentStreak: number;
  bestStreak: number;
  status: ChallengeStatus;
  createdAt: string;
  lastProgressDate: string | null;
  completedAt: string | null;
}

interface HubMilestone {
  id: string;
  title: string;
  isCompleted: boolean;
  completedAt: string | null;
}

interface HubGoal {
  id: string;
  title: string;
  description: string;
  category: GoalCategory;
  status: GoalStatus;
  progress: number;
  milestones: HubMilestone[];
  trackingType: GoalTrackingType;
  trackingTarget: number;
  trackingCurrent: number;
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface HubFocusSession {
  id: string;
  startTime: string;
  endTime: string | null;
  plannedDurationMinutes: number;
  actualDurationMinutes: number;
  type: string;
  status: FocusSessionStatus;
  linkedTaskId: string | null;
  linkedTaskTitle: string;
  date: string;
}

interface HubFocusState {
  isActive: boolean;
  isPaused: boolean;
  isBreak: boolean;
  isOpenEnded: boolean;
  isExtraTime: boolean;
  extraTimeSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  selectedMinutes: number;
  isOverlayMinimized: boolean;
  taskTitle: string | null;
  startTimestamp: number | null;
  endTimestamp: number | null;
  pausedRemainingSeconds: number | null;
  pausedElapsedSeconds: number | null;
  updatedAtMs: number;
}

interface HubScheduleEvent {
  id: string;
  title: string;
  type: string;
  date: string | null;
  startTime: string;
  endTime: string | null;
  location: string;
  scheduleType: HubScheduleType;
  isImported: boolean;
  isRecurring: boolean;
  recurrence: HubScheduleRecurrence;
  weekdays: number[];
  recurrenceEndDate: string | null;
  importedCalendarId: string | null;
  color: string | null;
  description: string;
}

interface HubScheduleOccurrence {
  key: string;
  occurrenceDate: string;
  event: HubScheduleEvent;
}

interface CalendarGridDay {
  ymd: string;
  dayOfMonth: number;
  inMonth: boolean;
}

interface ScheduleAgendaItem {
  key: string;
  ymd: string;
  title: string;
  startTime: string;
  endTime: string | null;
  location: string;
  isTask: boolean;
  type: string;
  task: HubTask | null;
  event: HubScheduleEvent | null;
}

interface TodayAgendaItem {
  id: string;
  taskId: string | null;
  title: string;
  type: string;
  startTime: string;
  endTime: string | null;
  location: string;
  isTask: boolean;
  sourceLabel?: string;
  sourceColor?: string;
}

interface HubDailyStats {
  date: string;
  tasksCompleted: number;
  tasksCreated: number;
  focusMinutes: number;
  focusSessions: number;
  goalsProgress: number;
  productivityScore: number;
  distractionsBlocked: number;
  notes: string;
}

interface HubSnapshot {
  version: string;
  exportDate: string;
  source: string;
  tasks: HubTask[];
  challenges: HubChallenge[];
  goals: HubGoal[];
  focusSessions: HubFocusSession[];
  focusState: HubFocusState | null;
  dailyStats: Record<string, HubDailyStats>;
  streaks: Record<string, unknown>;
  achievements: Record<string, unknown>;
  settings: Record<string, unknown>;
  revisions: unknown[];
  scheduleSchool: HubScheduleEvent[];
  schedulePersonal: HubScheduleEvent[];
  taskLists: unknown[];
  blockedSites: unknown[];
  blockedAttempts: unknown[];
  idleRecords: unknown[];
  idleCategories: unknown[];
  websiteTimeLimits: unknown[];
  websiteDailyUsage: Record<string, unknown>;
  importedCalendarsMeta: Record<string, unknown>;
  [key: string]: unknown;
}

interface MobileSyncState {
  lastPayloadChecksum: string;
  lastRemoteChecksum: string;
  lastRemoteVersion: number;
  lastSyncAt: string;
}

function nowIso() {
  return new Date().toISOString();
}

function computePayloadChecksum(payload: string) {
  const stableSerialize = (value: unknown): string => {
    if (Array.isArray(value)) {
      return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(obj[key])}`).join(',')}}`;
    }

    return JSON.stringify(value);
  };

  let normalized = payload;

  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const clone: Record<string, unknown> = { ...parsed };
      delete clone.exportDate;
      delete clone.source;
      normalized = stableSerialize(clone);
    }
  } catch {
    normalized = payload;
  }

  let hash = 2166136261;

  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function getSyncStateStorageKey(uid: string) {
  return `${MOBILE_SYNC_STATE_PREFIX}:${uid}`;
}

function getRemoteVersionFromSnapshotData(data: Record<string, unknown>) {
  const explicitMs = Number(data.updatedAtMs);
  if (Number.isFinite(explicitMs) && explicitMs > 0) {
    return Math.floor(explicitMs);
  }

  const updatedAt = data.updatedAt as { toMillis?: () => number; seconds?: number } | undefined;

  if (updatedAt?.toMillis) {
    const millis = Number(updatedAt.toMillis());
    if (Number.isFinite(millis) && millis > 0) {
      return Math.floor(millis);
    }
  }

  const seconds = Number(updatedAt?.seconds);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.floor(seconds * 1000);
  }

  return 0;
}

function hasSyncState(state: MobileSyncState | null) {
  if (!state) return false;
  if (state.lastPayloadChecksum || state.lastRemoteChecksum) return true;
  return Number.isFinite(state.lastRemoteVersion) && state.lastRemoteVersion > 0;
}

async function readSyncState(uid: string): Promise<MobileSyncState | null> {
  try {
    const raw = await AsyncStorage.getItem(getSyncStateStorageKey(uid));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<MobileSyncState>;
    return {
      lastPayloadChecksum: typeof parsed.lastPayloadChecksum === 'string' ? parsed.lastPayloadChecksum : '',
      lastRemoteChecksum: typeof parsed.lastRemoteChecksum === 'string' ? parsed.lastRemoteChecksum : '',
      lastRemoteVersion: Number.isFinite(Number(parsed.lastRemoteVersion)) ? Number(parsed.lastRemoteVersion) : 0,
      lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : nowIso(),
    };
  } catch {
    return null;
  }
}

async function writeSyncState(uid: string, state: MobileSyncState) {
  await AsyncStorage.setItem(getSyncStateStorageKey(uid), JSON.stringify(state));
}

function formatLocalYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayYmd() {
  return formatLocalYmd(new Date());
}

function generateId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function safeObj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toFinite(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toYmd(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10);

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return formatLocalYmd(parsed);
    }
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatLocalYmd(value);
  }

  return null;
}

function toDateTimestamp(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const ts = new Date(`${trimmed}T00:00:00`).getTime();
      return Number.isFinite(ts) ? ts : null;
    }

    const ts = new Date(trimmed).getTime();
    return Number.isFinite(ts) ? ts : null;
  }

  return null;
}

function normalizeScheduleType(value: unknown, fallback: HubScheduleType = 'school'): HubScheduleType {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === 'school' || candidate === 'personal') return candidate;
  return fallback;
}

function normalizeScheduleRecurrence(value: unknown): HubScheduleRecurrence {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === 'daily' || candidate === 'weekly' || candidate === 'monthly') return candidate;
  return null;
}

function normalizeTimeValue(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return fallback;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return fallback;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return fallback;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeOptionalTimeValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = normalizeTimeValue(trimmed, '');
  return normalized || null;
}

function normalizeTaskReminderMinutes(value: unknown): number | null {
  if (value == null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric);
}

function normalizeScheduleWeekdays(value: unknown) {
  const weekdayValues = safeArray(value)
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6);

  return Array.from(new Set(weekdayValues));
}

function normalizeImportedCalendarId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeScheduleBadgeColor(value: unknown, fallback = '#6366f1') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  const shortHex = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^#([0-9a-fA-F]{6})$/.test(trimmed)) return trimmed;
  return fallback;
}

function getImportedSourceDetails(
  event: HubScheduleEvent,
  importedCalendarsMeta: Record<string, unknown>,
): { label: string; color: string } | null {
  if (!event.importedCalendarId && !event.isImported) return null;

  const meta = event.importedCalendarId
    ? safeObj(importedCalendarsMeta[event.importedCalendarId])
    : {};
  const label = typeof meta.name === 'string' && meta.name.trim()
    ? meta.name.trim()
    : 'Imported Calendar';
  const color = normalizeScheduleBadgeColor(
    (typeof meta.color === 'string' && meta.color.trim()) ? meta.color : event.color,
    '#6366f1',
  );

  return { label, color };
}

function normalizeScheduleEvent(raw: unknown, fallbackType: HubScheduleType): HubScheduleEvent {
  const data = safeObj(raw);
  const recurrence = normalizeScheduleRecurrence(data.recurrence);
  const isRecurring = Boolean(data.isRecurring || recurrence);
  const importedCalendarId = normalizeImportedCalendarId(
    data.importedCalendarId
      ?? data.sourceCalendarId
      ?? data.calendarId,
  );

  return {
    id: typeof data.id === 'string' && data.id ? data.id : generateId('event'),
    title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'Untitled Event',
    type: typeof data.type === 'string' && data.type.trim() ? data.type.trim().toLowerCase() : 'other',
    date: toYmd(data.date),
    startTime: normalizeTimeValue(data.startTime, '09:00'),
    endTime: normalizeOptionalTimeValue(data.endTime),
    location: typeof data.location === 'string' ? data.location.trim() : '',
    scheduleType: normalizeScheduleType(data.scheduleType, fallbackType),
    isImported: Boolean(data.isImported || importedCalendarId),
    isRecurring,
    recurrence,
    weekdays: normalizeScheduleWeekdays(data.weekdays),
    recurrenceEndDate: toYmd(data.recurrenceEndDate),
    importedCalendarId,
    color: typeof data.color === 'string' && data.color.trim() ? data.color.trim() : null,
    description: typeof data.description === 'string' ? data.description : '',
  };
}

function scheduleEventOccursOn(event: HubScheduleEvent, ymd: string) {
  if (!ymd) return false;
  if (event.date && ymd < event.date) return false;
  if (event.recurrenceEndDate && ymd > event.recurrenceEndDate) return false;

  if (!event.isRecurring) {
    return event.date === ymd;
  }

  if (event.recurrence === 'daily') {
    return true;
  }

  if (event.recurrence === 'weekly') {
    const parsed = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return false;
    const weekday = parsed.getDay();

    if (event.weekdays.length > 0) {
      return event.weekdays.includes(weekday);
    }

    if (!event.date) return false;
    const startDate = new Date(`${event.date}T00:00:00`);
    if (Number.isNaN(startDate.getTime())) return false;
    return startDate.getDay() === weekday;
  }

  if (event.recurrence === 'monthly') {
    if (!event.date) return false;
    const startDate = new Date(`${event.date}T00:00:00`);
    const parsed = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(parsed.getTime())) return false;
    return startDate.getDate() === parsed.getDate();
  }

  return event.date === ymd;
}

function normalizeTaskStatus(value: unknown): TaskStatus {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === 'not-started' || candidate === 'in-progress' || candidate === 'completed') return candidate;
  return 'not-started';
}

function normalizeTaskPriority(value: unknown): TaskPriority {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === 'low' || candidate === 'medium' || candidate === 'high' || candidate === 'urgent') return candidate;
  return 'medium';
}

function normalizeChallengeType(value: unknown): ChallengeType {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === 'daily' || candidate === 'weekly' || candidate === 'custom') return candidate;
  return 'custom';
}

function normalizeGoalCategory(value: unknown): GoalCategory {
  const candidate = String(value || '').trim().toLowerCase();
  if (
    candidate === 'academic'
    || candidate === 'skill'
    || candidate === 'project'
    || candidate === 'career'
    || candidate === 'personal'
    || candidate === 'other'
  ) {
    return candidate;
  }
  return 'academic';
}

function normalizeGoalStatus(value: unknown): GoalStatus {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === 'active' || candidate === 'completed' || candidate === 'paused' || candidate === 'abandoned') {
    return candidate;
  }
  return 'active';
}

function normalizeGoalTrackingType(value: unknown): GoalTrackingType {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === 'focus_hours' || candidate === 'tasks_completed' || candidate === 'website_minutes' || candidate === 'milestones') {
    return candidate;
  }
  return 'milestones';
}

function normalizeTask(raw: unknown): HubTask {
  const data = safeObj(raw);

  return {
    id: typeof data.id === 'string' && data.id ? data.id : generateId('task'),
    title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'Untitled Task',
    description: typeof data.description === 'string' ? data.description : '',
    linkUrl: typeof data.linkUrl === 'string'
      ? data.linkUrl
      : (typeof data.url === 'string' ? data.url : null),
    dueDate: toYmd(data.dueDate),
    dueTime: typeof data.dueTime === 'string' && data.dueTime.trim() ? data.dueTime.trim() : null,
    reminderMinutes: normalizeTaskReminderMinutes(data.reminderMinutes),
    priority: normalizeTaskPriority(data.priority),
    status: normalizeTaskStatus(data.status),
    category: typeof data.category === 'string' && data.category.trim() ? data.category.trim() : 'homework',
    tags: safeArray<string>(data.tags).filter((tag) => typeof tag === 'string' && tag.trim().length > 0),
    linkedGoalId: typeof data.linkedGoalId === 'string' && data.linkedGoalId ? data.linkedGoalId : null,
    isRecurring: Boolean(data.isRecurring ?? data.recurring),
    repeatType: typeof data.repeatType === 'string'
      ? data.repeatType
      : (typeof data.recurrence === 'string' ? data.recurrence : null),
    completedAt: typeof data.completedAt === 'string' && data.completedAt ? data.completedAt : null,
    createdAt: typeof data.createdAt === 'string' && data.createdAt ? data.createdAt : nowIso(),
    updatedAt: typeof data.updatedAt === 'string' && data.updatedAt ? data.updatedAt : nowIso(),
  };
}

function normalizeChallenge(raw: unknown): HubChallenge {
  const data = safeObj(raw);
  const targetProgress = Math.max(1, Math.round(toFinite(data.targetProgress, 1)));
  const currentProgress = Math.max(0, Math.round(toFinite(data.currentProgress, 0)));

  return {
    id: typeof data.id === 'string' && data.id ? data.id : generateId('challenge'),
    metric: typeof data.metric === 'string' && data.metric.trim() ? data.metric.trim().toLowerCase() : 'tasks',
    type: normalizeChallengeType(data.type),
    options: safeObj(data.options),
    title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'Challenge',
    customTitle: Boolean(data.customTitle),
    description: typeof data.description === 'string'
      ? data.description
      : 'Track your progress and stay consistent.',
    targetProgress,
    currentProgress,
    currentStreak: Math.max(0, Math.round(toFinite(data.currentStreak, 0))),
    bestStreak: Math.max(0, Math.round(toFinite(data.bestStreak, 0))),
    status: String(data.status || '').toLowerCase() === 'completed' ? 'completed' : 'active',
    createdAt: typeof data.createdAt === 'string' && data.createdAt ? data.createdAt : nowIso(),
    lastProgressDate: toYmd(data.lastProgressDate),
    completedAt: typeof data.completedAt === 'string' && data.completedAt ? data.completedAt : null,
  };
}

function normalizeMilestone(raw: unknown): HubMilestone {
  const data = safeObj(raw);

  return {
    id: typeof data.id === 'string' && data.id ? data.id : generateId('milestone'),
    title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'Milestone',
    isCompleted: Boolean(data.isCompleted),
    completedAt: typeof data.completedAt === 'string' && data.completedAt ? data.completedAt : null,
  };
}

function normalizeGoal(raw: unknown): HubGoal {
  const data = safeObj(raw);
  const milestones = safeArray(data.milestones).map(normalizeMilestone);
  const progressCandidate = Math.round(toFinite(data.progress, 0));

  return {
    id: typeof data.id === 'string' && data.id ? data.id : generateId('goal'),
    title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'Goal',
    description: typeof data.description === 'string' ? data.description : '',
    category: normalizeGoalCategory(data.category),
    status: normalizeGoalStatus(data.status),
    progress: Math.max(0, Math.min(100, progressCandidate)),
    milestones,
    trackingType: normalizeGoalTrackingType(data.trackingType),
    trackingTarget: Math.max(0, toFinite(data.trackingTarget, toFinite(data.targetValue, 0))),
    trackingCurrent: Math.max(0, toFinite(data.trackingCurrent, toFinite(data.currentValue, 0))),
    targetDate: toYmd(data.targetDate),
    createdAt: typeof data.createdAt === 'string' && data.createdAt ? data.createdAt : nowIso(),
    updatedAt: typeof data.updatedAt === 'string' && data.updatedAt ? data.updatedAt : nowIso(),
    completedAt: typeof data.completedAt === 'string' && data.completedAt ? data.completedAt : null,
  };
}

function normalizeFocusSession(raw: unknown): HubFocusSession {
  const data = safeObj(raw);
  const statusCandidate = String(data.status || '').trim().toLowerCase();
  const status: FocusSessionStatus =
    statusCandidate === 'active' || statusCandidate === 'completed' || statusCandidate === 'stopped'
      ? statusCandidate
      : 'completed';

  const startTime = typeof data.startTime === 'string' && data.startTime ? data.startTime : nowIso();
  const date = toYmd(data.date) || toYmd(startTime) || todayYmd();

  return {
    id: typeof data.id === 'string' && data.id ? data.id : generateId('focus'),
    startTime,
    endTime: typeof data.endTime === 'string' && data.endTime ? data.endTime : null,
    plannedDurationMinutes: Math.max(1, Math.round(toFinite(data.plannedDurationMinutes, 25))),
    actualDurationMinutes: Math.max(0, Math.round(toFinite(data.actualDurationMinutes, 0))),
    type: typeof data.type === 'string' && data.type ? data.type : 'pomodoro',
    status,
    linkedTaskId: typeof data.linkedTaskId === 'string' && data.linkedTaskId ? data.linkedTaskId : null,
    linkedTaskTitle: typeof data.linkedTaskTitle === 'string' ? data.linkedTaskTitle : '',
    date,
  };
}

function normalizeFocusState(raw: unknown): HubFocusState | null {
  const data = safeObj(raw);
  if (!Object.keys(data).length) return null;

  const isActive = Boolean(data.isActive);
  if (!isActive) return null;

  const selectedMinutes = Math.max(1, Math.round(toFinite(data.selectedMinutes, 25)));
  const isPaused = Boolean(data.isPaused);
  const isOpenEnded = Boolean(data.isOpenEnded);
  const isExtraTime = Boolean(data.isExtraTime);

  let remainingSeconds = Math.max(0, Math.round(toFinite(data.remainingSeconds, selectedMinutes * 60)));
  const endTimestampRaw = Number(data.endTimestamp);
  let endTimestamp = Number.isFinite(endTimestampRaw) && endTimestampRaw > 0
    ? Math.round(endTimestampRaw)
    : null;

  if (!isPaused && !isOpenEnded && !isExtraTime && typeof endTimestamp === 'number') {
    remainingSeconds = Math.max(0, Math.ceil((endTimestamp - Date.now()) / 1000));
  }

  if ((isOpenEnded || isExtraTime) && remainingSeconds !== 0) {
    remainingSeconds = 0;
    endTimestamp = null;
  }

  const startTimestampRaw = Number(data.startTimestamp);
  const startTimestamp = Number.isFinite(startTimestampRaw) && startTimestampRaw > 0
    ? Math.round(startTimestampRaw)
    : null;

  const pausedRemainingSeconds = isPaused
    ? Math.max(0, Math.round(toFinite(data.pausedRemainingSeconds, remainingSeconds)))
    : null;

  const pausedElapsedSeconds = isPaused
    ? Math.max(0, Math.round(toFinite(data.pausedElapsedSeconds, (selectedMinutes * 60) - remainingSeconds)))
    : null;

  return {
    isActive: true,
    isPaused,
    isBreak: Boolean(data.isBreak),
    isOpenEnded,
    isExtraTime,
    extraTimeSeconds: Math.max(0, Math.round(toFinite(data.extraTimeSeconds, 0))),
    elapsedSeconds: Math.max(0, Math.round(toFinite(data.elapsedSeconds, 0))),
    remainingSeconds,
    selectedMinutes,
    isOverlayMinimized: Boolean(data.isOverlayMinimized),
    taskTitle: typeof data.taskTitle === 'string' && data.taskTitle.trim() ? data.taskTitle.trim() : null,
    startTimestamp,
    endTimestamp,
    pausedRemainingSeconds,
    pausedElapsedSeconds,
    updatedAtMs: Math.max(0, Math.round(toFinite(data.updatedAtMs, Date.now()))),
  };
}

function normalizeDailyStats(raw: unknown): HubDailyStats {
  const data = safeObj(raw);
  return {
    date: toYmd(data.date) || todayYmd(),
    tasksCompleted: Math.max(0, Math.round(toFinite(data.tasksCompleted, 0))),
    tasksCreated: Math.max(0, Math.round(toFinite(data.tasksCreated, 0))),
    focusMinutes: Math.max(0, Math.round(toFinite(data.focusMinutes, 0))),
    focusSessions: Math.max(0, Math.round(toFinite(data.focusSessions, 0))),
    goalsProgress: Math.max(0, Math.round(toFinite(data.goalsProgress, 0))),
    productivityScore: Math.max(0, Math.round(toFinite(data.productivityScore, 0))),
    distractionsBlocked: Math.max(0, Math.round(toFinite(data.distractionsBlocked, 0))),
    notes: typeof data.notes === 'string' ? data.notes : '',
  };
}

function createEmptySnapshot(): HubSnapshot {
  return {
    version: '2.0',
    exportDate: nowIso(),
    source: 'mobile-app',
    tasks: [],
    challenges: [],
    goals: [],
    focusSessions: [],
    focusState: null,
    dailyStats: {},
    streaks: {},
    achievements: {},
    settings: {},
    revisions: [],
    scheduleSchool: [],
    schedulePersonal: [],
    taskLists: [],
    blockedSites: [],
    blockedAttempts: [],
    idleRecords: [],
    idleCategories: [],
    websiteTimeLimits: [],
    websiteDailyUsage: {},
    importedCalendarsMeta: {},
  };
}

function normalizeSnapshot(raw: unknown): HubSnapshot {
  const base = createEmptySnapshot();
  const data = safeObj(raw);
  const settings = safeObj(data.settings);
  const normalizedFocusState = normalizeFocusState(data.focusState ?? settings.focusState);
  const statsInput = safeObj(data.dailyStats);
  const normalizedStats: Record<string, HubDailyStats> = {};

  for (const [key, value] of Object.entries(statsInput)) {
    const normalizedKey = toYmd(key) || key;
    normalizedStats[normalizedKey] = normalizeDailyStats(value);
  }

  return {
    ...base,
    ...data,
    source: 'mobile-app',
    exportDate: nowIso(),
    tasks: safeArray(data.tasks).map(normalizeTask),
    challenges: safeArray(data.challenges).map(normalizeChallenge),
    goals: safeArray(data.goals).map(normalizeGoal),
    focusSessions: safeArray(data.focusSessions).map(normalizeFocusSession),
    focusState: normalizedFocusState,
    dailyStats: normalizedStats,
    streaks: safeObj(data.streaks),
    achievements: safeObj(data.achievements),
    settings,
    revisions: safeArray(data.revisions),
    scheduleSchool: safeArray(data.scheduleSchool).map((event) => normalizeScheduleEvent(event, 'school')),
    schedulePersonal: safeArray(data.schedulePersonal).map((event) => normalizeScheduleEvent(event, 'personal')),
    taskLists: safeArray(data.taskLists),
    blockedSites: safeArray(data.blockedSites),
    blockedAttempts: safeArray(data.blockedAttempts),
    idleRecords: safeArray(data.idleRecords),
    idleCategories: safeArray(data.idleCategories),
    websiteTimeLimits: safeArray(data.websiteTimeLimits),
    websiteDailyUsage: safeObj(data.websiteDailyUsage),
    importedCalendarsMeta: safeObj(data.importedCalendarsMeta),
  };
}

function isYesterdayYmd(candidate: string | null, today: string) {
  if (!candidate) return false;
  const start = toDateTimestamp(candidate);
  const end = toDateTimestamp(today);
  if (start == null || end == null) return false;
  return end - start === 24 * 60 * 60 * 1000;
}

function getWeekStartYmd(ymd: string) {
  const parsed = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return ymd;
  const day = parsed.getDay();
  const diff = parsed.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(parsed.getFullYear(), parsed.getMonth(), diff);
  return formatLocalYmd(monday);
}

function getWeekEndYmd(ymd: string) {
  const start = getWeekStartYmd(ymd);
  return addDaysToYmd(start, 6);
}

function getTimestampForYmdTime(ymd: string | null, time: string | null, fallbackTime: string) {
  const day = toYmd(ymd);
  if (!day) return null;
  const normalizedTime = normalizeTimeValue(time, fallbackTime);
  if (!normalizedTime) return null;

  const ts = new Date(`${day}T${normalizedTime}:00`).getTime();
  if (!Number.isFinite(ts)) return null;
  return ts;
}

function formatLeadMinutes(minutes: number) {
  const safe = Math.max(1, Math.round(toFinite(minutes, 60)));
  if (safe % 1440 === 0) {
    const days = Math.round(safe / 1440);
    return `${days}d before`;
  }
  if (safe >= 60 && safe % 60 === 0) {
    const hours = Math.round(safe / 60);
    return `${hours}h before`;
  }
  return `${safe}m before`;
}

function normalizeSmartReminderSettings(raw: unknown): SmartReminderSettings {
  const candidate = safeObj(raw);

  const toCategory = (key: ReminderCategory): ReminderCategorySetting => {
    const current = safeObj(candidate[key]);
    const defaultSetting = DEFAULT_SMART_REMINDER_SETTINGS[key];
    const lead = Math.max(1, Math.round(toFinite(current.leadMinutes, defaultSetting.leadMinutes)));
    return {
      enabled: typeof current.enabled === 'boolean' ? current.enabled : defaultSetting.enabled,
      leadMinutes: lead,
    };
  };

  return {
    tasks: toCategory('tasks'),
    schedule: toCategory('schedule'),
    challenges: toCategory('challenges'),
  };
}

function refreshChallengePeriods(challenges: HubChallenge[]) {
  const today = todayYmd();

  return challenges.map((challenge) => {
    if (challenge.type === 'daily') {
      if (challenge.lastProgressDate && challenge.lastProgressDate !== today) {
        return {
          ...challenge,
          currentProgress: 0,
          status: 'active' as ChallengeStatus,
          completedAt: null,
        };
      }
      return challenge;
    }

    if (challenge.type === 'weekly' && challenge.lastProgressDate) {
      const lastWeek = getWeekStartYmd(challenge.lastProgressDate);
      const thisWeek = getWeekStartYmd(today);
      if (lastWeek !== thisWeek) {
        return {
          ...challenge,
          currentProgress: 0,
          status: 'active' as ChallengeStatus,
          completedAt: null,
        };
      }
    }

    return challenge;
  });
}

function applyChallengeProgress(
  challenges: HubChallenge[],
  metric: string,
  amount: number,
  meta: { durationMinutes?: number } = {},
) {
  const normalizedMetric = String(metric || '').trim().toLowerCase();
  if (!normalizedMetric || amount <= 0) return challenges;

  const today = todayYmd();

  return challenges.map((challenge) => {
    if (challenge.status !== 'active') return challenge;
    if (String(challenge.metric || '').trim().toLowerCase() !== normalizedMetric) return challenge;

    if (normalizedMetric === 'focus_sessions') {
      const minimumMinutes = Math.max(0, Math.round(toFinite(challenge.options.minMinutes, 0)));
      const duration = Math.max(0, Math.round(toFinite(meta.durationMinutes, 0)));
      if (minimumMinutes > 0 && duration < minimumMinutes) {
        return challenge;
      }
    }

    let nextStreak = challenge.currentStreak;
    if (challenge.lastProgressDate === today) {
      nextStreak = challenge.currentStreak;
    } else if (isYesterdayYmd(challenge.lastProgressDate, today) && challenge.currentStreak > 0) {
      nextStreak = challenge.currentStreak + 1;
    } else {
      nextStreak = 1;
    }

    const nextProgress = challenge.currentProgress + amount;
    const isCompleted = nextProgress >= challenge.targetProgress;

    return {
      ...challenge,
      currentProgress: nextProgress,
      status: isCompleted
        ? ('completed' as ChallengeStatus)
        : ('active' as ChallengeStatus),
      completedAt: isCompleted ? nowIso() : null,
      currentStreak: nextStreak,
      bestStreak: Math.max(challenge.bestStreak, nextStreak),
      lastProgressDate: today,
    };
  });
}

function getWebsiteUsageMinutesTotal(websiteUsage: Record<string, unknown>) {
  const sites = safeObj(websiteUsage.sites);
  let total = 0;
  for (const value of Object.values(sites)) {
    const minutes = Math.max(0, toFinite(value, 0));
    total += minutes;
  }
  return Math.round(total);
}

function calculateMilestoneProgress(goal: HubGoal) {
  if (!goal.milestones.length) {
    return Math.max(0, Math.min(100, Math.round(goal.progress)));
  }
  const completed = goal.milestones.filter((milestone) => milestone.isCompleted).length;
  return Math.round((completed / goal.milestones.length) * 100);
}

function refreshTrackedGoals(
  goals: HubGoal[],
  tasks: HubTask[],
  sessions: HubFocusSession[],
  websiteUsage: Record<string, unknown>,
) {
  const websiteMinutes = getWebsiteUsageMinutesTotal(websiteUsage);
  const currentIso = nowIso();

  return goals.map((goal) => {
    const trackingType = normalizeGoalTrackingType(goal.trackingType);
    const createdTs = toDateTimestamp(goal.createdAt) ?? 0;

    if (trackingType === 'milestones') {
      const progress = calculateMilestoneProgress(goal);
      return {
        ...goal,
        trackingType,
        progress,
      };
    }

    let trackingCurrent = 0;
    let trackingTarget = Math.max(1, toFinite(goal.trackingTarget, 1));

    if (trackingType === 'focus_hours') {
      trackingTarget = Math.max(0.5, Math.round(trackingTarget * 10) / 10);
      let totalMinutes = 0;

      for (const session of sessions) {
        if (session.status === 'active') continue;
        const ts = toDateTimestamp(session.endTime || session.startTime);
        if (ts != null && ts < createdTs) continue;
        totalMinutes += Math.max(0, Math.round(toFinite(session.actualDurationMinutes, 0)));
      }

      trackingCurrent = Math.round((totalMinutes / 60) * 10) / 10;
    } else if (trackingType === 'tasks_completed') {
      trackingTarget = Math.max(1, Math.round(trackingTarget));
      trackingCurrent = tasks.filter((task) => {
        if (task.status !== 'completed') return false;
        const ts = toDateTimestamp(task.completedAt || task.updatedAt || task.createdAt);
        if (ts == null) return true;
        return ts >= createdTs;
      }).length;
    } else if (trackingType === 'website_minutes') {
      trackingTarget = Math.max(1, Math.round(trackingTarget));
      trackingCurrent = websiteMinutes;
    }

    const progress = Math.max(0, Math.min(100, Math.round((trackingCurrent / trackingTarget) * 100)));
    const shouldAutoComplete = trackingType !== 'website_minutes' && progress >= 100;

    return {
      ...goal,
      trackingType,
      trackingTarget,
      trackingCurrent,
      progress,
      status: shouldAutoComplete && goal.status === 'active' ? 'completed' : goal.status,
      completedAt: shouldAutoComplete && !goal.completedAt ? currentIso : goal.completedAt,
      updatedAt: currentIso,
    };
  });
}

function computeProductivityScore(stats: HubDailyStats, settings: Record<string, unknown>) {
  const targetMinutes = Math.max(30, Math.round(toFinite(settings.dailyStudyTarget, 8) * 60));
  const targetTasks = Math.max(1, Math.round(toFinite(settings.dailyTaskTarget, 5)));

  const focusScore = Math.min((stats.focusMinutes / targetMinutes) * 40, 40);
  const taskScore = Math.min((stats.tasksCompleted / targetTasks) * 35, 35);
  const sessionScore = Math.min((stats.focusSessions / 8) * 15, 15);

  const hasActivity = stats.focusMinutes > 0 || stats.tasksCompleted > 0 || stats.focusSessions > 0;
  const distractionPenalty = Math.min(stats.distractionsBlocked * 0.5, 10);
  const distractionScore = hasActivity ? (10 - distractionPenalty) : 0;

  return Math.max(0, Math.min(100, Math.round(focusScore + taskScore + sessionScore + distractionScore)));
}

function refreshTodayStats(snapshot: HubSnapshot) {
  const today = todayYmd();
  const existing = normalizeDailyStats(snapshot.dailyStats[today]);

  const tasksCreated = snapshot.tasks.filter((task) => toYmd(task.createdAt) === today).length;
  const tasksCompleted = snapshot.tasks.filter((task) => toYmd(task.completedAt) === today).length;

  const sessionsToday = snapshot.focusSessions.filter((session) => {
    const ymd = toYmd(session.date) || toYmd(session.startTime);
    return ymd === today && session.status !== 'active';
  });

  const focusMinutes = sessionsToday.reduce(
    (sum, session) => sum + Math.max(0, Math.round(toFinite(session.actualDurationMinutes, 0))),
    0,
  );

  const goalsProgress = snapshot.goals.length
    ? Math.round(snapshot.goals.reduce((sum, goal) => sum + goal.progress, 0) / snapshot.goals.length)
    : 0;

  const merged: HubDailyStats = {
    ...existing,
    date: today,
    tasksCreated,
    tasksCompleted,
    focusMinutes,
    focusSessions: sessionsToday.length,
    goalsProgress,
    productivityScore: 0,
  };

  merged.productivityScore = computeProductivityScore(merged, safeObj(snapshot.settings));

  return {
    ...snapshot,
    dailyStats: {
      ...snapshot.dailyStats,
      [today]: merged,
    },
  };
}

function finalizeSnapshot(input: HubSnapshot) {
  const normalized = normalizeSnapshot(input);
  normalized.challenges = refreshChallengePeriods(normalized.challenges);
  normalized.goals = refreshTrackedGoals(
    normalized.goals,
    normalized.tasks,
    normalized.focusSessions,
    normalized.websiteDailyUsage,
  );
  return refreshTodayStats(normalized);
}

function formatTimer(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
  const secs = (safeSeconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function formatMinutes(minutes: number) {
  if (minutes <= 0) return '0m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatYmdLabel(ymd: string | null) {
  if (!ymd) return 'No due date';
  const date = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(date.getTime())) return ymd;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getDayDiff(fromYmd: string, toYmdValue: string) {
  const fromTs = toDateTimestamp(fromYmd);
  const toTs = toDateTimestamp(toYmdValue);
  if (fromTs == null || toTs == null) return 0;
  const diffMs = toTs - fromTs;
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

function formatDueLabel(dueYmd: string, nowYmd: string) {
  const daysDiff = getDayDiff(nowYmd, dueYmd);
  if (daysDiff < 0) return `Overdue by ${Math.abs(daysDiff)}d`;
  if (daysDiff === 0) return 'Due today';
  if (daysDiff === 1) return 'Due tomorrow';
  return `Due in ${daysDiff}d`;
}

function getDashboardGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatTimeLabel(value: string | null) {
  if (!value) return '--:--';
  const normalized = normalizeTimeValue(value, '');
  if (!normalized) return value;
  const [hours, minutes] = normalized.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function scheduleTimeToMinutes(value: string | null) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const normalized = normalizeTimeValue(value, '');
  if (!normalized) return Number.MAX_SAFE_INTEGER;
  const [hours, minutes] = normalized.split(':').map(Number);
  return (hours * 60) + minutes;
}

function compareScheduleEvents(a: HubScheduleEvent, b: HubScheduleEvent) {
  const timeDiff = scheduleTimeToMinutes(a.startTime) - scheduleTimeToMinutes(b.startTime);
  if (timeDiff !== 0) return timeDiff;
  return a.title.localeCompare(b.title);
}

function toLabelCase(value: string) {
  const normalized = String(value || '').trim().replace(/[_-]+/g, ' ');
  if (!normalized) return 'Other';
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function addDaysToYmd(baseYmd: string, days: number) {
  const parsed = new Date(`${baseYmd}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return baseYmd;
  parsed.setDate(parsed.getDate() + days);
  return formatLocalYmd(parsed);
}

function getMonthStartYmd(ymd: string) {
  const parsed = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return todayYmd().slice(0, 8) + '01';
  parsed.setDate(1);
  return formatLocalYmd(parsed);
}

function addMonthsToYmd(baseYmd: string, months: number) {
  const parsed = new Date(`${baseYmd}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return baseYmd;
  parsed.setMonth(parsed.getMonth() + months, 1);
  return formatLocalYmd(parsed);
}

function formatMonthYearLabel(monthStartYmd: string) {
  const parsed = new Date(`${monthStartYmd}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return monthStartYmd;
  return parsed.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function getCalendarWeekStartYmd(ymd: string) {
  const parsed = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return ymd;
  const day = parsed.getDay();
  parsed.setDate(parsed.getDate() - day);
  return formatLocalYmd(parsed);
}

function buildCalendarWeekDays(weekStartYmd: string): CalendarGridDay[] {
  const weekStart = new Date(`${weekStartYmd}T00:00:00`);
  if (Number.isNaN(weekStart.getTime())) return [];

  const days: CalendarGridDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const current = new Date(weekStart);
    current.setDate(weekStart.getDate() + i);
    days.push({
      ymd: formatLocalYmd(current),
      dayOfMonth: current.getDate(),
      inMonth: true,
    });
  }
  return days;
}

function formatWeekRangeLabel(weekStartYmd: string) {
  const start = new Date(`${weekStartYmd}T00:00:00`);
  if (Number.isNaN(start.getTime())) return weekStartYmd;

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startLabel} - ${endLabel}`;
}

function taskOccursOnDate(task: HubTask, ymd: string) {
  if (task.status === 'completed') return false;

  const due = toYmd(task.dueDate);
  if (due === ymd) return true;

  const repeatType = String(task.repeatType || '').trim().toLowerCase();
  if (!task.isRecurring || repeatType !== 'daily') return false;
  if (due && due > ymd) return false;
  return true;
}

function getTasksForDate(tasks: HubTask[], ymd: string) {
  return tasks
    .filter((task) => taskOccursOnDate(task, ymd))
    .sort((a, b) => {
      const aTime = a.dueTime || '99:99';
      const bTime = b.dueTime || '99:99';
      if (aTime !== bTime) return aTime.localeCompare(bTime);

      const priorityDiff = getTaskPriorityRank(b.priority) - getTaskPriorityRank(a.priority);
      if (priorityDiff !== 0) return priorityDiff;

      return a.title.localeCompare(b.title);
    });
}

function buildScheduleAgendaForDate(events: HubScheduleEvent[], tasks: HubTask[], ymd: string): ScheduleAgendaItem[] {
  const eventItems: ScheduleAgendaItem[] = getScheduleEventsForDate(events, ymd).map((event) => ({
    key: `event_${event.id}_${ymd}_${event.startTime}`,
    ymd,
    title: event.title,
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location,
    isTask: false,
    type: event.type,
    task: null,
    event,
  }));

  const taskItems: ScheduleAgendaItem[] = getTasksForDate(tasks, ymd).map((task) => ({
    key: `task_${task.id}_${ymd}`,
    ymd,
    title: task.title,
    startTime: normalizeTimeValue(task.dueTime, '09:00'),
    endTime: task.dueTime,
    location: '',
    isTask: true,
    type: 'task',
    task,
    event: null,
  }));

  return [...eventItems, ...taskItems].sort((a, b) => {
    const timeDiff = scheduleTimeToMinutes(a.startTime) - scheduleTimeToMinutes(b.startTime);
    if (timeDiff !== 0) return timeDiff;
    if (a.isTask !== b.isTask) return a.isTask ? 1 : -1;
    return a.title.localeCompare(b.title);
  });
}

function buildCalendarGridDays(monthStartYmd: string): CalendarGridDay[] {
  const monthStart = new Date(`${monthStartYmd}T00:00:00`);
  if (Number.isNaN(monthStart.getTime())) return [];

  const startWeekday = monthStart.getDay();
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - startWeekday);

  const days: CalendarGridDay[] = [];
  for (let i = 0; i < 42; i += 1) {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + i);
    days.push({
      ymd: formatLocalYmd(current),
      dayOfMonth: current.getDate(),
      inMonth: current.getMonth() === monthStart.getMonth(),
    });
  }

  return days;
}

function getScheduleEventsForDate(events: HubScheduleEvent[], ymd: string) {
  return events
    .filter((event) => scheduleEventOccursOn(event, ymd))
    .sort(compareScheduleEvents);
}

function buildScheduleOccurrences(events: HubScheduleEvent[], startYmd: string, daysWindow: number) {
  const totalDays = Math.max(1, Math.round(daysWindow));
  const occurrences: HubScheduleOccurrence[] = [];

  for (let offset = 0; offset < totalDays; offset += 1) {
    const ymd = addDaysToYmd(startYmd, offset);

    for (const event of events) {
      if (!scheduleEventOccursOn(event, ymd)) continue;
      occurrences.push({
        key: `${event.id}_${ymd}_${event.startTime}`,
        occurrenceDate: ymd,
        event,
      });
    }
  }

  return occurrences.sort((a, b) => {
    if (a.occurrenceDate !== b.occurrenceDate) {
      return a.occurrenceDate.localeCompare(b.occurrenceDate);
    }

    return compareScheduleEvents(a.event, b.event);
  });
}

function getTaskPriorityRank(priority: TaskPriority) {
  if (priority === 'urgent') return 4;
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  return 1;
}

function getTaskBucket(task: HubTask): 'overdue' | 'today' | 'upcoming' | 'completed' {
  if (task.status === 'completed') return 'completed';
  const due = toYmd(task.dueDate);
  const today = todayYmd();
  if (!due) return 'upcoming';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  return 'upcoming';
}

function nextTaskStatus(status: TaskStatus): TaskStatus {
  if (status === 'not-started') return 'in-progress';
  if (status === 'in-progress') return 'completed';
  return 'not-started';
}

function nextTaskStatusLabel(status: TaskStatus) {
  if (status === 'not-started') return 'Start';
  if (status === 'in-progress') return 'Complete';
  return 'Reopen';
}

function challengeMetricDescription(metric: string, target: number, minMinutes: number) {
  if (metric === 'focus_sessions') {
    if (minMinutes > 0) return `Complete ${target} focus sessions (${minMinutes}+ min each).`;
    return `Complete ${target} focus sessions.`;
  }
  if (metric === 'focus_time') return `Accumulate ${target} focus minutes.`;
  if (metric === 'reviews') return `Complete ${target} review actions.`;
  return `Complete ${target} tasks.`;
}

function getGoalTrackingSummary(goal: HubGoal) {
  if (goal.trackingType === 'focus_hours') {
    return `${goal.trackingCurrent.toFixed(1)} / ${goal.trackingTarget.toFixed(1)} hours`;
  }
  if (goal.trackingType === 'tasks_completed') {
    return `${Math.round(goal.trackingCurrent)} / ${Math.round(goal.trackingTarget)} tasks`;
  }
  if (goal.trackingType === 'website_minutes') {
    return `${Math.round(goal.trackingCurrent)} / ${Math.round(goal.trackingTarget)} minutes`;
  }

  if (!goal.milestones.length) {
    return `${goal.progress}% complete`;
  }

  const completed = goal.milestones.filter((m) => m.isCompleted).length;
  return `${completed} / ${goal.milestones.length} milestones`;
}

function getGoalIncrement(goal: HubGoal) {
  if (goal.trackingType === 'focus_hours') return 0.5;
  if (goal.trackingType === 'tasks_completed') return 1;
  if (goal.trackingType === 'website_minutes') return 10;
  return 10;
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [snapshot, setSnapshot] = useState<HubSnapshot>(createEmptySnapshot());
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [scheduleView, setScheduleView] = useState<ScheduleView>('school');
  const [scheduleCalendarMode, setScheduleCalendarMode] = useState<ScheduleCalendarMode>('month');
  const [scheduleSelectedDate, setScheduleSelectedDate] = useState(todayYmd());
  const [scheduleMonthCursor, setScheduleMonthCursor] = useState(() => getMonthStartYmd(todayYmd()));
  const [scheduleWeekCursor, setScheduleWeekCursor] = useState(() => getCalendarWeekStartYmd(todayYmd()));

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskDueTime, setTaskDueTime] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium');
  const [dashboardTaskInput, setDashboardTaskInput] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [editingTaskDueDate, setEditingTaskDueDate] = useState('');
  const [editingTaskDueTime, setEditingTaskDueTime] = useState('');
  const [editingTaskPriority, setEditingTaskPriority] = useState<TaskPriority>('medium');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<'all' | TaskStatus>('all');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<'all' | TaskPriority>('all');

  const [goalTitle, setGoalTitle] = useState('');
  const [goalCategory, setGoalCategory] = useState<GoalCategory>('academic');
  const [goalTrackingType, setGoalTrackingType] = useState<GoalTrackingType>('milestones');
  const [goalTarget, setGoalTarget] = useState('10');
  const [goalFilter, setGoalFilter] = useState<'all' | GoalCategory>('all');

  const [dailyStudyTargetInput, setDailyStudyTargetInput] = useState('8');
  const [dailyTaskTargetInput, setDailyTaskTargetInput] = useState('5');
  const [weeklyStudyTargetInput, setWeeklyStudyTargetInput] = useState('40');

  const [challengeTitle, setChallengeTitle] = useState('');
  const [challengeTarget, setChallengeTarget] = useState('5');
  const [challengeType, setChallengeType] = useState<ChallengeType>('daily');
  const [challengeMetric, setChallengeMetric] = useState<'tasks' | 'focus_sessions' | 'focus_time' | 'reviews'>('tasks');
  const [challengeMinMinutes, setChallengeMinMinutes] = useState('25');
  const [challengeFilter, setChallengeFilter] = useState<'all' | 'active' | 'completed' | 'daily' | 'weekly'>('all');

  const [focusPresetMinutes, setFocusPresetMinutes] = useState<number>(25);
  const [focusCustomMinutes, setFocusCustomMinutes] = useState('45');
  const [focusLinkedTaskId, setFocusLinkedTaskId] = useState('');
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [focusRemainingSeconds, setFocusRemainingSeconds] = useState(25 * 60);
  const [focusTargetMinutes, setFocusTargetMinutes] = useState(25);
  const [focusStartedAt, setFocusStartedAt] = useState<string | null>(null);
  const [focusDndEnabled, setFocusDndEnabled] = useState(false);

  const [reminderHour, setReminderHour] = useState('20');
  const [reminderMinute, setReminderMinute] = useState('00');
  const [smartReminderSettings, setSmartReminderSettings] = useState<SmartReminderSettings>(
    DEFAULT_SMART_REMINDER_SETTINGS,
  );
  const [smartReminderStatus, setSmartReminderStatus] = useState('Custom reminders are not configured yet.');
  const [interactionPermissionPrompted, setInteractionPermissionPrompted] = useState(false);
  const lastInteractionNotificationAtRef = useRef(0);
  const focusStateSyncBusyRef = useRef(false);
  const lastFocusStateSyncAtRef = useRef(0);
  const lastFocusStateSyncedSecondRef = useRef<number | null>(null);
  const taskReminderSyncBusyRef = useRef(false);
  const smartReminderSyncBusyRef = useRef(false);
  const focusRunningRef = useRef(false);
  const focusDndEnabledRef = useRef(false);
  const firestoreUnsubRef = useRef<(() => void) | null>(null);
  const syncMutedUntilRef = useRef(0);

  const isExpoGoAndroid = Platform.OS === 'android'
    && (Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo');

  const tabs: Array<{ key: AppTab; label: string }> = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'today', label: 'Today' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'goals', label: 'Goals' },
    { key: 'revisions', label: 'Revisions' },
    { key: 'challenges', label: 'Challenges' },
    { key: 'focus', label: 'Focus' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'sync', label: 'Sync' },
    { key: 'notifications', label: 'Notifications' },
  ];

  const tasksDone = useMemo(
    () => snapshot.tasks.filter((task) => task.status === 'completed').length,
    [snapshot.tasks],
  );

  const focusMinutesToday = useMemo(() => {
    const stats = snapshot.dailyStats[todayYmd()];
    return stats ? stats.focusMinutes : 0;
  }, [snapshot.dailyStats]);

  const activeGoalsCount = useMemo(
    () => snapshot.goals.filter((goal) => goal.status === 'active').length,
    [snapshot.goals],
  );

  const completedChallenges = useMemo(
    () => snapshot.challenges.filter((challenge) => challenge.status === 'completed').length,
    [snapshot.challenges],
  );

  const bestChallengeStreak = useMemo(
    () => snapshot.challenges.reduce((max, challenge) => Math.max(max, challenge.bestStreak), 0),
    [snapshot.challenges],
  );

  const todayStats = useMemo(
    () => normalizeDailyStats(snapshot.dailyStats[todayYmd()]),
    [snapshot.dailyStats],
  );

  const allScheduleEvents = useMemo(() => {
    const school = snapshot.scheduleSchool.map((event) => normalizeScheduleEvent(event, 'school'));
    const personal = snapshot.schedulePersonal.map((event) => normalizeScheduleEvent(event, 'personal'));
    return [...school, ...personal];
  }, [snapshot.scheduleSchool, snapshot.schedulePersonal]);

  const scheduleEventsForView = useMemo(() => {
    if (scheduleView === 'combined') return allScheduleEvents;
    return allScheduleEvents.filter((event) => event.scheduleType === scheduleView);
  }, [allScheduleEvents, scheduleView]);

  const dashboardTodaySchedule = useMemo(() => {
    const today = todayYmd();
    return allScheduleEvents
      .filter((event) => scheduleEventOccursOn(event, today))
      .sort(compareScheduleEvents);
  }, [allScheduleEvents]);

  const todayScheduleForView = useMemo(() => {
    const today = todayYmd();
    return scheduleEventsForView
      .filter((event) => scheduleEventOccursOn(event, today))
      .sort(compareScheduleEvents);
  }, [scheduleEventsForView]);

  const selectedDateAgendaItems = useMemo(
    () => buildScheduleAgendaForDate(scheduleEventsForView, snapshot.tasks, scheduleSelectedDate),
    [scheduleEventsForView, snapshot.tasks, scheduleSelectedDate],
  );

  const scheduleCalendarGridDays = useMemo(
    () => buildCalendarGridDays(scheduleMonthCursor),
    [scheduleMonthCursor],
  );

  const scheduleWeekDays = useMemo(
    () => buildCalendarWeekDays(scheduleWeekCursor),
    [scheduleWeekCursor],
  );

  const scheduleVisibleCalendarDays = useMemo(
    () => (scheduleCalendarMode === 'week' ? scheduleWeekDays : scheduleCalendarGridDays),
    [scheduleCalendarMode, scheduleWeekDays, scheduleCalendarGridDays],
  );

  const scheduleEventCountByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const day of scheduleVisibleCalendarDays) {
      const eventsCount = getScheduleEventsForDate(scheduleEventsForView, day.ymd).length;
      const tasksCount = getTasksForDate(snapshot.tasks, day.ymd).length;
      counts[day.ymd] = eventsCount + tasksCount;
    }
    return counts;
  }, [scheduleVisibleCalendarDays, scheduleEventsForView, snapshot.tasks]);

  const upcomingScheduleForView = useMemo(
    () => buildScheduleOccurrences(scheduleEventsForView, todayYmd(), 14).slice(0, 12),
    [scheduleEventsForView],
  );

  const priorityTasksPreview = useMemo(() => {
    return [...snapshot.tasks]
      .filter((task) => task.status !== 'completed')
      .sort((a, b) => {
        const priorityDiff = getTaskPriorityRank(b.priority) - getTaskPriorityRank(a.priority);
        if (priorityDiff !== 0) return priorityDiff;

        const aDue = a.dueDate || '9999-12-31';
        const bDue = b.dueDate || '9999-12-31';
        if (aDue !== bDue) return aDue.localeCompare(bDue);

        return b.updatedAt.localeCompare(a.updatedAt);
      })
      .slice(0, 5);
  }, [snapshot.tasks]);

  const upcomingDeadlineTasks = useMemo(() => {
    return [...snapshot.tasks]
      .filter((task) => task.status !== 'completed' && Boolean(task.dueDate))
      .sort((a, b) => {
        const dueDiff = (a.dueDate || '').localeCompare(b.dueDate || '');
        if (dueDiff !== 0) return dueDiff;
        return getTaskPriorityRank(b.priority) - getTaskPriorityRank(a.priority);
      })
      .slice(0, 5);
  }, [snapshot.tasks]);

  const dashboardTodayTasks = useMemo(() => {
    const today = todayYmd();

    return [...snapshot.tasks]
      .filter((task) => {
        if (task.status === 'completed') return false;
        if (task.dueDate === today) return true;

        const repeat = String(task.repeatType || '').trim().toLowerCase();
        return task.isRecurring && repeat === 'daily';
      })
      .sort((a, b) => {
        const priorityDiff = getTaskPriorityRank(b.priority) - getTaskPriorityRank(a.priority);
        if (priorityDiff !== 0) return priorityDiff;

        const aTime = a.dueTime || '99:99';
        const bTime = b.dueTime || '99:99';
        if (aTime !== bTime) return aTime.localeCompare(bTime);

        return a.title.localeCompare(b.title);
      })
      .slice(0, 8);
  }, [snapshot.tasks]);

  const todayChallengeHighlights = useMemo(() => {
    const today = todayYmd();

    return snapshot.challenges
      .filter((challenge) => challenge.targetProgress > 0 && challenge.title)
      .filter((challenge) => challenge.status === 'active' || challenge.status === 'completed')
      .map((challenge) => {
        const percent = Math.max(
          0,
          Math.min(100, Math.round((challenge.currentProgress / Math.max(1, challenge.targetProgress)) * 100)),
        );
        const needsProgressToday = challenge.status === 'active'
          && challenge.type === 'daily'
          && challenge.lastProgressDate !== today;

        return {
          challenge,
          percent,
          needsProgressToday,
        };
      })
      .sort((a, b) => {
        if (a.needsProgressToday !== b.needsProgressToday) return a.needsProgressToday ? -1 : 1;

        const aRank = a.challenge.status === 'active' ? 0 : 1;
        const bRank = b.challenge.status === 'active' ? 0 : 1;
        if (aRank !== bRank) return aRank - bRank;

        if (a.challenge.type !== b.challenge.type) {
          if (a.challenge.type === 'daily') return -1;
          if (b.challenge.type === 'daily') return 1;
        }

        return b.percent - a.percent;
      })
      .slice(0, 8);
  }, [snapshot.challenges]);

  const todayAgendaItems = useMemo<TodayAgendaItem[]>(() => {
    return [
      ...dashboardTodaySchedule.map((event) => {
        const source = getImportedSourceDetails(event, snapshot.importedCalendarsMeta);
        return {
          id: event.id,
          taskId: null,
          title: event.title,
          type: event.type,
          startTime: event.startTime,
          endTime: event.endTime,
          location: event.location,
          isTask: false,
          sourceLabel: source?.label,
          sourceColor: source?.color,
        };
      }),
      ...dashboardTodayTasks.map((task) => ({
        id: `task_${task.id}`,
        taskId: task.id,
        title: task.title,
        type: 'task',
        startTime: task.dueTime || '09:00',
        endTime: task.dueTime || null,
        location: '',
        isTask: true,
        sourceLabel: undefined,
        sourceColor: undefined,
      })),
    ].sort((a, b) => scheduleTimeToMinutes(a.startTime) - scheduleTimeToMinutes(b.startTime));
  }, [dashboardTodaySchedule, dashboardTodayTasks, snapshot.importedCalendarsMeta]);

  const todayDigest = useMemo(() => {
    const activeChallengeCount = todayChallengeHighlights.filter((entry) => entry.challenge.status === 'active').length;
    const nextTask = dashboardTodayTasks[0]?.title || '';
    const nextEvent = dashboardTodaySchedule[0];
    const nextEventLabel = nextEvent
      ? `${nextEvent.title} at ${formatTimeLabel(nextEvent.startTime)}`
      : '';

    const details: string[] = [];
    if (nextTask) details.push(`Top task: ${nextTask}.`);
    if (nextEventLabel) details.push(`Next event: ${nextEventLabel}.`);

    return {
      title: 'Today in Productivity Hub',
      body: `${dashboardTodayTasks.length} tasks, ${dashboardTodaySchedule.length} schedule items, ${activeChallengeCount} active challenges.${details.length ? ` ${details.join(' ')}` : ''}`,
    };
  }, [dashboardTodayTasks, dashboardTodaySchedule, todayChallengeHighlights]);

  const dashboardGoalsSummary = useMemo(() => {
    const goalRows = snapshot.goals
      .filter((goal) => goal.status !== 'abandoned')
      .map((goal) => {
        const progress = Math.max(0, Math.min(100, Math.round(goal.progress)));
        return { goal, progress };
      })
      .sort((a, b) => {
        const aDone = a.progress >= 100 ? 1 : 0;
        const bDone = b.progress >= 100 ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return b.progress - a.progress;
      });

    const completedCount = goalRows.filter((entry) => entry.progress >= 100).length;
    const avgProgress = goalRows.length
      ? Math.round(goalRows.reduce((sum, entry) => sum + entry.progress, 0) / goalRows.length)
      : 0;

    return {
      rows: goalRows.slice(0, 4),
      completedCount,
      avgProgress,
      totalCount: goalRows.length,
    };
  }, [snapshot.goals]);

  const dashboardReviewItems = useMemo(() => {
    const today = todayYmd();

    return safeArray(snapshot.revisions)
      .map((revisionRaw) => {
        const revision = safeObj(revisionRaw);
        const dueYmd = toYmd(revision.dueDate) || toYmd(revision.nextReview);
        return {
          id: typeof revision.id === 'string' && revision.id ? revision.id : generateId('review'),
          title: typeof revision.title === 'string' && revision.title.trim() ? revision.title.trim() : 'Review item',
          dueYmd,
        };
      })
      .filter((item) => Boolean(item.dueYmd) && (item.dueYmd as string) <= today)
      .sort((a, b) => String(a.dueYmd).localeCompare(String(b.dueYmd)))
      .slice(0, 3);
  }, [snapshot.revisions]);

  const revisionsList = useMemo(() => {
    return safeArray(snapshot.revisions)
      .map((revisionRaw) => {
        const revision = safeObj(revisionRaw);
        const dueYmd = toYmd(revision.dueDate) || toYmd(revision.nextReview);

        return {
          id: typeof revision.id === 'string' && revision.id ? revision.id : generateId('review'),
          title: typeof revision.title === 'string' && revision.title.trim() ? revision.title.trim() : 'Review item',
          dueYmd,
          source: typeof revision.source === 'string' ? revision.source : '',
        };
      })
      .sort((a, b) => {
        if (!a.dueYmd && !b.dueYmd) return a.title.localeCompare(b.title);
        if (!a.dueYmd) return 1;
        if (!b.dueYmd) return -1;
        return a.dueYmd.localeCompare(b.dueYmd);
      });
  }, [snapshot.revisions]);

  const dashboardBestRecord = useMemo(() => {
    const rows = Object.entries(snapshot.dailyStats)
      .map(([dateKey, statsRaw]) => {
        const stats = normalizeDailyStats(statsRaw);
        const date = toYmd(dateKey) || stats.date;

        return {
          date,
          focusMinutes: Math.max(0, Math.round(toFinite(stats.focusMinutes, 0))),
          focusSessions: Math.max(0, Math.round(toFinite(stats.focusSessions, 0))),
          tasksCompleted: Math.max(0, Math.round(toFinite(stats.tasksCompleted, 0))),
          productivityScore: Math.max(0, Math.round(toFinite(stats.productivityScore, 0))),
        };
      })
      .filter((row) => row.date);

    let bestDay: (typeof rows)[number] | null = null;
    for (const row of rows) {
      if (row.focusMinutes <= 0) continue;
      if (!bestDay || row.focusMinutes > bestDay.focusMinutes) {
        bestDay = row;
      }
    }

    if (!bestDay) return null;

    const today = todayYmd();
    const todayRow = rows.find((row) => row.date === today) || {
      date: today,
      focusMinutes: todayStats.focusMinutes,
      focusSessions: todayStats.focusSessions,
      tasksCompleted: todayStats.tasksCompleted,
      productivityScore: todayStats.productivityScore,
    };

    const isToday = bestDay.date === today;
    const progress = bestDay.focusMinutes > 0
      ? Math.min(100, Math.round((todayRow.focusMinutes / bestDay.focusMinutes) * 100))
      : 0;
    const remaining = Math.max(0, bestDay.focusMinutes - todayRow.focusMinutes);

    return {
      bestDay,
      todayRow,
      isToday,
      isNewRecord: isToday && todayRow.focusMinutes >= bestDay.focusMinutes && todayRow.focusMinutes > 0,
      progress,
      remaining,
    };
  }, [snapshot.dailyStats, todayStats]);

  const dashboardDeadlineItems = useMemo(() => {
    const today = todayYmd();
    return upcomingDeadlineTasks.map((task) => ({
      task,
      dueLabel: formatDueLabel(task.dueDate || today, today),
    }));
  }, [upcomingDeadlineTasks]);

  const filteredTasks = useMemo(() => {
    const query = taskSearch.trim().toLowerCase();

    return [...snapshot.tasks]
      .filter((task) => {
        if (taskStatusFilter !== 'all' && task.status !== taskStatusFilter) return false;
        if (taskPriorityFilter !== 'all' && task.priority !== taskPriorityFilter) return false;

        if (query) {
          const haystack = `${task.title} ${task.description} ${task.category} ${task.tags.join(' ')}`.toLowerCase();
          if (!haystack.includes(query)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (a.status !== b.status) {
          const order = { 'not-started': 0, 'in-progress': 1, completed: 2 } as const;
          return order[a.status] - order[b.status];
        }

        const priorityDiff = getTaskPriorityRank(b.priority) - getTaskPriorityRank(a.priority);
        if (priorityDiff !== 0) return priorityDiff;

        const aDue = a.dueDate || '9999-12-31';
        const bDue = b.dueDate || '9999-12-31';
        if (aDue !== bDue) return aDue.localeCompare(bDue);

        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [snapshot.tasks, taskSearch, taskStatusFilter, taskPriorityFilter]);

  const groupedTasks = useMemo(() => {
    const overdue = filteredTasks.filter((task) => getTaskBucket(task) === 'overdue');
    const today = filteredTasks.filter((task) => getTaskBucket(task) === 'today');
    const upcoming = filteredTasks.filter((task) => getTaskBucket(task) === 'upcoming');
    const completed = filteredTasks.filter((task) => getTaskBucket(task) === 'completed');
    return { overdue, today, upcoming, completed };
  }, [filteredTasks]);

  const filteredGoals = useMemo(() => {
    if (goalFilter === 'all') return snapshot.goals;
    return snapshot.goals.filter((goal) => goal.category === goalFilter);
  }, [snapshot.goals, goalFilter]);

  const filteredChallenges = useMemo(() => {
    return snapshot.challenges.filter((challenge) => {
      if (challengeFilter === 'all') return true;
      if (challengeFilter === 'active') return challenge.status === 'active';
      if (challengeFilter === 'completed') return challenge.status === 'completed';
      if (challengeFilter === 'daily') return challenge.type === 'daily';
      if (challengeFilter === 'weekly') return challenge.type === 'weekly';
      return true;
    });
  }, [snapshot.challenges, challengeFilter]);

  const weeklySeries = useMemo(() => {
    const rows: Array<{ date: string; label: string; focusMinutes: number; tasksCompleted: number; score: number }> = [];

    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const ymd = formatLocalYmd(date);
      const stats = normalizeDailyStats(snapshot.dailyStats[ymd]);
      rows.push({
        date: ymd,
        label: date.toLocaleDateString(undefined, { weekday: 'short' }),
        focusMinutes: stats.focusMinutes,
        tasksCompleted: stats.tasksCompleted,
        score: stats.productivityScore,
      });
    }

    return rows;
  }, [snapshot.dailyStats]);

  const weeklyFocusMinutes = useMemo(
    () => weeklySeries.reduce((sum, row) => sum + row.focusMinutes, 0),
    [weeklySeries],
  );

  const weeklyTasksDone = useMemo(
    () => weeklySeries.reduce((sum, row) => sum + row.tasksCompleted, 0),
    [weeklySeries],
  );

  const averageWeeklyScore = useMemo(() => {
    if (!weeklySeries.length) return 0;
    const total = weeklySeries.reduce((sum, row) => sum + row.score, 0);
    return Math.round(total / weeklySeries.length);
  }, [weeklySeries]);

  const smartReminderCategories: Array<{
    key: ReminderCategory;
    label: string;
    description: string;
  }> = [
    {
      key: 'tasks',
      label: 'Tasks',
      description: 'Notify before due tasks',
    },
    {
      key: 'schedule',
      label: 'Schedules',
      description: 'Notify before events start',
    },
    {
      key: 'challenges',
      label: 'Challenges',
      description: 'Notify before daily/weekly challenge deadlines',
    },
  ];

  function isFocusDndActive() {
    return focusDndEnabledRef.current && focusRunningRef.current;
  }

  async function configureAndroidNotificationChannels(silent: boolean) {
    if (Platform.OS !== 'android') return;

    const notifications = getNotificationsModule();
    if (!notifications) return;

    // daily-reminders and interaction-feedback are always configured at full importance.
    // When a focus/DND session is active, getNotificationChannelId() routes reminders to the
    // silent channel instead — so these channels only fire when the user is not in DND.
    await notifications.setNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL_ID, {
      name: 'Daily reminders',
      importance: notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
    }).catch(() => undefined);

    await notifications.setNotificationChannelAsync(ANDROID_INTERACTION_CHANNEL_ID, {
      name: 'Interaction feedback',
      importance: notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 120],
      enableVibrate: true,
    }).catch(() => undefined);

    await notifications.setNotificationChannelAsync(ANDROID_FOCUS_SILENT_CHANNEL_ID, {
      name: 'Focus DND (silent)',
      importance: notifications.AndroidImportance.MIN,
      sound: null,
      vibrationPattern: [0],
    }).catch(() => undefined);
  }

  function buildFocusStateFromRuntime(): HubFocusState | null {
    if (!focusRunning) return null;

    const selectedMinutes = Math.max(1, Math.round(toFinite(focusTargetMinutes, getSelectedFocusMinutes())));
    const remainingSeconds = Math.max(0, Math.round(toFinite(focusRemainingSeconds, selectedMinutes * 60)));
    const parsedStart = focusStartedAt ? Date.parse(focusStartedAt) : Number.NaN;
    const startTimestamp = Number.isFinite(parsedStart)
      ? Math.round(parsedStart)
      : Date.now() - Math.max(0, ((selectedMinutes * 60) - remainingSeconds) * 1000);
    const linkedTask = snapshot.tasks.find((task) => task.id === focusLinkedTaskId);

    return {
      isActive: true,
      isPaused: focusPaused,
      isBreak: false,
      isOpenEnded: false,
      isExtraTime: false,
      extraTimeSeconds: 0,
      elapsedSeconds: Math.max(0, (selectedMinutes * 60) - remainingSeconds),
      remainingSeconds,
      selectedMinutes,
      isOverlayMinimized: false,
      taskTitle: linkedTask?.title || null,
      startTimestamp,
      endTimestamp: Date.now() + (remainingSeconds * 1000),
      pausedRemainingSeconds: focusPaused ? remainingSeconds : null,
      pausedElapsedSeconds: focusPaused ? Math.max(0, (selectedMinutes * 60) - remainingSeconds) : null,
      updatedAtMs: Date.now(),
    };
  }

  function hydrateFocusStateFromSnapshot(sourceSnapshot: HubSnapshot) {
    const incoming = normalizeFocusState(sourceSnapshot.focusState);
    if (!incoming?.isActive) return;

    const selectedMinutes = Math.max(1, incoming.selectedMinutes || 25);
    let remainingSeconds = Math.max(0, incoming.remainingSeconds || 0);

    if (incoming.isPaused) {
      remainingSeconds = Math.max(0, incoming.pausedRemainingSeconds ?? remainingSeconds);
    } else if (typeof incoming.endTimestamp === 'number') {
      remainingSeconds = Math.max(0, Math.ceil((incoming.endTimestamp - Date.now()) / 1000));
    }

    if (!incoming.isPaused && remainingSeconds <= 0) return;

    setFocusTargetMinutes(selectedMinutes);
    setFocusRemainingSeconds(remainingSeconds);
    setFocusStartedAt(incoming.startTimestamp ? new Date(incoming.startTimestamp).toISOString() : nowIso());
    setFocusPaused(incoming.isPaused);
    setFocusRunning(true);

    if (incoming.taskTitle) {
      const linked = sourceSnapshot.tasks.find((task) => task.title === incoming.taskTitle);
      if (linked?.id) setFocusLinkedTaskId(linked.id);
    }

    lastFocusStateSyncedSecondRef.current = remainingSeconds;
    lastFocusStateSyncAtRef.current = Date.now();
  }

  async function syncFocusStateSnapshot(force = false) {
    if (!focusRunning) return;
    if (focusStateSyncBusyRef.current) return;

    const currentSecond = Math.max(0, Math.round(focusRemainingSeconds));
    if (!force) {
      if (focusPaused) return;
      if (currentSecond <= 0) return;
      if (currentSecond % FOCUS_STATE_SYNC_INTERVAL_SECONDS !== 0) return;
      if (lastFocusStateSyncedSecondRef.current === currentSecond) return;
    }

    const nextFocusState = buildFocusStateFromRuntime();
    if (!nextFocusState) return;

    focusStateSyncBusyRef.current = true;

    try {
      const saved = await saveLocalSnapshot(normalizeSnapshot({
        ...snapshot,
        focusState: nextFocusState,
      }));

      lastFocusStateSyncAtRef.current = Date.now();
      lastFocusStateSyncedSecondRef.current = currentSecond;

      if (currentUser) {
        await pushToCloud(saved, { silent: true, allowConflictUpload: true });
      }
    } finally {
      focusStateSyncBusyRef.current = false;
    }
  }

  async function updateFocusDndSetting(enabled: boolean) {
    setFocusDndEnabled(enabled);

    const nextSettings = {
      ...safeObj(snapshot.settings),
      focusDndDuringSession: enabled,
    };

    await applyLocalChanges(normalizeSnapshot({
      ...snapshot,
      settings: nextSettings,
    }));
  }

  useEffect(() => {
    let active = true;

    const hydrateSmartReminderState = async () => {
      try {
        const storedSettings = await AsyncStorage.getItem(SMART_REMINDER_SETTINGS_KEY);
        if (storedSettings && active) {
          setSmartReminderSettings(normalizeSmartReminderSettings(JSON.parse(storedSettings)));
        }
      } catch {
        // Keep defaults on parse/storage failure.
      }

      try {
        const storedIds = await AsyncStorage.getItem(SMART_REMINDER_NOTIFICATION_IDS_KEY);
        const ids = storedIds ? safeArray<string>(JSON.parse(storedIds)) : [];
        if (active) {
          setSmartReminderStatus(
            ids.length > 0
              ? `${ids.length} custom reminder${ids.length === 1 ? '' : 's'} currently scheduled.`
              : 'No custom reminders scheduled.',
          );
        }
      } catch {
        if (active) setSmartReminderStatus('No custom reminders scheduled.');
      }
    };

    void hydrateSmartReminderState();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    focusRunningRef.current = focusRunning;
    focusNotificationRuntime.focusRunning = focusRunning;
  }, [focusRunning]);

  useEffect(() => {
    focusDndEnabledRef.current = focusDndEnabled;
    focusNotificationRuntime.dndEnabled = focusDndEnabled;
  }, [focusDndEnabled]);

  useEffect(() => {
    const dndActive = focusDndEnabled && focusRunning;
    void configureAndroidNotificationChannels(dndActive);
  }, [focusDndEnabled, focusRunning]);

  useEffect(() => {
    void syncTaskRemindersForSnapshot(snapshot);
  }, [snapshot.tasks]);

  // Auto-refresh smart reminders whenever tasks or schedule events change
  useEffect(() => {
    if (smartReminderSyncBusyRef.current) return;

    const notifications = getNotificationsModule();
    if (!notifications) return;

    smartReminderSyncBusyRef.current = true;

    const run = async () => {
      try {
        const permission = await notifications.getPermissionsAsync();
        if (!permission.granted) return;

        const raw = await AsyncStorage.getItem(SMART_REMINDER_SETTINGS_KEY);
        if (!raw) return;

        const savedSettings = normalizeSmartReminderSettings(JSON.parse(raw));
        const anyEnabled = savedSettings.tasks.enabled
          || savedSettings.schedule.enabled
          || savedSettings.challenges.enabled;
        if (!anyEnabled) return;

        await clearSmartReminders({ showAlert: false });

        const drafts = buildSmartReminderDrafts(savedSettings);
        if (!drafts.length) return;

        const scheduledIds: string[] = [];
        for (const draft of drafts) {
          const content: import('expo-notifications').NotificationContentInput = {
            title: draft.title,
            body: draft.body,
            sound: 'default',
            data: { scope: 'custom-reminder', category: draft.category, itemKey: draft.itemKey },
          };
          const dateTrigger = new Date(draft.triggerAtMs);
          try {
            const preferredTrigger = (
              Platform.OS === 'android'
                ? {
                    type: notifications.SchedulableTriggerInputTypes.DATE,
                    date: dateTrigger,
                    channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
                  }
                : { type: notifications.SchedulableTriggerInputTypes.DATE, date: dateTrigger }
            ) as import('expo-notifications').NotificationTriggerInput;
            const id = await notifications.scheduleNotificationAsync({ content, trigger: preferredTrigger });
            if (id) scheduledIds.push(id);
          } catch { /* best-effort */ }
        }
        await AsyncStorage.setItem(SMART_REMINDER_NOTIFICATION_IDS_KEY, JSON.stringify(scheduledIds));
        setSmartReminderStatus(`${scheduledIds.length} reminder${scheduledIds.length === 1 ? '' : 's'} scheduled.`);
      } catch { /* ignore parse errors */ }
      finally {
        smartReminderSyncBusyRef.current = false;
      }
    };

    void run();
  }, [snapshot.tasks, snapshot.scheduleSchool, snapshot.schedulePersonal, snapshot.challenges]);

  useEffect(() => {
    if (!focusRunning) {
      lastFocusStateSyncedSecondRef.current = null;
      return;
    }

    void syncFocusStateSnapshot(true);
  }, [focusRunning, focusPaused, focusLinkedTaskId]);

  useEffect(() => {
    if (!focusRunning || focusPaused) return;
    void syncFocusStateSnapshot(false);
  }, [focusRunning, focusPaused, focusRemainingSeconds]);

  useEffect(() => {
    if (!currentUser) {
      // Tear down any live Firestore listener when signed out
      if (firestoreUnsubRef.current) {
        firestoreUnsubRef.current();
        firestoreUnsubRef.current = null;
      }
      return;
    }

    // Initial pull on sign-in / focus-mode change
    void pullFromCloud(currentUser, true);

    // Real-time Firestore listener for instant cross-device sync
    const docRef = doc(db, SYNC_COLLECTION, currentUser.uid);
    const unsubFirestore = onSnapshot(
      docRef,
      () => {
        // Fired whenever the cloud document is written from any device
        void pullFromCloud(currentUser, true);
      },
      () => { /* listener errors are best-effort */ },
    );
    firestoreUnsubRef.current = unsubFirestore;

    // Fallback polling — much less aggressive now that we have a live listener
    const intervalMs = focusRunning ? 60000 : 30000;
    const timer = setInterval(() => {
      void pullFromCloud(currentUser, true);
    }, intervalMs);

    return () => {
      unsubFirestore();
      firestoreUnsubRef.current = null;
      clearInterval(timer);
    };
  }, [currentUser, focusRunning]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const notifications = getNotificationsModule();
    if (!notifications) return;

    notifications.setNotificationChannelAsync(ANDROID_FOCUS_SILENT_CHANNEL_ID, {
      name: 'Focus DND (silent)',
      importance: notifications.AndroidImportance.MIN,
      sound: null,
      vibrationPattern: [0],
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!focusRunning || focusPaused) return;

    const timer = setInterval(() => {
      setFocusRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [focusRunning, focusPaused]);

  useEffect(() => {
    if (!focusRunning) return;
    if (focusRemainingSeconds > 0) return;
    void completeFocusSession('completed');
  }, [focusRemainingSeconds, focusRunning]);

  function hydrateSettingsInputs(sourceSnapshot: HubSnapshot) {
    const settings = safeObj(sourceSnapshot.settings);
    const dailyStudyTarget = Math.max(1, Math.round(toFinite(settings.dailyStudyTarget, 8)));
    const dailyTaskTarget = Math.max(1, Math.round(toFinite(settings.dailyTaskTarget, 5)));
    const weeklyStudyTarget = Math.max(1, Math.round(toFinite(settings.weeklyStudyTarget, 40)));
    const focusDnd = Boolean(settings.focusDndDuringSession);

    setDailyStudyTargetInput(String(dailyStudyTarget));
    setDailyTaskTargetInput(String(dailyTaskTarget));
    setWeeklyStudyTargetInput(String(weeklyStudyTarget));
    setFocusDndEnabled(focusDnd);
  }

  async function saveLocalSnapshot(next: HubSnapshot) {
    const finalized = finalizeSnapshot(next);
    setSnapshot(finalized);
    await AsyncStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(finalized));
    return finalized;
  }

  async function pullFromCloud(userOverride?: User, silent = false) {
    const user = userOverride || currentUser;
    if (!user) return;

    // Respect post-push mute window to avoid re-importing what we just pushed
    if (Date.now() < syncMutedUntilRef.current) return;

    setSyncBusy(true);
    if (!silent) setSyncStatus('Syncing from cloud...');

    try {
      const docRef = doc(db, SYNC_COLLECTION, user.uid);
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        if (!silent) setSyncStatus('No cloud snapshot yet. Create data, then push.');
        return;
      }

      const cloudData = (snap.data() || {}) as Record<string, unknown>;
      const payload = cloudData.payload;
      if (typeof payload !== 'string' || !payload.trim()) {
        if (!silent) setSyncStatus('Cloud snapshot exists but payload is empty.');
        return;
      }

      const remoteChecksum = computePayloadChecksum(payload);
      const remoteVersion = getRemoteVersionFromSnapshotData(cloudData);
      const previousState = await readSyncState(user.uid);

      // If we've already applied this exact remote version, skip to avoid overwriting local work
      if (previousState && previousState.lastRemoteChecksum === remoteChecksum) {
        if (!silent) setSyncStatus('Already up to date.');
        return;
      }

      // Check if local has unsaved changes (push may have failed or is in-flight)
      const localCache = await AsyncStorage.getItem(LOCAL_CACHE_KEY);
      if (localCache && previousState?.lastPayloadChecksum) {
        const localChecksum = computePayloadChecksum(localCache);
        if (localChecksum !== previousState.lastPayloadChecksum) {
          // Local has changes that differ from what we last synced — push first, then pull
          if (!silent) setSyncStatus('Uploading local changes before pulling...');
          const localParsed = JSON.parse(localCache) as HubSnapshot;
          await pushToCloud(normalizeSnapshot(localParsed), { silent: true, allowConflictUpload: true });
          return;
        }
      }

      const parsed = JSON.parse(payload);
      const normalized = normalizeSnapshot(parsed);
      const saved = await saveLocalSnapshot(normalized);
      hydrateSettingsInputs(saved);
      hydrateFocusStateFromSnapshot(saved);
      await writeSyncState(user.uid, {
        lastPayloadChecksum: remoteChecksum,
        lastRemoteChecksum: remoteChecksum,
        lastRemoteVersion: remoteVersion || Date.now(),
        lastSyncAt: nowIso(),
      });
      setLastSyncAt(nowIso());
      if (!silent) setSyncStatus('Synced — pulled latest data.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown sync error';
      if (!silent) setSyncStatus(`Pull failed: ${message}`);
    } finally {
      setSyncBusy(false);
    }
  }

  async function pushToCloud(
    snapshotOverride?: HubSnapshot,
    options: { allowConflictUpload?: boolean; silent?: boolean } = {},
  ) {
    const { allowConflictUpload = false, silent = false } = options;

    if (!currentUser) {
      if (!silent) setSyncStatus('Sign in before syncing.');
      return;
    }

    const finalized = finalizeSnapshot(snapshotOverride || snapshot);
    setSnapshot(finalized);
    await AsyncStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(finalized));

    const payload = JSON.stringify(
      {
        ...finalized,
        exportDate: nowIso(),
        source: 'mobile-app',
      },
      null,
      2,
    );
    const localChecksum = computePayloadChecksum(payload);

    setSyncBusy(true);
    if (!silent) setSyncStatus('Pushing local data to cloud...');

    try {
      const docRef = doc(db, SYNC_COLLECTION, currentUser.uid);
      const remoteSnap = await getDoc(docRef);
      const remoteData = remoteSnap.exists()
        ? ((remoteSnap.data() || {}) as Record<string, unknown>)
        : {};
      const remotePayload = typeof remoteData.payload === 'string' ? remoteData.payload : '';
      const hasRemotePayload = !!remotePayload.trim();
      const remoteChecksum = hasRemotePayload ? computePayloadChecksum(remotePayload) : '';
      const remoteVersion = hasRemotePayload ? getRemoteVersionFromSnapshotData(remoteData) : 0;

      const previousState = await readSyncState(currentUser.uid);
      const hasPriorState = hasSyncState(previousState);
      const localChangedSinceLastSync = !hasPriorState
        || localChecksum !== (previousState?.lastPayloadChecksum || '');
      const remoteChangedSinceLastSync = hasRemotePayload && (
        !hasPriorState
        || remoteChecksum !== (previousState?.lastRemoteChecksum || '')
        || remoteVersion > Number(previousState?.lastRemoteVersion || 0)
      );

      if (remoteChangedSinceLastSync && !localChangedSinceLastSync) {
        const parsed = JSON.parse(remotePayload);
        const normalized = normalizeSnapshot(parsed);
        const savedRemote = await saveLocalSnapshot(normalized);
        hydrateSettingsInputs(savedRemote);
        await writeSyncState(currentUser.uid, {
          lastPayloadChecksum: remoteChecksum,
          lastRemoteChecksum: remoteChecksum,
          lastRemoteVersion: remoteVersion || Date.now(),
          lastSyncAt: nowIso(),
        });
        setLastSyncAt(nowIso());
        if (!silent) setSyncStatus('Cloud had newer data. Pulled latest snapshot instead of overwriting.');
        return;
      }

      if (remoteChangedSinceLastSync && localChangedSinceLastSync && !allowConflictUpload) {
        if (!silent) {
          setSyncStatus('Sync blocked: cloud changed on another device. Pull latest first to avoid resurrecting deleted tasks.');
        }
        return;
      }

      const updatedAtMs = Date.now();
      await setDoc(
        docRef,
        {
          payload,
          payloadChecksum: localChecksum,
          schemaVersion: 2,
          updatedAt: serverTimestamp(),
          updatedAtMs,
          updatedBy: 'mobile-app',
        },
        { merge: true },
      );
      await writeSyncState(currentUser.uid, {
        lastPayloadChecksum: localChecksum,
        lastRemoteChecksum: localChecksum,
        lastRemoteVersion: updatedAtMs,
        lastSyncAt: nowIso(),
      });
      // Mute pull for 4 s so we don't immediately re-import what we just pushed
      syncMutedUntilRef.current = Date.now() + 4000;
      setLastSyncAt(nowIso());
      if (!silent) setSyncStatus('Cloud sync successful.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown sync error';
      setSyncStatus(`Push failed: ${message}`);
    } finally {
      setSyncBusy(false);
    }
  }

  async function applyLocalChanges(next: HubSnapshot) {
    const saved = await saveLocalSnapshot(next);
    if (currentUser) {
      await pushToCloud(saved, { silent: true, allowConflictUpload: true });
    }
  }

  // Re-sync and re-schedule reminders when the app returns to the foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (currentUser) {
          void pullFromCloud(currentUser, true);
        }
        // Re-schedule smart reminders so they stay current after the app was backgrounded
        void syncTaskRemindersForSnapshot(snapshot);
      }
    });
    return () => subscription.remove();
  }, [currentUser, snapshot]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthReady(true);

      if (!user) {
        setSnapshot(createEmptySnapshot());
        setSyncStatus('Signed out.');
        return;
      }

      try {
        const cached = await AsyncStorage.getItem(LOCAL_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          const normalized = finalizeSnapshot(normalizeSnapshot(parsed));
          setSnapshot(normalized);
          hydrateSettingsInputs(normalized);
          hydrateFocusStateFromSnapshot(normalized);
        } else {
          const empty = createEmptySnapshot();
          setSnapshot(empty);
          hydrateSettingsInputs(empty);
        }
      } catch {
        const fallback = createEmptySnapshot();
        setSnapshot(fallback);
        hydrateSettingsInputs(fallback);
      }

      await pullFromCloud(user, true);
      void requestNotificationPermission();
      setSyncStatus('Signed in and ready.');
    });

    return () => unsubscribe();
  }, []);

  async function handleSignIn() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Enter email and password.');
      return;
    }

    setAuthBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password.trim());
      setSyncStatus('Signed in.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed';
      Alert.alert('Sign in failed', message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleCreateAccount() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Enter email and password.');
      return;
    }

    setAuthBusy(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password.trim());
      setSyncStatus('Account created and signed in.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Account creation failed';
      Alert.alert('Create account failed', message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
      setCurrentUser(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign out failed';
      Alert.alert('Sign out failed', message);
    }
  }

  function openTaskDueDatePicker(editing = false) {
    if (Platform.OS !== 'android') {
      Alert.alert('Date picker', 'Date picker is available on Android in this build.');
      return;
    }

    const sourceValue = editing ? editingTaskDueDate : taskDueDate;
    const seedYmd = toYmd(sourceValue) || todayYmd();
    const seedDate = new Date(`${seedYmd}T00:00:00`);

    DateTimePickerAndroid.open({
      mode: 'date',
      value: Number.isNaN(seedDate.getTime()) ? new Date() : seedDate,
      onChange: (event, selectedDate) => {
        if (event.type !== 'set' || !selectedDate) return;
        const ymd = formatLocalYmd(selectedDate);
        if (editing) {
          setEditingTaskDueDate(ymd);
        } else {
          setTaskDueDate(ymd);
        }
      },
    });
  }

  function openTaskDueTimePicker(editing = false) {
    if (Platform.OS !== 'android') {
      Alert.alert('Time picker', 'Time picker is available on Android in this build.');
      return;
    }

    const sourceValue = editing ? editingTaskDueTime : taskDueTime;
    const normalized = normalizeTimeValue(sourceValue, '09:00');
    const [hours, minutes] = normalized.split(':').map((part) => Number(part));
    const seedDate = new Date();
    seedDate.setHours(hours, minutes, 0, 0);

    DateTimePickerAndroid.open({
      mode: 'time',
      value: seedDate,
      is24Hour: true,
      onChange: (event, selectedDate) => {
        if (event.type !== 'set' || !selectedDate) return;
        const next = `${String(selectedDate.getHours()).padStart(2, '0')}:${String(selectedDate.getMinutes()).padStart(2, '0')}`;
        if (editing) {
          setEditingTaskDueTime(next);
        } else {
          setTaskDueTime(next);
        }
      },
    });
  }

  function clearTaskDueDate(editing = false) {
    if (editing) {
      setEditingTaskDueDate('');
      return;
    }
    setTaskDueDate('');
  }

  function clearTaskDueTime(editing = false) {
    if (editing) {
      setEditingTaskDueTime('');
      return;
    }
    setTaskDueTime('');
  }

  async function handleAddTask() {
    const title = taskTitle.trim();
    if (!title) {
      Alert.alert('Task title required', 'Enter a title for your task.');
      return;
    }

    const due = toYmd(taskDueDate.trim());
    if (taskDueDate.trim() && !due) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD format for due date.');
      return;
    }

    const dueTime = normalizeOptionalTimeValue(taskDueTime.trim());
    if (taskDueTime.trim() && !dueTime) {
      Alert.alert('Invalid time', 'Use HH:mm format (for example 09:30).');
      return;
    }

    const newTask: HubTask = {
      id: generateId('task'),
      title,
      description: '',
      linkUrl: null,
      dueDate: due,
      dueTime,
      reminderMinutes: null,
      priority: taskPriority,
      status: 'not-started',
      category: 'homework',
      tags: [],
      linkedGoalId: null,
      isRecurring: false,
      repeatType: null,
      completedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    const next = normalizeSnapshot({
      ...snapshot,
      tasks: [newTask, ...snapshot.tasks],
    });

    await applyLocalChanges(next);
    setTaskTitle('');
    setTaskDueDate('');
    setTaskDueTime('');
    await sendInteractionNotification('Task added', `${title} was added to your tasks.`);
  }

  async function handleAddDashboardTodayTask() {
    const title = dashboardTaskInput.trim();
    if (!title) return;

    const newTask: HubTask = {
      id: generateId('task'),
      title,
      description: '',
      linkUrl: null,
      dueDate: todayYmd(),
      dueTime: null,
      reminderMinutes: null,
      priority: 'medium',
      status: 'not-started',
      category: 'homework',
      tags: [],
      linkedGoalId: null,
      isRecurring: false,
      repeatType: null,
      completedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    const next = normalizeSnapshot({
      ...snapshot,
      tasks: [newTask, ...snapshot.tasks],
    });

    await applyLocalChanges(next);
    setDashboardTaskInput('');
    await sendInteractionNotification('Task added', `${title} was added for today.`);
  }

  async function advanceTask(taskId: string) {
    let completedNow = false;
    let changedTaskTitle = '';
    let changedTaskStatus: TaskStatus | null = null;

    const nextTasks = snapshot.tasks.map((task) => {
      if (task.id !== taskId) return task;

      const status = nextTaskStatus(task.status);
      changedTaskTitle = task.title;
      changedTaskStatus = status;
      if (status === 'completed' && task.status !== 'completed') {
        completedNow = true;
      }

      return {
        ...task,
        status,
        completedAt: status === 'completed' ? nowIso() : null,
        updatedAt: nowIso(),
      };
    });

    let next = normalizeSnapshot({ ...snapshot, tasks: nextTasks });
    if (completedNow) {
      next = {
        ...next,
        challenges: applyChallengeProgress(next.challenges, 'tasks', 1),
      };
    }

    await applyLocalChanges(next);

    if (changedTaskTitle && changedTaskStatus) {
      if (changedTaskStatus === 'completed') {
        await sendInteractionNotification('Task completed', `${changedTaskTitle} marked completed.`);
      } else {
        await sendInteractionNotification('Task updated', `${changedTaskTitle} is now ${changedTaskStatus}.`);
      }
    }
  }

  async function deleteTask(taskId: string) {
    const removedTask = snapshot.tasks.find((task) => task.id === taskId);
    const nextTasks = snapshot.tasks.filter((task) => task.id !== taskId);
    await applyLocalChanges(normalizeSnapshot({ ...snapshot, tasks: nextTasks }));
    if (removedTask) {
      await sendInteractionNotification('Task deleted', `${removedTask.title} was removed.`);
    }
  }

  function startTaskEdit(task: HubTask) {
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
    setEditingTaskDueDate(task.dueDate || '');
    setEditingTaskDueTime(task.dueTime || '');
    setEditingTaskPriority(task.priority);
    setActiveTab('tasks');
  }

  function cancelTaskEdit() {
    setEditingTaskId(null);
    setEditingTaskTitle('');
    setEditingTaskDueDate('');
    setEditingTaskDueTime('');
    setEditingTaskPriority('medium');
  }

  async function saveTaskEdit() {
    if (!editingTaskId) return;

    const title = editingTaskTitle.trim();
    if (!title) {
      Alert.alert('Task title required', 'Enter a title for your task.');
      return;
    }

    const due = toYmd(editingTaskDueDate.trim());
    if (editingTaskDueDate.trim() && !due) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD format for due date.');
      return;
    }

    const dueTime = normalizeOptionalTimeValue(editingTaskDueTime.trim());
    if (editingTaskDueTime.trim() && !dueTime) {
      Alert.alert('Invalid time', 'Use HH:mm format (for example 09:30).');
      return;
    }

    const nextTasks = snapshot.tasks.map((task) => {
      if (task.id !== editingTaskId) return task;
      return {
        ...task,
        title,
        dueDate: due,
        dueTime,
        priority: editingTaskPriority,
        updatedAt: nowIso(),
      };
    });

    await applyLocalChanges(normalizeSnapshot({ ...snapshot, tasks: nextTasks }));
    await sendInteractionNotification('Task updated', `${title} was updated.`);
    cancelTaskEdit();
  }

  async function sendTaskToReview(taskId: string) {
    const task = snapshot.tasks.find((entry) => entry.id === taskId);
    if (!task) return;

    const dueYmd = task.dueDate || todayYmd();
    const reviewItem = {
      id: generateId('review'),
      title: task.title,
      source: 'task',
      taskId: task.id,
      dueDate: dueYmd,
      nextReview: dueYmd,
      createdAt: nowIso(),
      intervalDays: 1,
      easeFactor: 2.5,
      repetitions: 0,
    };

    let next = normalizeSnapshot({
      ...snapshot,
      revisions: [reviewItem, ...safeArray(snapshot.revisions)],
    });

    next = {
      ...next,
      challenges: applyChallengeProgress(next.challenges, 'reviews', 1),
    };

    await applyLocalChanges(next);
    Alert.alert('Added to review', 'Task was sent to Items to Review.');
    await sendInteractionNotification('Sent to review', `${task.title} was added to Items to Review.`);
  }

  function openTaskActions(task: HubTask) {
    const details = [
      task.priority.toUpperCase(),
      task.status,
      task.dueDate ? formatYmdLabel(task.dueDate) : 'No due date',
      task.dueTime ? formatTimeLabel(task.dueTime) : 'No due time',
      task.reminderMinutes == null || task.reminderMinutes < 0
        ? 'Reminder off'
        : `Reminder ${task.reminderMinutes} min early`,
    ].join(' | ');

    Alert.alert(task.title, details, [
      {
        text: 'Start Focus',
        onPress: () => {
          setFocusLinkedTaskId(task.id);
          setActiveTab('focus');
        },
      },
      {
        text: nextTaskStatusLabel(task.status),
        onPress: () => {
          void advanceTask(task.id);
        },
      },
      {
        text: 'Edit',
        onPress: () => startTaskEdit(task),
      },
      {
        text: 'Send to Review',
        onPress: () => {
          void sendTaskToReview(task.id);
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteTask(task.id);
        },
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  }

  async function handleAddGoal() {
    const title = goalTitle.trim();
    if (!title) {
      Alert.alert('Goal title required', 'Enter a goal title.');
      return;
    }

    const target = Math.max(1, toFinite(goalTarget, 10));
    const milestones = goalTrackingType === 'milestones'
      ? [{ id: generateId('milestone'), title: 'Milestone 1', isCompleted: false, completedAt: null }]
      : [];

    const goal: HubGoal = {
      id: generateId('goal'),
      title,
      description: '',
      category: goalCategory,
      status: 'active',
      progress: 0,
      milestones,
      trackingType: goalTrackingType,
      trackingTarget: goalTrackingType === 'milestones' ? 0 : target,
      trackingCurrent: 0,
      targetDate: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      completedAt: null,
    };

    await applyLocalChanges(normalizeSnapshot({
      ...snapshot,
      goals: [goal, ...snapshot.goals],
    }));

    await sendInteractionNotification('Goal added', `${title} was created.`);

    setGoalTitle('');
    setGoalTarget('10');
  }

  async function adjustGoal(goalId: string, delta: number) {
    const nextGoals = snapshot.goals.map((goal) => {
      if (goal.id !== goalId) return goal;

      if (goal.trackingType === 'milestones') {
        const nextProgress = Math.max(0, Math.min(100, Math.round(goal.progress + delta)));
        return {
          ...goal,
          progress: nextProgress,
          status: nextProgress >= 100 ? 'completed' : 'active',
          completedAt: nextProgress >= 100 ? nowIso() : null,
          updatedAt: nowIso(),
        };
      }

      const nextCurrent = Math.max(0, goal.trackingCurrent + delta);
      return {
        ...goal,
        trackingCurrent: nextCurrent,
        updatedAt: nowIso(),
      };
    });

    await applyLocalChanges(normalizeSnapshot({ ...snapshot, goals: nextGoals }));
  }

  async function toggleGoalStatus(goalId: string) {
    const nextGoals = snapshot.goals.map((goal) => {
      if (goal.id !== goalId) return goal;
      const isCompleted = goal.status === 'completed';
      return {
        ...goal,
        status: isCompleted ? 'active' : 'completed',
        completedAt: isCompleted ? null : nowIso(),
        updatedAt: nowIso(),
      };
    });

    await applyLocalChanges(normalizeSnapshot({ ...snapshot, goals: nextGoals }));
  }

  async function saveDailyTargets() {
    const dailyStudyTarget = Math.max(1, Math.round(toFinite(dailyStudyTargetInput, 8)));
    const dailyTaskTarget = Math.max(1, Math.round(toFinite(dailyTaskTargetInput, 5)));
    const weeklyStudyTarget = Math.max(1, Math.round(toFinite(weeklyStudyTargetInput, 40)));

    const nextSettings = {
      ...safeObj(snapshot.settings),
      dailyStudyTarget,
      dailyTaskTarget,
      weeklyStudyTarget,
    };

    await applyLocalChanges(normalizeSnapshot({
      ...snapshot,
      settings: nextSettings,
    }));

    Alert.alert('Targets saved', 'Daily and weekly targets were updated.');
  }

  async function handleAddChallenge() {
    const title = challengeTitle.trim();
    if (!title) {
      Alert.alert('Challenge title required', 'Enter a challenge title.');
      return;
    }

    const target = Math.max(1, Math.round(toFinite(challengeTarget, 5)));
    const minMinutes = Math.max(0, Math.round(toFinite(challengeMinMinutes, 25)));

    const challenge: HubChallenge = {
      id: generateId('challenge'),
      metric: challengeMetric,
      type: challengeType,
      options: challengeMetric === 'focus_sessions' ? { minMinutes } : {},
      title,
      customTitle: true,
      description: challengeMetricDescription(challengeMetric, target, minMinutes),
      targetProgress: target,
      currentProgress: 0,
      currentStreak: 0,
      bestStreak: 0,
      status: 'active',
      createdAt: nowIso(),
      lastProgressDate: null,
      completedAt: null,
    };

    await applyLocalChanges(normalizeSnapshot({
      ...snapshot,
      challenges: [challenge, ...snapshot.challenges],
    }));

    await sendInteractionNotification('Challenge added', `${title} was created.`);

    setChallengeTitle('');
    setChallengeTarget('5');
    setChallengeType('daily');
    setChallengeMetric('tasks');
    setChallengeMinMinutes('25');
  }

  async function incrementChallenge(challengeId: string) {
    const nextChallenges = snapshot.challenges.map((challenge) => {
      if (challenge.id !== challengeId) return challenge;
      if (challenge.status === 'completed') return challenge;

      const nextProgress = challenge.currentProgress + 1;
      const completed = nextProgress >= challenge.targetProgress;
      const today = todayYmd();
      const nextStreak = challenge.lastProgressDate === today
        ? challenge.currentStreak
        : (isYesterdayYmd(challenge.lastProgressDate, today) && challenge.currentStreak > 0)
          ? challenge.currentStreak + 1
          : 1;

      return {
        ...challenge,
        currentProgress: nextProgress,
        status: completed ? 'completed' : 'active',
        completedAt: completed ? nowIso() : null,
        lastProgressDate: today,
        currentStreak: nextStreak,
        bestStreak: Math.max(challenge.bestStreak, nextStreak),
      };
    });

    await applyLocalChanges(normalizeSnapshot({ ...snapshot, challenges: nextChallenges }));
  }

  async function resetChallenge(challengeId: string) {
    const nextChallenges = snapshot.challenges.map((challenge) => {
      if (challenge.id !== challengeId) return challenge;
      return {
        ...challenge,
        currentProgress: 0,
        status: 'active',
        completedAt: null,
      };
    });

    await applyLocalChanges(normalizeSnapshot({ ...snapshot, challenges: nextChallenges }));
  }

  async function deleteChallenge(challengeId: string) {
    const nextChallenges = snapshot.challenges.filter((challenge) => challenge.id !== challengeId);
    await applyLocalChanges(normalizeSnapshot({ ...snapshot, challenges: nextChallenges }));
  }

  function getSelectedFocusMinutes() {
    if (focusPresetMinutes > 0) return focusPresetMinutes;
    const custom = Math.round(toFinite(focusCustomMinutes, 45));
    return Math.max(5, custom);
  }

  function getFocusSessionType(minutes: number) {
    if (minutes === 25) return 'pomodoro';
    if (minutes === 50) return 'deep-work';
    if (minutes === 90) return 'flow';
    return 'custom';
  }

  function startFocusSession() {
    const minutes = getSelectedFocusMinutes();
    setFocusTargetMinutes(minutes);
    setFocusRemainingSeconds(minutes * 60);
    setFocusStartedAt(nowIso());
    setFocusPaused(false);
    setFocusRunning(true);
  }

  function togglePauseFocus() {
    if (!focusRunning) return;
    setFocusPaused((prev) => !prev);
  }

  async function completeFocusSession(status: FocusSessionStatus) {
    if (!focusStartedAt) return;

    const endedAt = nowIso();
    const elapsedSeconds = Math.max(0, (focusTargetMinutes * 60) - focusRemainingSeconds);
    const actualMinutes = Math.max(0, Math.round(elapsedSeconds / 60));
    const linkedTask = snapshot.tasks.find((task) => task.id === focusLinkedTaskId);

    const session: HubFocusSession = {
      id: generateId('focus'),
      startTime: focusStartedAt,
      endTime: endedAt,
      plannedDurationMinutes: focusTargetMinutes,
      actualDurationMinutes: actualMinutes,
      type: getFocusSessionType(focusTargetMinutes),
      status,
      linkedTaskId: linkedTask?.id || null,
      linkedTaskTitle: linkedTask?.title || '',
      date: todayYmd(),
    };

    let next = normalizeSnapshot({
      ...snapshot,
      focusState: null,
      focusSessions: [session, ...snapshot.focusSessions],
    });

    if (actualMinutes > 0) {
      next = {
        ...next,
        challenges: applyChallengeProgress(
          applyChallengeProgress(next.challenges, 'focus_time', actualMinutes),
          'focus_sessions',
          1,
          { durationMinutes: actualMinutes },
        ),
      };
    }

    await applyLocalChanges(next);

    setFocusRunning(false);
    setFocusPaused(false);
    setFocusRemainingSeconds(getSelectedFocusMinutes() * 60);
    setFocusStartedAt(null);

    if (status === 'completed') {
      Alert.alert('Focus session complete', `Great work. Logged ${formatMinutes(actualMinutes)}.`);
      await sendInteractionNotification('Focus session complete', `Logged ${formatMinutes(actualMinutes)} of focus.`);
    } else if (status === 'stopped' && actualMinutes > 0) {
      await sendInteractionNotification('Focus session stopped', `Saved ${formatMinutes(actualMinutes)} before stopping.`);
    }
  }

  function buildSmartReminderDrafts(settings: SmartReminderSettings): SmartReminderDraft[] {
    const now = Date.now();
    const minimumTriggerTs = now + (30 * 1000);
    const drafts: SmartReminderDraft[] = [];

    if (settings.tasks.enabled) {
      const leadMs = settings.tasks.leadMinutes * 60 * 1000;

      const taskDrafts = snapshot.tasks
        .filter((task) => task.status !== 'completed' && Boolean(toYmd(task.dueDate)))
        .map((task) => {
          const dueTs = getTimestampForYmdTime(task.dueDate, task.dueTime, '21:00');
          if (dueTs == null || dueTs <= now) return null;

          const triggerAtMs = dueTs - leadMs;
          if (triggerAtMs < minimumTriggerTs) return null;

          const dueDateLabel = formatYmdLabel(task.dueDate);
          const dueTimeLabel = task.dueTime ? formatTimeLabel(task.dueTime) : '9:00 PM';

          return {
            category: 'tasks' as ReminderCategory,
            itemKey: `task_${task.id}_${task.dueDate || 'none'}_${task.dueTime || 'none'}_${settings.tasks.leadMinutes}`,
            title: 'Task reminder',
            body: `${task.title} is due ${dueDateLabel} at ${dueTimeLabel}.`,
            triggerAtMs,
          };
        })
        .filter((entry): entry is SmartReminderDraft => Boolean(entry))
        .sort((a, b) => a.triggerAtMs - b.triggerAtMs)
        .slice(0, SMART_REMINDER_MAX_PER_CATEGORY);

      drafts.push(...taskDrafts);
    }

    if (settings.schedule.enabled) {
      const leadMs = settings.schedule.leadMinutes * 60 * 1000;

      const scheduleDrafts = buildScheduleOccurrences(allScheduleEvents, todayYmd(), SMART_REMINDER_LOOKAHEAD_DAYS)
        .map((occurrence) => {
          const eventTs = getTimestampForYmdTime(occurrence.occurrenceDate, occurrence.event.startTime, '09:00');
          if (eventTs == null || eventTs <= now) return null;

          const triggerAtMs = eventTs - leadMs;
          if (triggerAtMs < minimumTriggerTs) return null;

          return {
            category: 'schedule' as ReminderCategory,
            itemKey: `event_${occurrence.key}_${settings.schedule.leadMinutes}`,
            title: 'Schedule reminder',
            body: `${occurrence.event.title} starts ${formatYmdLabel(occurrence.occurrenceDate)} at ${formatTimeLabel(occurrence.event.startTime)}.`,
            triggerAtMs,
          };
        })
        .filter((entry): entry is SmartReminderDraft => Boolean(entry))
        .sort((a, b) => a.triggerAtMs - b.triggerAtMs)
        .slice(0, SMART_REMINDER_MAX_PER_CATEGORY);

      drafts.push(...scheduleDrafts);
    }

    if (settings.challenges.enabled) {
      const leadMs = settings.challenges.leadMinutes * 60 * 1000;
      const today = todayYmd();
      const weekEnd = getWeekEndYmd(today);

      const challengeDrafts = snapshot.challenges
        .filter((challenge) => challenge.status === 'active' && challenge.currentProgress < challenge.targetProgress)
        .map((challenge) => {
          const dueYmd = challenge.type === 'weekly' ? weekEnd : today;
          const dueTs = getTimestampForYmdTime(dueYmd, '21:00', '21:00');
          if (dueTs == null || dueTs <= now) return null;

          const triggerAtMs = dueTs - leadMs;
          if (triggerAtMs < minimumTriggerTs) return null;

          return {
            category: 'challenges' as ReminderCategory,
            itemKey: `challenge_${challenge.id}_${dueYmd}_${settings.challenges.leadMinutes}`,
            title: 'Challenge reminder',
            body: `${challenge.title}: ${challenge.currentProgress}/${challenge.targetProgress} done. Keep your streak alive.`,
            triggerAtMs,
          };
        })
        .filter((entry): entry is SmartReminderDraft => Boolean(entry))
        .sort((a, b) => a.triggerAtMs - b.triggerAtMs)
        .slice(0, SMART_REMINDER_MAX_PER_CATEGORY);

      drafts.push(...challengeDrafts);
    }

    return drafts.sort((a, b) => a.triggerAtMs - b.triggerAtMs);
  }

  function buildTaskReminderDrafts(tasks: HubTask[]): TaskReminderDraft[] {
    const now = Date.now();
    const minimumTriggerTs = now + (30 * 1000);

    return tasks
      .filter((task) => task.status !== 'completed' && Boolean(toYmd(task.dueDate)))
      .map((task) => {
        if (task.reminderMinutes == null) return null;

        const reminderMinutes = Math.round(toFinite(task.reminderMinutes, Number.NaN));
        if (!Number.isFinite(reminderMinutes) || reminderMinutes < 0) return null;

        const dueTs = getTimestampForYmdTime(task.dueDate, task.dueTime, '21:00');
        if (dueTs == null || dueTs <= now) return null;

        const triggerAtMs = dueTs - (reminderMinutes * 60 * 1000);
        if (triggerAtMs < minimumTriggerTs) return null;

        const dueDateLabel = formatYmdLabel(task.dueDate);
        const dueTimeLabel = task.dueTime ? formatTimeLabel(task.dueTime) : '9:00 PM';

        return {
          taskId: task.id,
          itemKey: `task_direct_${task.id}_${task.dueDate || 'none'}_${task.dueTime || 'none'}_${reminderMinutes}`,
          title: 'Task reminder',
          body: `${task.title} is due ${dueDateLabel} at ${dueTimeLabel}.`,
          triggerAtMs,
        };
      })
      .filter((entry): entry is TaskReminderDraft => Boolean(entry))
      .sort((a, b) => a.triggerAtMs - b.triggerAtMs)
      .slice(0, SMART_REMINDER_MAX_PER_CATEGORY * 3);
  }

  async function syncTaskRemindersForSnapshot(nextSnapshot: HubSnapshot) {
    if (isExpoGoAndroid) return;
    if (taskReminderSyncBusyRef.current) return;

    const notifications = getNotificationsModule();
    if (!notifications) return;

    taskReminderSyncBusyRef.current = true;

    try {
      const permission = await notifications.getPermissionsAsync();
      if (!permission.granted) return;

      const storedRaw = await AsyncStorage.getItem(TASK_REMINDER_NOTIFICATION_IDS_KEY);
      const storedParsed = storedRaw ? safeObj(JSON.parse(storedRaw)) : {};
      const storedMap: Record<string, string> = {};

      for (const [itemKey, notificationId] of Object.entries(storedParsed)) {
        if (typeof itemKey !== 'string' || !itemKey.trim()) continue;
        if (typeof notificationId !== 'string' || !notificationId.trim()) continue;
        storedMap[itemKey] = notificationId;
      }

      const drafts = buildTaskReminderDrafts(nextSnapshot.tasks);
      const draftByKey = new Map(drafts.map((draft) => [draft.itemKey, draft]));

      for (const [itemKey, notificationId] of Object.entries(storedMap)) {
        if (draftByKey.has(itemKey)) continue;
        await notifications.cancelScheduledNotificationAsync(notificationId).catch(() => undefined);
      }

      const nextMap: Record<string, string> = {};

      for (const draft of drafts) {
        const existingId = storedMap[draft.itemKey];
        if (existingId) {
          nextMap[draft.itemKey] = existingId;
          continue;
        }

        const content: import('expo-notifications').NotificationContentInput = {
          title: draft.title,
          body: draft.body,
          sound: 'default',
          data: {
            scope: 'task-reminder',
            taskId: draft.taskId,
            itemKey: draft.itemKey,
          },
        };

        const dateTrigger = new Date(draft.triggerAtMs);

        try {
          const preferredTrigger = (
            Platform.OS === 'android'
              ? {
                  type: notifications.SchedulableTriggerInputTypes.DATE,
                  date: dateTrigger,
                  channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
                }
              : {
                  type: notifications.SchedulableTriggerInputTypes.DATE,
                  date: dateTrigger,
                }
          ) as import('expo-notifications').NotificationTriggerInput;

          let id = '';
          try {
            id = await notifications.scheduleNotificationAsync({
              content,
              trigger: preferredTrigger,
            });
          } catch {
            id = await notifications.scheduleNotificationAsync({
              content,
              trigger: dateTrigger as unknown as import('expo-notifications').NotificationTriggerInput,
            });
          }

          if (id) {
            nextMap[draft.itemKey] = id;
          }
        } catch {
          // Keep automatic reminder syncing best-effort.
        }
      }

      await AsyncStorage.setItem(TASK_REMINDER_NOTIFICATION_IDS_KEY, JSON.stringify(nextMap));
    } catch {
      // Keep automatic reminder syncing non-blocking.
    } finally {
      taskReminderSyncBusyRef.current = false;
    }
  }

  async function clearSmartReminders(options: { showAlert?: boolean } = {}) {
    const notifications = getNotificationsModule();
    const showAlert = options.showAlert !== false;

    try {
      const stored = await AsyncStorage.getItem(SMART_REMINDER_NOTIFICATION_IDS_KEY);
      const ids = stored ? safeArray<string>(JSON.parse(stored)) : [];

      if (notifications) {
        for (const id of ids) {
          await notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
        }
      }

      await AsyncStorage.removeItem(SMART_REMINDER_NOTIFICATION_IDS_KEY);
      setSmartReminderStatus('Custom reminders cleared.');

      if (showAlert) {
        Alert.alert('Custom reminders cleared', 'Per-category reminders have been removed.');
      }
    } catch {
      if (showAlert) {
        Alert.alert('Reminder error', 'Could not clear custom reminders.');
      }
    }
  }

  async function applySmartReminders() {
    if (isExpoGoAndroid) {
      Alert.alert(
        'Development build required',
        'Expo Go does not fully support Android notifications. Build and open the development app to use custom reminders.',
      );
      return;
    }

    const normalizedSettings = normalizeSmartReminderSettings(smartReminderSettings);
    setSmartReminderSettings(normalizedSettings);
    await AsyncStorage.setItem(SMART_REMINDER_SETTINGS_KEY, JSON.stringify(normalizedSettings));

    const granted = await requestNotificationPermission();
    if (!granted) return;

    const notifications = getNotificationsModule();
    if (!notifications) return;

    await clearSmartReminders({ showAlert: false });

    const drafts = buildSmartReminderDrafts(normalizedSettings);
    if (!drafts.length) {
      setSmartReminderStatus('No upcoming items matched your reminder settings.');
      Alert.alert('No reminders scheduled', 'No upcoming tasks/events/challenges matched the selected lead times.');
      return;
    }

    const counts: Record<ReminderCategory, number> = {
      tasks: 0,
      schedule: 0,
      challenges: 0,
    };
    const scheduledIds: string[] = [];

    for (const draft of drafts) {
      const content: import('expo-notifications').NotificationContentInput = {
        title: draft.title,
        body: draft.body,
        sound: 'default',
        data: {
          scope: 'custom-reminder',
          category: draft.category,
          itemKey: draft.itemKey,
        },
      };

      const dateTrigger = new Date(draft.triggerAtMs);

      try {
        const preferredTrigger = (
          Platform.OS === 'android'
            ? {
                type: notifications.SchedulableTriggerInputTypes.DATE,
                date: dateTrigger,
                channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
              }
            : {
                type: notifications.SchedulableTriggerInputTypes.DATE,
                date: dateTrigger,
              }
        ) as import('expo-notifications').NotificationTriggerInput;

        let id = '';
        try {
          id = await notifications.scheduleNotificationAsync({
            content,
            trigger: preferredTrigger,
          });
        } catch {
          id = await notifications.scheduleNotificationAsync({
            content,
            trigger: dateTrigger as unknown as import('expo-notifications').NotificationTriggerInput,
          });
        }

        scheduledIds.push(id);
        counts[draft.category] += 1;
      } catch {
        // Keep scheduling best-effort so one bad entry does not block others.
      }
    }

    await AsyncStorage.setItem(SMART_REMINDER_NOTIFICATION_IDS_KEY, JSON.stringify(scheduledIds));

    const summary = `Scheduled ${scheduledIds.length} custom reminders (Tasks ${counts.tasks}, Schedule ${counts.schedule}, Challenges ${counts.challenges}).`;
    setSmartReminderStatus(summary);
    Alert.alert('Custom reminders ready', summary);
  }

  async function requestNotificationPermission() {
    if (isExpoGoAndroid) {
      Alert.alert(
        'Development build required',
        'Android notifications are limited in Expo Go. Use the development build for reminder scheduling.',
      );
      return false;
    }

    const notifications = getNotificationsModule();
    if (!notifications) return false;

    const settings = await notifications.getPermissionsAsync();
    let granted = settings.granted;

    if (!granted) {
      const request = await notifications.requestPermissionsAsync();
      granted = request.granted;
    }

    if (!granted) {
      Alert.alert('Permission needed', 'Enable notifications to receive reminders.');
      return false;
    }

    setSyncStatus('Notifications permission granted.');
    void syncTaskRemindersForSnapshot(snapshot);
    return true;
  }

  function getNotificationChannelId(defaultId: string) {
    if (Platform.OS !== 'android') return defaultId;
    return isFocusDndActive() ? ANDROID_FOCUS_SILENT_CHANNEL_ID : defaultId;
  }

  async function sendInteractionNotification(title: string, body: string) {
    if (isExpoGoAndroid) return;
    if (isFocusDndActive()) return;

    const notifications = getNotificationsModule();
    if (!notifications) return;

    const now = Date.now();
    if (now - lastInteractionNotificationAtRef.current < INTERACTION_NOTIFICATION_COOLDOWN_MS) return;

    try {
      const permission = await notifications.getPermissionsAsync();
      let granted = permission.granted;

      if (!granted && !interactionPermissionPrompted) {
        const requested = await notifications.requestPermissionsAsync();
        granted = requested.granted;
        setInteractionPermissionPrompted(true);
      }

      if (!granted) return;

      lastInteractionNotificationAtRef.current = now;

      const channelId = getNotificationChannelId(ANDROID_INTERACTION_CHANNEL_ID);
      const silent = isFocusDndActive();

      await notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: silent ? false : 'default',
          data: { scope: 'interaction' },
          ...(Platform.OS === 'android' && { channelId }),
        },
        trigger: null,
      });
    } catch {
      // Keep interaction feedback best-effort and non-blocking.
    }
  }

  async function sendTodaySummaryNotification() {
    if (isExpoGoAndroid) {
      Alert.alert(
        'Development build required',
        'Android notifications are limited in Expo Go. Use the development build to send summary notifications.',
      );
      return;
    }

    const granted = await requestNotificationPermission();
    if (!granted) return;

    const notifications = getNotificationsModule();
    if (!notifications) return;

    const summaryChannelId = getNotificationChannelId(ANDROID_NOTIFICATION_CHANNEL_ID);
    const summarySilent = isFocusDndActive();

    try {
      await notifications.scheduleNotificationAsync({
        content: {
          title: todayDigest.title,
          body: todayDigest.body,
          sound: summarySilent ? false : 'default',
          data: { scope: 'today-summary', date: todayYmd() },
          ...(Platform.OS === 'android' && { channelId: summaryChannelId }),
        },
        trigger: null,
      });

      Alert.alert('Summary sent', 'Today\'s summary was sent to your notifications.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown notification error';
      Alert.alert('Notification error', message);
    }
  }

  async function scheduleDailyReminder() {
    const hour = Math.round(toFinite(reminderHour, -1));
    const minute = Math.round(toFinite(reminderMinute, -1));

    if (hour < 0 || hour > 23) {
      Alert.alert('Invalid hour', 'Hour must be between 0 and 23.');
      return;
    }

    if (minute < 0 || minute > 59) {
      Alert.alert('Invalid minute', 'Minute must be between 0 and 59.');
      return;
    }

    const granted = await requestNotificationPermission();
    if (!granted) return;

    const notifications = getNotificationsModule();
    if (!notifications) return;

    const oldId = await AsyncStorage.getItem(DAILY_NOTIFICATION_ID_KEY);
    if (oldId) {
      await notifications.cancelScheduledNotificationAsync(oldId).catch(() => undefined);
    }

    const content: import('expo-notifications').NotificationContentInput = {
      title: todayDigest.title,
      body: todayDigest.body,
      sound: isFocusDndActive() ? false : 'default',
      data: {
        channelId: getNotificationChannelId(ANDROID_NOTIFICATION_CHANNEL_ID),
        scope: 'daily-reminder',
      },
    };

    try {
      const primaryTrigger = (
        Platform.OS === 'android'
          ? {
              type: notifications.SchedulableTriggerInputTypes.DAILY,
              hour,
              minute,
              channelId: getNotificationChannelId(ANDROID_NOTIFICATION_CHANNEL_ID),
            }
          : {
              type: notifications.SchedulableTriggerInputTypes.CALENDAR,
              hour,
              minute,
              repeats: true,
            }
      ) as import('expo-notifications').NotificationTriggerInput;

      let newId = '';
      try {
        newId = await notifications.scheduleNotificationAsync({
          content,
          trigger: primaryTrigger,
        });
      } catch {
        const fallbackTrigger = {
          hour,
          minute,
          repeats: true,
        } as import('expo-notifications').NotificationTriggerInput;

        newId = await notifications.scheduleNotificationAsync({
          content,
          trigger: fallbackTrigger,
        });
      }

      await AsyncStorage.setItem(DAILY_NOTIFICATION_ID_KEY, newId);
      Alert.alert('Reminder scheduled', `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} every day.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown notification error';
      Alert.alert('Notification error', message);
    }
  }

  async function cancelDailyReminder() {
    const notifications = getNotificationsModule();
    if (!notifications) return;

    const scheduledId = await AsyncStorage.getItem(DAILY_NOTIFICATION_ID_KEY);
    if (!scheduledId) {
      Alert.alert('No reminder found', 'There is no scheduled daily reminder to cancel.');
      return;
    }

    await notifications.cancelScheduledNotificationAsync(scheduledId).catch(() => undefined);
    await AsyncStorage.removeItem(DAILY_NOTIFICATION_ID_KEY);
    Alert.alert('Reminder canceled', 'Daily reminder has been removed.');
  }

  if (!authReady) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <View style={styles.centeredBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.mutedText}>Loading mobile workspace...</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (!currentUser) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <StatusBar style="light" />
          <KeyboardAvoidingView
            style={styles.authWrapper}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView contentContainerStyle={styles.authScrollContent} keyboardShouldPersistTaps="handled">
              <View style={styles.authCard}>
                <Text style={styles.authTitle}>Productivity Hub Mobile</Text>
                <Text style={styles.authSubtitle}>
                  Desktop style command center on your phone with cloud sync.
                </Text>

                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.input}
                />

                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={COLORS.textMuted}
                  secureTextEntry
                  style={styles.input}
                />

                <Pressable style={styles.primaryButton} onPress={handleSignIn} disabled={authBusy}>
                  <Text style={styles.primaryButtonText}>{authBusy ? 'Please wait...' : 'Sign In'}</Text>
                </Pressable>

                <Pressable style={styles.secondaryButton} onPress={handleCreateAccount} disabled={authBusy}>
                  <Text style={styles.secondaryButtonText}>Create Account</Text>
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  const maxWeeklyFocus = Math.max(1, ...weeklySeries.map((row) => row.focusMinutes));

  function pressAction(handler: () => void) {
    return (event?: { stopPropagation?: () => void }) => {
      event?.stopPropagation?.();
      handler();
    };
  }

  function renderCompactTaskActions(task: HubTask) {
    return (
      <View style={styles.compactActionsRow}>
        <Pressable
          style={styles.tinyActionButton}
          onPress={pressAction(() => {
            setFocusLinkedTaskId(task.id);
            setActiveTab('focus');
          })}
        >
          <Text style={styles.tinyActionButtonText}>Focus</Text>
        </Pressable>

        <Pressable style={styles.tinyActionButton} onPress={pressAction(() => startTaskEdit(task))}>
          <Text style={styles.tinyActionButtonText}>Edit</Text>
        </Pressable>

        <Pressable style={styles.tinyActionButton} onPress={pressAction(() => void sendTaskToReview(task.id))}>
          <Text style={styles.tinyActionButtonText}>Review</Text>
        </Pressable>

        <Pressable style={styles.tinyActionButton} onPress={pressAction(() => void advanceTask(task.id))}>
          <Text style={styles.tinyActionButtonText}>{nextTaskStatusLabel(task.status)}</Text>
        </Pressable>

        <Pressable style={styles.tinyDangerActionButton} onPress={pressAction(() => void deleteTask(task.id))}>
          <Text style={styles.tinyDangerActionButtonText}>Delete</Text>
        </Pressable>
      </View>
    );
  }

  function renderTaskGroup(title: string, tasks: HubTask[]) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeadingRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardCount}>{tasks.length}</Text>
        </View>

        {tasks.length === 0 ? (
          <Text style={styles.mutedText}>No tasks in this section.</Text>
        ) : (
          tasks.map((task) => (
            <Pressable key={task.id} style={styles.itemCard} onPress={() => openTaskActions(task)}>
              <View style={styles.itemMain}>
                <Text style={[styles.itemTitle, task.status === 'completed' ? styles.itemTitleDone : undefined]}>
                  {task.title}
                </Text>
                <Text style={styles.itemMeta}>
                  {task.priority.toUpperCase()} | {task.status} | {formatYmdLabel(task.dueDate)}
                </Text>
                <Text style={styles.progressMeta}>Tap for actions</Text>
              </View>

              {renderCompactTaskActions(task)}
            </Pressable>
          ))
        )}
      </View>
    );
  }

  function openTodayAgendaItem(item: TodayAgendaItem) {
    if (item.isTask && item.taskId) {
      const task = snapshot.tasks.find((entry) => entry.id === item.taskId);
      if (task) {
        openTaskActions(task);
      }
      return;
    }

    const lines = [
      formatTimeLabel(item.startTime),
      item.endTime ? `${formatTimeLabel(item.startTime)} - ${formatTimeLabel(item.endTime)}` : null,
      item.sourceLabel ? `Source: ${item.sourceLabel}` : null,
      item.location || null,
    ].filter(Boolean);

    Alert.alert(item.title, lines.join('\n') || 'Schedule item', [
      {
        text: 'Start Focus',
        onPress: () => setActiveTab('focus'),
      },
      {
        text: 'Open Schedule',
        onPress: () => {
          const today = todayYmd();
          setScheduleSelectedDate(today);
          setScheduleMonthCursor(getMonthStartYmd(today));
          setScheduleWeekCursor(getCalendarWeekStartYmd(today));
          setActiveTab('schedule');
        },
      },
      { text: 'Close', style: 'cancel' },
    ]);
  }

  function renderDashboardTab() {
    const greetingText = `${getDashboardGreeting()}, Scholar!`;
    const dateLabel = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const visibleChallenges = todayChallengeHighlights.slice(0, 3);

    const formatRecordTime = (minutes: number) => {
      const safeMinutes = Math.max(0, Math.round(minutes));
      const hours = Math.floor(safeMinutes / 60);
      const mins = safeMinutes % 60;
      if (hours === 0) return `${mins}m`;
      if (mins === 0) return `${hours}h`;
      return `${hours}h ${mins}m`;
    };

    const goalFillStyles = [styles.goalFill1, styles.goalFill2, styles.goalFill3, styles.goalFill4];

    return (
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <View style={styles.dashboardHeaderPanel}>
          <Text style={styles.dashboardGreeting}>{greetingText}</Text>
          <Text style={styles.dashboardDate}>{dateLabel}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>Today's Hub</Text>
            <Text style={styles.cardCount}>{dashboardTodayTasks.length + dashboardTodaySchedule.length + todayChallengeHighlights.length}</Text>
          </View>

          <Text style={styles.mutedText}>{todayDigest.body}</Text>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Tasks</Text>
              <Text style={styles.summaryValue}>{dashboardTodayTasks.length}</Text>
              <Text style={styles.summaryMeta}>Today</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Events</Text>
              <Text style={styles.summaryValue}>{dashboardTodaySchedule.length}</Text>
              <Text style={styles.summaryMeta}>Today</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Challenges</Text>
              <Text style={styles.summaryValue}>{todayChallengeHighlights.length}</Text>
              <Text style={styles.summaryMeta}>Today</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Focus</Text>
              <Text style={styles.summaryValue}>{formatMinutes(todayStats.focusMinutes)}</Text>
              <Text style={styles.summaryMeta}>Today</Text>
            </View>
          </View>

          <View style={styles.todayDigestSection}>
            <Text style={styles.summaryLabel}>Next Tasks</Text>
            {dashboardTodayTasks.length === 0 ? (
              <Text style={styles.summaryMeta}>No tasks due today.</Text>
            ) : (
              dashboardTodayTasks.slice(0, 3).map((task) => (
                <Pressable key={`hub-task-${task.id}`} style={styles.todayDigestRow} onPress={() => openTaskActions(task)}>
                  <Text style={styles.compactTitle}>{task.title}</Text>
                  <Text style={styles.compactMeta}>
                    {task.dueTime ? formatTimeLabel(task.dueTime) : 'Any time'} | {task.priority.toUpperCase()}
                  </Text>
                </Pressable>
              ))
            )}
          </View>

          <View style={styles.todayDigestSection}>
            <Text style={styles.summaryLabel}>Next Events</Text>
            {dashboardTodaySchedule.length === 0 ? (
              <Text style={styles.summaryMeta}>No events scheduled today.</Text>
            ) : (
              dashboardTodaySchedule.slice(0, 3).map((event) => {
                const source = getImportedSourceDetails(event, snapshot.importedCalendarsMeta);

                return (
                  <Pressable key={`hub-event-${event.id}`} style={styles.todayDigestRow} onPress={() => openTodayAgendaItem({
                    id: event.id,
                    taskId: null,
                    title: event.title,
                    type: event.type,
                    startTime: event.startTime,
                    endTime: event.endTime,
                    location: event.location,
                    isTask: false,
                    sourceLabel: source?.label,
                    sourceColor: source?.color,
                  })}>
                    <Text style={styles.compactTitle}>{event.title}</Text>
                    {source ? (
                      <View
                        style={[
                          styles.scheduleSourceBadge,
                          {
                            borderColor: `${source.color}88`,
                            backgroundColor: `${source.color}22`,
                          },
                        ]}
                      >
                        <Text style={[styles.scheduleSourceBadgeText, { color: source.color }]} numberOfLines={1}>
                          {source.label}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={styles.compactMeta}>
                      {formatTimeLabel(event.startTime)}{event.endTime ? ` - ${formatTimeLabel(event.endTime)}` : ''}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>

          <View style={styles.todayDigestSection}>
            <Text style={styles.summaryLabel}>Challenge Progress</Text>
            {todayChallengeHighlights.length === 0 ? (
              <Text style={styles.summaryMeta}>No challenges for today.</Text>
            ) : (
              todayChallengeHighlights.slice(0, 3).map((entry) => {
                const { challenge, percent, needsProgressToday } = entry;
                return (
                  <Pressable key={`hub-challenge-${challenge.id}`} style={styles.todayDigestRow} onPress={() => setActiveTab('challenges')}>
                    <Text style={styles.compactTitle}>{challenge.title}</Text>
                    <Text style={styles.compactMeta}>
                      {challenge.currentProgress}/{challenge.targetProgress} ({percent}%)
                      {needsProgressToday ? ' | Due today' : ''}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>

          <View style={styles.inlineButtonsRow}>
            <Pressable style={styles.primaryButtonInline} onPress={() => setActiveTab('today')}>
              <Text style={styles.primaryButtonText}>Open Today</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryButtonInline, isExpoGoAndroid ? styles.buttonDisabled : undefined]}
              onPress={() => void sendTodaySummaryNotification()}
              disabled={isExpoGoAndroid}
            >
              <Text style={styles.secondaryButtonText}>Notify me</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>Today's Tasks</Text>
            <Text style={styles.cardCount}>{dashboardTodayTasks.length}</Text>
          </View>

          <View style={styles.dashboardQuickAddRow}>
            <TextInput
              value={dashboardTaskInput}
              onChangeText={setDashboardTaskInput}
              placeholder="Add a task for today..."
              placeholderTextColor={COLORS.textMuted}
              style={[styles.input, styles.dashboardQuickAddInput]}
              returnKeyType="done"
              onSubmitEditing={() => void handleAddDashboardTodayTask()}
            />
            <Pressable style={styles.dashboardQuickAddButton} onPress={() => void handleAddDashboardTodayTask()}>
              <Text style={styles.dashboardQuickAddButtonText}>+</Text>
            </Pressable>
          </View>

          {dashboardTodayTasks.length === 0 ? (
            <Text style={styles.mutedText}>No tasks planned for today</Text>
          ) : (
            dashboardTodayTasks.map((task) => {
              return (
                <Pressable key={task.id} style={styles.compactRow} onPress={() => openTaskActions(task)}>
                  <Text style={styles.compactTitle}>{task.title}</Text>
                  <Text style={styles.compactMeta}>
                    {task.dueTime ? `${formatTimeLabel(task.dueTime)} | ` : ''}{task.priority.toUpperCase()}
                  </Text>
                  {renderCompactTaskActions(task)}
                </Pressable>
              );
            })
          )}

          <Pressable style={styles.linkButton} onPress={() => setActiveTab('tasks')}>
            <Text style={styles.linkButtonText}>View All</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          {dashboardBestRecord == null ? (
            <View style={styles.bestRecordWrapper}>
              <View style={styles.bestRecordHeader}>
                <Text style={styles.bestRecordIcon}>🏅</Text>
                <View style={styles.bestRecordHeadText}>
                  <Text style={styles.cardTitle}>Personal Best</Text>
                  <Text style={styles.compactMeta}>No records yet</Text>
                </View>
              </View>
              <Text style={styles.mutedText}>Start a focus session to set your first personal record!</Text>
            </View>
          ) : (
            <View style={styles.bestRecordWrapper}>
              <View style={styles.bestRecordHeader}>
                <Text style={styles.bestRecordIcon}>{dashboardBestRecord.isNewRecord ? '🏆' : '🏅'}</Text>
                <View style={styles.bestRecordHeadText}>
                  <Text style={styles.cardTitle}>{dashboardBestRecord.isNewRecord ? 'New Personal Record!' : 'Personal Best'}</Text>
                  <Text style={styles.compactMeta}>
                    {dashboardBestRecord.isToday
                      ? 'Today - New Record!'
                      : new Date(`${dashboardBestRecord.bestDay.date}T00:00:00`).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                  </Text>
                </View>
              </View>

              <View style={styles.bestRecordStatsRow}>
                <View style={[styles.summaryCard, styles.bestRecordPrimaryStat]}>
                  <Text style={styles.summaryValue}>{formatRecordTime(dashboardBestRecord.bestDay.focusMinutes)}</Text>
                  <Text style={styles.summaryMeta}>Focus Time</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{dashboardBestRecord.bestDay.focusSessions}</Text>
                  <Text style={styles.summaryMeta}>Sessions</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{dashboardBestRecord.bestDay.tasksCompleted}</Text>
                  <Text style={styles.summaryMeta}>Tasks Done</Text>
                </View>
                {dashboardBestRecord.bestDay.productivityScore > 0 ? (
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryValue}>{dashboardBestRecord.bestDay.productivityScore}%</Text>
                    <Text style={styles.summaryMeta}>Score</Text>
                  </View>
                ) : null}
              </View>

              {!dashboardBestRecord.isToday ? (
                <View style={styles.bestRecordProgressBlock}>
                  <View style={styles.cardHeadingRow}>
                    <Text style={styles.summaryLabel}>Today's progress toward record</Text>
                    <Text style={styles.summaryMeta}>{dashboardBestRecord.progress}%</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${dashboardBestRecord.progress}%` }]} />
                  </View>
                  <Text style={styles.compactMeta}>
                    {formatRecordTime(dashboardBestRecord.todayRow.focusMinutes)} focused | {dashboardBestRecord.todayRow.focusSessions} session{dashboardBestRecord.todayRow.focusSessions === 1 ? '' : 's'} | {dashboardBestRecord.todayRow.tasksCompleted} task{dashboardBestRecord.todayRow.tasksCompleted === 1 ? '' : 's'} done
                  </Text>
                  <Text style={styles.compactMeta}>
                    {dashboardBestRecord.remaining > 0
                      ? `${formatRecordTime(dashboardBestRecord.remaining)} to beat record`
                      : 'Record beaten!'}
                  </Text>
                </View>
              ) : null}

              <View style={styles.inlineButtonsRow}>
                <Pressable style={styles.primaryButtonInline} onPress={() => setActiveTab('focus')}>
                  <Text style={styles.primaryButtonText}>Start Focus</Text>
                </Pressable>
                <Pressable style={styles.secondaryButtonInline} onPress={() => setActiveTab('analytics')}>
                  <Text style={styles.secondaryButtonText}>Open Analytics</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>Goals</Text>
            <Text style={styles.cardCount}>{dashboardGoalsSummary.totalCount}</Text>
          </View>

          {dashboardGoalsSummary.totalCount === 0 ? (
            <Text style={styles.mutedText}>No active goals. Set one now!</Text>
          ) : (
            <>
              <View style={styles.goalSummaryRow}>
                <View style={styles.goalSummaryPill}>
                  <Text style={styles.summaryLabel}>Average</Text>
                  <Text style={styles.goalSummaryValue}>{dashboardGoalsSummary.avgProgress}%</Text>
                </View>
                <View style={styles.goalSummaryPill}>
                  <Text style={styles.summaryLabel}>Completed</Text>
                  <Text style={styles.goalSummaryValue}>{dashboardGoalsSummary.completedCount}/{dashboardGoalsSummary.totalCount}</Text>
                </View>
              </View>

              {dashboardGoalsSummary.rows.map((entry, index) => (
                <Pressable key={entry.goal.id} style={styles.goalBarRow} onPress={() => setActiveTab('goals')}>
                  <View style={styles.cardHeadingRow}>
                    <Text style={styles.compactTitle}>{entry.goal.title}</Text>
                    <Text style={styles.compactMeta}>{entry.progress}%</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, goalFillStyles[index % goalFillStyles.length], { width: `${entry.progress}%` }]} />
                  </View>
                </Pressable>
              ))}
            </>
          )}

          <Pressable style={styles.linkButton} onPress={() => setActiveTab('goals')}>
            <Text style={styles.linkButtonText}>View All</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>Items to Review</Text>
            <Text style={styles.cardCount}>{dashboardReviewItems.length}</Text>
          </View>

          {dashboardReviewItems.length === 0 ? (
            <Text style={styles.mutedText}>No items due for review!</Text>
          ) : (
            dashboardReviewItems.map((item) => (
              <Pressable key={item.id} style={styles.reviewRow} onPress={() => setActiveTab('revisions')}>
                <View style={styles.reviewBody}>
                  <Text style={styles.compactTitle}>{item.title}</Text>
                  <Text style={styles.compactMeta}>{formatDueLabel(String(item.dueYmd), todayYmd())}</Text>
                </View>
                <Pressable style={styles.smallButton} onPress={pressAction(() => setActiveTab('focus'))}>
                  <Text style={styles.smallButtonText}>Focus</Text>
                </Pressable>
              </Pressable>
            ))
          )}

          <Pressable style={styles.linkButton} onPress={() => setActiveTab('revisions')}>
            <Text style={styles.linkButtonText}>View All</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>Today's Schedule</Text>
            <Text style={styles.cardCount}>{todayAgendaItems.length}</Text>
          </View>

          {todayAgendaItems.length === 0 ? (
            <Text style={styles.mutedText}>No schedule yet for today</Text>
          ) : (
            todayAgendaItems.slice(0, 8).map((item) => (
              <Pressable
                key={`${item.id}_${item.startTime}`}
                style={styles.scheduleRow}
                onPress={() => openTodayAgendaItem(item)}
              >
                <Text style={styles.scheduleTime}>{formatTimeLabel(item.startTime)}</Text>
                <View style={styles.scheduleBody}>
                  <Text style={styles.scheduleTitle}>{item.title}</Text>
                  {item.sourceLabel ? (
                    <View
                      style={[
                        styles.scheduleSourceBadge,
                        {
                          borderColor: `${(item.sourceColor || '#6366f1')}88`,
                          backgroundColor: `${(item.sourceColor || '#6366f1')}22`,
                        },
                      ]}
                    >
                      <Text style={[styles.scheduleSourceBadgeText, { color: item.sourceColor || '#6366f1' }]} numberOfLines={1}>
                        {item.sourceLabel}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={styles.scheduleMeta}>
                    {item.endTime ? `${formatTimeLabel(item.startTime)} - ${formatTimeLabel(item.endTime)} | ` : ''}
                    {item.isTask ? 'Task' : toLabelCase(item.type)}
                  </Text>
                  {item.location ? <Text style={styles.scheduleMeta}>{item.location}</Text> : null}
                </View>
              </Pressable>
            ))
          )}

          <Pressable
            style={styles.linkButton}
            onPress={() => {
              const today = todayYmd();
              setScheduleView('combined');
              setScheduleSelectedDate(today);
              setScheduleMonthCursor(getMonthStartYmd(today));
              setScheduleWeekCursor(getCalendarWeekStartYmd(today));
              setActiveTab('schedule');
            }}
          >
            <Text style={styles.linkButtonText}>View All</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>Priority Tasks</Text>
            <Text style={styles.cardCount}>{priorityTasksPreview.length}</Text>
          </View>

          {priorityTasksPreview.length === 0 ? (
            <Text style={styles.mutedText}>No tasks yet. Add your first task to get started.</Text>
          ) : (
            priorityTasksPreview.map((task) => (
              <Pressable key={task.id} style={styles.compactRow} onPress={() => openTaskActions(task)}>
                <Text style={styles.compactTitle}>{task.title}</Text>
                <Text style={styles.compactMeta}>
                  {task.dueDate ? `${formatYmdLabel(task.dueDate)} | ` : ''}{task.priority}
                </Text>
                {renderCompactTaskActions(task)}
              </Pressable>
            ))
          )}

          <Pressable style={styles.linkButton} onPress={() => setActiveTab('tasks')}>
            <Text style={styles.linkButtonText}>View All</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>Deadlines</Text>
            <Text style={styles.cardCount}>{dashboardDeadlineItems.length}</Text>
          </View>

          {dashboardDeadlineItems.length === 0 ? (
            <Text style={styles.mutedText}>No upcoming deadlines.</Text>
          ) : (
            dashboardDeadlineItems.map(({ task, dueLabel }) => (
              <Pressable key={task.id} style={styles.compactRow} onPress={() => openTaskActions(task)}>
                <Text style={styles.compactTitle}>{task.title}</Text>
                <Text style={styles.compactMeta}>{dueLabel}</Text>
                {renderCompactTaskActions(task)}
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>Challenges</Text>
            <Text style={styles.cardCount}>{visibleChallenges.length}</Text>
          </View>

          {visibleChallenges.length === 0 ? (
            <>
              <Text style={styles.mutedText}>No challenges yet</Text>
              <Text style={styles.summaryMeta}>Create one to track progress automatically.</Text>
            </>
          ) : (
            visibleChallenges.map((entry) => {
              const { challenge, percent } = entry;

              return (
                <Pressable key={challenge.id} style={styles.progressCard} onPress={() => setActiveTab('challenges')}>
                  <View style={styles.cardHeadingRow}>
                    <Text style={styles.compactTitle}>{challenge.title}</Text>
                    <Text style={styles.compactMeta}>{challenge.currentProgress}/{challenge.targetProgress}</Text>
                  </View>
                  <Text style={styles.summaryMeta}>{toLabelCase(challenge.type)} | {toLabelCase(challenge.metric)}</Text>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        challenge.status === 'completed' ? styles.progressFillDone : undefined,
                        { width: `${percent}%` },
                      ]}
                    />
                  </View>
                </Pressable>
              );
            })
          )}

          <Pressable style={styles.linkButton} onPress={() => setActiveTab('challenges')}>
            <Text style={styles.linkButtonText}>View All</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  function renderTodayTab() {
    const activeChallenges = todayChallengeHighlights.filter((entry) => entry.challenge.status === 'active');

    return (
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Today's Snapshot</Text>
          <Text style={styles.mutedText}>{todayDigest.body}</Text>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Tasks</Text>
              <Text style={styles.summaryValue}>{dashboardTodayTasks.length}</Text>
              <Text style={styles.summaryMeta}>Due today</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Schedule</Text>
              <Text style={styles.summaryValue}>{todayAgendaItems.length}</Text>
              <Text style={styles.summaryMeta}>Items today</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Challenges</Text>
              <Text style={styles.summaryValue}>{activeChallenges.length}</Text>
              <Text style={styles.summaryMeta}>Active now</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Focus</Text>
              <Text style={styles.summaryValue}>{formatMinutes(focusMinutesToday)}</Text>
              <Text style={styles.summaryMeta}>Today</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>Today's Tasks</Text>
            <Text style={styles.cardCount}>{dashboardTodayTasks.length}</Text>
          </View>

          {dashboardTodayTasks.length === 0 ? (
            <Text style={styles.mutedText}>No tasks planned for today.</Text>
          ) : (
            dashboardTodayTasks.map((task) => (
              <Pressable key={task.id} style={styles.compactRow} onPress={() => openTaskActions(task)}>
                <Text style={styles.compactTitle}>{task.title}</Text>
                <Text style={styles.compactMeta}>
                  {task.dueTime ? `${formatTimeLabel(task.dueTime)} | ` : ''}{task.priority.toUpperCase()}
                </Text>
                {renderCompactTaskActions(task)}
              </Pressable>
            ))
          )}

          <Pressable style={styles.linkButton} onPress={() => setActiveTab('tasks')}>
            <Text style={styles.linkButtonText}>Open Tasks</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>Today's Schedule</Text>
            <Text style={styles.cardCount}>{todayAgendaItems.length}</Text>
          </View>

          {todayAgendaItems.length === 0 ? (
            <Text style={styles.mutedText}>No schedule items today.</Text>
          ) : (
            todayAgendaItems.map((item) => (
              <Pressable
                key={`${item.id}_${item.startTime}`}
                style={styles.scheduleRow}
                onPress={() => openTodayAgendaItem(item)}
              >
                <Text style={styles.scheduleTime}>{formatTimeLabel(item.startTime)}</Text>
                <View style={styles.scheduleBody}>
                  <Text style={styles.scheduleTitle}>{item.title}</Text>
                  {item.sourceLabel ? (
                    <View
                      style={[
                        styles.scheduleSourceBadge,
                        {
                          borderColor: `${(item.sourceColor || '#6366f1')}88`,
                          backgroundColor: `${(item.sourceColor || '#6366f1')}22`,
                        },
                      ]}
                    >
                      <Text style={[styles.scheduleSourceBadgeText, { color: item.sourceColor || '#6366f1' }]} numberOfLines={1}>
                        {item.sourceLabel}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={styles.scheduleMeta}>
                    {item.endTime ? `${formatTimeLabel(item.startTime)} - ${formatTimeLabel(item.endTime)} | ` : ''}
                    {item.isTask ? 'Task' : toLabelCase(item.type)}
                  </Text>
                  {item.location ? <Text style={styles.scheduleMeta}>{item.location}</Text> : null}
                </View>
              </Pressable>
            ))
          )}

          <Pressable
            style={styles.linkButton}
            onPress={() => {
              const today = todayYmd();
              setScheduleView('combined');
              setScheduleSelectedDate(today);
              setScheduleMonthCursor(getMonthStartYmd(today));
              setScheduleWeekCursor(getCalendarWeekStartYmd(today));
              setActiveTab('schedule');
            }}
          >
            <Text style={styles.linkButtonText}>Open Schedule</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>Today's Challenges</Text>
            <Text style={styles.cardCount}>{todayChallengeHighlights.length}</Text>
          </View>

          {todayChallengeHighlights.length === 0 ? (
            <Text style={styles.mutedText}>No challenges set for today.</Text>
          ) : (
            todayChallengeHighlights.map((entry) => {
              const { challenge, percent, needsProgressToday } = entry;

              return (
                <View key={challenge.id} style={styles.progressCard}>
                  <View style={styles.cardHeadingRow}>
                    <Text style={styles.compactTitle}>{challenge.title}</Text>
                    <Text style={styles.compactMeta}>{challenge.currentProgress}/{challenge.targetProgress}</Text>
                  </View>

                  <Text style={styles.summaryMeta}>
                    {toLabelCase(challenge.type)} | {toLabelCase(challenge.metric)}
                    {needsProgressToday ? ' | Due today' : ''}
                  </Text>

                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        challenge.status === 'completed' ? styles.progressFillDone : undefined,
                        { width: `${percent}%` },
                      ]}
                    />
                  </View>

                  <View style={styles.itemButtonsRow}>
                    {challenge.status === 'active' ? (
                      <Pressable style={styles.smallButton} onPress={pressAction(() => void incrementChallenge(challenge.id))}>
                        <Text style={styles.smallButtonText}>+1 Progress</Text>
                      </Pressable>
                    ) : null}

                    <Pressable style={styles.smallButton} onPress={pressAction(() => setActiveTab('challenges'))}>
                      <Text style={styles.smallButtonText}>Open</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    );
  }

  function renderScheduleTab() {
    const scheduleViewLabels: Record<ScheduleView, string> = {
      school: 'School Schedule',
      personal: 'Personal Schedule',
      combined: 'Combined View',
    };

    const calendarModeLabels: Record<ScheduleCalendarMode, string> = {
      month: 'Month View',
      week: 'Week View',
    };

    const weekLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const isWeekView = scheduleCalendarMode === 'week';
    const calendarLabel = isWeekView
      ? formatWeekRangeLabel(scheduleWeekCursor)
      : formatMonthYearLabel(scheduleMonthCursor);

    const todayAgendaCount = todayScheduleForView.length + getTasksForDate(snapshot.tasks, todayYmd()).length;

    const selectScheduleDate = (ymd: string) => {
      setScheduleSelectedDate(ymd);
      setScheduleMonthCursor(getMonthStartYmd(ymd));
      setScheduleWeekCursor(getCalendarWeekStartYmd(ymd));
    };

    const goToPreviousRange = () => {
      if (isWeekView) {
        setScheduleWeekCursor((prev) => addDaysToYmd(prev, -7));
        setScheduleSelectedDate((prev) => addDaysToYmd(prev, -7));
        return;
      }
      setScheduleMonthCursor((prev) => addMonthsToYmd(prev, -1));
    };

    const goToTodayRange = () => {
      const today = todayYmd();
      setScheduleMonthCursor(getMonthStartYmd(today));
      setScheduleWeekCursor(getCalendarWeekStartYmd(today));
      setScheduleSelectedDate(today);
    };

    const goToNextRange = () => {
      if (isWeekView) {
        setScheduleWeekCursor((prev) => addDaysToYmd(prev, 7));
        setScheduleSelectedDate((prev) => addDaysToYmd(prev, 7));
        return;
      }
      setScheduleMonthCursor((prev) => addMonthsToYmd(prev, 1));
    };

    const showScheduleEventDetails = (event: HubScheduleEvent, dateOverride?: string) => {
      const eventDate = dateOverride || event.date || scheduleSelectedDate;
      const timeRange = event.endTime
        ? `${formatTimeLabel(event.startTime)} - ${formatTimeLabel(event.endTime)}`
        : formatTimeLabel(event.startTime);
      const source = getImportedSourceDetails(event, snapshot.importedCalendarsMeta);

      const lines = [
        eventDate ? formatYmdLabel(eventDate) : null,
        timeRange,
        `${toLabelCase(event.type)} | ${toLabelCase(event.scheduleType)}`,
        source ? `Source: ${source.label}` : null,
        event.location || null,
      ].filter(Boolean);

      Alert.alert(event.title, lines.join('\n'), [
        {
          text: 'Start Focus',
          onPress: () => setActiveTab('focus'),
        },
        {
          text: 'Close',
          style: 'cancel',
        },
      ]);
    };

    const openScheduleAgendaItem = (item: ScheduleAgendaItem) => {
      if (item.isTask && item.task) {
        openTaskActions(item.task);
        return;
      }

      if (item.event) {
        showScheduleEventDetails(item.event, item.ymd);
      }
    };

    return (
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Task Schedule</Text>
          <Text style={styles.mutedText}>Switch between School Schedule, Personal Schedule, and Combined View.</Text>

          <View style={styles.chipRow}>
            {(['school', 'personal', 'combined'] as ScheduleView[]).map((view) => (
              <Pressable
                key={view}
                style={[styles.chipButton, scheduleView === view ? styles.chipButtonActive : undefined]}
                onPress={() => setScheduleView(view)}
              >
                <Text style={[styles.chipText, scheduleView === view ? styles.chipTextActive : undefined]}>
                  {scheduleViewLabels[view]}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.chipRow}>
            {(['month', 'week'] as ScheduleCalendarMode[]).map((mode) => (
              <Pressable
                key={mode}
                style={[styles.chipButton, scheduleCalendarMode === mode ? styles.chipButtonActive : undefined]}
                onPress={() => {
                  setScheduleCalendarMode(mode);
                  if (mode === 'week') {
                    setScheduleWeekCursor(getCalendarWeekStartYmd(scheduleSelectedDate));
                  } else {
                    setScheduleMonthCursor(getMonthStartYmd(scheduleSelectedDate));
                  }
                }}
              >
                <Text style={[styles.chipText, scheduleCalendarMode === mode ? styles.chipTextActive : undefined]}>
                  {calendarModeLabels[mode]}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Events</Text>
              <Text style={styles.summaryValue}>{scheduleEventsForView.length}</Text>
              <Text style={styles.summaryMeta}>{toLabelCase(scheduleView)} view</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Today</Text>
              <Text style={styles.summaryValue}>{todayAgendaCount}</Text>
              <Text style={styles.summaryMeta}>Events + tasks</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Next 14 days</Text>
              <Text style={styles.summaryValue}>{upcomingScheduleForView.length}</Text>
              <Text style={styles.summaryMeta}>Upcoming items</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>{calendarLabel}</Text>
            <View style={styles.calendarNavRow}>
              <Pressable
                style={styles.smallButton}
                onPress={goToPreviousRange}
              >
                <Text style={styles.smallButtonText}>Prev</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={goToTodayRange}>
                <Text style={styles.smallButtonText}>Today</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={goToNextRange}>
                <Text style={styles.smallButtonText}>Next</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.calendarWeekHeader}>
            {weekLabels.map((label) => (
              <Text key={label} style={styles.calendarWeekLabel}>{label}</Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {scheduleVisibleCalendarDays.map((day) => {
              const isSelected = day.ymd === scheduleSelectedDate;
              const isToday = day.ymd === todayYmd();
              const eventCount = scheduleEventCountByDate[day.ymd] || 0;
              const isOutsideInMonthMode = !isWeekView && !day.inMonth;

              return (
                <Pressable
                  key={day.ymd}
                  style={[
                    styles.calendarDayCell,
                    isOutsideInMonthMode ? styles.calendarDayOutside : undefined,
                    isToday ? styles.calendarDayToday : undefined,
                    isSelected ? styles.calendarDaySelected : undefined,
                  ]}
                  onPress={() => selectScheduleDate(day.ymd)}
                >
                  <Text
                    style={[
                      styles.calendarDayNumber,
                      isOutsideInMonthMode ? styles.calendarDayNumberOutside : undefined,
                      isSelected ? styles.calendarDayNumberSelected : undefined,
                    ]}
                  >
                    {day.dayOfMonth}
                  </Text>

                  {eventCount > 0 ? (
                    <View style={styles.calendarEventBadge}>
                      <Text style={styles.calendarEventBadgeText}>{eventCount}</Text>
                    </View>
                  ) : (
                    <View style={styles.calendarEventBadgeSpacer} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>{`Agenda for ${formatYmdLabel(scheduleSelectedDate)}`}</Text>
            <Text style={styles.cardCount}>{selectedDateAgendaItems.length}</Text>
          </View>

          {selectedDateAgendaItems.length === 0 ? (
            <Text style={styles.mutedText}>No schedule or tasks for this date.</Text>
          ) : (
            selectedDateAgendaItems.map((item) => {
              const timeRange = item.endTime
                ? `${formatTimeLabel(item.startTime)} - ${formatTimeLabel(item.endTime)}`
                : formatTimeLabel(item.startTime);
              const source = !item.isTask && item.event
                ? getImportedSourceDetails(item.event, snapshot.importedCalendarsMeta)
                : null;

              return (
                <Pressable
                  key={item.key}
                  style={styles.scheduleRow}
                  onPress={() => openScheduleAgendaItem(item)}
                >
                  <Text style={styles.scheduleTime}>{formatTimeLabel(item.startTime)}</Text>
                  <View style={styles.scheduleBody}>
                    <Text style={styles.scheduleTitle}>{item.title}</Text>
                    {source ? (
                      <View
                        style={[
                          styles.scheduleSourceBadge,
                          {
                            borderColor: `${source.color}88`,
                            backgroundColor: `${source.color}22`,
                          },
                        ]}
                      >
                        <Text style={[styles.scheduleSourceBadgeText, { color: source.color }]} numberOfLines={1}>
                          {source.label}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={styles.scheduleMeta}>{timeRange} | {item.isTask ? 'Task' : toLabelCase(item.type)}</Text>
                    {item.location ? <Text style={styles.scheduleMeta}>{item.location}</Text> : null}

                    {item.isTask && item.task ? (
                      renderCompactTaskActions(item.task)
                    ) : (
                      <View style={styles.compactActionsRow}>
                        <Pressable style={styles.tinyActionButton} onPress={pressAction(() => setActiveTab('focus'))}>
                          <Text style={styles.tinyActionButtonText}>Focus</Text>
                        </Pressable>
                        {item.event ? (
                          <Pressable
                            style={styles.tinyActionButton}
                            onPress={pressAction(() => showScheduleEventDetails(item.event as HubScheduleEvent, item.ymd))}
                          >
                            <Text style={styles.tinyActionButtonText}>Details</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>Next 14 days</Text>
            <Text style={styles.cardCount}>{upcomingScheduleForView.length}</Text>
          </View>

          {upcomingScheduleForView.length === 0 ? (
            <Text style={styles.mutedText}>No upcoming events found.</Text>
          ) : (
            upcomingScheduleForView.map((occurrence) => {
              const timeRange = occurrence.event.endTime
                ? `${formatTimeLabel(occurrence.event.startTime)} - ${formatTimeLabel(occurrence.event.endTime)}`
                : formatTimeLabel(occurrence.event.startTime);
              const source = getImportedSourceDetails(occurrence.event, snapshot.importedCalendarsMeta);

              return (
                <Pressable
                  key={occurrence.key}
                  style={styles.scheduleRow}
                  onPress={() => showScheduleEventDetails(occurrence.event, occurrence.occurrenceDate)}
                >
                  <Text style={styles.scheduleTime}>{formatYmdLabel(occurrence.occurrenceDate)}</Text>
                  <View style={styles.scheduleBody}>
                    <Text style={styles.scheduleTitle}>{occurrence.event.title}</Text>
                    {source ? (
                      <View
                        style={[
                          styles.scheduleSourceBadge,
                          {
                            borderColor: `${source.color}88`,
                            backgroundColor: `${source.color}22`,
                          },
                        ]}
                      >
                        <Text style={[styles.scheduleSourceBadgeText, { color: source.color }]} numberOfLines={1}>
                          {source.label}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={styles.scheduleMeta}>
                      {timeRange} | {toLabelCase(occurrence.event.type)} | {toLabelCase(occurrence.event.scheduleType)}
                    </Text>
                    {occurrence.event.location ? <Text style={styles.scheduleMeta}>{occurrence.event.location}</Text> : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    );
  }

  function renderTasksTab() {
    return (
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        {editingTaskId ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Edit task</Text>

            <TextInput
              value={editingTaskTitle}
              onChangeText={setEditingTaskTitle}
              placeholder="Task title"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />

            <Text style={styles.summaryMeta}>
              Due date: {editingTaskDueDate ? formatYmdLabel(editingTaskDueDate) : 'Not set'}
            </Text>

            <View style={styles.inlineButtonsRow}>
              <Pressable style={styles.secondaryButtonInline} onPress={() => openTaskDueDatePicker(true)}>
                <Text style={styles.secondaryButtonText}>Pick date</Text>
              </Pressable>
              <Pressable style={styles.secondaryButtonInline} onPress={() => clearTaskDueDate(true)}>
                <Text style={styles.secondaryButtonText}>Clear date</Text>
              </Pressable>
            </View>

            <Text style={styles.summaryMeta}>
              Due time: {editingTaskDueTime ? formatTimeLabel(editingTaskDueTime) : 'Not set'}
            </Text>

            <View style={styles.inlineButtonsRow}>
              <Pressable style={styles.secondaryButtonInline} onPress={() => openTaskDueTimePicker(true)}>
                <Text style={styles.secondaryButtonText}>Pick time</Text>
              </Pressable>
              <Pressable style={styles.secondaryButtonInline} onPress={() => clearTaskDueTime(true)}>
                <Text style={styles.secondaryButtonText}>Clear time</Text>
              </Pressable>
            </View>

            <View style={styles.chipRow}>
              {(['low', 'medium', 'high', 'urgent'] as TaskPriority[]).map((priority) => (
                <Pressable
                  key={priority}
                  style={[styles.chipButton, editingTaskPriority === priority ? styles.chipButtonActive : undefined]}
                  onPress={() => setEditingTaskPriority(priority)}
                >
                  <Text style={[styles.chipText, editingTaskPriority === priority ? styles.chipTextActive : undefined]}>
                    {priority}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.inlineButtonsRow}>
              <Pressable style={styles.primaryButtonInline} onPress={() => void saveTaskEdit()}>
                <Text style={styles.primaryButtonText}>Save</Text>
              </Pressable>
              <Pressable style={styles.secondaryButtonInline} onPress={cancelTaskEdit}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create task</Text>

          <TextInput
            value={taskTitle}
            onChangeText={setTaskTitle}
            placeholder="Task title"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
          />

          <Text style={styles.summaryMeta}>
            Due date: {taskDueDate ? formatYmdLabel(taskDueDate) : 'Not set'}
          </Text>

          <View style={styles.inlineButtonsRow}>
            <Pressable style={styles.secondaryButtonInline} onPress={() => openTaskDueDatePicker(false)}>
              <Text style={styles.secondaryButtonText}>Pick date</Text>
            </Pressable>
            <Pressable style={styles.secondaryButtonInline} onPress={() => clearTaskDueDate(false)}>
              <Text style={styles.secondaryButtonText}>Clear date</Text>
            </Pressable>
          </View>

          <Text style={styles.summaryMeta}>
            Due time: {taskDueTime ? formatTimeLabel(taskDueTime) : 'Not set'}
          </Text>

          <View style={styles.inlineButtonsRow}>
            <Pressable style={styles.secondaryButtonInline} onPress={() => openTaskDueTimePicker(false)}>
              <Text style={styles.secondaryButtonText}>Pick time</Text>
            </Pressable>
            <Pressable style={styles.secondaryButtonInline} onPress={() => clearTaskDueTime(false)}>
              <Text style={styles.secondaryButtonText}>Clear time</Text>
            </Pressable>
          </View>

          <View style={styles.chipRow}>
            {(['low', 'medium', 'high', 'urgent'] as TaskPriority[]).map((priority) => (
              <Pressable
                key={priority}
                style={[styles.chipButton, taskPriority === priority ? styles.chipButtonActive : undefined]}
                onPress={() => setTaskPriority(priority)}
              >
                <Text style={[styles.chipText, taskPriority === priority ? styles.chipTextActive : undefined]}>{priority}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.primaryButton} onPress={() => void handleAddTask()}>
            <Text style={styles.primaryButtonText}>Add task</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Filters</Text>

          <TextInput
            value={taskSearch}
            onChangeText={setTaskSearch}
            placeholder="Search tasks"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
          />

          <View style={styles.chipRow}>
            {(['all', 'not-started', 'in-progress', 'completed'] as Array<'all' | TaskStatus>).map((status) => (
              <Pressable
                key={status}
                style={[styles.chipButton, taskStatusFilter === status ? styles.chipButtonActive : undefined]}
                onPress={() => setTaskStatusFilter(status)}
              >
                <Text style={[styles.chipText, taskStatusFilter === status ? styles.chipTextActive : undefined]}>{status}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.chipRow}>
            {(['all', 'urgent', 'high', 'medium', 'low'] as Array<'all' | TaskPriority>).map((priority) => (
              <Pressable
                key={priority}
                style={[styles.chipButton, taskPriorityFilter === priority ? styles.chipButtonActive : undefined]}
                onPress={() => setTaskPriorityFilter(priority)}
              >
                <Text style={[styles.chipText, taskPriorityFilter === priority ? styles.chipTextActive : undefined]}>{priority}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {renderTaskGroup('Overdue', groupedTasks.overdue)}
        {renderTaskGroup('Today', groupedTasks.today)}
        {renderTaskGroup('Upcoming', groupedTasks.upcoming)}
        {renderTaskGroup('Completed', groupedTasks.completed)}
      </ScrollView>
    );
  }

  function renderGoalsTab() {
    return (
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Daily targets</Text>

          <View style={styles.smallInputRow}>
            <TextInput
              value={dailyStudyTargetInput}
              onChangeText={setDailyStudyTargetInput}
              keyboardType="numeric"
              placeholder="Study hours"
              placeholderTextColor={COLORS.textMuted}
              style={[styles.input, styles.compactInput]}
            />

            <TextInput
              value={dailyTaskTargetInput}
              onChangeText={setDailyTaskTargetInput}
              keyboardType="numeric"
              placeholder="Tasks/day"
              placeholderTextColor={COLORS.textMuted}
              style={[styles.input, styles.compactInput]}
            />

            <TextInput
              value={weeklyStudyTargetInput}
              onChangeText={setWeeklyStudyTargetInput}
              keyboardType="numeric"
              placeholder="Study hours/week"
              placeholderTextColor={COLORS.textMuted}
              style={[styles.input, styles.compactInput]}
            />
          </View>

          <Pressable style={styles.secondaryButton} onPress={() => void saveDailyTargets()}>
            <Text style={styles.secondaryButtonText}>Save targets</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create goal</Text>

          <TextInput
            value={goalTitle}
            onChangeText={setGoalTitle}
            placeholder="Goal title"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
          />

          <TextInput
            value={goalTarget}
            onChangeText={setGoalTarget}
            keyboardType="numeric"
            placeholder="Tracking target"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
          />

          <View style={styles.chipRow}>
            {(['academic', 'skill', 'project', 'career'] as GoalCategory[]).map((category) => (
              <Pressable
                key={category}
                style={[styles.chipButton, goalCategory === category ? styles.chipButtonActive : undefined]}
                onPress={() => setGoalCategory(category)}
              >
                <Text style={[styles.chipText, goalCategory === category ? styles.chipTextActive : undefined]}>{category}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.chipRow}>
            {(['milestones', 'focus_hours', 'tasks_completed', 'website_minutes'] as GoalTrackingType[]).map((type) => (
              <Pressable
                key={type}
                style={[styles.chipButton, goalTrackingType === type ? styles.chipButtonActive : undefined]}
                onPress={() => setGoalTrackingType(type)}
              >
                <Text style={[styles.chipText, goalTrackingType === type ? styles.chipTextActive : undefined]}>{type}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.primaryButton} onPress={() => void handleAddGoal()}>
            <Text style={styles.primaryButtonText}>Add goal</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Goal categories</Text>

          <View style={styles.chipRow}>
            {(['all', 'academic', 'skill', 'project', 'career'] as Array<'all' | GoalCategory>).map((category) => (
              <Pressable
                key={category}
                style={[styles.chipButton, goalFilter === category ? styles.chipButtonActive : undefined]}
                onPress={() => setGoalFilter(category)}
              >
                <Text style={[styles.chipText, goalFilter === category ? styles.chipTextActive : undefined]}>{category}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>Goals</Text>
            <Text style={styles.cardCount}>{filteredGoals.length}</Text>
          </View>

          {filteredGoals.length === 0 ? (
            <Text style={styles.mutedText}>No goals yet. Create your first goal above.</Text>
          ) : (
            filteredGoals.map((goal) => {
              const increment = getGoalIncrement(goal);
              return (
                <View key={goal.id} style={styles.itemCard}>
                  <View style={styles.itemMain}>
                    <Text style={styles.itemTitle}>{goal.title}</Text>
                    <Text style={styles.itemMeta}>{goal.category} | {goal.status}</Text>
                    <Text style={styles.itemMeta}>{getGoalTrackingSummary(goal)}</Text>

                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, goal.progress))}%` }]} />
                    </View>
                    <Text style={styles.progressMeta}>{goal.progress}%</Text>
                  </View>

                  <View style={styles.itemButtonsRow}>
                    <Pressable style={styles.smallButton} onPress={() => void adjustGoal(goal.id, increment)}>
                      <Text style={styles.smallButtonText}>+{increment}</Text>
                    </Pressable>
                    <Pressable style={styles.smallButton} onPress={() => void toggleGoalStatus(goal.id)}>
                      <Text style={styles.smallButtonText}>{goal.status === 'completed' ? 'Activate' : 'Complete'}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    );
  }

  function renderRevisionsTab() {
    const today = todayYmd();
    const dueNowCount = revisionsList.filter((item) => item.dueYmd && item.dueYmd <= today).length;

    return (
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>Items to Review</Text>
            <Text style={styles.cardCount}>{revisionsList.length}</Text>
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total</Text>
              <Text style={styles.summaryValue}>{revisionsList.length}</Text>
              <Text style={styles.summaryMeta}>Review items</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Due now</Text>
              <Text style={styles.summaryValue}>{dueNowCount}</Text>
              <Text style={styles.summaryMeta}>Due today or overdue</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          {revisionsList.length === 0 ? (
            <Text style={styles.mutedText}>No items due for review!</Text>
          ) : (
            revisionsList.map((item) => (
              <View key={item.id} style={styles.reviewRow}>
                <View style={styles.reviewBody}>
                  <Text style={styles.compactTitle}>{item.title}</Text>
                  <Text style={styles.compactMeta}>
                    {item.dueYmd ? formatDueLabel(item.dueYmd, today) : 'No due date'}
                    {item.source ? ` | ${item.source}` : ''}
                  </Text>
                </View>

                <Pressable style={styles.smallButton} onPress={() => setActiveTab('focus')}>
                  <Text style={styles.smallButtonText}>Focus</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    );
  }

  function renderChallengesTab() {
    return (
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Challenge stats</Text>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Active</Text>
              <Text style={styles.summaryValue}>{snapshot.challenges.filter((c) => c.status === 'active').length}</Text>
              <Text style={styles.summaryMeta}>In progress</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Completed</Text>
              <Text style={styles.summaryValue}>{completedChallenges}</Text>
              <Text style={styles.summaryMeta}>Done</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Best streak</Text>
              <Text style={styles.summaryValue}>{bestChallengeStreak}</Text>
              <Text style={styles.summaryMeta}>Longest run</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create challenge</Text>

          <TextInput
            value={challengeTitle}
            onChangeText={setChallengeTitle}
            placeholder="Challenge title"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
          />

          <TextInput
            value={challengeTarget}
            onChangeText={setChallengeTarget}
            placeholder="Target count"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
            style={styles.input}
          />

          <View style={styles.chipRow}>
            {(['daily', 'weekly', 'custom'] as ChallengeType[]).map((type) => (
              <Pressable
                key={type}
                style={[styles.chipButton, challengeType === type ? styles.chipButtonActive : undefined]}
                onPress={() => setChallengeType(type)}
              >
                <Text style={[styles.chipText, challengeType === type ? styles.chipTextActive : undefined]}>{type}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.chipRow}>
            {(['tasks', 'focus_sessions', 'focus_time', 'reviews'] as const).map((metric) => (
              <Pressable
                key={metric}
                style={[styles.chipButton, challengeMetric === metric ? styles.chipButtonActive : undefined]}
                onPress={() => setChallengeMetric(metric)}
              >
                <Text style={[styles.chipText, challengeMetric === metric ? styles.chipTextActive : undefined]}>{metric}</Text>
              </Pressable>
            ))}
          </View>

          {challengeMetric === 'focus_sessions' ? (
            <TextInput
              value={challengeMinMinutes}
              onChangeText={setChallengeMinMinutes}
              placeholder="Minimum minutes per session"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
              style={styles.input}
            />
          ) : null}

          <Pressable style={styles.primaryButton} onPress={() => void handleAddChallenge()}>
            <Text style={styles.primaryButtonText}>Add challenge</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Filters</Text>

          <View style={styles.chipRow}>
            {(['all', 'active', 'completed', 'daily', 'weekly'] as const).map((filter) => (
              <Pressable
                key={filter}
                style={[styles.chipButton, challengeFilter === filter ? styles.chipButtonActive : undefined]}
                onPress={() => setChallengeFilter(filter)}
              >
                <Text style={[styles.chipText, challengeFilter === filter ? styles.chipTextActive : undefined]}>{filter}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>Challenges</Text>
            <Text style={styles.cardCount}>{filteredChallenges.length}</Text>
          </View>

          {filteredChallenges.length === 0 ? (
            <Text style={styles.mutedText}>No challenges for this filter.</Text>
          ) : (
            filteredChallenges.map((challenge) => {
              const percent = Math.min(100, Math.round((challenge.currentProgress / challenge.targetProgress) * 100));
              return (
                <View key={challenge.id} style={styles.itemCard}>
                  <View style={styles.itemMain}>
                    <Text style={styles.itemTitle}>{challenge.title}</Text>
                    <Text style={styles.itemMeta}>{challenge.type} | {challenge.metric} | streak {challenge.currentStreak}</Text>

                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          challenge.status === 'completed' ? styles.progressFillDone : undefined,
                          { width: `${percent}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressMeta}>
                      {challenge.currentProgress}/{challenge.targetProgress} ({percent}%)
                    </Text>
                  </View>

                  <View style={styles.itemButtonsRow}>
                    <Pressable style={styles.smallButton} onPress={() => void incrementChallenge(challenge.id)}>
                      <Text style={styles.smallButtonText}>+1</Text>
                    </Pressable>
                    <Pressable style={styles.smallButton} onPress={() => void resetChallenge(challenge.id)}>
                      <Text style={styles.smallButtonText}>Reset</Text>
                    </Pressable>
                    <Pressable style={styles.smallDangerButton} onPress={() => void deleteChallenge(challenge.id)}>
                      <Text style={styles.smallDangerButtonText}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    );
  }

  function renderFocusTab() {
    const recentSessions = snapshot.focusSessions.slice(0, 6);

    return (
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, styles.focusCard]}>
          <Text style={styles.cardTitle}>Focus mode</Text>
          <Text style={styles.timerValue}>{formatTimer(focusRemainingSeconds)}</Text>
          <Text style={styles.itemMeta}>Target: {focusTargetMinutes} min</Text>

          <View style={styles.chipRow}>
            {[25, 50, 90, 0].map((minutes) => (
              <Pressable
                key={String(minutes)}
                style={[styles.chipButton, focusPresetMinutes === minutes ? styles.chipButtonActive : undefined]}
                onPress={() => {
                  setFocusPresetMinutes(minutes);
                  if (!focusRunning) {
                    const nextMinutes = minutes === 0 ? getSelectedFocusMinutes() : minutes;
                    setFocusTargetMinutes(nextMinutes);
                    setFocusRemainingSeconds(nextMinutes * 60);
                  }
                }}
              >
                <Text style={[styles.chipText, focusPresetMinutes === minutes ? styles.chipTextActive : undefined]}>
                  {minutes === 0 ? 'Custom' : `${minutes}m`}
                </Text>
              </Pressable>
            ))}
          </View>

          {focusPresetMinutes === 0 ? (
            <TextInput
              value={focusCustomMinutes}
              onChangeText={setFocusCustomMinutes}
              keyboardType="numeric"
              placeholder="Custom minutes"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />
          ) : null}

          <Text style={styles.sectionLabel}>Link to task (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalChips}>
            <Pressable
              style={[styles.chipButton, focusLinkedTaskId === '' ? styles.chipButtonActive : undefined]}
              onPress={() => setFocusLinkedTaskId('')}
            >
              <Text style={[styles.chipText, focusLinkedTaskId === '' ? styles.chipTextActive : undefined]}>No task</Text>
            </Pressable>

            {snapshot.tasks
              .filter((task) => task.status !== 'completed')
              .slice(0, 10)
              .map((task) => (
                <Pressable
                  key={task.id}
                  style={[styles.chipButton, focusLinkedTaskId === task.id ? styles.chipButtonActive : undefined]}
                  onPress={() => setFocusLinkedTaskId(task.id)}
                >
                  <Text style={[styles.chipText, focusLinkedTaskId === task.id ? styles.chipTextActive : undefined]}>
                    {task.title}
                  </Text>
                </Pressable>
              ))}
          </ScrollView>

          {!focusRunning ? (
            <Pressable style={styles.primaryButton} onPress={startFocusSession}>
              <Text style={styles.primaryButtonText}>Start session</Text>
            </Pressable>
          ) : (
            <View style={styles.inlineButtonsRow}>
              <Pressable style={styles.secondaryButtonInline} onPress={togglePauseFocus}>
                <Text style={styles.secondaryButtonText}>{focusPaused ? 'Resume' : 'Pause'}</Text>
              </Pressable>
              <Pressable style={styles.smallDangerButtonInline} onPress={() => void completeFocusSession('stopped')}>
                <Text style={styles.smallDangerButtonText}>Stop</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Today's focus</Text>
          <Text style={styles.summaryValue}>{formatMinutes(focusMinutesToday)}</Text>
          <Text style={styles.summaryMeta}>{normalizeDailyStats(snapshot.dailyStats[todayYmd()]).focusSessions} sessions completed</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardTitle}>Recent sessions</Text>
            <Text style={styles.cardCount}>{recentSessions.length}</Text>
          </View>

          {recentSessions.length === 0 ? (
            <Text style={styles.mutedText}>No sessions yet.</Text>
          ) : (
            recentSessions.map((session) => (
              <View key={session.id} style={styles.compactRow}>
                <Text style={styles.compactTitle}>{session.type}</Text>
                <Text style={styles.compactMeta}>
                  {formatMinutes(session.actualDurationMinutes)} | {session.date}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    );
  }

  function renderAnalyticsTab() {
    return (
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Weekly overview</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Focus</Text>
              <Text style={styles.summaryValue}>{formatMinutes(weeklyFocusMinutes)}</Text>
              <Text style={styles.summaryMeta}>Last 7 days</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Tasks done</Text>
              <Text style={styles.summaryValue}>{weeklyTasksDone}</Text>
              <Text style={styles.summaryMeta}>Last 7 days</Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Avg score</Text>
              <Text style={styles.summaryValue}>{averageWeeklyScore}</Text>
              <Text style={styles.summaryMeta}>Productivity</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Daily focus trend</Text>

          {weeklySeries.map((row) => {
            const width = Math.max(4, Math.round((row.focusMinutes / maxWeeklyFocus) * 100));
            return (
              <View key={row.date} style={styles.analyticsRow}>
                <Text style={styles.analyticsLabel}>{row.label}</Text>
                <View style={styles.analyticsTrack}>
                  <View style={[styles.analyticsFill, { width: `${width}%` }]} />
                </View>
                <Text style={styles.analyticsValue}>{row.focusMinutes}m</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Insights</Text>
          <Text style={styles.mutedText}>- Strong days are those with both focus time and completed tasks.</Text>
          <Text style={styles.mutedText}>- Current best challenge streak: {bestChallengeStreak}.</Text>
          <Text style={styles.mutedText}>- Keep daily targets aligned with your real schedule.</Text>
        </View>
      </ScrollView>
    );
  }

  function renderSyncTab() {
    return (
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cloud sync</Text>
          <Text style={styles.mutedText}>
            Use the same account on desktop and mobile. Pull before editing if desktop changed recently.
          </Text>

          <View style={styles.inlineButtonsRow}>
            <Pressable style={styles.primaryButtonInline} onPress={() => void pullFromCloud()} disabled={syncBusy}>
              <Text style={styles.primaryButtonText}>Pull from cloud</Text>
            </Pressable>

            <Pressable style={styles.secondaryButtonInline} onPress={() => void pushToCloud()} disabled={syncBusy}>
              <Text style={styles.secondaryButtonText}>Push to cloud</Text>
            </Pressable>
          </View>

          {syncBusy ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
          <Text style={styles.statusText}>{syncStatus || 'Idle'}</Text>
          <Text style={styles.mutedText}>Last sync: {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : 'never'}</Text>
        </View>
      </ScrollView>
    );
  }

  function renderNotificationsTab() {
    return (
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Daily reminder</Text>
          <Text style={styles.mutedText}>Set a local reminder to review tasks, goals, and challenges every day.</Text>

          <View style={styles.reminderPreviewBox}>
            <Text style={styles.summaryLabel}>Preview</Text>
            <Text style={styles.reminderPreviewTitle}>{todayDigest.title}</Text>
            <Text style={styles.reminderPreviewText}>{todayDigest.body}</Text>
          </View>

          <View style={styles.reminderCategoryCard}>
            <View style={styles.cardHeadingRow}>
              <View style={styles.reminderCategoryTextWrap}>
                <Text style={styles.compactTitle}>Focus Do Not Disturb</Text>
                <Text style={styles.summaryMeta}>Silence app notifications and touch vibration while a focus session is running.</Text>
              </View>

              <Pressable
                style={[
                  styles.reminderToggleButton,
                  focusDndEnabled ? styles.reminderToggleButtonOn : styles.reminderToggleButtonOff,
                ]}
                onPress={() => void updateFocusDndSetting(!focusDndEnabled)}
              >
                <Text style={styles.reminderToggleButtonText}>{focusDndEnabled ? 'On' : 'Off'}</Text>
              </Pressable>
            </View>

            <Text style={styles.summaryMeta}>
              {focusDndEnabled
                ? (focusRunning ? 'Focus DND is active now.' : 'Focus DND will activate when you start a focus session.')
                : 'Focus DND is currently disabled.'}
            </Text>
            <Text style={styles.warningText}>
              OS limitation: this app cannot force-silence phone calls. This mode only silences app notifications and vibration while focusing.
            </Text>
          </View>

          {isExpoGoAndroid ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                Expo Go on Android does not fully support notifications. Use the development build for this feature.
              </Text>
              <Text style={styles.warningText}>1. Build once: npm run android:dev</Text>
              <Text style={styles.warningText}>2. Start dev server: npm run start:dev</Text>
              <Text style={styles.warningText}>3. Open the installed Productivity Hub Mobile app (not Expo Go)</Text>
              <Text style={styles.warningText}>4. Return here and tap Schedule reminder</Text>
            </View>
          ) : null}

          <View style={styles.timeRow}>
            <TextInput
              value={reminderHour}
              onChangeText={setReminderHour}
              keyboardType="numeric"
              maxLength={2}
              style={[styles.input, styles.timeInput]}
              placeholder="HH"
              placeholderTextColor={COLORS.textMuted}
            />
            <Text style={styles.timeSeparator}>:</Text>
            <TextInput
              value={reminderMinute}
              onChangeText={setReminderMinute}
              keyboardType="numeric"
              maxLength={2}
              style={[styles.input, styles.timeInput]}
              placeholder="MM"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          <Pressable
            style={[styles.primaryButton, isExpoGoAndroid ? styles.buttonDisabled : undefined]}
            disabled={isExpoGoAndroid}
            onPress={() => void scheduleDailyReminder()}
          >
            <Text style={styles.primaryButtonText}>Schedule reminder</Text>
          </Pressable>

          <Pressable
            style={[styles.secondaryButton, isExpoGoAndroid ? styles.buttonDisabled : undefined]}
            disabled={isExpoGoAndroid}
            onPress={() => void cancelDailyReminder()}
          >
            <Text style={styles.secondaryButtonText}>Cancel reminder</Text>
          </Pressable>

          <Pressable
            style={[styles.secondaryButton, isExpoGoAndroid ? styles.buttonDisabled : undefined]}
            disabled={isExpoGoAndroid}
            onPress={() => void sendTodaySummaryNotification()}
          >
            <Text style={styles.secondaryButtonText}>Send today's summary now</Text>
          </Pressable>

          <Pressable
            style={[styles.secondaryButton, isExpoGoAndroid ? styles.buttonDisabled : undefined]}
            disabled={isExpoGoAndroid}
            onPress={() => void sendInteractionNotification('Interaction test', 'Notification sound and interaction feedback are active.')}
          >
            <Text style={styles.secondaryButtonText}>Send test notification</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Custom reminders by type</Text>
          <Text style={styles.mutedText}>
            Choose which categories should notify you and how long before each item starts or is due.
          </Text>

          {smartReminderCategories.map((category) => {
            const config = smartReminderSettings[category.key];

            return (
              <View key={category.key} style={styles.reminderCategoryCard}>
                <View style={styles.cardHeadingRow}>
                  <View style={styles.reminderCategoryTextWrap}>
                    <Text style={styles.compactTitle}>{category.label}</Text>
                    <Text style={styles.summaryMeta}>{category.description}</Text>
                  </View>

                  <Pressable
                    style={[
                      styles.reminderToggleButton,
                      config.enabled ? styles.reminderToggleButtonOn : styles.reminderToggleButtonOff,
                    ]}
                    onPress={() => {
                      setSmartReminderSettings((prev) => ({
                        ...prev,
                        [category.key]: {
                          ...prev[category.key],
                          enabled: !prev[category.key].enabled,
                        },
                      }));
                    }}
                  >
                    <Text style={styles.reminderToggleButtonText}>{config.enabled ? 'On' : 'Off'}</Text>
                  </Pressable>
                </View>

                <Text style={styles.summaryMeta}>Lead time: {formatLeadMinutes(config.leadMinutes)}</Text>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalChips}>
                  <View style={styles.chipRow}>
                    {REMINDER_LEAD_MINUTES_OPTIONS.map((minutes) => {
                      const selected = config.leadMinutes === minutes;
                      return (
                        <Pressable
                          key={`${category.key}_${minutes}`}
                          style={[styles.chipButton, selected ? styles.chipButtonActive : undefined]}
                          onPress={() => {
                            setSmartReminderSettings((prev) => ({
                              ...prev,
                              [category.key]: {
                                ...prev[category.key],
                                leadMinutes: minutes,
                              },
                            }));
                          }}
                        >
                          <Text style={[styles.chipText, selected ? styles.chipTextActive : undefined]}>
                            {formatLeadMinutes(minutes)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            );
          })}

          <View style={styles.inlineButtonsRow}>
            <Pressable
              style={[styles.primaryButtonInline, isExpoGoAndroid ? styles.buttonDisabled : undefined]}
              onPress={() => void applySmartReminders()}
              disabled={isExpoGoAndroid}
            >
              <Text style={styles.primaryButtonText}>Apply custom reminders</Text>
            </Pressable>

            <Pressable
              style={[styles.secondaryButtonInline, isExpoGoAndroid ? styles.buttonDisabled : undefined]}
              onPress={() => void clearSmartReminders()}
              disabled={isExpoGoAndroid}
            >
              <Text style={styles.secondaryButtonText}>Clear</Text>
            </Pressable>
          </View>

          <Text style={styles.statusText}>{smartReminderStatus}</Text>
        </View>
      </ScrollView>
    );
  }

  function renderActiveTab() {
    if (activeTab === 'dashboard') return renderDashboardTab();
    if (activeTab === 'today') return renderTodayTab();
    if (activeTab === 'schedule') return renderScheduleTab();
    if (activeTab === 'tasks') return renderTasksTab();
    if (activeTab === 'goals') return renderGoalsTab();
    if (activeTab === 'revisions') return renderRevisionsTab();
    if (activeTab === 'challenges') return renderChallengesTab();
    if (activeTab === 'focus') return renderFocusTab();
    if (activeTab === 'analytics') return renderAnalyticsTab();
    if (activeTab === 'sync') return renderSyncTab();
    return renderNotificationsTab();
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />

        <KeyboardAvoidingView style={styles.mainArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.headerCard}>
            <View>
              <Text style={styles.headerTitle}>Productivity Hub</Text>
              <Text style={styles.headerSubtitle}>{currentUser.email || 'Signed in user'}</Text>
            </View>

            <Pressable style={styles.signOutButton} onPress={() => void handleSignOut()}>
              <Text style={styles.signOutButtonText}>Sign Out</Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            style={styles.tabsScroll}
            contentContainerStyle={styles.tabsContent}
            showsHorizontalScrollIndicator={false}
          >
            {tabs.map((tab) => (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabPill, activeTab === tab.key ? styles.tabPillActive : undefined]}
              >
                <Text style={[styles.tabPillText, activeTab === tab.key ? styles.tabPillTextActive : undefined]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.contentArea}>{renderActiveTab()}</View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  centeredBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  mainArea: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  authWrapper: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  authScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  authCard: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
  authTitle: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '800',
  },
  authSubtitle: {
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  headerCard: {
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    elevation: 3,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  signOutButton: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  signOutButtonText: {
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  tabsScroll: {
    marginBottom: 8,
    maxHeight: 48,
  },
  tabsContent: {
    gap: 8,
    paddingVertical: 2,
    paddingRight: 20,
  },
  tabPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabPillActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
    borderColor: COLORS.primary,
  },
  tabPillText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  tabPillTextActive: {
    color: '#c7d2fe',
    fontWeight: '700',
  },
  contentArea: {
    flex: 1,
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    paddingBottom: 28,
    gap: 10,
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    // depth
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  heroCard: {
    backgroundColor: '#20204a',
  },
  heroTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  dashboardHeaderPanel: {
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
    elevation: 3,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  dashboardGreeting: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  dashboardDate: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  dashboardQuickAddRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dashboardQuickAddInput: {
    flex: 1,
  },
  dashboardQuickAddButton: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardQuickAddButtonText: {
    color: '#dbe2ff',
    fontSize: 22,
    lineHeight: 22,
    fontWeight: '800',
  },
  bestRecordWrapper: {
    gap: 10,
  },
  bestRecordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bestRecordIcon: {
    fontSize: 22,
  },
  bestRecordHeadText: {
    flex: 1,
    gap: 2,
  },
  bestRecordStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bestRecordPrimaryStat: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
  },
  bestRecordProgressBlock: {
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.bgSecondary,
    padding: 10,
  },
  goalSummaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  goalSummaryPill: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalSummaryValue: {
    color: COLORS.textPrimary,
    fontWeight: '800',
    fontSize: 13,
  },
  goalBarRow: {
    gap: 6,
  },
  goalFill1: {
    backgroundColor: '#818cf8',
  },
  goalFill2: {
    backgroundColor: '#22d3ee',
  },
  goalFill3: {
    backgroundColor: '#34d399',
  },
  goalFill4: {
    backgroundColor: '#f59e0b',
  },
  reviewRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: COLORS.bgSecondary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  reviewBody: {
    flex: 1,
    gap: 2,
  },
  calendarNavRow: {
    flexDirection: 'row',
    gap: 6,
  },
  calendarWeekHeader: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.bgSecondary,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  calendarWeekLabel: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 6,
  },
  calendarDayCell: {
    width: '13.5%',
    minWidth: 38,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.bgSecondary,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 4,
  },
  calendarDayOutside: {
    opacity: 0.45,
  },
  calendarDayToday: {
    borderColor: COLORS.info,
  },
  calendarDaySelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.3)',
  },
  calendarDayNumber: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  calendarDayNumberOutside: {
    color: COLORS.textMuted,
  },
  calendarDayNumberSelected: {
    color: '#e2e7ff',
  },
  calendarEventBadge: {
    minWidth: 18,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarEventBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  calendarEventBadgeSpacer: {
    height: 13,
  },
  cardHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  cardCount: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryCard: {
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
    minWidth: '47%',
    flexGrow: 1,
    gap: 2,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
  },
  summaryLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  summaryValue: {
    color: COLORS.primary,
    fontSize: 24,
    fontWeight: '800',
  },
  summaryMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  compactRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: COLORS.bgSecondary,
    gap: 8,
  },
  compactTitle: {
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  compactMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  todayDigestSection: {
    gap: 6,
  },
  todayDigestRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: COLORS.bgSecondary,
    gap: 2,
  },
  compactActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tinyActionButton: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  tinyActionButtonText: {
    color: '#dbe2ff',
    fontSize: 11,
    fontWeight: '700',
  },
  tinyDangerActionButton: {
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  tinyDangerActionButtonText: {
    color: '#ffc9c9',
    fontSize: 11,
    fontWeight: '700',
  },
  scheduleRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: COLORS.bgSecondary,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  scheduleTime: {
    color: '#cdd4ff',
    fontSize: 12,
    fontWeight: '700',
    minWidth: 72,
    marginTop: 1,
  },
  scheduleBody: {
    flex: 1,
    gap: 2,
  },
  scheduleTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  scheduleSourceBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 1,
    marginBottom: 1,
    maxWidth: '100%',
  },
  scheduleSourceBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  scheduleMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  progressCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: COLORS.bgSecondary,
    gap: 8,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  linkButton: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.16)',
  },
  linkButtonText: {
    color: '#cdd4ff',
    fontWeight: '700',
  },
  input: {
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  compactInput: {
    flex: 1,
    minWidth: 80,
  },
  smallInputRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  horizontalChips: {
    maxHeight: 44,
  },
  chipButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: COLORS.bgSecondary,
  },
  chipButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.3)',
  },
  chipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#dbe2ff',
  },
  itemCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.bgSecondary,
    padding: 10,
    gap: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  itemMain: {
    gap: 3,
  },
  itemTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  itemTitleDone: {
    color: COLORS.textMuted,
    textDecorationLine: 'line-through',
  },
  itemMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  itemButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  progressTrack: {
    width: '100%',
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#2d2d57',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  progressFillDone: {
    backgroundColor: COLORS.success,
  },
  progressMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonInline: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonInline: {
    flex: 1,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingVertical: 11,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  inlineButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  smallButton: {
    backgroundColor: 'rgba(99, 102, 241, 0.24)',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  smallButtonText: {
    color: '#dbe2ff',
    fontSize: 12,
    fontWeight: '700',
  },
  smallDangerButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  smallDangerButtonInline: {
    flex: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  smallDangerButtonText: {
    color: '#ffc9c9',
    fontSize: 12,
    fontWeight: '700',
  },
  focusCard: {
    alignItems: 'center',
  },
  timerValue: {
    color: '#ffffff',
    fontSize: 52,
    fontWeight: '800',
    letterSpacing: 1,
  },
  sectionLabel: {
    color: COLORS.textMuted,
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  analyticsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  analyticsLabel: {
    width: 34,
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  analyticsTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#2d2d57',
    overflow: 'hidden',
  },
  analyticsFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: COLORS.info,
  },
  analyticsValue: {
    width: 46,
    textAlign: 'right',
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 12,
  },
  statusText: {
    color: '#d6dcff',
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
  },
  mutedText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  reminderPreviewBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.bgSecondary,
    padding: 10,
    gap: 4,
  },
  reminderPreviewTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  reminderPreviewText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  reminderCategoryCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.bgSecondary,
    padding: 10,
    gap: 8,
  },
  reminderCategoryTextWrap: {
    flex: 1,
    gap: 2,
  },
  reminderToggleButton: {
    minWidth: 58,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderToggleButtonOn: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: COLORS.success,
  },
  reminderToggleButtonOff: {
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    borderColor: COLORS.borderLight,
  },
  reminderToggleButtonText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  warningBox: {
    borderWidth: 1,
    borderColor: '#8a5b00',
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderRadius: 10,
    padding: 10,
  },
  warningText: {
    color: '#ffd680',
    fontSize: 13,
    lineHeight: 18,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeInput: {
    width: 88,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
  },
  timeSeparator: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
});
