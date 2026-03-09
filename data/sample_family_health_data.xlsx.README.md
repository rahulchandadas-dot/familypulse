# FamilyPulse — Expected Excel Data Format

This document describes the required format for the family health data Excel file
used by FamilyPulse. The file should be placed at the path specified by
`EXCEL_FILE_PATH` in your `.env.local` file.

---

## File Format

- **Extension**: `.xlsx` or `.xls`
- **Sheet**: The first sheet is used by default (configurable via `ColumnMappingConfig.sheetName`)
- **Header row**: Row 1 (configurable via `ColumnMappingConfig.headerRow`)
- **One row = one day of data for one family member**

---

## Required Columns

| Column Name       | Internal Field    | Required | Type    | Description                                      |
|-------------------|-------------------|----------|---------|--------------------------------------------------|
| `member_id`       | `member_id`       | YES      | String  | Unique identifier for the family member (e.g. "mom", "dad", "child1"). This is used as the external ID in the database. |
| `member_name`     | `member_name`     | YES      | String  | Display name of the family member (e.g. "Alice Smith") |
| `date`            | `date`            | YES      | Date    | Date of the observation (YYYY-MM-DD, MM/DD/YYYY, or Excel serial format) |

---

## Optional Identity Columns

| Column Name       | Internal Field    | Type    | Description                                      |
|-------------------|-------------------|---------|--------------------------------------------------|
| `family_id`       | `family_id`       | String  | Family group identifier. If omitted, all members are placed in a "Default Family". |
| `relationship`    | `relationship`    | String  | e.g. "parent", "child", "spouse" — shown in the dashboard |

---

## Health Metric Columns

| Column Name           | Internal Field         | Type    | Unit      | Normal Range     | Higher is Better |
|-----------------------|------------------------|---------|-----------|------------------|------------------|
| `steps`               | `steps`                | Number  | steps     | 7,000 – 15,000   | Yes              |
| `sleep_hours`         | `sleep_hours`          | Number  | hours     | 7 – 9            | Yes              |
| `resting_heart_rate`  | `resting_heart_rate`   | Number  | bpm       | 50 – 80          | No               |
| `hrv`                 | `hrv`                  | Number  | ms        | 40 – 100         | Yes              |
| `stress_score`        | `stress_score`         | Number  | score     | 0 – 25           | No               |
| `readiness_score`     | `readiness_score`      | Number  | score     | 70 – 100         | Yes              |
| `calories_burned`     | `calories_burned`      | Number  | kcal      | 1,500 – 3,000    | Yes              |
| `activity_minutes`    | `activity_minutes`     | Number  | min       | 30 – 90          | Yes              |
| `blood_oxygen`        | `blood_oxygen`         | Number  | %         | 95 – 100         | Yes              |
| `glucose`             | `glucose`              | Number  | mg/dL     | 70 – 100         | Yes              |
| `notes`               | `notes`                | String  | —         | —                | —                |

---

## Column Name Flexibility

The ingestion engine normalizes column headers before matching. You do **not** need to use the exact column names above. The following variations are all recognized:

| Accepted Variations                                      | Maps To               |
|----------------------------------------------------------|-----------------------|
| `member_id`, `memberid`, `member`, `id`, `user_id`      | `member_id`           |
| `member_name`, `name`, `full_name`, `person`             | `member_name`         |
| `date`, `observation_date`, `record_date`, `day`         | `date`                |
| `steps`, `step_count`, `daily_steps`                     | `steps`               |
| `sleep_hours`, `sleep`, `sleep_duration`, `hours_of_sleep` | `sleep_hours`       |
| `resting_heart_rate`, `rhr`, `heart_rate`, `resting_hr` | `resting_heart_rate`  |
| `hrv`, `heart_rate_variability`, `hrv_ms`                | `hrv`                 |
| `stress_score`, `stress`, `stress_level`                 | `stress_score`        |
| `readiness_score`, `readiness`, `recovery_score`         | `readiness_score`     |
| `calories_burned`, `calories`, `active_calories`         | `calories_burned`     |
| `activity_minutes`, `active_minutes`, `exercise_minutes` | `activity_minutes`    |
| `blood_oxygen`, `spo2`, `oxygen_saturation`              | `blood_oxygen`        |
| `glucose`, `blood_glucose`, `blood_sugar`                | `glucose`             |
| `notes`, `note`, `comments`                              | `notes`               |

Case, spaces, and hyphens are all normalized (e.g. `Heart Rate Variability` and `heart-rate-variability` both work).

---

## Example Data

```
member_id | member_name | relationship | date       | steps | sleep_hours | resting_heart_rate | hrv | stress_score | readiness_score | calories_burned | activity_minutes | blood_oxygen | glucose
----------|-------------|--------------|------------|-------|-------------|-------------------|-----|--------------|-----------------|-----------------|------------------|--------------|--------
mom       | Alice Smith | parent       | 2024-03-01 | 8234  | 7.2         | 62                | 58  | 22           | 74              | 2100            | 42               | 98           | 92
mom       | Alice Smith | parent       | 2024-03-02 | 6512  | 6.5         | 65                | 44  | 38           | 61              | 1870            | 28               | 97           | 95
dad       | Bob Smith   | parent       | 2024-03-01 | 11200 | 7.8         | 58                | 72  | 15           | 82              | 2450            | 55               | 99           | 88
dad       | Bob Smith   | parent       | 2024-03-02 | 9800  | 7.5         | 60                | 68  | 18           | 79              | 2300            | 50               | 99           | 85
child1    | Emma Smith  | child        | 2024-03-01 | 12500 | 8.5         | 72                | 45  | 10           | 88              | 1800            | 65               | 99           | 83
child1    | Emma Smith  | child        | 2024-03-02 | 14200 | 9.0         | 70                | 52  | 8            | 92              | 1950            | 78               | 100          | 80
```

---

## Tips

1. **Multiple days per member**: Include one row per member per day for trend analysis.
2. **Consistent member_id**: Use the same `member_id` across all rows for the same person.
3. **Empty cells**: Leave metric cells empty if data is not available — they will be skipped.
4. **Date formats**: All of these work: `2024-03-01`, `03/01/2024`, `March 1, 2024`, or Excel date serial numbers.
5. **Custom columns**: If your wearable exports different column names, you can override the mapping by modifying `DEFAULT_COLUMN_MAP` in `src/lib/ingestion/column-mapping.ts`.

---

## Syncing Data

After placing your Excel file at `EXCEL_FILE_PATH`:

1. Click **"Sync Data"** in the dashboard header, OR
2. Send a `POST` request to `/api/ingest`

The ingestion pipeline will:
- Parse and validate all rows
- Upsert family members and metric observations
- Compute daily summary scores
- Trigger new recommendation generation

Check ingestion status via `GET /api/ingest`.
