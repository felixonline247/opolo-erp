import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'

export default function Broadcast() {
  const [services, setServices] = useState([])
  const [selectedService, setSelectedService] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [targetCount, setTargetCount] = useState(0)
  
  const router = useRouter()

  useEffect(() => {
    checkManagerAccess()
    fetchServices()
  }, [])

  // Update target count whenever the service selection changes
  useEffect(() => {
    if (selectedService) {
      updateTargetCount()
    } else {
      setTargetCount(0)
    }
  }, [selectedService])

  const checkManagerAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return router.push('/')
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
    if (profile?.role !== 'Manager') router.push('/dashboard')
    setLoading(false)
  }

  const fetchServices = async () => {
    const { data } = await supabase.from('services').select('id, service_name')
    setServices(data || [])
  }

  const updateTargetCount = async () => {
    const { count } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('service_id', selectedService)
      .in('status', ['Paid', 'Completed']) // Filter: Only Paid or Completed

    setTargetCount(count || 0)
  }

  const handleBulkSend = async (e) => {
    e.preventDefault()
    if (!selectedService || !message) return alert("Please select a service and enter a message.")
    if (targetCount === 0) return alert("No students found in this category.")
    
    if (!confirm(`Are you sure you want to send this SMS to ${targetCount} students?`)) return

    setSending(true)
    try {
      // 1. Fetch all phone numbers for the selected filter
      const { data: students, error } = await supabase
        .from('students')
        .select('phone_number, full_name')
        .eq('service_id', selectedService)
        .in('status', ['Paid', 'Completed'])

      if (error) throw error

      // 2. Prepare the numbers for Termii (Termii bulk uses an array or comma-separated string)
      const phoneNumbers = students.map(s => s.phone_number)

      // 3. Call your internal API route (which we will create next)
      const response = await fetch('/api/send-bulk-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phoneNumbers,
          sms: message
        })
      })

      const result = await response.json()

      if (response.ok) {
        alert(`Successfully queued messages for ${targetCount} students!`)
        setMessage('')
      } else {
        throw new Error(result.error || "Failed to send SMS")
      }

    } catch (err) {
      alert("Error: " + err.message)
    } finally {
      setSending(false)
    }
  }

  if (loading) return null

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-black text-blue-950 uppercase tracking-tighter">Bulk Broadcast</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Opolo CBT Communication Hub</p>
          </div>
          <Link href="/settings" className="text-xs font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest">← Back to Settings</Link>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-blue-900/5">
          <form onSubmit={handleBulkSend} className="space-y-6">
            
            {/* Filter Selection */}
            <div>
              <label className="block text-[10px] font-black text-blue-900 uppercase tracking-widest mb-3 ml-1">Target Service Group</label>
              <select 
                className="w-full p-4 rounded-2xl bg-slate-50 border-none ring-1 ring-slate-200 outline-none text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                required
              >
                <option value="">Select a Service Type...</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.service_name}</option>
                ))}
              </select>
              {selectedService && (
                <p className="mt-2 ml-1 text-[10px] font-bold text-green-600 uppercase">
                  Found: {targetCount} Students (Paid/Completed)
                </p>
              )}
            </div>

            {/* Message Box */}
            <div>
              <label className="block text-[10px] font-black text-blue-900 uppercase tracking-widest mb-3 ml-1">Message Content</label>
              <textarea 
                className="w-full p-6 rounded-2xl bg-slate-50 border-none ring-1 ring-slate-200 outline-none text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all"
                rows="6"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your announcement here..."
                required
              />
            </div>

            {/* Submit Button */}
            <button 
              type="submit"
              disabled={sending || targetCount === 0}
              className="w-full bg-blue-950 text-white p-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] hover:bg-black transition-all disabled:opacity-50 shadow-lg shadow-blue-950/20"
            >
              {sending ? 'Processing Broadcast...' : `Send to ${targetCount} Students`}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}