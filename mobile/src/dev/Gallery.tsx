import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FanHero, SensorCard } from '@/components/greenhouse';
import {
  AreaLineChart,
  BarActivityChart,
  BottomSheet,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  HeatmapGrid,
  IconButton,
  IconTile,
  ListRow,
  MinMaxInput,
  RadialGauge,
  Screen,
  SegmentedControl,
  Skeleton,
  Slider,
  StatTile,
  StatusPill,
  Stepper,
  TextField,
  Toggle,
  useToast,
  type ChartPoint,
} from '@/components/ui';
import { useSettingsStore, type ThemePreference } from '@/store/settingsStore';
import { useTheme } from '@/theme';
import { formatAxis } from '@/utils/sensors';

const now = Date.now();
const MIN = 60_000;
const wave = (i: number, base: number, amp: number) => base + Math.sin(i / 3) * amp + (i % 5) * 0.1;
const SPARK = Array.from({ length: 24 }, (_, i) => wave(i, 30, 1));
const TREND: ChartPoint[] = Array.from({ length: 60 }, (_, i) => ({
  t: now - (59 - i) * 30_000,
  v: i > 20 && i < 25 ? null : wave(i, 28, 2.5) + i * 0.05,
}));
const BAND: ChartPoint[] = Array.from({ length: 48 }, (_, i) => {
  const v = wave(i, 29, 2);
  return { t: now - (47 - i) * 30 * MIN, v, min: v - 1.5, max: v + 1.8 };
});
const BARS = Array.from({ length: 24 }, (_, i) => ({
  fraction: [3, 4, 9, 10, 11, 15, 20, 22].includes(i) ? 1 : i === 16 ? 0.4 : 0,
}));
const HEAT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, r) => ({
  label,
  values: Array.from({ length: 24 }, (_, h) =>
    r === 6 && h > 20 ? null : 24 + Math.sin((h - 6) / 4) * 5 + r * 0.3,
  ),
}));

/**
 * DEV ONLY: every reusable component with sample data, to check looks, dark mode and
 * touch behavior on the phone. Loaded lazily and only in development builds.
 */
export default function Gallery() {
  const theme = useTheme();
  const { colors } = theme;
  const router = useRouter();
  const toast = useToast();
  const pref = useSettingsStore((s) => s.themePreference);
  const setPref = useSettingsStore((s) => s.setThemePreference);
  const [mode, setMode] = useState<'auto' | 'on' | 'off'>('off');
  const [metric, setMetric] = useState('temp');
  const [onTemp, setOnTemp] = useState(32);
  const [offTemp, setOffTemp] = useState(28);
  const [toggle, setToggle] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [min, setMin] = useState('18');
  const [max, setMax] = useState('35');
  const [url, setUrl] = useState('http://192.168.50.69:4000');

  const trendDomain = useMemo(() => [now - 30 * MIN, now] as const, []);
  const bandDomain = useMemo(() => [now - 24 * 60 * MIN, now] as const, []);

  return (
    <Screen title="Component gallery" subtitle="Dev only · stage 1 building blocks">
      <SegmentedControl<ThemePreference>
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
          { value: 'system', label: 'System' },
        ]}
        value={pref}
        onChange={setPref}
        accessibilityLabel="Theme"
      />

      <Card eyebrow="Buttons" title="Pill shapes only" meta="3 sizes">
        <View style={styles.gap}>
          <Button
            label="Save thresholds"
            size="large"
            fullWidth
            onPress={() => toast.show('Saved', 'success')}
          />
          <Button
            label="Test connection"
            variant="secondary"
            fullWidth
            onPress={() => toast.show('Connected · 42 ms response time', 'success')}
          />
          <View style={styles.row}>
            <Button
              label="Retry"
              variant="secondary"
              icon="refresh"
              onPress={() => toast.show('Could not reach the server', 'error')}
            />
            <Button
              label="Mark all read"
              variant="ghost"
              size="small"
              onPress={() => toast.show('All read', 'info')}
            />
            <Button label="View all" variant="ghost" size="small" onPress={() => undefined} />
          </View>
          <View style={styles.row}>
            <Button label="Tonal" variant="tonal" onPress={() => undefined} />
            <Button label="Delete" variant="destructive" onPress={() => undefined} />
            <Button label="Demo" variant="inverse" size="small" onPress={() => setSheet(true)} />
          </View>
          <Button
            label="Loading keeps width"
            loading={loading}
            onPress={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 1500);
            }}
          />
          <Button label="Disabled" disabled onPress={() => undefined} />
          <View style={styles.row}>
            <IconButton
              icon="refresh"
              accessibilityLabel="Refresh"
              variant="ghost"
              onPress={() => undefined}
            />
            <IconButton
              icon="ellipsis-horizontal"
              accessibilityLabel="More options"
              onPress={() => undefined}
            />
            <IconButton
              icon="close"
              accessibilityLabel="Close"
              variant="outline"
              onPress={() => undefined}
            />
            <IconButton
              icon="add"
              accessibilityLabel="Add"
              variant="tonal"
              size="small"
              onPress={() => undefined}
            />
          </View>
        </View>
      </Card>

      <Card eyebrow="Pills & chips" title="Status">
        <View style={[styles.row, styles.wrap]}>
          <StatusPill tone="ok" label="Connected" variant="outline" icon="wifi" />
          <StatusPill tone="ok" label="Device online" variant="outline" />
          <StatusPill tone="ok" label="Live" variant="plain" uppercase />
          <StatusPill tone="warning" label="Connecting" variant="plain" uppercase />
          <StatusPill tone="ok" label="Good" variant="plain" />
          <StatusPill tone="danger" label="Critical" />
          <StatusPill tone="offline" label="Offline" />
        </View>
        <View style={[styles.row, styles.wrap, styles.top]}>
          {[
            ['temp', 'Temp', colors.chart.airTemp],
            ['hum', 'Humidity', colors.chart.humidity],
            ['soil', 'Soil', colors.chart.soilMoisture],
            ['light', 'Light', colors.chart.lux],
          ].map(([v, l, c]) => (
            <Chip
              key={v}
              label={l ?? ''}
              dotColor={c}
              selected={metric === v}
              onPress={() => setMetric(v ?? '')}
            />
          ))}
          <Chip label="All" count={2} selected onPress={() => undefined} />
          <Chip label="Warning" selected={false} onPress={() => undefined} />
        </View>
      </Card>

      <View style={styles.row}>
        <View style={styles.flex}>
          <SensorCard
            metric="airTemp"
            value={30.9}
            status={{ tone: 'ok', label: 'Good' }}
            trend="up"
            sparkline={SPARK}
            onPress={() => undefined}
          />
        </View>
        <View style={styles.flex}>
          <SensorCard
            metric="lux"
            value={27_800}
            status={{ tone: 'warning', label: 'High' }}
            trend="flat"
            sparkline={SPARK}
          />
        </View>
      </View>

      <Card
        eyebrow="Health ranges"
        title="At a glance"
        meta={<StatusPill tone="ok" label="Optimal zones" variant="plain" />}
      >
        <View style={styles.gauges}>
          <RadialGauge
            value={43}
            min={0}
            max={100}
            zone={[30, 80]}
            color={colors.chart.soilMoisture}
            display="43%"
            caption="Optimal"
            startLabel="Dry"
            endLabel="Wet"
            accessibilityLabel="Soil moisture 43 percent, optimal"
          />
          <RadialGauge
            value={31}
            min={20}
            max={40}
            zone={[18, 32]}
            ticks={[28, 32]}
            color={colors.chart.airTemp}
            display="31°"
            caption="Comfortable"
            startLabel="20°"
            endLabel="40°"
            accessibilityLabel="Air temperature 31 degrees, comfortable"
          />
        </View>
      </Card>

      <Card
        eyebrow="Live trend"
        title="Last 30 minutes"
        meta={<StatusPill tone="ok" label="Live" variant="plain" uppercase />}
      >
        <AreaLineChart
          points={TREND}
          color={colors.chart.airTemp}
          domain={trendDomain}
          gapMs={90_000}
          formatTick={(v) => formatAxis('airTemp', v)}
          formatValue={(v) => `${v.toFixed(1)} °C`}
          formatTime={(t) => new Date(t).toLocaleTimeString()}
          xLabels={['30m ago', '15m', 'Now']}
          threshold={{ value: 32, color: colors.chart.airTemp }}
          accessibilityLabel="Air temperature, last 30 minutes, sample data"
        />
      </Card>

      <Card eyebrow="24h overview" title="Air temperature (band)">
        <AreaLineChart
          points={BAND}
          color={colors.chart.airTemp}
          domain={bandDomain}
          gapMs={60 * MIN}
          band
          formatTick={(v) => formatAxis('airTemp', v)}
          formatValue={(v) => `${v.toFixed(1)} °C`}
          formatTime={(t) => new Date(t).toLocaleString()}
          xLabels={['12 AM', '12 PM', 'Now']}
          accessibilityLabel="Air temperature, 24 hours, sample data"
        />
      </Card>

      <View style={styles.row}>
        <StatTile label="Minimum" value="26.4°" />
        <StatTile label="Fan was on" value="2h 18m" />
      </View>

      <Card eyebrow="Automation" title="Fan activity" meta="2h 18m total">
        <BarActivityChart
          buckets={BARS}
          xLabels={['12 AM', '12 PM', 'Now']}
          accessibilityLabel="Fan activity sample"
        />
      </Card>

      <Card eyebrow="Patterns" title="Temperature by hour" meta="Last 7 days">
        <HeatmapGrid
          rows={HEAT}
          color={colors.chart.airTemp}
          columnLabels={{ 0: '12a', 6: '6a', 12: '12p', 18: '6p' }}
          accessibilityLabel="Heatmap sample"
        />
      </Card>

      <FanHero
        running={mode === 'on'}
        title={mode === 'on' ? 'Fan is running' : 'Fan is off'}
        caption="Last changed just now"
      >
        <SegmentedControl
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
          value={mode}
          onChange={setMode}
          accessibilityLabel="Fan mode"
        />
      </FanHero>

      <Card eyebrow="Automation" title="Fan thresholds" meta="°C">
        <View style={styles.gap}>
          <Stepper
            label="Fan turns ON at"
            value={onTemp}
            onChange={setOnTemp}
            step={1}
            min={10}
            max={50}
            unit="°"
            spokenUnit="degrees Celsius"
          />
          <Slider
            value={onTemp}
            min={20}
            max={45}
            step={1}
            onChange={setOnTemp}
            color={colors.chart.airTemp}
            accessibilityLabel="Fan turns ON at"
            spokenUnit="degrees Celsius"
          />
          <Stepper
            label="Fan turns OFF at"
            value={offTemp}
            onChange={setOffTemp}
            step={1}
            min={10}
            max={50}
            unit="°"
            spokenUnit="degrees Celsius"
          />
          <Slider
            value={offTemp}
            min={20}
            max={45}
            step={1}
            onChange={setOffTemp}
            color={colors.accent}
            accessibilityLabel="Fan turns OFF at"
            spokenUnit="degrees Celsius"
          />
        </View>
      </Card>

      <Card eyebrow="Alert rules" title="Sensor limits">
        <MinMaxInput
          label="Air temperature"
          unit="°C"
          min={min}
          max={max}
          onChangeMin={setMin}
          onChangeMax={setMax}
          maxError={Number(max) <= Number(min) ? 'Max must be above min' : null}
        />
        <Divider style={styles.top} />
        <TextField
          label="Server URL"
          icon="mci-server"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          keyboardType="url"
        />
      </Card>

      <Card padded>
        <ListRow
          title="Push notifications"
          subtitle="Receive important greenhouse alerts"
          icon="notifications-outline"
          trailing={
            <Toggle
              value={toggle}
              onValueChange={setToggle}
              accessibilityLabel="Push notifications"
            />
          }
        />
        <Divider />
        <ListRow
          title="Minimum severity"
          subtitle="Warning and critical"
          icon="warning-outline"
          iconTone="warning"
          onPress={() => setSheet(true)}
        />
      </Card>

      <View style={styles.row}>
        <IconTile icon="checkmark" solid size={40} />
        <IconTile icon="mci-fan" solid size={40} />
        <IconTile icon="warning-outline" tone="warning" />
        <IconTile icon="alert-circle-outline" tone="danger" />
        <IconTile icon="mci-sprout-outline" tone="accent" />
      </View>

      <Card>
        <View accessibilityLabel="Loading" style={styles.gap}>
          <Skeleton height={18} width="40%" />
          <Skeleton height={60} />
        </View>
      </Card>
      <Card>
        <EmptyState icon="leaf-outline" title="No alerts" message="Your greenhouse is happy" />
      </Card>
      <Card>
        <ErrorState message="Could not reach the server." onRetry={() => undefined} />
      </Card>

      <Button label="Back" variant="secondary" fullWidth onPress={() => router.back()} />

      <BottomSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        eyebrow="Demo controls"
        eyebrowTint={colors.demo}
        title="Presentation tools"
      >
        <StatusPill tone="demo" label="These controls are not part of the ETanim app." />
        <ListRow
          title="Simulate heat wave"
          subtitle="Push temperature past 32 °C"
          icon="mci-thermometer"
          iconTone="danger"
          onPress={() => undefined}
        />
        <ListRow
          title="Device offline"
          trailing={
            <Toggle
              value={false}
              onValueChange={() => undefined}
              accessibilityLabel="Device offline"
            />
          }
        />
        <Button
          label="Trigger push notification"
          variant="demo"
          icon="phone-portrait-outline"
          fullWidth
          onPress={() => setSheet(false)}
        />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 12 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  wrap: { flexWrap: 'wrap' },
  top: { marginTop: 12 },
  flex: { flex: 1 },
  gauges: { flexDirection: 'row', justifyContent: 'space-around' },
});
