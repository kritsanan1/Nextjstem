import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const signature = req.headers.get('stripe-signature')
    const body = await req.text()
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

    if (!signature || !webhookSecret) {
      return new Response('Missing signature or webhook secret', { status: 400 })
    }

    // Verify webhook signature
    const elements = signature.split(',')
    const signatureElements = {}
    
    for (const element of elements) {
      const [key, value] = element.split('=')
      signatureElements[key] = value
    }

    const timestamp = signatureElements['t']
    const v1 = signatureElements['v1']

    if (!timestamp || !v1) {
      return new Response('Invalid signature format', { status: 400 })
    }

    // Create expected signature
    const payload = `${timestamp}.${body}`
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    
    const signature_bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
    const expected_signature = Array.from(new Uint8Array(signature_bytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    if (expected_signature !== v1) {
      return new Response('Invalid signature', { status: 400 })
    }

    // Parse the event
    const event = JSON.parse(body)

    // Create Supabase client with service role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('Processing Stripe webhook:', event.type)

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(supabaseClient, event.data.object)
        break
        
      case 'customer.subscription.deleted':
        await handleSubscriptionCancellation(supabaseClient, event.data.object)
        break
        
      case 'invoice.payment_succeeded':
        await handlePaymentSuccess(supabaseClient, event.data.object)
        break
        
      case 'invoice.payment_failed':
        await handlePaymentFailure(supabaseClient, event.data.object)
        break
        
      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return new Response(
      JSON.stringify({ received: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Stripe webhook error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

async function handleSubscriptionChange(supabaseClient, subscription) {
  try {
    // Get customer email from Stripe customer ID
    const { data: customer } = await supabaseClient
      .from('customers')
      .select('*')
      .eq('customer_id', subscription.customer)
      .single()

    if (!customer) {
      console.error('Customer not found for subscription:', subscription.id)
      return
    }

    // Get user by email
    const { data: user } = await supabaseClient.auth.admin.getUserByEmail(customer.email)
    
    if (!user) {
      console.error('User not found for email:', customer.email)
      return
    }

    // Update subscription in database
    const { error: subscriptionError } = await supabaseClient
      .from('subscriptions')
      .upsert({
        subscription_id: subscription.id,
        customer_id: subscription.customer,
        subscription_status: subscription.status,
        price_id: subscription.items.data[0]?.price?.id,
        product_id: subscription.items.data[0]?.price?.product,
        scheduled_change: subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null,
      })

    if (subscriptionError) {
      console.error('Error updating subscription:', subscriptionError)
      return
    }

    // Initialize user entitlements based on the new subscription
    if (subscription.status === 'active') {
      const priceId = subscription.items.data[0]?.price?.id
      if (priceId) {
        await supabaseClient.rpc('initialize_user_entitlements', {
          p_user_id: user.user.id,
          p_stripe_price_id: priceId
        })
      }
    }

    console.log('Successfully processed subscription change:', subscription.id)
  } catch (error) {
    console.error('Error handling subscription change:', error)
    throw error
  }
}

async function handleSubscriptionCancellation(supabaseClient, subscription) {
  try {
    // Update subscription status
    const { error } = await supabaseClient
      .from('subscriptions')
      .update({
        subscription_status: 'canceled',
        scheduled_change: new Date().toISOString()
      })
      .eq('subscription_id', subscription.id)

    if (error) {
      console.error('Error updating canceled subscription:', error)
      return
    }

    // Get user and reset entitlements to free tier
    const { data: customer } = await supabaseClient
      .from('customers')
      .select('*')
      .eq('customer_id', subscription.customer)
      .single()

    if (customer) {
      const { data: user } = await supabaseClient.auth.admin.getUserByEmail(customer.email)
      
      if (user) {
        // Set to free tier entitlements (you might want to create a free tier price ID)
        await supabaseClient.rpc('initialize_user_entitlements', {
          p_user_id: user.user.id,
          p_stripe_price_id: 'price_free_tier' // You'll need to create this
        })
      }
    }

    console.log('Successfully processed subscription cancellation:', subscription.id)
  } catch (error) {
    console.error('Error handling subscription cancellation:', error)
    throw error
  }
}

async function handlePaymentSuccess(supabaseClient, invoice) {
  try {
    // Log successful payment
    console.log('Payment succeeded for invoice:', invoice.id)
    
    // You could add additional logic here like:
    // - Sending confirmation emails
    // - Updating payment history
    // - Triggering analytics events
    
  } catch (error) {
    console.error('Error handling payment success:', error)
    throw error
  }
}

async function handlePaymentFailure(supabaseClient, invoice) {
  try {
    // Log failed payment
    console.log('Payment failed for invoice:', invoice.id)
    
    // You could add additional logic here like:
    // - Sending payment failure notifications
    // - Temporarily suspending account features
    // - Triggering retry logic
    
  } catch (error) {
    console.error('Error handling payment failure:', error)
    throw error
  }
}