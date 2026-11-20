import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const pad2 = (n: number) => String(n).padStart(2, '0');

function sheetDate(v: any): string | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v <= 0) return null;
    return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) {
    const mm = +m[1], dd = +m[2], yyyy = +m[3];
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (mm < 1 || mm > 12 || dd < 1 || d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
    return yyyy + '-' + pad2(mm) + '-' + pad2(dd);
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2(+m[2]) + '-' + pad2(+m[3]);
  return null;
}

export async function GET(req: NextRequest) {
  if (!(await isCronAuthorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { supabaseAdmin, fetchAll } = await import('@/lib/supabase');
  const sheets = await import('@/lib/sheets');
  const sb = supabaseAdmin();

  const { data: missing, error } = await fetchAll(() =>
    sb.from('leads').select('id, lead_id').eq('source_key', 'INDIAMART').is('lead_date', null)
  );
  if (error) throw new Error('Could not load blank IndiaMART lead dates: ' + error.message);
  if (!missing.length) return NextResponse.json({ ok: true, scanned: 0, updated: 0, unmatched: 0, invalidDates: 0 });

  const rows = await sheets.readRange('Leads', 'A2:Q200000', true);
  const dateByLead = new Map<string, string | null>();
  for (const row of rows) {
    const leadId = String(row?.[0] ?? '').trim();
    if (!leadId) continue;
    dateByLead.set(leadId, sheetDate(row?.[1]));
  }

  let updated = 0, unmatched = 0, invalidDates = 0;
  const errors: string[] = [];
  for (const lead of missing) {
    if (!dateByLead.has(lead.lead_id)) { unmatched++; continue; }
    const date = dateByLead.get(lead.lead_id);
    if (!date) { invalidDates++; continue; }
    const { error: updateError } = await sb.from('leads').update({ lead_date: date }).eq('id', lead.id).is('lead_date', null);
    if (updateError) {
      if (errors.length < 5) errors.push(lead.lead_id + ': ' + updateError.message);
    } else updated++;
  }
  return NextResponse.json({ ok: errors.length === 0, scanned: missing.length, updated, unmatched, invalidDates, errors: errors.length ? errors : undefined });
}
