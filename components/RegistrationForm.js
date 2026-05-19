import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { logActivity } from '../lib/logger';

export default function RegistrationForm({ services, onSelect }) {
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [isExistingStudent, setIsExistingStudent] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [consultants, setConsultants] = useState([]); // Tracks active database consultants
  const [isVipRoute, setIsVipRoute] = useState(false); // Checkbox toggle state
  
  const [formData, setFormData] = useState({ 
    name: '', 
    phone: '', 
    jambCode: '', 
    regNumber: '',
    service_id: '',
    assigned_consultant_id: '' // Tracks chosen consultant profile ID
  });

  // Fetch active consultants on initial component mount
  useEffect(() => {
    const fetchActiveConsultants = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('role', 'Consultant')
          .order('full_name', { ascending: true });

        if (!error && data) {
          setConsultants(data);
        }
      } catch (err) {
        console.error("Error loading consultants framework:", err);
      }
    };
    fetchActiveConsultants();
  }, []);

  const handleSearch = async (query) => {
    setFormData({ ...formData, name: query });
    if (query.length < 3) {
      setSearchResults([]);
      setIsExistingStudent(false);
      return;
    }

    const { data, error } = await supabase
      .from('students')
      .select('id, full_name, phone_number, jamb_profile_code, reg_number')
      .or(`full_name.ilike.%${query}%,phone_number.ilike.%${query}%`)
      .limit(5);

    if (!error) setSearchResults(data);
  };

  const selectStudent = (student) => {
    setFormData({
      name: student.full_name,
      phone: student.phone_number,
      jambCode: student.jamb_profile_code || '',
      regNumber: student.reg_number || '',
      service_id: formData.service_id,
      assigned_consultant_id: formData.assigned_consultant_id
    });
    setSelectedStudentId(student.id);
    setIsExistingStudent(true);
    searchResults([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.service_id) return alert("Please select a service.");
    if (isVipRoute && !formData.assigned_consultant_id) return alert("Please choose an assigned consultant for this VIP Student.");
    setLoading(true);

    try {
      const selectedService = services.find(s => String(s.id) === String(formData.service_id));
      const totalCost = Number(selectedService?.price || 0); 
      const instCost = Number(selectedService?.institution_cost || 0);

      const studentPayload = {
        full_name: formData.name, 
        phone_number: formData.phone, 
        jamb_profile_code: formData.jambCode,
        reg_number: formData.regNumber,
        service_id: formData.service_id,
        status: 'Awaiting Payment',
        amount_paid: totalCost,
        institution_cost: instCost,
        assigned_consultant_id: isVipRoute ? formData.assigned_consultant_id : null, // Locks consultant relation to student
        is_deleted: false,
        created_at: new Date()
      };

      const { data: studentRecord, error: studentError } = await supabase
        .from('students')
        .insert([studentPayload])
        .select()
        .single();
      
      if (studentError) throw studentError;
      
      const logMessage = isVipRoute 
        ? `New VIP Service Request: ${formData.name} assigned to Consultant ID: ${formData.assigned_consultant_id}`
        : `New Service Request: ${formData.name} for ${selectedService?.service_name}`;

      await logActivity("Registration", logMessage);
      alert(isVipRoute ? "VIP Request sent! Overridable price workflow routed to Accountant inbox." : "Success! Request sent to Account Office.");
      
      // Reset Form State
      setFormData({ name: '', phone: '', jambCode: '', regNumber: '', service_id: '', assigned_consultant_id: '' });
      setIsExistingStudent(false);
      setIsVipRoute(false);
      setSelectedStudentId(null);
      if (onSelect) onSelect(); 

    } catch (error) {
      console.error("Submission Error:", error);
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100 w-full">
      <h2 className="text-xl font-black text-blue-900 mb-6 border-b pb-2 tracking-tight uppercase">Stage 1: Intake</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1 ml-1">Required Service</label>
          <select
            required
            className="w-full px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-blue-900"
            value={formData.service_id}
            onChange={(e) => setFormData({...formData, service_id: e.target.value})}
          >
            <option value="">-- Choose Service --</option>
            {services?.map(svc => (
              <option key={svc.id} value={svc.id}>{svc.service_name} (₦{svc.price?.toLocaleString()})</option>
            ))}
          </select>
        </div>

        {/* VIP ROUTE ASSIGNMENT TOGGLE LAYER */}
        <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <input 
              type="checkbox" 
              id="vipToggle"
              checked={isVipRoute}
              onChange={(e) => {
                setIsVipRoute(e.target.checked);
                if(!e.target.checked) setFormData({...formData, assigned_consultant_id: ''});
              }}
              className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500"
            />
            <label htmlFor="vipToggle" className="text-xs font-black uppercase text-purple-700 tracking-wide cursor-pointer select-none">
              Assign to a Consultant (VIP Student Route)
            </label>
          </div>

          {/* DYNAMIC CONTEXTUAL DROP-DOWN LIST */}
          {isVipRoute && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-200">
              <label className="block text-[10px] font-black text-purple-600 uppercase tracking-widest mb-1 ml-1">Choose Assigned Consultant</label>
              <select
                required={isVipRoute}
                className="w-full px-4 py-3 bg-purple-50 border border-purple-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm font-bold text-purple-900"
                value={formData.assigned_consultant_id}
                onChange={(e) => setFormData({...formData, assigned_consultant_id: e.target.value})}
              >
                <option value="">-- Select Consultant Name --</option>
                {consultants.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="relative">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Full Name (Search Existing)</label>
          <input 
            type="text" required
            className={`mt-1 block w-full border rounded-xl p-2.5 text-sm outline-none ${isExistingStudent ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-gray-200'}`}
            value={formData.name}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Type name or phone to search..."
          />
          {searchResults.length > 0 && (
            <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl mt-1 shadow-2xl overflow-hidden">
              {searchResults.map(s => (
                <div 
                  key={s.id} 
                  onClick={() => selectStudent(s)}
                  className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 text-sm"
                >
                  <p className="font-bold text-blue-900">{s.full_name}</p>
                  <p className="text-xs text-gray-500">{s.phone_number} | {s.jamb_profile_code}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Phone Number</label>
          <input 
            type="text" required
            className="mt-1 block w-full border border-gray-200 bg-slate-50 rounded-xl p-2.5 text-sm outline-none"
            value={formData.phone}
            onChange={(e) => setFormData({...formData, phone: e.target.value})}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Profile Code</label>
            <input 
              type="text"
              className="mt-1 block w-full border border-gray-200 bg-slate-50 rounded-xl p-2.5 text-sm outline-none"
              value={formData.jambCode}
              onChange={(e) => setFormData({...formData, jambCode: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Reg Number</label>
            <input 
              type="text"
              className="mt-1 block w-full border border-gray-200 bg-slate-50 rounded-xl p-2.5 text-sm outline-none"
              value={formData.regNumber}
              onChange={(e) => setFormData({...formData, regNumber: e.target.value})}
            />
          </div>
        </div>

        <button 
          type="submit" disabled={loading}
          className={`w-full py-4 px-4 rounded-xl text-white font-black transition-all shadow-lg uppercase tracking-tighter ${loading ? 'bg-gray-400' : 'bg-blue-900 hover:bg-black'}`}
        >
          {loading ? "Processing..." : "Send to Account Office"}
        </button>
      </div>
    </form>
  );
}