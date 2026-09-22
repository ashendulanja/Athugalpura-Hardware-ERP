// Supabase Edge Function: admin-users
// Deploy with: supabase functions deploy admin-users
// Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as function secrets.
// The service-role key NEVER belongs in the browser/GitHub Pages config.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function syntheticEmail(username: string) {
  const normalized = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_')
  return `${normalized}@login.hardwareerp.local`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization') || ''
    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const adminClient = createClient(url, serviceKey, { auth: { autoRefreshToken:false, persistSession:false } })

    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) throw new Error('Unauthorized')
    const { data: actor, error: profileErr } = await adminClient.from('profiles').select('id,tenant_id,role,display_name').eq('id',user.id).single()
    if (profileErr || !actor) throw new Error('Profile not found')
    if (!['super_admin','shop_admin'].includes(actor.role)) throw new Error('Insufficient permission')

    const body = await req.json()
    const action = body.action

    if (action === 'create') {
      const tenantId = actor.role === 'super_admin' ? body.tenantId : actor.tenant_id
      if (!tenantId) throw new Error('Tenant is required')
      if (actor.role === 'shop_admin' && body.role === 'shop_admin') throw new Error('Shop Admin cannot create another Shop Admin')
      const username = String(body.username || '').trim()
      const password = String(body.password || '')
      if (!username || password.length < 8) throw new Error('Username and password (8+ chars) are required')
      const email = syntheticEmail(username)
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({ email, password, email_confirm:true })
      if (createErr) throw createErr
      const { error: insertErr } = await adminClient.from('profiles').insert({
        id: created.user.id, tenant_id: tenantId, username, display_name: body.displayName || username,
        role: body.role || 'cashier', branch: body.branch || 'Main Branch', status:'active', must_change_password:true
      })
      if (insertErr) { await adminClient.auth.admin.deleteUser(created.user.id); throw insertErr }
      await adminClient.from('audit_logs').insert({tenant_id:tenantId,actor_id:actor.id,action:'USER_CREATE',entity_type:'profile',entity_id:created.user.id,detail:`Created ${username}`})
      return new Response(JSON.stringify({ ok:true, userId:created.user.id, username, temporaryPassword:password }), { headers:{...corsHeaders,'Content-Type':'application/json'} })
    }

    if (action === 'reset-password') {
      const targetId = body.userId
      const newPassword = String(body.password || '')
      if (newPassword.length < 8) throw new Error('Password must contain at least 8 characters')
      const { data: target, error } = await adminClient.from('profiles').select('id,tenant_id,username,role').eq('id',targetId).single()
      if (error || !target) throw new Error('User not found')
      if (actor.role !== 'super_admin' && target.tenant_id !== actor.tenant_id) throw new Error('Access denied')
      await adminClient.auth.admin.updateUserById(targetId,{password:newPassword})
      await adminClient.from('profiles').update({must_change_password:true}).eq('id',targetId)
      await adminClient.from('audit_logs').insert({tenant_id:target.tenant_id,actor_id:actor.id,action:'PASSWORD_RESET',entity_type:'profile',entity_id:targetId,detail:`Reset password for ${target.username}`})
      return new Response(JSON.stringify({ok:true,temporaryPassword:newPassword}),{headers:{...corsHeaders,'Content-Type':'application/json'}})
    }

    if (action === 'update-profile') {
      const targetId = body.userId
      const { data: target, error } = await adminClient.from('profiles').select('id,tenant_id,username,role').eq('id',targetId).single()
      if (error || !target) throw new Error('User not found')
      if (actor.role !== 'super_admin' && target.tenant_id !== actor.tenant_id) throw new Error('Access denied')
      if (actor.role !== 'super_admin' && body.role === 'shop_admin') throw new Error('Only Super Admin can assign Shop Admin')
      const patch: Record<string, unknown> = {}
      if (body.displayName) patch.display_name = String(body.displayName)
      if (body.role) patch.role = body.role
      if (body.branch !== undefined) patch.branch = String(body.branch || '')
      if (body.status) patch.status = body.status === 'suspended' ? 'suspended' : 'active'
      const { error: updateError } = await adminClient.from('profiles').update(patch).eq('id',targetId)
      if (updateError) throw updateError
      await adminClient.from('audit_logs').insert({tenant_id:target.tenant_id,actor_id:actor.id,action:'USER_UPDATE',entity_type:'profile',entity_id:targetId,detail:`Updated ${target.username}`})
      return new Response(JSON.stringify({ok:true}),{headers:{...corsHeaders,'Content-Type':'application/json'}})
    }

    if (action === 'set-status') {
      const targetId = body.userId
      const desired = body.status === 'suspended' ? 'suspended' : 'active'
      const { data: target, error } = await adminClient.from('profiles').select('id,tenant_id,username').eq('id',targetId).single()
      if (error || !target) throw new Error('User not found')
      if (actor.role !== 'super_admin' && target.tenant_id !== actor.tenant_id) throw new Error('Access denied')
      await adminClient.from('profiles').update({status:desired}).eq('id',targetId)
      await adminClient.from('audit_logs').insert({tenant_id:target.tenant_id,actor_id:actor.id,action:'USER_STATUS',entity_type:'profile',entity_id:targetId,detail:`Status changed to ${desired}`})
      return new Response(JSON.stringify({ok:true,status:desired}),{headers:{...corsHeaders,'Content-Type':'application/json'}})
    }

    throw new Error('Unknown action')
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:e instanceof Error ? e.message : String(e) }), { status:400, headers:{...corsHeaders,'Content-Type':'application/json'} })
  }
})
