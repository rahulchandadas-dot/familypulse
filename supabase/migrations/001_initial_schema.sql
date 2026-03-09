-- FamilyPulse Initial Schema
-- Migration: 001_initial_schema.sql

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- FAMILIES
-- ============================================================
CREATE TABLE families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FAMILY MEMBERS
-- ============================================================
CREATE TABLE family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  relationship TEXT, -- parent, child, spouse, grandparent, etc.
  date_of_birth DATE,
  external_id TEXT UNIQUE, -- maps to Excel member_id column
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MEMBER PROFILES (extended attributes)
-- ============================================================
CREATE TABLE member_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES family_members(id) ON DELETE CASCADE UNIQUE,
  avatar_color TEXT DEFAULT '#6366f1',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- METRIC TYPES (catalog of all possible health metrics)
-- ============================================================
CREATE TABLE metric_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,           -- e.g. 'steps', 'hrv', 'sleep_hours'
  label TEXT NOT NULL,                -- e.g. 'Steps', 'HRV', 'Sleep Duration'
  unit TEXT,                          -- e.g. 'steps', 'ms', 'hours'
  category TEXT,                      -- 'activity', 'sleep', 'heart', 'stress', 'nutrition', 'recovery'
  description TEXT,
  normal_range_min NUMERIC,
  normal_range_max NUMERIC,
  higher_is_better BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- METRIC OBSERVATIONS (one row per member per date per metric)
-- ============================================================
CREATE TABLE metric_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES family_members(id) ON DELETE CASCADE,
  metric_type_id UUID REFERENCES metric_types(id),
  observed_date DATE NOT NULL,
  value NUMERIC,
  raw_value TEXT,        -- original string value from Excel
  source TEXT DEFAULT 'excel',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(member_id, metric_type_id, observed_date)
);

-- ============================================================
-- DAILY SUMMARIES (pre-computed scores per member per day)
-- ============================================================
CREATE TABLE daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES family_members(id) ON DELETE CASCADE,
  summary_date DATE NOT NULL,
  readiness_score NUMERIC,
  stress_score NUMERIC,
  activity_score NUMERIC,
  sleep_score NUMERIC,
  overall_score NUMERIC,
  flags JSONB DEFAULT '[]',  -- array of {metric, severity, message} objects
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(member_id, summary_date)
);

-- ============================================================
-- RECOMMENDATIONS
-- ============================================================
CREATE TABLE recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  action_type TEXT,                          -- 'activity', 'sleep', 'nutrition', 'stress', 'social'
  priority INTEGER DEFAULT 1,               -- 1=high, 2=medium, 3=low
  affected_member_ids UUID[] DEFAULT '{}',
  evidence_level TEXT DEFAULT 'general',    -- 'strong', 'moderate', 'general', 'wellness'
  is_active BOOLEAN DEFAULT TRUE,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RECOMMENDATION FEEDBACK
-- ============================================================
CREATE TABLE recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID REFERENCES recommendations(id) ON DELETE CASCADE,
  feedback_type TEXT,  -- 'helpful', 'not_helpful', 'already_doing', 'not_applicable'
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SOURCE DOCUMENTS (approved medical/wellness sources)
-- ============================================================
CREATE TABLE source_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source_org TEXT NOT NULL,   -- 'CDC', 'NIH', 'MedlinePlus', 'NHS', 'WHO', etc.
  url TEXT,
  content_summary TEXT,
  topic_tags TEXT[] DEFAULT '{}',
  is_approved BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SOURCE CITATIONS
-- ============================================================
CREATE TABLE source_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id UUID REFERENCES source_documents(id),
  recommendation_id UUID REFERENCES recommendations(id),
  chat_message_id UUID,   -- nullable, references chat_messages
  excerpt TEXT,
  relevance_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CHAT SESSIONS
-- ============================================================
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CHAT MESSAGES
-- ============================================================
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  citations JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INGESTION LOGS
-- ============================================================
CREATE TABLE ingestion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT,
  rows_processed INTEGER,
  rows_inserted INTEGER,
  rows_updated INTEGER,
  errors JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending',  -- 'pending', 'running', 'success', 'error'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- SEED METRIC TYPES
-- ============================================================
INSERT INTO metric_types (key, label, unit, category, description, normal_range_min, normal_range_max, higher_is_better) VALUES
('steps',               'Steps',                  'steps',  'activity',  'Daily step count from wearable device',                    7000,   15000,  true),
('sleep_hours',         'Sleep Duration',         'hours',  'sleep',     'Total sleep time in hours',                                7,      9,      true),
('resting_heart_rate',  'Resting Heart Rate',     'bpm',    'heart',     'Resting heart rate in beats per minute',                   50,     80,     false),
('hrv',                 'Heart Rate Variability', 'ms',     'heart',     'HRV measures autonomic nervous system balance',            40,     100,    true),
('stress_score',        'Stress Score',           'score',  'stress',    'Computed stress score (lower is better, 0-100)',           0,      25,     false),
('readiness_score',     'Readiness Score',        'score',  'recovery',  'Overall readiness/recovery score (higher is better)',      70,     100,    true),
('calories_burned',     'Calories Burned',        'kcal',   'activity',  'Total daily calories burned including basal metabolic',    1500,   3000,   true),
('activity_minutes',    'Active Minutes',         'min',    'activity',  'Minutes of moderate-to-vigorous physical activity',        30,     90,     true),
('blood_oxygen',        'Blood Oxygen (SpO2)',    '%',      'heart',     'Blood oxygen saturation level',                            95,     100,    true),
('glucose',             'Blood Glucose',          'mg/dL',  'nutrition', 'Fasting or continuous blood glucose level',                70,     100,    true);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_metric_obs_member_date       ON metric_observations(member_id, observed_date DESC);
CREATE INDEX idx_metric_obs_metric_type       ON metric_observations(metric_type_id);
CREATE INDEX idx_daily_summaries_member_date  ON daily_summaries(member_id, summary_date DESC);
CREATE INDEX idx_recommendations_family       ON recommendations(family_id, is_active, priority);
CREATE INDEX idx_recommendations_active       ON recommendations(is_active, generated_at DESC);
CREATE INDEX idx_chat_messages_session        ON chat_messages(session_id, created_at);
CREATE INDEX idx_family_members_family        ON family_members(family_id);
CREATE INDEX idx_family_members_external_id   ON family_members(external_id);
CREATE INDEX idx_source_docs_approved         ON source_documents(is_approved);
CREATE INDEX idx_source_citations_rec         ON source_citations(recommendation_id);

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_families_updated_at
  BEFORE UPDATE ON families
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_family_members_updated_at
  BEFORE UPDATE ON family_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_member_profiles_updated_at
  BEFORE UPDATE ON member_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
