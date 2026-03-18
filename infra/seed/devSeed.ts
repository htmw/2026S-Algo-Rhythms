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

function generateApiKey(environment: 'live' | 'test'): GeneratedKey {
  const raw = `ne_${environment}_${crypto.randomBytes(32).toString('hex')}`;
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

    // ── API keys ──
    const acmeKey = generateApiKey('test');
    const globexKey = generateApiKey('test');

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

    // ── Channels for Acme ──
    await client.query(
      `INSERT INTO channels (tenant_id, type, label, config, priority)
       VALUES
         ($1, 'email', 'Email (Mailpit)', '{"smtp_host": "mailpit", "smtp_port": 1025}', 10),
         ($1, 'websocket', 'In-App WebSocket', '{}', 5),
         ($1, 'webhook', 'Generic Webhook', '{"url": "https://httpbin.org/post"}', 1)`,
      [acmeId],
    );

    // ── Channels for Globex ──
    await client.query(
      `INSERT INTO channels (tenant_id, type, label, config, priority)
       VALUES
         ($1, 'email', 'Email (Mailpit)', '{"smtp_host": "mailpit", "smtp_port": 1025}', 10),
         ($1, 'sms_webhook', 'SMS Webhook', '{"url": "https://httpbin.org/post"}', 8),
         ($1, 'websocket', 'In-App WebSocket', '{}', 5)`,
      [globexId],
    );

    // ── Usage records (current period) ──
    const periodStart = new Date();
    periodStart.setDate(1);
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await client.query(
      `INSERT INTO usage_records (tenant_id, period_start, period_end)
       VALUES ($1, $2, $3), ($4, $2, $3)`,
      [acmeId, periodStart.toISOString().split('T')[0], periodEnd.toISOString().split('T')[0], globexId],
    );

    await client.query('COMMIT');

    console.log('Seed complete.');
    console.log('');
    console.log('=== DEV API KEYS (save these — they cannot be retrieved later) ===');
    console.log(`Acme Corp:         ${acmeKey.raw}`);
    console.log(`Globex Industries: ${globexKey.raw}`);
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
