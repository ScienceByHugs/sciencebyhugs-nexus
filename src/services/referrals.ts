import { supabase } from './supabase'

export type ReferralMilestone = {
  count: number
  label: string
  type: string
}

export type ReferralDashboard = {
  success: boolean
  referralCode: string
  totalReferrals: number
  qualifiedReferrals: number
  pendingReferrals: number
  referrals: Array<{
    id: string
    name: string
    status: string
    referredAt: string
    qualifiedAt: string | null
    qualifyingOrderNumber: string | null
  }>
  milestones: ReferralMilestone[]
}

export async function getReferralDashboard(): Promise<ReferralDashboard> {
  const { data, error } = await supabase.functions.invoke('referral-dashboard', {
    body: { action: 'dashboard' },
  })

  if (error) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : error.message || 'Could not load referral rewards.',
    )
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Could not load referral rewards.')
  }

  return data as ReferralDashboard
}

export async function claimReferral(referralCode: string) {
  const { data, error } = await supabase.functions.invoke('referral-dashboard', {
    body: {
      action: 'claim',
      referralCode,
    },
  })

  if (error) {
    const reason = data?.reason
    if (reason === 'self_referral' || reason === 'invalid_code') {
      return data
    }

    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : error.message || 'Could not apply referral.',
    )
  }

  return data
}

export function buildReferralLink(referralCode: string) {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('ref', referralCode)
  return url.toString()
}
