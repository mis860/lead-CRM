import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Apply YYYY-MM-DD display formatting to the active lead tabs only.
 * Does not rewrite cell values or touch excluded legacy tabs.
 */
export async function GET(req: NextRequest) {
  if (!(await isCronAuthorized(req))) {
    return NextResponse.json({ error: 'Unauthorized. Log in as an admin first.' }, { status: 401 });
  }

  const sheets = await import('@/lib/sheets');
  const result = await sheets.formatLeadDateColumns(['Leads', 'Corp FB']);

  return NextResponse.json({
    ok: true,
    format: 'yyyy-mm-dd',
    tabs: ['Leads', 'Corp FB'],
    updated: true,
    result,
  });
}
