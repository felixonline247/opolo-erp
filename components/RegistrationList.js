import { supabase } from '../lib/supabaseClient';
import { sendCompletionSMS } from '../lib/sms';

export default function RegistrationList({ registrations }) {

  const handleMarkDone = async (registrationId, studentPhone, studentName, serviceName) => {
  // 1. Update Status in Supabase
  const { error } = await supabase
    .from('registrations')
    .update({ status: 'Done', completed_at: new Date() })
    .eq('id', registrationId);

  if (!error) {
    // 2. Trigger the SMS via Termii
    await sendCompletionSMS(studentPhone, studentName, serviceName);
    alert("Service Completed & SMS Sent!");
  }
};// PASTE THE CODE HERE (Inside the component, before the return)
  const handleMarkDone = async (registrationId, studentPhone, studentName, serviceName) => {
    const { error } = await supabase
      .from('registrations')
      .update({ status: 'Done', completed_at: new Date() })
      .eq('id', registrationId);

    if (!error) {
      await sendCompletionSMS(studentPhone, studentName, serviceName);
      alert("Service Completed & SMS Sent!");
      // Optional: Refresh the page or update the UI state here
    }
  };

  return (
    <div className="space-y-4">
      {registrations.map((reg) => (
        <div key={reg.id} className="p-4 border rounded shadow-sm flex justify-between items-center">
          <div>
            <p className="font-bold">{reg.students.full_name}</p>
            <p className="text-sm text-gray-500">{reg.service_types.service_name}</p>
          </div>
          
          {/* LINK THE CODE TO THE BUTTON HERE */}
          <button 
            onClick={() => handleMarkDone(
                reg.id, 
                reg.students.phone_number, 
                reg.students.full_name, 
                reg.service_types.service_name
            )}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Mark as Done
          </button>
        </div>
      ))}
    </div>
  );
}