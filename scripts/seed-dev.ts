/**
 * Dev database seeder — run with: tsx scripts/seed-dev.ts
 * Connects to DATABASE_URL from environment.
 * Idempotent: skips rows that already exist.
 */
import pg from "pg";
import crypto from "crypto";

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // -------------------------------------------------------------------------
    // neo.tenants — 1 demo tenant
    // -------------------------------------------------------------------------
    const tenantResult = await client.query<{ id: string }>(
      `INSERT INTO neo.tenants (slug, name, status)
       VALUES ('demo', 'Demo Pharma', 'active')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    const tenantId = tenantResult.rows[0]!.id;
    console.log(`[seed] tenant: ${tenantId}`);

    // -------------------------------------------------------------------------
    // tbl_users — 1 rep + 1 manager
    // -------------------------------------------------------------------------
    const managerResult = await client.query<{ id: string }>(
      `INSERT INTO tbl_users (email, first_name, last_name, name, role, provider, provider_id, region, language)
       VALUES ('manager@demo.com', 'Andrzej', 'Wiśniewski', 'Andrzej Wiśniewski', 'manager', 'local', 'manager@demo.com', 'Central', 'pl')
       ON CONFLICT (provider, provider_id) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`
    );
    const managerId = managerResult.rows[0]!.id;
    console.log(`[seed] manager: ${managerId}`);

    const repResult = await client.query<{ id: string }>(
      `INSERT INTO tbl_users (email, first_name, last_name, name, role, provider, provider_id, region, manager_id, language)
       VALUES ('rep@demo.com', 'Karolina', 'Nowicka', 'Karolina Nowicka', 'rep', 'local', 'rep@demo.com', 'Central', $1, 'pl')
       ON CONFLICT (provider, provider_id) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [managerId]
    );
    const repId = repResult.rows[0]!.id;
    console.log(`[seed] rep: ${repId}`);

    // -------------------------------------------------------------------------
    // tbl_hco — 2 organizations
    // -------------------------------------------------------------------------
    const hco1Result = await client.query<{ id: string }>(
      `INSERT INTO tbl_hco (name, type, city, region, status)
       VALUES ('Klinika Snu Warszawa', 'clinic', 'Warszawa', 'Central', 'active')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    const hco1Id = hco1Result.rows[0]!.id;
    console.log(`[seed] hco1 (Klinika Snu Warszawa): ${hco1Id}`);

    const hco2Result = await client.query<{ id: string }>(
      `INSERT INTO tbl_hco (name, type, city, region, status)
       VALUES ('Szpital Południowy', 'hospital', 'Kraków', 'South', 'active')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    const hco2Id = hco2Result.rows[0]!.id;
    console.log(`[seed] hco2 (Szpital Południowy): ${hco2Id}`);

    // -------------------------------------------------------------------------
    // tbl_hcp — 4 healthcare professionals
    // -------------------------------------------------------------------------

    // HCP 1: Pulmonologist, influence A, champion
    const hcp1Result = await client.query<{ id: string }>(
      `INSERT INTO tbl_hcp (
         hco_id, primary_hco_id, title, first_name, last_name, email, phone,
         primary_specialty, role, influence_tier, engagement_level,
         prescribing_volume, is_key_opinion_leader, region, status,
         language, visit_count
       ) VALUES (
         $1, $1, 'Dr.', 'Marek', 'Kowalski', 'm.kowalski@klinikasnu.example', '+48 600 100 200',
         'Pulmonology', 'doctor', 'A', 'champion',
         'high', true, 'Central', 'active',
         'pl', 3
       )
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [hco1Id]
    );
    const hcp1Id = hcp1Result.rows[0]!.id;
    console.log(`[seed] hcp1 (Marek Kowalski): ${hcp1Id}`);

    // HCP 2: Pulmonologist, influence B, neutral
    const hcp2Result = await client.query<{ id: string }>(
      `INSERT INTO tbl_hcp (
         hco_id, primary_hco_id, title, first_name, last_name, email, phone,
         primary_specialty, role, influence_tier, engagement_level,
         prescribing_volume, region, status, language, visit_count
       ) VALUES (
         $1, $1, 'Dr.', 'Anna', 'Zielińska', 'a.zielinska@klinikasnu.example', '+48 600 200 300',
         'Pulmonology', 'doctor', 'B', 'neutral',
         'medium', 'Central', 'active', 'pl', 1
       )
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [hco1Id]
    );
    const hcp2Id = hcp2Result.rows[0]!.id;
    console.log(`[seed] hcp2 (Anna Zielińska): ${hcp2Id}`);

    // HCP 3: Sleep medicine specialist, influence A, champion
    const hcp3Result = await client.query<{ id: string }>(
      `INSERT INTO tbl_hcp (
         hco_id, primary_hco_id, title, first_name, last_name, email, phone,
         primary_specialty, role, influence_tier, engagement_level,
         prescribing_volume, is_key_opinion_leader, region, status, language, visit_count
       ) VALUES (
         $1, $1, 'Prof.', 'Tomasz', 'Wróblewski', 't.wroblewski@szpitalpoludniowy.example', '+48 500 300 400',
         'Sleep medicine', 'doctor', 'A', 'champion',
         'high', true, 'South', 'active', 'pl', 5
       )
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [hco2Id]
    );
    const hcp3Id = hcp3Result.rows[0]!.id;
    console.log(`[seed] hcp3 (Tomasz Wróblewski): ${hcp3Id}`);

    // HCP 4: ENT doctor, influence C, skeptic
    const hcp4Result = await client.query<{ id: string }>(
      `INSERT INTO tbl_hcp (
         hco_id, primary_hco_id, title, first_name, last_name, email, phone,
         primary_specialty, role, influence_tier, engagement_level,
         prescribing_volume, region, status, language, visit_count
       ) VALUES (
         $1, $1, 'Dr.', 'Ewa', 'Dąbrowska', 'e.dabrowska@szpitalpoludniowy.example', '+48 500 400 500',
         'ENT', 'doctor', 'C', 'skeptic',
         'low', 'South', 'active', 'pl', 0
       )
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [hco2Id]
    );
    const hcp4Id = hcp4Result.rows[0]!.id;
    console.log(`[seed] hcp4 (Ewa Dąbrowska): ${hcp4Id}`);

    // -------------------------------------------------------------------------
    // tbl_leads — 3 leads
    // -------------------------------------------------------------------------
    await client.query(
      `INSERT INTO tbl_leads (name, email, status, region, institution)
       VALUES
         ('Dr. Piotr Mazur',          'p.mazur@hospital-north.example',    'new',       'North',   'Szpital Północny'),
         ('Dr. Izabela Nowak',         'i.nowak@clinic-west.example',       'contacted', 'West',    'Klinika Zachód'),
         ('Dr. Krzysztof Wiśniewski',  'k.wisniewski@medcenter.example',    'qualified', 'Central', 'Centrum Medyczne')
       ON CONFLICT DO NOTHING`
    );
    console.log("[seed] leads inserted");

    // -------------------------------------------------------------------------
    // tbl_events — 2 events linked to HCPs
    // -------------------------------------------------------------------------
    const event1Result = await client.query<{ id: string }>(
      `INSERT INTO tbl_events (rep_id, start_at, end_at, type, title, location, region, status)
       VALUES ($1, now() + interval '1 day', now() + interval '1 day 1 hour', 'f2f',
               'Visit — Dr. Kowalski', 'Klinika Snu Warszawa, ul. Śródmiejska 5', 'Central', 'scheduled')
       RETURNING id`,
      [repId]
    );
    const event1Id = event1Result.rows[0]!.id;
    await client.query(
      `INSERT INTO tbl_event_attendees (event_id, attendee_type, attendee_id, is_primary)
       VALUES ($1, 'hcp', $2, true)`,
      [event1Id, hcp1Id]
    );
    console.log(`[seed] event1: ${event1Id}`);

    const event2Result = await client.query<{ id: string }>(
      `INSERT INTO tbl_events (rep_id, start_at, end_at, type, title, location, region, status)
       VALUES ($1, now() + interval '3 days', now() + interval '3 days 1 hour', 'f2f',
               'Visit — Prof. Wróblewski', 'Szpital Południowy, al. Krakowska 12', 'South', 'scheduled')
       RETURNING id`,
      [repId]
    );
    const event2Id = event2Result.rows[0]!.id;
    await client.query(
      `INSERT INTO tbl_event_attendees (event_id, attendee_type, attendee_id, is_primary)
       VALUES ($1, 'hcp', $2, true)`,
      [event2Id, hcp3Id]
    );
    console.log(`[seed] event2: ${event2Id}`);

    // -------------------------------------------------------------------------
    // tbl_app_config — 1 row with blue primary color
    // -------------------------------------------------------------------------
    await client.query(
      `INSERT INTO tbl_app_config (primary_color, secondary_color, tenant_name)
       VALUES ('#1565c0', '#2e7d32', 'Demo Pharma')
       ON CONFLICT DO NOTHING`
    );
    console.log("[seed] app_config inserted");

    await client.query("COMMIT");
    console.log("[seed] done — all data committed");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[seed] error, rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

void run();
