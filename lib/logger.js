import { supabase } from './supabaseClient'

export const logActivity = async (action, details = "") => {
  const { data: { user } } = await supabase.auth.getUser()
  
  // Get the staff's role from their profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user?.id)
    .single()

  await supabase.from('activity_logs').insert([{
    user_email: user?.email,
    role: profile?.role || 'Staff',
    action: action,
    details: details
  }])
}