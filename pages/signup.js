import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'

export default function StaffSignup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const router = useRouter()

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    // 1. Create the Auth Account in Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password: password,
    })

    if (authError) {
      setMessage({ type: 'error', text: authError.message })
      setLoading(false)
      return
    }

    if (authData.user) {
      // 2. Link the existing profile to this new Auth User
      // We look for the row you created in Settings using the email
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('email')
        .eq('email', email.toLowerCase().trim())
        .single()

      if (existingProfile) {
        // If a profile was pre-registered, update it with the real Auth ID
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ id: authData.user.id })
          .eq('email', email.toLowerCase().trim())
        
        if (updateError) console.error("Link Error:", updateError.message)
      } else {
        // 3. If no pre-existing profile was found, create a new one from scratch
        const { error: insertError } = await supabase
          .from('profiles')
          .insert([
            { 
              id: authData.user.id, 
              email: email.toLowerCase().trim(), 
              role: 'Service Staff' 
            }
          ])
        
        if (insertError) console.error("Insert Error:", insertError.message)
      }

      setMessage({ 
        type: 'success', 
        text: 'Signup successful! Please check your email for a confirmation link before logging in.' 
      })
      
      // Optional: Redirect to login after a short delay
      setTimeout(() => router.push('/'), 5000)
    }
    
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl shadow-blue-900/10 p-10 border border-slate-100">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black text-blue-950 uppercase tracking-tighter">Staff Onboarding</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Opolo CBT Resort • 2026 Cycle</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-2 block">Official Email Address</label>
            <input 
              type="email" 
              className="w-full p-4 rounded-2xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-600 outline-none font-bold text-sm"
              placeholder="name@opolocbt.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-2 block">Create Password</label>
            <input 
              type="password" 
              className="w-full p-4 rounded-2xl bg-slate-50 border-none ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-600 outline-none font-bold text-sm"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {message && (
            <div className={`p-4 rounded-xl text-xs font-bold uppercase tracking-wide ${message.type === 'error' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
              {message.text}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-950 text-white p-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-black transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Create Staff Account'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <Link href="/" className="text-[10px] font-black text-slate-400 uppercase hover:text-blue-600 transition">
            Already have an account? Login Here
          </Link>
        </div>
      </div>
    </div>
  )
}