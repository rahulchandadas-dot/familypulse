/**
 * Generates a realistic 30-day sample health dataset for the Smith family (4 members)
 * and writes it to data/family_health_data.xlsx
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// ── Family members ────────────────────────────────────────────────────────────
const MEMBERS = [
  {
    member_id: 'dad',
    member_name: 'David Smith',
    relationship: 'parent',
    family_id: 'smith-family',
    // Profile: busy exec, moderate fitness, chronic mild stress
    base: {
      steps: 8500, sleep_hours: 6.8, resting_heart_rate: 64, hrv: 52,
      stress_score: 32, readiness_score: 68, calories_burned: 2400,
      activity_minutes: 38, blood_oxygen: 98, glucose: 94,
    },
  },
  {
    member_id: 'mom',
    member_name: 'Sarah Smith',
    relationship: 'parent',
    family_id: 'smith-family',
    // Profile: active, good sleeper, generally high readiness
    base: {
      steps: 11200, sleep_hours: 7.6, resting_heart_rate: 58, hrv: 68,
      stress_score: 20, readiness_score: 78, calories_burned: 2100,
      activity_minutes: 52, blood_oxygen: 99, glucose: 88,
    },
  },
  {
    member_id: 'teen',
    member_name: 'Emma Smith',
    relationship: 'child',
    family_id: 'smith-family',
    // Profile: teenager, irregular sleep, high activity on school days
    base: {
      steps: 9800, sleep_hours: 7.2, resting_heart_rate: 68, hrv: 58,
      stress_score: 25, readiness_score: 74, calories_burned: 1950,
      activity_minutes: 55, blood_oxygen: 99, glucose: 84,
    },
  },
  {
    member_id: 'child',
    member_name: 'Liam Smith',
    relationship: 'child',
    family_id: 'smith-family',
    // Profile: young child, very active, great sleep
    base: {
      steps: 12500, sleep_hours: 9.2, resting_heart_rate: 74, hrv: 48,
      stress_score: 8, readiness_score: 88, calories_burned: 1700,
      activity_minutes: 72, blood_oxygen: 100, glucose: 82,
    },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function jitter(value, pct = 0.12) {
  return value * (1 + rand(-pct, pct));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Simulate a gradual trend over 30 days with some noise */
function trendedValue(base, day, trendPct, noisePct) {
  const trend = 1 + (trendPct * day / 30);
  return base * trend * (1 + rand(-noisePct, noisePct));
}

/**
 * Generate one day's data for a member.
 * Injects realistic patterns:
 *   - Weekend boosts for activity
 *   - Mid-week stress spikes for parents
 *   - Sleep debt accumulation for dad
 *   - Exam-week stress spike for teen (days 18-22)
 *   - Recovery week for mom (days 24-30, post-illness dip then recovery)
 */
function generateDayRow(member, date, dayIndex) {
  const dow = date.getDay(); // 0=Sun, 6=Sat
  const isWeekend = dow === 0 || dow === 6;
  const isMidWeek = dow >= 2 && dow <= 4;
  const b = member.base;

  let steps = jitter(b.steps, 0.15);
  let sleep = jitter(b.sleep_hours, 0.08);
  let rhr = jitter(b.resting_heart_rate, 0.05);
  let hrv = jitter(b.hrv, 0.12);
  let stress = jitter(b.stress_score, 0.15);
  let readiness = jitter(b.readiness_score, 0.08);
  let calories = jitter(b.calories_burned, 0.1);
  let activity = jitter(b.activity_minutes, 0.18);
  let spo2 = jitter(b.blood_oxygen, 0.01);
  let glucose = jitter(b.glucose, 0.06);

  // ── Weekend effects ──────────────────────────────────────────────────────
  if (isWeekend) {
    steps *= 1.25;
    activity *= 1.35;
    calories *= 1.15;
    sleep *= 1.1;          // sleep in on weekends
    stress *= 0.75;
    readiness *= 1.08;
  }

  // ── Member-specific patterns ─────────────────────────────────────────────
  if (member.member_id === 'dad') {
    // Mid-week stress spike + sleep debt
    if (isMidWeek) {
      stress *= 1.4;
      sleep *= 0.88;
      hrv *= 0.85;
      readiness *= 0.88;
      rhr *= 1.06;
    }
    // Gradual sleep improvement after day 15 (started a sleep routine)
    if (dayIndex > 15) {
      sleep = trendedValue(b.sleep_hours, dayIndex - 15, 0.08, 0.06);
      readiness = trendedValue(b.readiness_score, dayIndex - 15, 0.06, 0.05);
    }
  }

  if (member.member_id === 'mom') {
    // Brief illness dip days 8-12, then recovery
    if (dayIndex >= 8 && dayIndex <= 12) {
      readiness *= 0.72;
      sleep *= 1.15;       // sleeping more when sick
      steps *= 0.55;
      activity *= 0.4;
      hrv *= 0.7;
      rhr *= 1.12;
      spo2 *= 0.985;
    } else if (dayIndex >= 13 && dayIndex <= 18) {
      // Recovery ramp
      const recovery = (dayIndex - 12) / 6;
      readiness = b.readiness_score * (0.72 + 0.28 * recovery) * (1 + rand(-0.05, 0.05));
    }
  }

  if (member.member_id === 'teen') {
    // Exam week: days 18-22 — high stress, poor sleep
    if (dayIndex >= 18 && dayIndex <= 22) {
      stress *= 1.8;
      sleep *= 0.82;
      hrv *= 0.78;
      readiness *= 0.80;
      steps *= 0.65;       // sitting more
      activity *= 0.5;
    }
    // Screen-time late nights on weekends — worse sleep
    if (isWeekend) {
      sleep *= 0.90;
      stress *= 1.1;
    }
  }

  if (member.member_id === 'child') {
    // Very consistent — just add more noise
    steps = jitter(b.steps, 0.22);
    activity = jitter(b.activity_minutes, 0.25);
    // School days slightly less active than weekends
    if (!isWeekend) {
      steps *= 0.88;
      activity *= 0.80;
    }
  }

  // ── Clamp to physiologically valid ranges ────────────────────────────────
  return {
    family_id: member.family_id,
    member_id: member.member_id,
    member_name: member.member_name,
    relationship: member.relationship,
    date: date.toISOString().split('T')[0],
    steps:               Math.round(clamp(steps, 500, 30000)),
    sleep_hours:         Math.round(clamp(sleep, 3, 12) * 10) / 10,
    resting_heart_rate:  Math.round(clamp(rhr, 40, 110)),
    hrv:                 Math.round(clamp(hrv, 10, 180)),
    stress_score:        Math.round(clamp(stress, 0, 100)),
    readiness_score:     Math.round(clamp(readiness, 10, 100)),
    calories_burned:     Math.round(clamp(calories, 800, 5000)),
    activity_minutes:    Math.round(clamp(activity, 0, 300)),
    blood_oxygen:        Math.round(clamp(spo2, 88, 100) * 10) / 10,
    glucose:             Math.round(clamp(glucose, 60, 200)),
    notes: '',
  };
}

// ── Build dataset ─────────────────────────────────────────────────────────────

const DAYS = 30;
const rows = [];

// Start 30 days ago
const startDate = new Date();
startDate.setDate(startDate.getDate() - DAYS);

for (let d = 0; d < DAYS; d++) {
  const date = new Date(startDate);
  date.setDate(startDate.getDate() + d);

  for (const member of MEMBERS) {
    rows.push(generateDayRow(member, date, d));
  }
}

// ── Write Excel file ──────────────────────────────────────────────────────────

async function writeExcel() {
  const outDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'family_health_data.xlsx');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FamilyPulse';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Health Data', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // Define columns
  sheet.columns = [
    { header: 'family_id',          key: 'family_id',          width: 18 },
    { header: 'member_id',          key: 'member_id',          width: 12 },
    { header: 'member_name',        key: 'member_name',        width: 18 },
    { header: 'relationship',       key: 'relationship',       width: 14 },
    { header: 'date',               key: 'date',               width: 14 },
    { header: 'steps',              key: 'steps',              width: 10 },
    { header: 'sleep_hours',        key: 'sleep_hours',        width: 13 },
    { header: 'resting_heart_rate', key: 'resting_heart_rate', width: 20 },
    { header: 'hrv',                key: 'hrv',                width: 8  },
    { header: 'stress_score',       key: 'stress_score',       width: 14 },
    { header: 'readiness_score',    key: 'readiness_score',    width: 17 },
    { header: 'calories_burned',    key: 'calories_burned',    width: 17 },
    { header: 'activity_minutes',   key: 'activity_minutes',   width: 18 },
    { header: 'blood_oxygen',       key: 'blood_oxygen',       width: 15 },
    { header: 'glucose',            key: 'glucose',            width: 10 },
    { header: 'notes',              key: 'notes',              width: 20 },
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  headerRow.alignment = { horizontal: 'center' };
  headerRow.height = 20;

  // Add data rows
  rows.forEach((row, i) => {
    const r = sheet.addRow(row);
    // Alternate row shading
    if (i % 2 === 0) {
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5FF' } };
    }
  });

  // Add auto-filter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };

  await workbook.xlsx.writeFile(outPath);
  console.log(`✓ Written ${rows.length} rows to ${outPath}`);
  console.log(`  Members: ${MEMBERS.map(m => m.member_name).join(', ')}`);
  console.log(`  Date range: ${rows[0].date} → ${rows[rows.length - 1].date}`);
  console.log(`  Days: ${DAYS} | Rows per member: ${DAYS}`);
}

writeExcel().catch(console.error);
