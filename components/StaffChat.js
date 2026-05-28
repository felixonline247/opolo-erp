import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function StaffChat({ currentUser }) {
  const [staffList, setStaffList] = useState([])
  const [onlineStaffIds, setOnlineStaffIds] = useState([])
  const [selectedStaff, setSelectedStaff] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  
  // NEW: Dedicated sound and visual neon-pulse state vectors
  const [isGlowing, setIsGlowing] = useState(false)
  const scrollRef = useRef()
  const audioRef = useRef(null)

  const NOTIFICATION_SOUND = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3"

  // 1. Fetch All Staff Profiles and Subscribe to Realtime Presence (Online/Offline status)
  useEffect(() => {
    fetchStaffProfiles()
    audioRef.current = new Audio(NOTIFICATION_SOUND)

    // Monitor Online States using Supabase Realtime Presence
    const presenceChannel = supabase.channel('online_staff_tracker', {
      config: { presence: { key: currentUser.id } }
    })

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState()
        // Extract array of active keys logged into the presence dictionary
        const activeIds = Object.keys(state)
        setOnlineStaffIds(activeIds)
      })
      .on('presence', { event: 'join', key: currentUser.id }, () => {})
      .on('presence', { event: 'leave', key: currentUser.id }, () => {})
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track current user's profile metadata properties
          await presenceChannel.track({ 
            online_at: new Date().toISOString(),
            name: currentUser.name 
          })
        }
      })

    return () => {
      supabase.removeChannel(presenceChannel)
    }
  }, [currentUser.id])

  // 2. Private Conversation Live Subscription: Listen for messages sent to or by current user
  useEffect(() => {
    if (!selectedStaff) return

    fetchPrivateConversation()

    const msgChannel = supabase
      .channel(`private_chat_${currentUser.id}_${selectedStaff.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'staff_messages'
      }, (payload) => {
        const incoming = payload.new
        
        // Match conditions: belongs to the current open private 1-on-1 viewport
        const isFromSelected = incoming.sender_id === selectedStaff.id && incoming.recipient_id === currentUser.id
        const isToSelected = incoming.sender_id === currentUser.id && incoming.recipient_id === selectedStaff.id

        if (isFromSelected || isToSelected) {
          if (isFromSelected) {
            triggerGlowAndSound()
          }
          fetchPrivateConversation()
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(msgChannel)
    }
  }, [selectedStaff, currentUser.id])

  // Auto-scroll layout handler
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchStaffProfiles = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .neq('id', currentUser.id) // Hide yourself from the listing
      .order('full_name', { ascending: true })

    if (data) setStaffList(data)
  }

  const fetchPrivateConversation = async () => {
    if (!selectedStaff) return
    
    // Construct lookup constraint filter logic properties mapping pairs securely
    const { data } = await supabase
      .from('staff_messages')
      .select(`
        id, content, created_at, sender_id, recipient_id,
        profiles!staff_messages_sender_id_fkey(full_name, role)
      `)
      .or(`and(sender_id.eq.${currentUser.id},recipient_id.eq.${selectedStaff.id}),and(sender_id.eq.${selectedStaff.id},recipient_id.eq.${currentUser.id})`)
      .order('created_at', { ascending: true })

    if (data) setMessages(data)
  }

  const triggerGlowAndSound = () => {
    // Play Audio file directly 
    audioRef.current?.play().catch(() => console.log("Audio contextual override policy restriction hit."))
    
    // Toggle active border ring glow animation profiles on the dashboard container
    setIsGlowing(true)
    setTimeout(() => setIsGlowing(false), 2500)

    // Tab notification banner string adjustment
    const originalTitle = document.title
    document.title = "💬 Private Message Received!"
    setTimeout(() => { document.title = originalTitle }, 3000)
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedStaff) return

    const { error } = await supabase
      .from('staff_messages')
      .insert({
        content: newMessage.trim(),
        sender_id: currentUser.id,
        recipient_id: selectedStaff.id
      })

    if (!error) {
      setNewMessage('')
      fetchPrivateConversation()
    }
  }

  return (
    <div className={`flex h-full w-full overflow-hidden bg-slate-50 transition-all duration-300 ${isGlowing ? 'ring-8 ring-blue-500 shadow-[0_0_40px_rgba(59,130,246,0.6)]' : ''}`}>
      
      {/* LEFT SIDEBAR: Active Staff Index Panel */}
      <div className="w-[160px] md:w-[180px] border-r bg-white flex flex-col h-full overflow-y-auto">
        <div className="p-4 border-b bg-slate-50/50">
          <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Staff Contacts</p>
        </div>
        <div className="divide-y divide-slate-100 flex-1">
          {staffList.map((staff) => {
            const isOnline = onlineStaffIds.includes(staff.id)
            const isSelected = selectedStaff?.id === staff.id
            return (
              <div
                key={staff.id}
                onClick={() => { setSelectedStaff(staff); setMessages([]); }}
                className={`p-4 cursor-pointer transition-all flex flex-col gap-1 text-left ${isSelected ? 'bg-blue-900 text-white' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-1.5 w-full justify-between">
                  <span className={`text-xs font-black truncate max-w-[85%] ${isSelected ? 'text-white' : 'text-blue-950'}`}>
                    {staff.full_name}
                  </span>
                  
                  {/* Realtime dynamic status marker indicator badge */}
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-slate-300'}`} />
                </div>
                <span className={`text-[8px] font-bold uppercase ${isSelected ? 'text-blue-200' : 'text-slate-400'}`}>
                  {staff.role}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* RIGHT CHAT CONTAINER FRAMEWORK */}
      <div className="flex-1 flex flex-col h-full bg-white">
        {selectedStaff ? (
          <>
            {/* Active Window Room Header */}
            <div className="p-4 border-b bg-white flex justify-between items-center shrink-0">
              <div className="text-left">
                <h4 className="text-xs font-black uppercase text-blue-950 tracking-wide">
                  {selectedStaff.full_name}
                </h4>
                <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest">
                  Direct Line ({selectedStaff.role})
                </p>
              </div>
              {onlineStaffIds.includes(selectedStaff.id) && (
                <span className="bg-green-50 border border-green-100 text-green-600 px-2.5 py-1 rounded-full text-[8px] font-black uppercase animate-pulse">
                  Online Now
                </span>
              )}
            </div>

            {/* Conversation Core Body Messages Screen */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
              {messages.map((msg) => {
                const isMe = msg.sender_id === currentUser.id
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] p-3.5 rounded-[1.5rem] text-xs font-bold shadow-sm ${
                      isMe ? 'bg-blue-950 text-white rounded-tr-none' : 'bg-white text-blue-950 border border-slate-200 rounded-tl-none'
                    }`}>
                      {msg.content}
                    </div>
                    <span className="text-[7px] font-bold text-slate-300 uppercase mt-1 px-1">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )
              })}
              <div ref={scrollRef} />
            </div>

            {/* Form Input Messenger Action Core Layout */}
            <form onSubmit={handleSendMessage} className="p-4 bg-white border-t flex gap-2 shrink-0">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={`Type a private message...`}
                className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-3 text-xs font-bold text-blue-950 outline-none ring-1 ring-slate-200/50 focus:ring-blue-900 transition-all"
              />
              <button type="submit" className="bg-blue-900 text-white px-5 rounded-xl font-black text-[9px] uppercase tracking-wider hover:bg-blue-800 transition-all">
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/30">
            <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 009 11.5V10m.458 4.735C10.747 12.016 11.75 8.843 11.75 5.5 11.75 3.012 11.018.735 9.765-1.5M12 11a14.12 14.12 0 001.5-6.5C13.5 2.012 12.765-.265 11.5-2.5m4.337 14.152c-.521-.52-1.077-1.01-1.666-1.467m-3.44 2.04L13.5 21M7 11h.01M17 11h.01" /></svg>
            </div>
            <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">No Active Chat</h5>
            <p className="text-[8px] font-bold text-slate-300 uppercase mt-0.5">Select a staff contact on the left to initialize private messaging.</p>
          </div>
        )}
      </div>
    </div>
  )
}