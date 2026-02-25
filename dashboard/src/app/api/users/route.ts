import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

let _pool: Pool | null = null;
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

function isAdmin(session: any) {
  return session?.user?.role === 'admin';
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const pool = getPool();
  const result = await pool.query(
    `SELECT id, email, name, role, provider, created_at FROM users ORDER BY created_at ASC`
  );
  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { email, name, role, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 10);
  const pool = getPool();
  try {
    const result = await pool.query(
      `INSERT INTO users (email, name, role, password_hash, provider)
       VALUES ($1, $2, $3, $4, 'credentials')
       RETURNING id, email, name, role, created_at`,
      [email, name || null, role || 'viewer', hash]
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (err: any) {
    if (err.code === '23505') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await req.json();
  const pool = getPool();
  await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
