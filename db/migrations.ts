// Database migrations, bundled as code so the deployed app can create its own tables without reading files at runtime.
// Append new migrations to the end; never edit one that has shipped.
export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: '0001_init.sql',
    sql: `
CREATE TABLE dzongkhags (
  id         text PRIMARY KEY,            -- ISO 3166-2:BT, e.g. BT-15
  slug       text NOT NULL UNIQUE,        -- url slug, e.g. thimphu
  name       text NOT NULL,
  aliases    text[] NOT NULL DEFAULT '{}',
  lat        double precision NOT NULL,   -- headquarters town (approximate), used only for weather lookups
  lon        double precision NOT NULL,
  grid_col   int NOT NULL,                -- schematic tile-map position (not geography)
  grid_row   int NOT NULL
);

CREATE TABLE sources (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  url           text,
  kind          text NOT NULL,            -- api | iati | manual
  status        text NOT NULL DEFAULT 'not_run',  -- ok | stale | error | not_run
  last_attempt  timestamptz,
  last_success  timestamptz,
  records       int NOT NULL DEFAULT 0,
  error         text,
  notes         text
);

CREATE TABLE projects (
  id                   text PRIMARY KEY,
  source               text NOT NULL REFERENCES sources(id),
  funder               text NOT NULL,
  title                text NOT NULL,
  description          text,
  status               text NOT NULL,
  sector               text,
  implementing_agency  text,
  amount_committed     numeric,
  amount_disbursed     numeric,
  currency             text NOT NULL DEFAULT 'USD',
  start_date           date,
  end_date             date,
  geo_confidence       text NOT NULL DEFAULT 'none',
  url                  text,
  fetched_at           timestamptz NOT NULL
);
CREATE INDEX projects_source_idx ON projects(source);
CREATE INDEX projects_status_idx ON projects(status);

CREATE TABLE project_locations (
  project_id   text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dzongkhag_id text NOT NULL REFERENCES dzongkhags(id),
  gewog        text,
  village      text
);
CREATE INDEX project_locations_dz_idx ON project_locations(dzongkhag_id);
CREATE INDEX project_locations_proj_idx ON project_locations(project_id);

CREATE TABLE budget_lines (
  id            serial PRIMARY KEY,
  fiscal_year   text NOT NULL,
  agency        text NOT NULL,
  budget_type   text NOT NULL DEFAULT 'total',
  amount        numeric NOT NULL,
  currency      text NOT NULL,
  funding_source text,
  source_name   text NOT NULL,
  source_url    text NOT NULL,
  document      text NOT NULL,
  page          text,
  retrieved_on  date
);

CREATE TABLE allocations (
  id             serial PRIMARY KEY,
  fiscal_year    text NOT NULL,
  dzongkhag_id   text NOT NULL REFERENCES dzongkhags(id),
  gewog          text,
  village        text,
  sector         text,
  funding_source text NOT NULL,
  amount         numeric NOT NULL,
  currency       text NOT NULL,
  source_name    text NOT NULL,
  source_url     text NOT NULL,
  document       text NOT NULL,
  page           text,
  retrieved_on   date
);
CREATE INDEX allocations_dz_idx ON allocations(dzongkhag_id);

CREATE TABLE weather_daily (
  dzongkhag_id text NOT NULL REFERENCES dzongkhags(id),
  date         date NOT NULL,
  tmax_c       real,
  tmin_c       real,
  precip_mm    real,
  is_forecast  boolean NOT NULL DEFAULT false,
  fetched_at   timestamptz NOT NULL,
  PRIMARY KEY (dzongkhag_id, date)
);

CREATE TABLE tenders (
  id            text PRIMARY KEY,
  dzongkhag_id  text REFERENCES dzongkhags(id),
  title         text NOT NULL,
  agency        text,
  category      text,
  value         numeric,
  currency      text,
  published_on  date,
  closing_on    date,
  status        text,
  url           text NOT NULL,
  source_name   text NOT NULL,
  retrieved_on  date
);
CREATE INDEX tenders_dz_idx ON tenders(dzongkhag_id);

CREATE TABLE offices (
  id            serial PRIMARY KEY,
  dzongkhag_id  text REFERENCES dzongkhags(id),   -- NULL = national
  kind          text NOT NULL,                    -- leader | office
  name          text NOT NULL,
  role          text,
  contact       text,
  source_name   text NOT NULL,
  source_url    text NOT NULL,
  retrieved_on  date
);

CREATE TABLE boundaries (
  dzongkhag_id text PRIMARY KEY REFERENCES dzongkhags(id),
  geometry     jsonb NOT NULL,
  license      text,
  retrieved_at timestamptz NOT NULL
);

CREATE TABLE update_log (
  id      serial PRIMARY KEY,
  at      timestamptz NOT NULL DEFAULT now(),
  job     text NOT NULL,
  status  text NOT NULL,
  records int NOT NULL DEFAULT 0,
  message text
);
`,
  },
  {
    name: '0002_drop_runtime_boundaries.sql',
    // Map boundaries are now bundled with the app (src/geo, public/geo); the download job and its table are gone.
    sql: `
DELETE FROM update_log WHERE job = 'boundaries';
DELETE FROM sources WHERE id = 'boundaries';
DROP TABLE IF EXISTS boundaries;
`,
  },
  {
    name: '0003_leaders.sql',
    // Elected members, refreshed daily from Parliament's public member records, plus dated news flags
    // that invite a human to re-check an entry. Flags never carry a name.
    sql: `
CREATE TABLE leaders (
  id            serial PRIMARY KEY,
  house         text NOT NULL,              -- na | nc
  name          text NOT NULL,
  role          text NOT NULL,
  constituency  text,                       -- National Assembly only
  dzongkhag_id  text REFERENCES dzongkhags(id) ON DELETE CASCADE,  -- null for eminent members
  eminent       boolean NOT NULL DEFAULT false,
  parliament    text NOT NULL,
  term_start    text,
  term_end      text,
  source_name   text NOT NULL,
  source_url    text NOT NULL,
  fetched_at    timestamptz NOT NULL
);
CREATE INDEX leaders_dz_idx ON leaders (dzongkhag_id);

CREATE TABLE news_flags (
  id            serial PRIMARY KEY,
  dzongkhag_id  text NOT NULL REFERENCES dzongkhags(id) ON DELETE CASCADE,
  title         text NOT NULL,
  url           text,
  published     timestamptz,
  source_name   text NOT NULL,
  source_url    text NOT NULL,
  fetched_at    timestamptz NOT NULL,
  UNIQUE (dzongkhag_id, title, source_name)
);
CREATE INDEX news_flags_dz_idx ON news_flags (dzongkhag_id, published DESC);
`,
  },
  {
    name: '0004_tenders_egp.sql',
    // Tenders now come from two places: the e-GP portal and the curated CSV. Each job must replace only its
    // own rows, so a row records where it came from; the extra columns are what e-GP's tender list prints.
    sql: `
ALTER TABLE tenders ADD COLUMN source    text NOT NULL DEFAULT 'rgob-manual';
ALTER TABLE tenders ADD COLUMN tender_id text;
ALTER TABLE tenders ADD COLUMN reference text;
ALTER TABLE tenders ADD COLUMN hierarchy text;
ALTER TABLE tenders ADD COLUMN proc_type text;
ALTER TABLE tenders ADD COLUMN method    text;
ALTER TABLE tenders ADD COLUMN amendments integer NOT NULL DEFAULT 0;
CREATE INDEX tenders_closing_idx ON tenders (closing_on DESC NULLS LAST);
CREATE INDEX tenders_source_idx  ON tenders (source);
`,
  },
  {
    name: '0005_source_alerts.sql',
    // When a source was last reported as overdue, so a collector that has been dead for a week sends one
    // notice a day instead of one per check, and so a recovery can be announced once. Null means nobody has
    // been told — which is also the state after a recovery.
    sql: `
ALTER TABLE sources ADD COLUMN alerted_at timestamptz;
`,
  },
];
