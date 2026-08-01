// app/profile/activity.tsx
// ACTIVITY-HISTORY(P3)Stage 2:活動紀錄頁。
// 四型事件(made / added / checked / favorited)日分組時間軸;
// SORT dropdown = SHOW 型別過濾 + ORDER 排序;任一非預設時鈕變
// CANCEL(✗)一鍵還原(2026-08-01 拍板)。v1 過濾/排序純前端。
// Header 自繪(照 shelf 前例,迴避 iOS 26 header 鈕玻璃殼——
// SORT 方框鈕需在 band 內)。band 樣式鏡射 shelf backPill/sortBtn。

import { withAlpha } from '@/constants/cabinetTokens'
import OaklandDusk from '@/constants/OaklandDusk'
import { R } from '@/constants/radius'
import Type from '@/constants/typography'
import { useAuth } from '@/context/auth'
import { apiFetch } from '@/lib/api'
import FontAwesome from '@expo/vector-icons/FontAwesome'
import { router, useFocusEffect } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type EventType = 'made' | 'added' | 'checked' | 'favorited'

type ActivityEvent = {
  type: EventType
  key: string
  name: string
  amount_ml: number | null
  ts: string
  alcoholic?: boolean
}

type DisplayEvent = ActivityEvent & { count: number }

type DaySection = { label: string; dayKey: string; events: DisplayEvent[] }

type ShowFilter = 'all' | EventType
type OrderMode = 'newest' | 'oldest'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabelFor(d: Date, now: Date): string {
  const today = localDayKey(now)
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  const k = localDayKey(d)
  if (k === today) return 'TODAY'
  if (k === localDayKey(y)) return 'YESTERDAY'
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`
}

function timeLabelFor(d: Date): string {
  let h = d.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${mm} ${ampm}`
}

function articleFor(name: string): string {
  return /^[aeiou]/i.test(name.trim()) ? 'an' : 'a'
}

// 日分組 + 同日同杯 made 合併 ×n(拍板項 3)
function buildSections(events: ActivityEvent[], show: ShowFilter, order: OrderMode): DaySection[] {
  const filtered = show === 'all' ? events : events.filter((e) => e.type === show)
  const sorted = [...filtered].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))

  const sections: DaySection[] = []
  const madeByDayKey = new Map<string, DisplayEvent>()

  for (const e of sorted) {
    const d = new Date(e.ts)
    const dayKey = localDayKey(d)
    let section = sections[sections.length - 1]
    if (!section || section.dayKey !== dayKey) {
      section = { label: dayLabelFor(d, new Date()), dayKey, events: [] }
      sections.push(section)
    }
    if (e.type === 'made') {
      const mergeKey = `${dayKey}:${e.key}`
      const existing = madeByDayKey.get(mergeKey)
      if (existing) {
        existing.count += 1
        continue
      }
      const de: DisplayEvent = { ...e, count: 1 }
      madeByDayKey.set(mergeKey, de)
      section.events.push(de)
    } else {
      section.events.push({ ...e, count: 1 })
    }
  }

  if (order === 'oldest') {
    sections.reverse()
    for (const s of sections) s.events.reverse()
  }
  return sections
}

const ICON_META: Record<EventType, { icon: React.ComponentProps<typeof FontAwesome>['name']; color: string; bg: string }> = {
  made: { icon: 'glass', color: OaklandDusk.brand.gold, bg: withAlpha(OaklandDusk.brand.gold, 0.14) },
  added: { icon: 'plus', color: OaklandDusk.semantic.ready, bg: 'rgba(29,158,117,0.12)' },
  checked: { icon: 'shopping-bag', color: OaklandDusk.brand.sundown, bg: 'rgba(224,160,48,0.12)' },
  favorited: { icon: 'heart', color: 'rgb(214,110,124)', bg: 'rgba(192,72,88,0.12)' },
}

function FilterIcon({ color }: { color: string }) {
  return (
    <View style={{ alignItems: 'flex-end', gap: 3 }}>
      <View style={{ width: 16, height: 2.5, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 12, height: 2.5, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 8, height: 2.5, borderRadius: 1, backgroundColor: color }} />
    </View>
  )
}

function EventRow({ ev }: { ev: DisplayEvent }) {
  const meta = ICON_META[ev.type]
  const d = new Date(ev.ts)

  let bold = ''
  let gray = ''
  if (ev.type === 'made') {
    bold = `Made ${articleFor(ev.name)} ${ev.name}`
    gray = ev.count > 1 ? ` ×${ev.count}` : ''
  } else if (ev.type === 'added') {
    bold = ev.name
    gray = ev.amount_ml ? ` added · ${ev.amount_ml}ml` : ' added'
  } else if (ev.type === 'checked') {
    bold = ev.name
    gray = ev.alcoholic ? ' checked off → My Bar' : ' checked off'
  } else {
    bold = ev.name
    gray = ' favorited'
  }

  return (
    <View style={styles.eventCard}>
      <View style={[styles.eventIcon, { backgroundColor: meta.bg }]}>
        <FontAwesome name={meta.icon} size={14} color={meta.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.eventLine} numberOfLines={1}>
          {bold}
          <Text style={styles.eventLineGray}>{gray}</Text>
        </Text>
        <Text style={styles.eventTime}>{timeLabelFor(d)}</Text>
      </View>
    </View>
  )
}

const SHOW_OPTIONS: Array<{ value: ShowFilter; label: string }> = [
  { value: 'all', label: 'All activity' },
  { value: 'made', label: 'Made' },
  { value: 'added', label: 'Added to bar' },
  { value: 'checked', label: 'List check-offs' },
  { value: 'favorited', label: 'Favorites' },
]

const ORDER_OPTIONS: Array<{ value: OrderMode; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
]

export default function ActivityScreen() {
  const insets = useSafeAreaInsets()
  const { session } = useAuth()

  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [show, setShow] = useState<ShowFilter>('all')
  const [order, setOrder] = useState<OrderMode>('newest')
  const [ddOpen, setDdOpen] = useState(false)

  const isDefault = show === 'all' && order === 'newest'

  const fetchActivity = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/activity?limit=200', { session })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      setEvents(Array.isArray(data.events) ? data.events : [])
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load activity')
    } finally {
      setLoading(false)
    }
  }, [session])

  useFocusEffect(
    useCallback(() => {
      fetchActivity()
    }, [fetchActivity])
  )

  const sections = useMemo(() => buildSections(events, show, order), [events, show, order])

  const resetSort = () => {
    setShow('all')
    setOrder('newest')
    setDdOpen(false)
  }

  if (!session) {
    return <View style={styles.screen} />
  }

  return (
    <View style={styles.screen}>
      {/* 自繪 band(照 shelf 前例) */}
      <View style={[styles.band, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={6} accessibilityLabel="Back to Profile" style={styles.backPill}>
          <FontAwesome name="chevron-left" size={14} color={OaklandDusk.brand.gold} />
          <Text style={styles.backPillText}>Profile</Text>
        </Pressable>
        <Pressable
          onPress={() => (isDefault ? setDdOpen((v) => !v) : resetSort())}
          hitSlop={6}
          accessibilityLabel={isDefault ? 'Sort activity' : 'Cancel sort'}
          style={styles.sortBtn}
        >
          <View style={styles.sortFrame}>
            {isDefault ? (
              <FilterIcon color={OaklandDusk.brand.gold} />
            ) : (
              <FontAwesome name="times" size={14} color={OaklandDusk.brand.gold} />
            )}
          </View>
          <Text style={styles.sortLabel}>{isDefault ? 'SORT' : 'CANCEL'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody}>
        <Text style={[Type.display, styles.title]}>Activity</Text>

        {loading && events.length === 0 && (
          <ActivityIndicator color={OaklandDusk.brand.gold} style={{ marginTop: 32 }} />
        )}

        {!loading && error && <Text style={[Type.caption, styles.errorText]}>{error}</Text>}

        {!loading && !error && events.length === 0 && (
          <View style={styles.emptyWrap}>
            <FontAwesome name="glass" size={40} color={OaklandDusk.text.tertiary} />
            <Text style={[Type.body, { color: OaklandDusk.text.secondary }]}>No activity yet.</Text>
            <Text style={[Type.caption, styles.emptyHint]}>
              Make a cocktail or add a bottle — it shows up here.
            </Text>
          </View>
        )}

        {!error && events.length > 0 && sections.length === 0 && (
          <Text style={[Type.caption, styles.emptyHint, { marginTop: 24, textAlign: 'center' }]}>
            Nothing matches this filter.
          </Text>
        )}

        {sections.map((s) => (
          <View key={s.dayKey}>
            <Text style={styles.dayHeader}>{s.label}</Text>
            {s.events.map((ev, i) => (
              <EventRow key={`${s.dayKey}-${ev.type}-${ev.key}-${i}`} ev={ev} />
            ))}
          </View>
        ))}
      </ScrollView>

      {/* SORT dropdown(SHOW 過濾 + ORDER 排序) */}
      {ddOpen && (
        <>
          <Pressable style={styles.ddBackdrop} onPress={() => setDdOpen(false)} accessibilityLabel="Close sort menu" />
          <View style={[styles.dd, { top: insets.top + 58 }]}>
            <Text style={styles.ddSection}>SHOW</Text>
            {SHOW_OPTIONS.map((o) => (
              <Pressable
                key={o.value}
                onPress={() => setShow(o.value)}
                style={[styles.ddOpt, show === o.value && styles.ddOptOn]}
              >
                <Text style={[styles.ddOptText, show === o.value && styles.ddOptTextOn]}>{o.label}</Text>
                {show === o.value && <FontAwesome name="check" size={11} color={OaklandDusk.brand.gold} />}
              </Pressable>
            ))}
            <View style={styles.ddDivider} />
            <Text style={styles.ddSection}>ORDER</Text>
            {ORDER_OPTIONS.map((o) => (
              <Pressable
                key={o.value}
                onPress={() => setOrder(o.value)}
                style={[styles.ddOpt, order === o.value && styles.ddOptOn]}
              >
                <Text style={[styles.ddOptText, order === o.value && styles.ddOptTextOn]}>{o.label}</Text>
                {order === o.value && <FontAwesome name="check" size={11} color={OaklandDusk.brand.gold} />}
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: OaklandDusk.bg.void },
  band: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  backPill: {
    height: 40,
    borderRadius: R.pill,
    paddingHorizontal: 16,
    backgroundColor: withAlpha(OaklandDusk.text.primary, 0.05),
    borderWidth: 1,
    borderColor: withAlpha(OaklandDusk.text.primary, 0.14),
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backPillText: {
    fontSize: 16,
    color: OaklandDusk.brand.gold,
  },
  sortBtn: {
    alignItems: 'center',
    gap: 4,
  },
  sortFrame: {
    width: 32,
    height: 32,
    borderRadius: R.control,
    borderWidth: 1,
    borderColor: withAlpha(OaklandDusk.brand.gold, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortLabel: {
    fontFamily: 'DMMono',
    fontSize: 8,
    letterSpacing: 2,
    color: OaklandDusk.brand.gold,
  },
  scrollBody: { paddingHorizontal: 16, paddingBottom: 40 },
  title: { color: OaklandDusk.text.primary, marginBottom: 4 },
  errorText: { color: OaklandDusk.brand.sundown, textAlign: 'center', marginTop: 24 },
  emptyWrap: { alignItems: 'center', gap: 10, marginTop: 56, paddingHorizontal: 24 },
  emptyHint: { color: OaklandDusk.text.tertiary, textAlign: 'center' },
  dayHeader: {
    fontFamily: 'DMMono',
    fontSize: 10,
    letterSpacing: 2.5,
    color: OaklandDusk.text.tertiary,
    marginTop: 16,
    marginBottom: 8,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: OaklandDusk.bg.card,
    borderWidth: 1,
    borderColor: OaklandDusk.bg.border,
    borderRadius: R.panel,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  eventIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventLine: {
    fontSize: 14,
    fontWeight: '600',
    color: OaklandDusk.text.primary,
  },
  eventLineGray: {
    fontWeight: '400',
    color: OaklandDusk.text.secondary,
  },
  eventTime: {
    fontFamily: 'DMMono',
    fontSize: 10,
    color: OaklandDusk.text.tertiary,
    marginTop: 2,
  },
  ddBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  dd: {
    position: 'absolute',
    right: 16,
    width: 200,
    backgroundColor: OaklandDusk.bg.surface,
    borderWidth: 1,
    borderColor: withAlpha(OaklandDusk.text.primary, 0.14),
    borderRadius: R.panel,
    padding: 12,
  },
  ddSection: {
    fontFamily: 'DMMono',
    fontSize: 9,
    letterSpacing: 2,
    color: OaklandDusk.text.tertiary,
    marginTop: 4,
    marginBottom: 6,
  },
  ddOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderRadius: R.control,
  },
  ddOptOn: {
    backgroundColor: withAlpha(OaklandDusk.brand.gold, 0.12),
  },
  ddOptText: {
    fontSize: 13,
    color: OaklandDusk.text.secondary,
  },
  ddOptTextOn: {
    color: OaklandDusk.brand.gold,
    fontWeight: '600',
  },
  ddDivider: {
    height: 1,
    backgroundColor: withAlpha(OaklandDusk.text.primary, 0.08),
    marginVertical: 8,
  },
})
