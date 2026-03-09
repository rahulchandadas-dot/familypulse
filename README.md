# FamilyPulse

A family health intelligence dashboard that aggregates wearable and health data across family members, detects patterns, and generates coordinated family-level health actions — grounded in approved medical sources.

## Architecture

```
Excel File (your data)
       │
       ▼
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  Ingestion      │────▶│  Supabase /       │────▶│  Rules Engine     │
│  Pipeline       │     │  PostgreSQL       │     │  (detection.ts)   │
│  (xlsx parser)  │     │                  │     └────────┬──────────┘
└─────────────────┘     └──────────────────┘              │
                                                          ▼
                                               ┌───────────────────┐
                                               │  Recommendation   │
                                               │  Engine           │
                                               │  (Claude API)     │
                                               └────────┬──────────┘
                                                        │
                                               ┌────────▼──────────┐
                                               │  Medical Grounding │
                                               │  (approved sources)│
                                               └────────┬──────────┘
                                                        │
                                               ┌────────▼──────────┐
                                               │  Next.js Dashboard │
                                               │  + Chat Interface  │
                                               └───────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript |
| Styling | Tailwind CSS, shadcn/ui, Lucide icons |
| Charts | Recharts |
| Database | Supabase (PostgreSQL) |
| AI | Anthropic Claude (`claude-sonnet-4-6`) |
| Data ingestion | `xlsx` library |

## Project Structure

```
familypulse/
├── src/
│   ├── app/
│   │   ├── dashboard/page.tsx       # Main dashboard (server component)
│   │   └── api/
│   │       ├── ingest/route.ts      # POST: trigger Excel ingestion
│   │       ├── recommendations/     # GET/POST recommendations
│   │       ├── metrics/route.ts     # GET metric observations
│   │       └── chat/route.ts        # POST chat messages
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── DashboardView.tsx        # Main 3-section layout
│   │   │   ├── RecommendationCards.tsx  # Top: action cards
│   │   │   ├── HealthHighlights.tsx     # Middle: flagged metrics
│   │   │   ├── MetricsGrid.tsx          # Bottom: all metrics
│   │   │   └── MetricDetailModal.tsx    # Metric deep-dive modal
│   │   ├── chat/ChatInterface.tsx       # Slide-in chat panel
│   │   └── layout/Header.tsx
│   ├── lib/
│   │   ├── ingestion/
│   │   │   ├── excel-parser.ts      # Parse + upsert Excel data
│   │   │   └── column-mapping.ts    # Flexible column name mapping
│   │   ├── rules/
│   │   │   └── detection.ts         # Rules-based flag detection
│   │   ├── recommendations/
│   │   │   └── engine.ts            # Candidate generation + LLM
│   │   ├── retrieval/
│   │   │   ├── sources.ts           # Approved sources whitelist
│   │   │   └── grounding.ts         # Medical grounding / citations
│   │   └── supabase/
│   │       ├── client.ts            # Browser client
│   │       └── server.ts            # Server/admin client
│   └── types/index.ts               # All TypeScript interfaces
├── supabase/
│   └── migrations/001_initial_schema.sql
└── data/
    └── sample_family_health_data.xlsx.README.md
```

## Quick Start

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [Anthropic API key](https://console.anthropic.com)

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.local.example .env.local
# Fill in your Supabase URL, anon key, service role key, and Anthropic API key
```

### 3. Run the database migration
In your Supabase dashboard → SQL Editor, run:
```
supabase/migrations/001_initial_schema.sql
```

### 4. Prepare your Excel file
Place your family health data Excel file at the path set in `EXCEL_FILE_PATH` (default: `./data/family_health_data.xlsx`).

See `data/sample_family_health_data.xlsx.README.md` for the expected format.

### 5. Start the dev server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Sync your data
Click **Sync Data** in the dashboard header (or `POST /api/ingest`) to ingest your Excel file and generate recommendations.

---

## Dashboard Layout

```
┌─────────────────────────────────────────────────────────┐
│  RECOMMENDED ACTIONS                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ HIGH priority│  │ MED priority │  │ LOW priority │  │
│  │ card         │  │ card         │  │ card         │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
├─────────────────────────────────────────────────────────┤
│  HEALTH HIGHLIGHTS (flagged metrics)                    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│  │Alice │ │Bob   │ │Emma  │ │Alice │ │Bob   │        │
│  │Sleep │ │HRV   │ │Steps │ │Stress│ │RHR   │        │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘        │
├─────────────────────────────────────────────────────────┤
│  ALL METRICS  [All] [Activity] [Sleep] [Heart] [Stress] │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐   │
│  │    │ │    │ │    │ │    │ │    │ │    │ │    │   │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘   │
└─────────────────────────────────────────────────────────┘
                                              [💬 Chat]
```

---

## Medical Safety

- All AI-generated recommendations cite only **approved sources** (CDC, NIH, MedlinePlus, NHS, WHO, AHA, etc.)
- The system uses **retrieval-based grounding** — not fine-tuning
- Claims without approved source support are **withheld or labeled as general wellness**
- No diagnosis language is used
- Every screen includes an educational disclaimer
- Source citations are rendered inline in recommendation cards and chat responses

---

## Data Model (key tables)

| Table | Purpose |
|-------|---------|
| `families` | Family group |
| `family_members` | Individual members |
| `metric_observations` | One row per member × date × metric |
| `daily_summaries` | Pre-computed scores + flags per member per day |
| `recommendations` | Active family-level actions |
| `source_documents` | Approved medical source registry |
| `source_citations` | Links recommendations/chat answers to sources |
| `chat_messages` | Persistent chat history |
| `ingestion_logs` | Audit trail of Excel syncs |

---

## Extending the App

**Add a new metric:** Add a row to `metric_types` in the DB and a column to your Excel file.

**Add an approved source:** Add an entry to `src/lib/retrieval/sources.ts` and insert a row into `source_documents`.

**Replace Excel with a wearable API:** Implement a new ingestor in `src/lib/ingestion/` that writes to the same `metric_observations` table. The rest of the pipeline is unchanged.

---

## Disclaimer

FamilyPulse is an educational wellness tool. It is **not** a medical device and does **not** diagnose, treat, or prevent any disease. Always consult a qualified healthcare professional for medical advice.
