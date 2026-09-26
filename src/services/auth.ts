import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type NexusProfile = {
  id: string
  customer_number: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  preferred_contact_method: string | null
  account_status: string | null
  membership_id: string | null
  memberships: {
    name: string
    benefits: string[]
  } | null
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })

  if (error) throw error

  await claimExistingProfile()

  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}


const NEXUS_RECOVERY_URL = 'https://nexus.sciencebyhugs.com/?mode=recovery'

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: NEXUS_RECOVERY_URL,
  })
  if (error) throw error
}

export async function updatePassword(newPassword: string) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  })
  if (error) throw error
  return data
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
) {
  const user = await getCurrentUser()
  if (!user?.email) throw new Error('Signed-in email could not be loaded.')

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })

  if (verifyError) {
    throw new Error('Current password is incorrect.')
  }

  return updatePassword(newPassword)
}

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user
}

export async function claimExistingProfile() {
  const { data, error } = await supabase.functions.invoke('claim-existing-profile', {
    method: 'POST',
    body: {},
  })

  if (error) throw error
  return data
}

export async function getMyProfile(): Promise<NexusProfile | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id,customer_number,first_name,last_name,email,phone,preferred_contact_method,account_status,membership_id,memberships(name,benefits)')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (error) throw error
  return data as NexusProfile | null
}

export function onAuthChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })
}
