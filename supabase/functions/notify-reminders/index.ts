import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @deno-types="npm:@types/web-push"
import webpush from 'npm:web-push';

const VAPID_PUBLIC_KEY  = 'BCcVZSSg7f5yJuQIzDCgyEH_V5BAd8YvBF1D6w7H9VRW6_eYvxjuAuR8s34nNHiqx1xXLoCbzjoRxo-6A82GLg4';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT     = 'mailto:brian@brianguerra.com';

serve(async () => {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Eastern time: get today's date
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  const { data: reminders } = await supabase
    .from('reminders')
    .select('title, due_date')
    .eq('done', false)
    .not('due_date', 'is', null)
    .lte('due_date', today);

  if (!reminders?.length) {
    return new Response('No reminders today', { status: 200 });
  }

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth');

  if (!subscriptions?.length) {
    return new Response('No subscribers', { status: 200 });
  }

  const overdue  = reminders.filter(r => r.due_date < today);
  const dueToday = reminders.filter(r => r.due_date === today);

  let body = '';
  if (dueToday.length === 1 && overdue.length === 0) {
    body = dueToday[0].title;
  } else {
    const parts = [];
    if (dueToday.length)  parts.push(`${dueToday.length} due today`);
    if (overdue.length)   parts.push(`${overdue.length} overdue`);
    body = parts.join(', ');
  }

  const payload = JSON.stringify({
    title: 'Casa GM',
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png'
  });

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
    )
  );

  // Clean up expired subscriptions (HTTP 410)
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
  if (sent > 0) {
    await supabase.from('notifications').insert({ title: 'Casa GM', body });
  }
  return new Response(JSON.stringify({ sent, total: subscriptions.length }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
