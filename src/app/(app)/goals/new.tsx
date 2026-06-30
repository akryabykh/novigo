import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Timeframe } from '../../../core/domain';
import { validateWeights } from '../../../core/logic';
import { useAuth } from '../../../features/auth/auth-provider';
import { useCreateSession } from '../../../features/queries';
import type { NewGoal } from '../../../core/data';
import { Button, Card, Input, ProgressBar, ProgressRing, Text } from '../../../ui/components';
import { radius, spacing, timeframeColor, timeframeLabel } from '../../../ui/theme';
import { useColors } from '../../../ui/theme-provider';

interface Row {
  key: string;
  title: string;
  target: string;
  weight: string;
}
type Rows = Record<Timeframe, Row[]>;

let counter = 0;
const newRow = (): Row => ({ key: `r${counter++}`, title: '', target: '', weight: '' });

const ORDER: Timeframe[] = ['day', 'week', 'month'];
const HINT: Record<Timeframe, string> = {
  day: 'каждый день',
  week: 'за неделю',
  month: 'за месяц (4 недели)',
};

export default function NewSessionScreen() {
  const c = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const createSession = useCreateSession(user?.id);

  const [step, setStep] = useState<'intro' | 'form'>('intro');
  const [rows, setRows] = useState<Rows>({ day: [newRow()], week: [], month: [] });
  const [error, setError] = useState<string | null>(null);

  const update = (tf: Timeframe, key: string, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [tf]: r[tf].map((x) => (x.key === key ? { ...x, ...patch } : x)) }));
  const add = (tf: Timeframe) => setRows((r) => ({ ...r, [tf]: [...r[tf], newRow()] }));
  const remove = (tf: Timeframe, key: string) =>
    setRows((r) => ({ ...r, [tf]: r[tf].filter((x) => x.key !== key) }));
  const distribute = (tf: Timeframe) =>
    setRows((r) => {
      const list = r[tf];
      const n = list.length;
      if (n === 0) return r;
      const each = Math.floor((100 / n) * 10) / 10;
      return {
        ...r,
        [tf]: list.map((x, i) => ({
          ...x,
          weight: String(i === 0 ? Math.round((100 - each * (n - 1)) * 10) / 10 : each),
        })),
      };
    });

  const submit = () => {
    setError(null);
    const goals: NewGoal[] = [];

    for (const tf of ORDER) {
      const list = rows[tf];
      if (list.length === 0) continue;
      const parsed = list.map((x) => ({
        title: x.title.trim(),
        timeframe: tf,
        target: parseFloat(x.target),
        weight: parseFloat(x.weight) || 0,
      }));
      for (const g of parsed) {
        if (!g.title) return setError(`«${timeframeLabel[tf]}»: у каждой цели должно быть название`);
        if (!Number.isFinite(g.target) || g.target <= 0)
          return setError(`«${timeframeLabel[tf]}»: укажи цель (> 0) для «${g.title}»`);
      }
      const w = validateWeights(parsed);
      if (!w.ok)
        return setError(`«${timeframeLabel[tf]}»: сумма весов должна быть 100% (сейчас ${Math.round(w.sum)}%)`);
      goals.push(...parsed);
    }

    if (goals.length === 0) return setError('Добавь хотя бы одну цель');

    createSession.mutate(goals, {
      onSuccess: () => router.replace('/(app)'),
      onError: (e: any) => setError(e?.message ?? 'Не удалось создать сессию'),
    });
  };

  if (step === 'intro') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
        <Intro onStart={() => setStep('form')} onClose={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
        }}>
        <Text variant="heading">Новая сессия целей</Text>
        <Text variant="label" tone="muted" onPress={() => router.back()}>
          Отмена
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ alignItems: 'center', paddingBottom: spacing['3xl'] }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={{ width: '100%', maxWidth: 560, paddingHorizontal: spacing.xl, gap: spacing.xl }}>
          <Text variant="body" tone="muted">
            Отсчёт пойдёт с момента создания: день, неделя и месяц (4 недели). Веса внутри каждого
            горизонта в сумме = 100%.
          </Text>

          {ORDER.map((tf) => (
            <Section
              key={tf}
              tf={tf}
              rows={rows[tf]}
              onUpdate={(key, patch) => update(tf, key, patch)}
              onAdd={() => add(tf)}
              onRemove={(key) => remove(tf, key)}
              onDistribute={() => distribute(tf)}
            />
          ))}

          {error ? (
            <Text variant="caption" tone="danger">
              {error}
            </Text>
          ) : null}

          <Button title="Поставить цели" onPress={submit} loading={createSession.isPending} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  tf,
  rows,
  onUpdate,
  onAdd,
  onRemove,
  onDistribute,
}: {
  tf: Timeframe;
  rows: Row[];
  onUpdate: (key: string, patch: Partial<Row>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onDistribute: () => void;
}) {
  const c = useColors();
  const color = timeframeColor[tf];
  const sum = rows.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0);
  const remaining = Math.round((100 - sum) * 10) / 10;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
        <Text variant="heading" style={{ flex: 1 }}>
          {timeframeLabel[tf]}
        </Text>
        <Text variant="caption" tone="faint">
          {HINT[tf]}
        </Text>
      </View>

      {rows.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="label" tone="muted">
              Веса
            </Text>
            <Text
              variant="label"
              style={{ color: remaining === 0 ? c.success : remaining < 0 ? c.danger : c.textMuted }}>
              {remaining === 0 ? '100% ✓' : remaining > 0 ? `осталось ${remaining}%` : `перебор ${Math.abs(remaining)}%`}
            </Text>
          </View>
          <ProgressBar
            progress={Math.min(1, sum / 100)}
            color={remaining < 0 ? c.danger : sum === 100 ? c.success : color}
          />
        </View>
      ) : null}

      {rows.map((r, i) => (
        <Card key={r.key}>
          <View style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="label" tone="faint">
                Цель {i + 1}
              </Text>
              <Text variant="label" tone="danger" onPress={() => onRemove(r.key)}>
                Удалить
              </Text>
            </View>
            <Input
              value={r.title}
              onChangeText={(t) => onUpdate(r.key, { title: t })}
              placeholder="Название цели"
            />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Цель (число)"
                  value={r.target}
                  onChangeText={(t) => onUpdate(r.key, { target: t })}
                  keyboardType="numeric"
                  placeholder="30"
                />
              </View>
              <View style={{ width: 96 }}>
                <Input
                  label="Вес %"
                  value={r.weight}
                  onChangeText={(t) => onUpdate(r.key, { weight: t })}
                  keyboardType="numeric"
                  placeholder="50"
                />
              </View>
            </View>
          </View>
        </Card>
      ))}

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Pressable
          onPress={onAdd}
          style={{
            flex: 1,
            height: 46,
            borderRadius: radius.md,
            borderWidth: 1.5,
            borderColor: c.border,
            borderStyle: 'dashed',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text variant="label" style={{ color }}>
            Добавить цель
          </Text>
        </Pressable>
        {rows.length > 1 ? (
          <Pressable
            onPress={onDistribute}
            style={{
              height: 46,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.md,
              backgroundColor: c.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text variant="label" tone="muted">
              Поровну
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ---------- ОНБОРДИНГ ----------
const SLIDES: { title: string; text: string }[] = [
  {
    title: 'Сессия целей',
    text: 'Ставишь цели на день, неделю и месяц. Отсчёт идёт с этого момента и длится 4 недели — это одна сессия.',
  },
  {
    title: 'Три кольца',
    text: 'На главном — три кольца. Тапни кольцо, чтобы открыть цели этого горизонта, и отмечай прогресс прямо на плашке кнопками + и −.',
  },
  {
    title: 'Откуда проценты',
    text: 'День — это дневные цели. Неделя = 50% от того, как шли дни (идеальный день = 1/7), плюс 50% недельные цели. Месяц = 50% от 4 недель плюс 50% месячные. Веса внутри каждого горизонта в сумме = 100%.',
  },
];

function Intro({ onStart, onClose }: { onStart: () => void; onClose: () => void }) {
  const c = useColors();
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  return (
    <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Text variant="label" tone="muted" onPress={onClose}>
          Закрыть
        </Text>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing['2xl'] }}>
        <View style={{ height: 200, alignItems: 'center', justifyContent: 'center' }}>
          {i === 0 ? <IlloSession /> : i === 1 ? <IlloRings /> : <IlloFormula />}
        </View>
        <View style={{ gap: spacing.md, alignItems: 'center', maxWidth: 460 }}>
          <Text variant="title" style={{ textAlign: 'center' }}>
            {slide.title}
          </Text>
          <Text variant="body" tone="muted" style={{ textAlign: 'center' }}>
            {slide.text}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: spacing.lg }}>
        {SLIDES.map((_, idx) => (
          <View
            key={idx}
            style={{
              width: idx === i ? 22 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: idx === i ? c.accent : c.border,
            }}
          />
        ))}
      </View>

      <View style={{ gap: spacing.md }}>
        <Button title={last ? 'Поставить цели' : 'Далее'} onPress={() => (last ? onStart() : setI(i + 1))} />
        {i > 0 ? (
          <Text variant="label" tone="muted" style={{ textAlign: 'center' }} onPress={() => setI(i - 1)}>
            Назад
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function IlloSession() {
  const c = useColors();
  return (
    <View style={{ gap: 6, alignItems: 'center' }}>
      {[0, 1, 2, 3].map((r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 6 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => {
            const idx = r * 7 + d;
            return (
              <View
                key={d}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  backgroundColor: idx === 0 ? timeframeColor.day : c.surfaceAlt,
                }}
              />
            );
          })}
        </View>
      ))}
      <View style={{ height: spacing.sm }} />
      <Text variant="caption" tone="faint">
        4 недели · 28 дней
      </Text>
    </View>
  );
}

function IlloRings() {
  const data: { tf: keyof typeof timeframeColor; v: number; label: string }[] = [
    { tf: 'day', v: 0.7, label: 'День' },
    { tf: 'week', v: 0.45, label: 'Неделя' },
    { tf: 'month', v: 0.2, label: 'Месяц' },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: spacing.lg }}>
      {data.map((d) => (
        <View key={d.tf} style={{ alignItems: 'center', gap: spacing.sm }}>
          <ProgressRing progress={d.v} size={80} stroke={8} color={timeframeColor[d.tf]} />
          <Text variant="caption" tone="muted">
            {d.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function FormulaRow({ color, title, text }: { color: string; title: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
      <Text variant="label" style={{ width: 78 }}>
        {title}
      </Text>
      <Text variant="caption" tone="muted" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

function IlloFormula() {
  return (
    <View style={{ gap: spacing.lg, alignSelf: 'stretch', paddingHorizontal: spacing.sm }}>
      <FormulaRow color={timeframeColor.day} title="День" text="дневные цели — 100%" />
      <FormulaRow color={timeframeColor.week} title="Неделя" text="½ дни + ½ недельные цели" />
      <FormulaRow color={timeframeColor.month} title="Месяц" text="½ недели + ½ месячные цели" />
    </View>
  );
}
