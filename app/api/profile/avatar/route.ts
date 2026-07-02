import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Persists avatar_url via the service role client instead of the browser's
// RLS-scoped update — writes to profiles from the client were silently
// affecting 0 rows for reasons not worth chasing further.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { path } = await request.json()
  if (typeof path !== 'string' || !path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: pub } = admin.storage.from('avatars').getPublicUrl(path)
  const url = `${pub.publicUrl}?t=${Date.now()}`

  const { error } = await admin.from('profiles').update({ avatar_url: url }).eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ url })
}
