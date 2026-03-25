import 'dotenv/config';
import pg from 'pg';
import crypto from 'node:crypto';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

interface GeneratedKey {
  raw: string;
  hash: string;
  prefix: string;
}

function generateApiKey(): GeneratedKey {
  const raw = `ne_test_${crypto.randomBytes(32).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const prefix = raw.substring(0, 8);
  return { raw, hash, prefix };
}

async function seed(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── Tenant 1: Acme Corp (free plan) ──
    const acmeResult = await client.query(`
      INSERT INTO tenants (name, slug, plan, rate_limit_per_sec, monthly_quota, max_channels)
      VALUES ('Acme Corp', 'acme-corp', 'free', 10, 10000, 3)
      ON CONFLICT (slug) DO NOTHING
      RETURNING id
    `);
    const acmeId = acmeResult.rows[0]?.id;

    // ── Tenant 2: Globex Industries (business plan) ──
    const globexResult = await client.query(`
      INSERT INTO tenants (name, slug, plan, rate_limit_per_sec, monthly_quota, max_channels)
      VALUES ('Globex Industries', 'globex', 'business', 50, 100000, 10)
      ON CONFLICT (slug) DO NOTHING
      RETURNING id
    `);
    const globexId = globexResult.rows[0]?.id;

    if (!acmeId || !globexId) {
      console.log('Seed data already exists. Skipping.');
      await client.query('ROLLBACK');
      return;
    }

    // ── API keys (no RLS on api_keys table) ──
    const acmeKey = generateApiKey();
    const globexKey = generateApiKey();

    await client.query(
      `INSERT INTO api_keys (tenant_id, key_hash, key_prefix, label, scopes)
       VALUES ($1, $2, $3, $4, $5)`,
      [acmeId, acmeKey.hash, acmeKey.prefix, 'Dev key', '{notifications:write,notifications:read}'],
    );

    await client.query(
      `INSERT INTO api_keys (tenant_id, key_hash, key_prefix, label, scopes)
       VALUES ($1, $2, $3, $4, $5)`,
      [globexId, globexKey.hash, globexKey.prefix, 'Dev key', '{notifications:write,notifications:read}'],
    );

    // ── Channels + usage for Acme (RLS-protected tables) ──
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [acmeId]);

    await client.query(
      `INSERT INTO channels (tenant_id, type, label, config, priority, is_enabled, circuit_state)
       VALUES
         ($1, 'email', 'Email (Mailpit)', '{"smtp_host": "mailpit", "smtp_port": 1025}', 10, true, 'closed'),
         ($1, 'websocket', 'In-App WebSocket', '{}', 5, true, 'closed'),
         ($1, 'webhook', 'Generic Webhook', '{"url": "https://httpbin.org/post"}', 1, true, 'closed')`,
      [acmeId],
    );

    const periodStart = new Date();
    periodStart.setDate(1);
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    const periodStartStr = periodStart.toISOString().split('T')[0];
    const periodEndStr = periodEnd.toISOString().split('T')[0];

    await client.query(
      `INSERT INTO usage_records (tenant_id, period_start, period_end)
       VALUES ($1, $2, $3)`,
      [acmeId, periodStartStr, periodEndStr],
    );

    // ── Channels + usage for Globex (RLS-protected tables) ──
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [globexId]);

    await client.query(
      `INSERT INTO channels (tenant_id, type, label, config, priority, is_enabled, circuit_state)
       VALUES
         ($1, 'email', 'Email (Mailpit)', '{"smtp_host": "mailpit", "smtp_port": 1025}', 10, true, 'closed'),
         ($1, 'sms_webhook', 'SMS Webhook', '{"url": "https://httpbin.org/post"}', 8, true, 'closed'),
         ($1, 'websocket', 'In-App WebSocket', '{}', 5, true, 'closed')`,
      [globexId],
    );

    await client.query(
      `INSERT INTO usage_records (tenant_id, period_start, period_end)
       VALUES ($1, $2, $3)`,
      [globexId, periodStartStr, periodEndStr],
    );

    // ── Reset tenant context ──
    await client.query("SELECT set_config('app.current_tenant_id', '', false)");

    await client.query('COMMIT');

    console.log('');
    console.log('Seed complete.');
    console.log('');
    console.log('════════════════════════════════════════════════');
    console.log('  DEV API KEYS');
    console.log('════════════════════════════════════════════════');
    console.log('');
    console.log(`  Tenant: Acme Corp`);
    console.log(`  API Key: ${acmeKey.raw}`);
    console.log('');
    console.log(`  Tenant: Globex Industries`);
    console.log(`  API Key: ${globexKey.raw}`);
    console.log('');
    console.log('  Save these - they are shown once and never stored.');
    console.log('════════════════════════════════════════════════');
    console.log('');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
