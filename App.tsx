import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Dimensions,
  Modal, 
} from 'react-native';
import { PieChart } from 'react-native-chart-kit';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Task = {
  id: string;
  name: string;
  startedAt: number | null;
};

type TimeEntry = {
  id: string;
  taskId: string;
  taskName: string;
  startTime: number;
  endTime: number;
  duration: number;
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [showClearModal, setShowClearModal] = useState(false);
  const [draft, setDraft] = useState('');
  const [, setTick] = useState(0);
  const [currentTab, setCurrentTab] = useState<'timer' | 'log' | 'analytics'>('timer');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasRunning = tasks.some((t) => t.startedAt !== null);

  // Timer effect
  useEffect(() => {
    if (hasRunning && intervalRef.current === null) {
      intervalRef.current = setInterval(() => setTick((n) => n + 1), 1000);
    } else if (!hasRunning && intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasRunning]);

  // Persistence: load on mount
  useEffect(() => {
    (async () => {
      try {
        const [tasksRaw, entriesRaw] = await Promise.all([
          AsyncStorage.getItem('tasks'),
          AsyncStorage.getItem('timeEntries'),
        ]);
        if (tasksRaw) setTasks(JSON.parse(tasksRaw));
        if (entriesRaw) setTimeEntries(JSON.parse(entriesRaw));
      } catch (e) {
        console.warn('Failed to load data', e);
      }
    })();
  }, []);

  // Persistence: save on change
  useEffect(() => {
    AsyncStorage.setItem('tasks', JSON.stringify(tasks)).catch(() => {});
  }, [tasks]);
  useEffect(() => {
    AsyncStorage.setItem('timeEntries', JSON.stringify(timeEntries)).catch(() => {});
  }, [timeEntries]);

  const addTask = () => {
    const name = draft.trim();
    if (!name) return;
    setTasks((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, name, startedAt: null },
    ]);
    setDraft('');
  };

  const SUGGESTED_TASKS = [
    'JIRA',
    'R&D',
    'eMail',
    'Meeting',
    'Support',
    'On the phone',
    'Thinking',
    'Resting',
    'In pain and agony',
  ];

  const addSuggestedTask = (name: string) => {
    if (tasks.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
    setTasks((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, name, startedAt: null },
    ]);
  };

  const toggleTask = (id: string) => {
    const now = Date.now();
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          if (t.startedAt === null) {
            return { ...t, startedAt: now };
          }
          const duration = now - t.startedAt;
          setTimeEntries((prevEntries) => [
            ...prevEntries,
            {
              id: `${Date.now()}-${Math.random()}`,
              taskId: id,
              taskName: t.name,
              startTime: t.startedAt ?? now, // fallback to now if null (shouldn't happen)
              endTime: now,
              duration,
            },
          ]);
          return { ...t, startedAt: null };
        }
        if (t.startedAt !== null) {
          const duration = now - t.startedAt;
          setTimeEntries((prevEntries) => [
            ...prevEntries,
            {
              id: `${Date.now()}-${Math.random()}`,
              taskId: t.id,
              taskName: t.name,
              startTime: t.startedAt,
              endTime: now,
              duration,
            },
          ]);
          return { ...t, startedAt: null };
        }
        return t;
      })
    );
  };

  const deleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setTimeEntries((prev) => prev.filter((e) => e.taskId !== id));
  };

  const deleteTimeEntry = (entryId: string) => {
    setTimeEntries((prev) => prev.filter((e) => e.id !== entryId));
  };

  const getTodayTime = (taskId?: string): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return timeEntries
      .filter((e) => {
        if (taskId && e.taskId !== taskId) return false;
        return new Date(e.startTime) >= today;
      })
      .reduce((sum, e) => sum + e.duration, 0);
  };

  const getTotalTimeForTask = (taskId: string): number => {
    return timeEntries
      .filter((e) => e.taskId === taskId)
      .reduce((sum, e) => sum + e.duration, 0);
  };

  const getEntriesByDate = (): Map<string, TimeEntry[]> => {
    const groups = new Map<string, TimeEntry[]>();
    const sorted = [...timeEntries].sort((a, b) => b.startTime - a.startTime);
    sorted.forEach((entry) => {
      const dateKey = formatDate(entry.startTime);
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey)!.push(entry);
    });
    return groups;
  };

  const getTaskStats = (taskId: string) => {
    const entries = timeEntries.filter((e) => e.taskId === taskId);
    if (entries.length === 0) return { count: 0, avgDuration: 0, totalDuration: 0 };
    const totalDuration = entries.reduce((sum, e) => sum + e.duration, 0);
    return {
      count: entries.length,
      avgDuration: totalDuration / entries.length,
      totalDuration,
    };
  };

  const liveMs = (t: Task) => (t.startedAt !== null ? Date.now() - t.startedAt : 0);

  const totalMs = useMemo(
    () => getTodayTime() + tasks.filter((t) => t.startedAt !== null).reduce((sum, t) => sum + liveMs(t), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeEntries, tasks, hasRunning]
  );

  const TabButton = ({ tab, label }: { tab: typeof currentTab; label: string }) => (
    <Pressable
      style={[styles.tabButton, currentTab === tab && styles.tabButtonActive]}
      onPress={() => setCurrentTab(tab)}
    >
      <Text style={[styles.tabButtonText, currentTab === tab && styles.tabButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );

  const renderTimerTab = () => (
    <>
      <View style={styles.header}>
        <Text style={styles.title}>Work Timer</Text>
        <Text style={styles.totalLabel}>Total today</Text>
        <Text style={styles.totalValue}>{formatDuration(totalMs)}</Text>
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="New task name"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={addTask}
          returnKeyType="done"
        />
        <Pressable style={styles.addButton} onPress={addTask}>
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>

      <View style={styles.suggestionsRow}>
        {SUGGESTED_TASKS.map((name) => {
          const exists = tasks.some((t) => t.name.toLowerCase() === name.toLowerCase());
          return (
            <Pressable
              key={name}
              style={[styles.suggestionChip, exists && styles.suggestionChipDisabled]}
              onPress={() => addSuggestedTask(name)}
              disabled={exists}
            >
              <Text style={[styles.suggestionChipText, exists && styles.suggestionChipTextDisabled]}>
                {exists ? name : `+ ${name}`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        ListEmptyComponent={
          <Text style={styles.empty}>No tasks yet. Add one above to start tracking.</Text>
        }
        renderItem={({ item }) => {
          const running = item.startedAt !== null;
          // Fix: startedAt can be null, so check before using
          const currentSessionMs = running && item.startedAt !== null ? Date.now() - item.startedAt : 0;
          const totalMs = getTotalTimeForTask(item.id) + currentSessionMs;
          return (
            <View style={[styles.task, running && styles.taskRunning]}>
              <View style={styles.taskTop}>
                <Text style={styles.taskName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.taskTime}>{formatDuration(totalMs)}</Text>
              </View>
              <View style={styles.taskActions}>
                <Pressable
                  style={[styles.actionBtn, running ? styles.stopBtn : styles.startBtn]}
                  onPress={() => toggleTask(item.id)}
                >
                  <Text style={styles.actionText}>{running ? 'Stop' : 'Start'}</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, styles.deleteBtn]} onPress={() => deleteTask(item.id)}>
                  <Text style={styles.actionText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
        contentContainerStyle={tasks.length === 0 ? styles.listEmpty : styles.list}
        scrollEnabled={false}
      />
    </>
  );

  const renderLogTab = () => {
    const groupedEntries = getEntriesByDate();
    const dates = Array.from(groupedEntries.keys());
    return (
      <FlatList
        data={dates}
        keyExtractor={(date) => date}
        ListEmptyComponent={<Text style={styles.empty}>No time entries yet.</Text>}
        renderItem={({ item: dateKey }) => {
          const entries = groupedEntries.get(dateKey) || [];
          return (
            <View key={dateKey} style={styles.dateGroup}>
              <Text style={styles.dateGroupTitle}>{dateKey}</Text>
              {entries.map((entry) => (
                <View key={entry.id} style={styles.logEntry}>
                  <View style={styles.logEntryTop}>
                    <Text style={styles.logEntryTask}>{entry.taskName}</Text>
                    <Text style={styles.logEntryDuration}>{formatDuration(entry.duration)}</Text>
                  </View>
                  <View style={styles.logEntryTimes}>
                    <Text style={styles.logEntryTime}>
                      {formatTime(entry.startTime)} - {formatTime(entry.endTime)}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.actionBtn, styles.deleteBtn]}
                    onPress={() => deleteTimeEntry(entry.id)}
                  >
                    <Text style={styles.actionText}>Delete</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          );
        }}
        contentContainerStyle={dates.length === 0 ? styles.listEmpty : styles.list}
      />
    );
  };

  const buildReportHtml = (): string => {
    const palette = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899'];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEntries = timeEntries.filter((e) => new Date(e.startTime) >= todayStart);

    const todayBreakdown = tasks
      .map((task, idx) => {
        const duration = todayEntries
          .filter((e) => e.taskId === task.id)
          .reduce((sum, e) => sum + e.duration, 0);
        return { name: task.name, duration, color: palette[idx % palette.length] };
      })
      .filter((d) => d.duration > 0)
      .sort((a, b) => b.duration - a.duration);

    const totalToday = todayBreakdown.reduce((s, d) => s + d.duration, 0);
    const maxToday = todayBreakdown[0]?.duration ?? 0;

    const taskRows = tasks
      .map((task) => {
        const stats = getTaskStats(task.id);
        const todayTime = todayEntries
          .filter((e) => e.taskId === task.id)
          .reduce((sum, e) => sum + e.duration, 0);
        return { task, stats, todayTime };
      })
      .sort((a, b) => b.stats.totalDuration - a.stats.totalDuration);

    const escapeHtml = (s: string) =>
      s.replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
      );

    const barRows = todayBreakdown
      .map((d) => {
        const pct = maxToday > 0 ? (d.duration / maxToday) * 100 : 0;
        const share = totalToday > 0 ? ((d.duration / totalToday) * 100).toFixed(1) : '0.0';
        return `
          <div class="bar-row">
            <div class="bar-label">${escapeHtml(d.name)}</div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${pct.toFixed(2)}%; background:${d.color};"></div>
            </div>
            <div class="bar-value">${formatDuration(d.duration)} <span class="muted">(${share}%)</span></div>
          </div>`;
      })
      .join('');

    const taskCards = taskRows
      .map(({ task, stats, todayTime }) => `
        <div class="card">
          <div class="card-title">${escapeHtml(task.name)}</div>
          <div class="card-grid">
            <div><span class="muted">Today</span><br><b>${formatDuration(todayTime)}</b></div>
            <div><span class="muted">Total</span><br><b>${formatDuration(stats.totalDuration)}</b></div>
            <div><span class="muted">Sessions</span><br><b>${stats.count}</b></div>
            <div><span class="muted">Avg</span><br><b>${stats.count > 0 ? formatDuration(stats.avgDuration) : '—'}</b></div>
          </div>
        </div>`)
      .join('');

    const generatedAt = new Date().toLocaleString();

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>Work Log Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; margin: 0; padding: 32px; background: #f5f6f8; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 28px 0 12px; border-bottom: 2px solid #e6e6e6; padding-bottom: 6px; }
  .muted { color: #666; font-size: 12px; }
  .summary { background: #fff; border: 1px solid #e6e6e6; border-radius: 12px; padding: 16px 20px; margin-top: 12px; }
  .summary .big { font-size: 32px; font-weight: 700; color: #2563eb; }
  .bar-row { display: grid; grid-template-columns: 160px 1fr 160px; align-items: center; gap: 12px; margin-bottom: 10px; }
  .bar-label { font-size: 13px; font-weight: 600; }
  .bar-track { background: #e6e6e6; border-radius: 6px; height: 18px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 6px; }
  .bar-value { font-size: 13px; text-align: right; font-variant-numeric: tabular-nums; }
  .cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .card { background: #fff; border: 1px solid #e6e6e6; border-radius: 10px; padding: 14px 16px; }
  .card-title { font-size: 15px; font-weight: 700; margin-bottom: 10px; }
  .card-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-size: 13px; }
  .empty { color: #888; font-style: italic; }
  @media print { body { background: #fff; padding: 16px; } }
</style></head>
<body>
  <h1>Work Log Report</h1>
  <div class="muted">Generated ${escapeHtml(generatedAt)}</div>

  <div class="summary">
    <div class="muted">Total time logged today</div>
    <div class="big">${formatDuration(totalToday)}</div>
    <div class="muted">${todayEntries.length} session${todayEntries.length === 1 ? '' : 's'} across ${todayBreakdown.length} task${todayBreakdown.length === 1 ? '' : 's'}</div>
  </div>

  <h2>Time Distribution — Today</h2>
  ${barRows || '<div class="empty">No time logged today.</div>'}

  <h2>Task Breakdown — All Time</h2>
  ${taskCards ? `<div class="cards">${taskCards}</div>` : '<div class="empty">No tasks yet.</div>'}
</body></html>`;
  };

  const exportReport = async () => {
    const html = buildReportHtml();
    try {
      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
          setTimeout(() => win.print(), 300);
        }
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Work Log Report' });
      }
    } catch (err) {
      console.warn('Export failed', err);
    }
  };

  const csvEscape = (val: string | number): string => {
    const s = String(val);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const toIsoLocal = (ts: number): string => new Date(ts).toISOString();

  const jiraTimeSpent = (ms: number): string => {
    const totalMinutes = Math.max(1, Math.round(ms / 60000));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  };

  const jiraIssueKey = (taskName: string): string => {
    const match = taskName.match(/^[A-Z][A-Z0-9]+-\d+/);
    return match ? match[0] : '';
  };

  const sortedEntriesAsc = () =>
    [...timeEntries].sort((a, b) => a.startTime - b.startTime);

  const buildCsv = (): string => {
    const header = ['Date', 'Task', 'Start', 'End', 'Duration (HH:MM:SS)', 'Duration (seconds)'];
    const rows = sortedEntriesAsc().map((e) => [
      new Date(e.startTime).toISOString().slice(0, 10),
      e.taskName,
      toIsoLocal(e.startTime),
      toIsoLocal(e.endTime),
      formatDuration(e.duration),
      Math.round(e.duration / 1000),
    ]);
    return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
  };

  const buildJiraCsv = (): string => {
    // Jira-friendly worklog CSV: one row per entry.
    // "Issue Key" auto-extracted if task name starts with e.g. ABC-123, else blank.
    const header = ['Issue Key', 'Date Started', 'Time Spent', 'Time Spent (seconds)', 'Comment'];
    const rows = sortedEntriesAsc().map((e) => [
      jiraIssueKey(e.taskName),
      toIsoLocal(e.startTime),
      jiraTimeSpent(e.duration),
      Math.max(60, Math.round(e.duration / 1000)),
      e.taskName,
    ]);
    return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
  };

  const buildJson = (): string => {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        tasks: tasks.map(({ id, name }) => ({ id, name })),
        entries: sortedEntriesAsc().map((e) => ({
          id: e.id,
          taskId: e.taskId,
          taskName: e.taskName,
          startTime: toIsoLocal(e.startTime),
          endTime: toIsoLocal(e.endTime),
          durationMs: e.duration,
          durationSeconds: Math.round(e.duration / 1000),
          durationFormatted: formatDuration(e.duration),
        })),
      },
      null,
      2
    );
  };

  const shareTextFile = async (
    fileName: string,
    content: string,
    mimeType: string,
    dialogTitle: string
  ) => {
    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
      const file = new File(Paths.cache, fileName);
      if (file.exists) file.delete();
      file.create();
      file.write(content);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType, dialogTitle, UTI: mimeType });
      }
    } catch (err) {
      console.warn('Export failed', err);
    }
  };

  const exportCsv = () => {
    if (timeEntries.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    shareTextFile(`worklog-${date}.csv`, buildCsv(), 'text/csv', 'Work Log CSV');
  };

  const exportJiraCsv = () => {
    if (timeEntries.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    shareTextFile(`worklog-jira-${date}.csv`, buildJiraCsv(), 'text/csv', 'Jira Worklog CSV');
  };

  const exportJson = () => {
    if (timeEntries.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    shareTextFile(`worklog-${date}.json`, buildJson(), 'application/json', 'Work Log JSON');
  };

  const clearAllData = async () => {
    setShowClearModal(false);
    setTasks([]);
    setTimeEntries([]);
    await AsyncStorage.multiRemove(['tasks', 'timeEntries']);
  };

  const renderAnalyticsTab = () => (
    <ScrollView style={styles.analyticsContainer} contentContainerStyle={styles.analyticsList}>
      <View style={styles.analyticsHeader}>
        <Text style={styles.analyticsTitle}>Today's Summary</Text>
        <Pressable style={styles.exportBtn} onPress={exportReport}>
          <Text style={styles.exportBtnText}>Export PDF</Text>
        </Pressable>
      </View>
      <View style={styles.exportRow}>
        <Pressable style={[styles.exportBtn, styles.exportBtnSecondary]} onPress={exportCsv}>
          <Text style={styles.exportBtnSecondaryText}>CSV</Text>
        </Pressable>
        <Pressable style={[styles.exportBtn, styles.exportBtnSecondary]} onPress={exportJiraCsv}>
          <Text style={styles.exportBtnSecondaryText}>Jira CSV</Text>
        </Pressable>
        <Pressable style={[styles.exportBtn, styles.exportBtnSecondary]} onPress={exportJson}>
          <Text style={styles.exportBtnSecondaryText}>JSON</Text>
        </Pressable>
        <Pressable style={[styles.exportBtn, styles.exportBtnDanger]} onPress={() => setShowClearModal(true)}>
          <Text style={styles.exportBtnDangerText}>Clear All Data</Text>
        </Pressable>
      </View>

      <Modal
        visible={showClearModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowClearModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Are you sure?</Text>
            <Text style={styles.modalText}>This will permanently delete all tasks and time entries. This action cannot be undone.</Text>
            <View style={styles.modalActions}>
              <Pressable style={[styles.exportBtn, styles.exportBtnDanger, {flex:1, marginRight:8}]} onPress={clearAllData}>
                <Text style={styles.exportBtnDangerText}>Yes, clear all</Text>
              </Pressable>
              <Pressable style={[styles.exportBtn, {flex:1, backgroundColor:'#eee', borderColor:'#eee'}]} onPress={() => setShowClearModal(false)}>
                <Text style={{color:'#333', fontWeight:'600', fontSize:13}}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Text style={styles.analyticsStat}>Total Time: {formatDuration(getTodayTime())}</Text>

      <Text style={styles.analyticsTitle}>Time Distribution</Text>
      {tasks.length > 0 && timeEntries.length > 0 ? (
        (() => {
          const todayEntries = timeEntries.filter((e) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return new Date(e.startTime) >= today;
          });

          if (todayEntries.length === 0) {
            return <Text style={styles.empty}>No time entries today yet.</Text>;
          }

          const chartData = tasks
            .map((task) => {
              const taskTime = todayEntries
                .filter((e) => e.taskId === task.id)
                .reduce((sum, e) => sum + e.duration, 0);
              return { name: task.name, duration: taskTime };
            })
            .filter((d) => d.duration > 0);

          if (chartData.length === 0) {
            return <Text style={styles.empty}>No time logged today.</Text>;
          }

          const data = chartData.map((item, idx) => ({
            name: `${item.name} (${formatDuration(item.duration)})`,
            duration: Math.round(item.duration / 1000),
            color: ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899'][idx % 6],
            legendFontColor: '#666',
            legendFontSize: 12,
          }));

          return (
            <View style={styles.chartContainer}>
              <PieChart
                data={data}
                width={Dimensions.get('window').width - 32}
                height={220}
                chartConfig={{
                  color: (opacity = 1) => `rgba(26, 26, 26, ${opacity})`,
                  // strokeColor removed: not a valid PieChart config property
                  backgroundColor: '#f5f6f8',
                }}
                accessor={'duration'}
                backgroundColor={'transparent'}
                paddingLeft={'15'}
              />
            </View>
          );
        })()
      ) : (
        <Text style={styles.empty}>Add tasks and log time to see distribution.</Text>
      )}

      <Text style={styles.analyticsTitle}>Task Breakdown</Text>
      {tasks.length === 0 ? (
        <Text style={styles.empty}>No tasks yet.</Text>
      ) : (
        tasks.map((task) => {
          const stats = getTaskStats(task.id);
          const todayTime = timeEntries
            .filter((e) => {
              if (e.taskId !== task.id) return false;
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              return new Date(e.startTime) >= today;
            })
            .reduce((sum, e) => sum + e.duration, 0);
          return (
            <View key={task.id} style={styles.statCard}>
              <Text style={styles.statCardTitle}>{task.name}</Text>
              <Text style={styles.statCardStat}>Today: {formatDuration(todayTime)}</Text>
              <Text style={styles.statCardStat}>Total: {formatDuration(stats.totalDuration)}</Text>
              <Text style={styles.statCardStat}>Sessions: {stats.count}</Text>
              {stats.count > 0 && (
                <Text style={styles.statCardStat}>Avg: {formatDuration(stats.avgDuration)}</Text>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.tabBar}>
        <TabButton tab="timer" label="Timer" />
        <TabButton tab="log" label="Log" />
        <TabButton tab="analytics" label="Analytics" />
      </View>

      {currentTab === 'timer' && renderTimerTab()}
      {currentTab === 'log' && renderLogTab()}
      {currentTab === 'analytics' && renderAnalyticsTab()}

      <StatusBar style="auto" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f6f8',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingHorizontal: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#2563eb',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
  },
  tabButtonTextActive: {
    color: '#2563eb',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  totalLabel: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  totalValue: {
    fontSize: 32,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: '#1a1a1a',
  },
  addRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  addButton: {
    marginLeft: 8,
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  suggestionChipDisabled: {
    backgroundColor: '#eef0f3',
    borderColor: '#d1d5db',
  },
  suggestionChipText: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '600',
  },
  suggestionChipTextDisabled: {
    color: '#9ca3af',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  empty: {
    textAlign: 'center',
    color: '#888',
    fontSize: 14,
  },
  task: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e6e6e6',
  },
  taskRunning: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
  },
  taskTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  taskName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginRight: 8,
  },
  taskTime: {
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    color: '#333',
  },
  taskActions: {
    flexDirection: 'row',
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  startBtn: { backgroundColor: '#16a34a' },
  stopBtn: { backgroundColor: '#dc2626' },
  deleteBtn: { backgroundColor: '#374151' },
  actionText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  dateGroup: {
    marginBottom: 16,
  },
  dateGroupTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  logEntry: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
  },
  logEntryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  logEntryTask: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  logEntryDuration: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: '#2563eb',
  },
  logEntryTimes: {
    marginBottom: 8,
  },
  logEntryTime: {
    fontSize: 13,
    color: '#666',
  },
  analyticsContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  analyticsList: {
    paddingBottom: 24,
  },
  analyticsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 12,
  },
  analyticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exportBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  exportBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  exportRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  exportBtnSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  exportBtnSecondaryText: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '600',
  },
  exportBtnDanger: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dc2626',
  },
  exportBtnDangerText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: 320,
    maxWidth: '90%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#dc2626',
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 18,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    width: '100%',
  },
  analyticsStat: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
  },
  chartContainer: {
    marginBottom: 16,
    alignItems: 'center',
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e6e6e6',
  },
  statCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  statCardStat: {
    fontSize: 14,
    color: '#555',
    marginBottom: 4,
  },
});
