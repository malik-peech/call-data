import "server-only";
import {
  listCalendarEvents,
  scheduleBotForEvent,
  unscheduleBotForEvent,
  shouldRecordEvent,
  type RecallCalendarEvent,
} from "@/lib/integrations/recall";

/**
 * Process a `calendar.sync_events` webhook: fetch updated events for the
 * calendar and reconcile bot scheduling with our capture rules.
 *
 * Rule (anti-double-bot): record everything with a video link EXCEPT meetings
 * a sales member owns/attends (they run Attio) — see shouldRecordEvent + RECALL_EXCLUDE.
 */
export async function syncCalendar(calendarId: string, updatedAtGte?: string): Promise<{
  scheduled: number;
  unscheduled: number;
}> {
  let scheduled = 0;
  let unscheduled = 0;
  let cursor: string | undefined = updatedAtGte;

  const page = await listCalendarEvents({ calendarId, updatedAtGte: cursor });
  const events: RecallCalendarEvent[] = page.results ?? [];

  for (const ev of events) {
    const hasBot = (ev.bots?.length ?? 0) > 0;
    const wanted = shouldRecordEvent(ev);
    try {
      if (wanted && !hasBot) {
        await scheduleBotForEvent(ev.id);
        scheduled++;
      } else if (!wanted && hasBot) {
        await unscheduleBotForEvent(ev.id);
        unscheduled++;
      }
    } catch (e) {
      console.error(`[calendar] reconcile failed for event ${ev.id}:`, e);
    }
  }

  return { scheduled, unscheduled };
}
