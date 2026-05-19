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
} from 'react-native';

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
  const [draft, setDraft] = useState('');
  const [, setTick] = useState(0);
  const [currentTab, setCurrentTab] = useState<'timer' | 'log' | 'analytics'>('timer');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasRunning = tasks.some((t) => t.startedAt !== null);

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

  const addTask = () => {
    const name = draft.trim();
    if (!name) return;
    setTasks((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, name, startedAt: null },
    ]);
    setDraft('');
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
              startTime: t.startedAt,
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

      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        ListEmptyComponent={
          <Text style={styles.empty}>No tasks yet. Add one above to start tracking.</Text>
        }
        renderItem={({ item }) => {
          const running = item.startedAt !== null;
          const currentSessionMs = running ? Date.now() - item.startedAt : 0;
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

  const renderAnalyticsTab = () => (
    <ScrollView style={styles.analyticsContainer} contentContainerStyle={styles.analyticsList}>
      <Text style={styles.analyticsTitle}>Today's Summary</Text>
      <Text style={styles.analyticsStat}>Total Time: {formatDuration(getTodayTime())}</Text>

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
  analyticsStat: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
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
