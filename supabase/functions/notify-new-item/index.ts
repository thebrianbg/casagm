import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @deno-types="npm:@types/web-push"
import webpush from 'npm:web-push';

const VAPID_PUBLIC_KEY  = 'BCcVZSSg7f5yJuQIzDCgyEH_V5BAd8YvBF1D6w7H9VRW6_eYvxjuAuR8s34nNHiqx1xXLoCbzjoRxo-6A82GLg4';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT     = 'mailto:brian@brianguerra.com';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(d: string) {
  const [, m, day] = d.split('-').map(Number);
  return `${MONTHS[m - 1]} ${day}`;
}

serve(async (req) => {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { table, record } = await req.json();
  if (!record) return new Response('No record', { status: 400 });

  let body = '';
  if (table === 'reminders') {
    body = record.due_date
      ? `${record.title} — due ${fmtDate(record.due_date)}`
      : record.title;
  } else if (table === 'events') {
    body = `${record.title} — ${fmtDate(record.date)}`;
  } else {
    return new Response('Unknown table', { status: 400 });
  }

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth');

  if (!subscriptions?.length) return new Response('No subscribers', { status: 200 });

  const payload = JSON.stringify({
    title: table === 'reminders' ? '📋 New Reminder' : '📅 New Event',
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png'
  });

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  // Clean up expired subscriptions
  const expired = subscriptions.filter((_, i) =>
    results[i].status === 'rejected' &&
    (results[i] as PromiseRejectedResult).reason?.statusCode === 410
  );
  if (expired.length) {
    await Promise.all(expired.map(s =>
      supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
    ));
  }

  const sent = results.filter(r => r.status === 'fulfilled').length;
  const notifTitle = table === 'reminders' ? '📋 New Reminder' : '📅 New Event';
  if (sent > 0) {
    await supabase.from('notifications').insert({
      title: notifTitle, body,
      record_type: table,
      record_id: record.id ?? null
    });
  }
  return new Response(JSON.stringify({ sent }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
