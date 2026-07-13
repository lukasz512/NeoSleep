/**
 * Demo database seeder — run with: tsx scripts/seed-demo.ts
 * Connects to DATABASE_URL from environment.
 * Idempotent: skips rows that already exist.
 * Uses the new FHIR-aligned schema: platform + tenant schemas, TPT identities pattern.
 */
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TENANT = "neosleep_pl";

async function run(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET search_path TO "${TENANT}", platform, public`);

    // -------------------------------------------------------------------------
    // platform.companies + platform.tenants — ensure demo company exists
    // -------------------------------------------------------------------------
    const companyResult = await client.query<{ id: string }>(
      `INSERT INTO platform.companies (slug, name, status)
       VALUES ('neosleep', 'NeoSleep', 'active')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    const companyId = companyResult.rows[0]!.id;

    await client.query(
      `INSERT INTO platform.tenants (company_id, slug, name, country_code, locale, timezone)
       VALUES ($1, 'neosleep_pl', 'NeoSleep Poland', 'PL', 'pl', 'Europe/Warsaw')
       ON CONFLICT (slug) DO NOTHING`,
      [companyId]
    );
    console.log(`[seed] company: ${companyId}`);

    // -------------------------------------------------------------------------
    // users — manager + rep (TPT: identities first, then users)
    // -------------------------------------------------------------------------
    const managerIdentityResult = await client.query<{ id: string }>(
      `INSERT INTO identities (title, first_name, last_name, email, phone, language)
       VALUES (NULL, 'Andrzej', 'Wiśniewski', 'manager@demo.com', NULL, 'pl')
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`
    );
    const managerIdentityId = managerIdentityResult.rows[0]!.id;

    const managerResult = await client.query<{ id: string }>(
      `INSERT INTO users (identity_id, google_sub, region, status)
       VALUES ($1, 'local:manager@demo.com', 'Central', 'active')
       ON CONFLICT (google_sub) DO UPDATE SET status = 'active'
       RETURNING id`,
      [managerIdentityId]
    );
    const managerId = managerResult.rows[0]!.id;

    // Assign manager role
    const managerRoleResult = await client.query<{ id: string }>(
      `SELECT id FROM platform.roles WHERE name = 'manager' AND company_id IS NULL`
    );
    if (managerRoleResult.rows[0]) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [managerId, managerRoleResult.rows[0].id]
      );
    }
    console.log(`[seed] manager user: ${managerId}`);

    const repIdentityResult = await client.query<{ id: string }>(
      `INSERT INTO identities (title, first_name, last_name, email, phone, language)
       VALUES (NULL, 'Karolina', 'Nowicka', 'rep@demo.com', NULL, 'pl')
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`
    );
    const repIdentityId = repIdentityResult.rows[0]!.id;

    const repResult = await client.query<{ id: string }>(
      `INSERT INTO users (identity_id, google_sub, region, status)
       VALUES ($1, 'local:rep@demo.com', 'Central', 'active')
       ON CONFLICT (google_sub) DO UPDATE SET status = 'active'
       RETURNING id`,
      [repIdentityId]
    );
    const userId = repResult.rows[0]!.id;

    const repRoleResult = await client.query<{ id: string }>(
      `SELECT id FROM platform.roles WHERE name = 'rep' AND company_id IS NULL`
    );
    if (repRoleResult.rows[0]) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, repRoleResult.rows[0].id]
      );
    }
    console.log(`[seed] rep user: ${userId}`);

    // -------------------------------------------------------------------------
    // organization — 2 healthcare organizations
    // -------------------------------------------------------------------------
    const org1Result = await client.query<{ id: string }>(
      `INSERT INTO organization (name, type, region, status)
       VALUES ('Klinika Snu Warszawa', 'sleep_center', 'Central', 'active')
       ON CONFLICT DO NOTHING
       RETURNING id`
    );
    const org1Id = org1Result.rows[0]?.id ?? (
      await client.query<{ id: string }>(`SELECT id FROM organization WHERE name = 'Klinika Snu Warszawa'`)
    ).rows[0]!.id;
    console.log(`[seed] org1 (Klinika Snu Warszawa): ${org1Id}`);

    const org2Result = await client.query<{ id: string }>(
      `INSERT INTO organization (name, type, region, status)
       VALUES ('Szpital Południowy', 'hospital', 'South', 'active')
       ON CONFLICT DO NOTHING
       RETURNING id`
    );
    const org2Id = org2Result.rows[0]?.id ?? (
      await client.query<{ id: string }>(`SELECT id FROM organization WHERE name = 'Szpital Południowy'`)
    ).rows[0]!.id;
    console.log(`[seed] org2 (Szpital Południowy): ${org2Id}`);

    // -------------------------------------------------------------------------
    // practitioner — 4 HCPs (TPT: identities first, then practitioner)
    // -------------------------------------------------------------------------

    // Practitioner 1: Pulmonologist KOL
    const p1IdentityResult = await client.query<{ id: string }>(
      `INSERT INTO identities (title, first_name, last_name, email, phone, language)
       VALUES ('Dr.', 'Marek', 'Kowalski', 'm.kowalski@klinikasnu.example', '+48600100200', 'pl')
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`
    );
    const p1IdentityId = p1IdentityResult.rows[0]!.id;
    const p1Result = await client.query<{ id: string }>(
      `INSERT INTO practitioner (identity_id, organization_id, national_ids, primary_specialty,
         specialties, influence_tier, region, status)
       VALUES ($1, $2, '{"PL:PWZ": "1234567"}', 'pulmonology',
         ARRAY['pulmonology', 'sleep_medicine'], 'kol', 'Central', 'active')
       ON CONFLICT (identity_id) DO UPDATE SET status = 'active'
       RETURNING id`,
      [p1IdentityId, org1Id]
    );
    const p1Id = p1Result.rows[0]!.id;
    console.log(`[seed] practitioner1 (Marek Kowalski): ${p1Id}`);

    // Practitioner 2: Pulmonologist standard
    const p2IdentityResult = await client.query<{ id: string }>(
      `INSERT INTO identities (title, first_name, last_name, email, phone, language)
       VALUES ('Dr.', 'Anna', 'Zielińska', 'a.zielinska@klinikasnu.example', '+48600200300', 'pl')
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`
    );
    const p2IdentityId = p2IdentityResult.rows[0]!.id;
    const p2Result = await client.query<{ id: string }>(
      `INSERT INTO practitioner (identity_id, organization_id, national_ids, primary_specialty,
         specialties, influence_tier, region, status)
       VALUES ($1, $2, '{"PL:PWZ": "2345678"}', 'pulmonology',
         ARRAY['pulmonology'], 'medium', 'Central', 'active')
       ON CONFLICT (identity_id) DO UPDATE SET status = 'active'
       RETURNING id`,
      [p2IdentityId, org1Id]
    );
    const p2Id = p2Result.rows[0]!.id;
    console.log(`[seed] practitioner2 (Anna Zielińska): ${p2Id}`);

    // Practitioner 3: Sleep medicine KOL
    const p3IdentityResult = await client.query<{ id: string }>(
      `INSERT INTO identities (title, first_name, last_name, email, phone, language)
       VALUES ('Prof.', 'Tomasz', 'Wróblewski', 't.wroblewski@szpitalpoludniowy.example', '+48500300400', 'pl')
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`
    );
    const p3IdentityId = p3IdentityResult.rows[0]!.id;
    const p3Result = await client.query<{ id: string }>(
      `INSERT INTO practitioner (identity_id, organization_id, national_ids, primary_specialty,
         specialties, influence_tier, region, status)
       VALUES ($1, $2, '{"PL:PWZ": "3456789"}', 'sleep_medicine',
         ARRAY['sleep_medicine', 'pulmonology', 'neurology'], 'kol', 'South', 'active')
       ON CONFLICT (identity_id) DO UPDATE SET status = 'active'
       RETURNING id`,
      [p3IdentityId, org2Id]
    );
    const p3Id = p3Result.rows[0]!.id;
    console.log(`[seed] practitioner3 (Tomasz Wróblewski): ${p3Id}`);

    // Practitioner 4: ENT
    const p4IdentityResult = await client.query<{ id: string }>(
      `INSERT INTO identities (title, first_name, last_name, email, phone, language)
       VALUES ('Dr.', 'Ewa', 'Dąbrowska', 'e.dabrowska@szpitalpoludniowy.example', '+48500400500', 'pl')
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`
    );
    const p4IdentityId = p4IdentityResult.rows[0]!.id;
    const p4Result = await client.query<{ id: string }>(
      `INSERT INTO practitioner (identity_id, organization_id, national_ids, primary_specialty,
         specialties, influence_tier, region, status)
       VALUES ($1, $2, '{"PL:PWZ": "4567890"}', 'ent',
         ARRAY['ent'], 'low', 'South', 'active')
       ON CONFLICT (identity_id) DO UPDATE SET status = 'active'
       RETURNING id`,
      [p4IdentityId, org2Id]
    );
    const p4Id = p4Result.rows[0]!.id;
    console.log(`[seed] practitioner4 (Ewa Dąbrowska): ${p4Id}`);

    // -------------------------------------------------------------------------
    // lead — 3 leads (TPT: identities first)
    // -------------------------------------------------------------------------
    const leadData = [
      { salutation: "Dr.", first_name: "Piotr",      last_name: "Mazur",        email: "p.mazur@hospital-north.example",    status: "new",       region: "North" },
      { salutation: "Dr.", first_name: "Izabela",    last_name: "Nowak",        email: "i.nowak@clinic-west.example",       status: "contacted", region: "West"  },
      { salutation: "Dr.", first_name: "Krzysztof",  last_name: "Wiśniewski",   email: "k.wisniewski@medcenter.example",    status: "qualified", region: "Central" },
    ];
    for (const l of leadData) {
      const liResult = await client.query<{ id: string }>(
        `INSERT INTO identities (title, first_name, last_name, email, language)
         VALUES ($1, $2, $3, $4, 'pl')
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
         RETURNING id`,
        [l.salutation, l.first_name, l.last_name, l.email]
      );
      await client.query(
        `INSERT INTO lead (identity_id, status, region, assigned_to)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (identity_id) DO NOTHING`,
        [liResult.rows[0]!.id, l.status, l.region, userId]
      );
    }
    console.log("[seed] leads inserted");

    // -------------------------------------------------------------------------
    // encounter — 2 planned visits
    // -------------------------------------------------------------------------
    const enc1Result = await client.query<{ id: string }>(
      `INSERT INTO encounter (user_id, practitioner_id, organization_id, type, status,
         start_at, end_at, region)
       VALUES ($1, $2, $3, 'visit', 'planned',
         now() + interval '1 day', now() + interval '1 day 1 hour', 'Central')
       RETURNING id`,
      [userId, p1Id, org1Id]
    );
    console.log(`[seed] encounter1: ${enc1Result.rows[0]!.id}`);

    const enc2Result = await client.query<{ id: string }>(
      `INSERT INTO encounter (user_id, practitioner_id, organization_id, type, status,
         start_at, end_at, region)
       VALUES ($1, $2, $3, 'visit', 'planned',
         now() + interval '3 days', now() + interval '3 days 1 hour', 'South')
       RETURNING id`,
      [userId, p3Id, org2Id]
    );
    console.log(`[seed] encounter2: ${enc2Result.rows[0]!.id}`);

    // -------------------------------------------------------------------------
    // app_config — NeoSleep brand colors
    // -------------------------------------------------------------------------
    await client.query(
      `INSERT INTO app_config (tenant_name, primary_color, secondary_color, primary_color_dark,
         secondary_color_dark, pwa_theme_color)
       VALUES ('NeoSleep Poland', '#128F83', '#474747', '#17b5a5', '#0f9284', '#128F83')
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
