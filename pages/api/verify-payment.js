import { createClient } from '@supabase/supabase-js'

// Initialize a privileged service instance using environment authorization parameters
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role key to bypass RLS policies during recovery actions
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method execution protocol not allowed.' })
  }

  const { tx_ref, student_data } = req.body

  if (!tx_ref) {
    return res.status(400).json({ message: 'Missing transaction execution reference payload parameters.' })
  }

  try {
    // 1. Verify if the reference token identifier has already been synchronized inside your ledger table
    const { data: existingStudent } = await supabaseAdmin
      .from('students')
      .select('id, full_name, payment_reference')
      .eq('payment_reference', tx_ref)
      .maybeSingle()

    if (existingStudent) {
      return res.status(409).json({ 
        message: `Aborted: This transaction reference is already linked to student profile record: ${existingStudent.full_name}.` 
      })
    }

    // 2. Query Flutterwave's official validation endpoint using your private environment Secret Key
    const flwResponse = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`
      }
    })

    const flwData = await flwResponse.json()

    // PROTECTION GAURDRAIL FIX: Check if flwData or flwData.data is empty before reading properties to avoid server crashes
    if (!flwData || flwData.status !== 'success' || !flwData.data || (flwData.data.status !== 'successful' && flwData.data.status !== 'completed')) {
      const displayMessage = flwData?.message || 'Flutterwave does not register a cleared successful payout session for this transaction reference token.'
      return res.status(422).json({ 
        message: `Validation Failure: ${displayMessage}` 
      })
    }

    // Extract financial metadata straight from the payment gateway settlement statement payload
    const flwAmount = flwData.data.amount
    const meta = flwData.data.meta || {}

    // Fall back to parameters submitted manually inside the administration console if webhook metadata parameters drop out
    const finalName = meta.student_name || student_data?.p_full_name || 'Reconciled Student'
    const finalPhone = meta.student_phone || student_data?.p_phone_number || 'N/A'
    const finalJambCode = meta.jamb_code || student_data?.p_jamb_code || ''
    const finalRegNum = meta.reg_number || student_data?.p_reg_number || ''
    const finalServiceId = meta.service_id || student_data?.p_service_id
    const finalAgentId = meta.agent_id || student_data?.p_agent_id

    if (!finalServiceId) {
      return res.status(400).json({ message: 'Reconciliation failed: Unable to bind a valid service identifier to this record.' })
    }

    // Fetch service parameters to automatically read and map institution_cost parameters down to rows
    const { data: targetServiceData } = await supabaseAdmin
      .from('services')
      .select('institution_cost')
      .eq('id', finalServiceId)
      .single()

    const calculatedInstCost = targetServiceData?.institution_cost ? Number(targetServiceData.institution_cost) : 0

    // 3. Force sync row record insertion utilizing your verified system RPC routine
    const { error: rpcError } = await supabaseAdmin.rpc('insert_business_center_student', {
      p_full_name: finalName,
      p_phone_number: finalPhone,
      p_jamb_code: finalJambCode,
      p_reg_number: finalRegNum,
      p_service_id: finalServiceId, 
      p_agent_id: finalAgentId,
      p_amount_paid: flwAmount
    })

    if (rpcError) {
      console.warn("RPC Routine insertion failed or unavailable. Processing direct layout fallback insert...", rpcError.message)
      
      // Fallback direct insert parameters if RPC parameters lock due to signature differences during metadata lookups
      // STATE VALUE FIX: Changed from 'Queue Wallet' fallback string to 'Pending' to sync with Version 3.0 workflow mapping
      const { error: insertError } = await supabaseAdmin
        .from('students')
        .insert([{
          full_name: finalName,
          phone_number: finalPhone,
          jamb_profile_code: finalJambCode,
          registration_number: finalRegNum,
          service_id: finalServiceId,
          agent_id: finalAgentId,
          amount_paid: flwAmount,
          institution_cost: calculatedInstCost, // Attaches the base institution costs safely for profit accounting
          status: 'Pending', // Aligns student into collection Inbox queue
          registration_source: 'Business Center',
          payment_reference: tx_ref,
          payment_gateway: 'Flutterwave',
          is_deleted: false
        }])

      if (insertError) throw insertError
    } else {
      // Affix the verified payment token parameter to the newly created RPC trace record row entry
      await supabaseAdmin
        .from('students')
        .update({ payment_reference: tx_ref, payment_gateway: 'Flutterwave' })
        .eq('full_name', finalName)
        .eq('phone_number', finalPhone)
        .is('payment_reference', null)
    }

    return res.status(200).json({ message: 'System sync successful! Student profile initialized inside Queue Ledger.' })

  } catch (error) {
    console.error('Reconciliation Server Engine Failure:', error)
    return res.status(500).json({ message: 'Internal Server Sync Failure: ' + error.message })
  }
}