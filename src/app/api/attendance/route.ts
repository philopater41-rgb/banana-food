import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [todayRecords, monthlyRecords, savedNames] = await Promise.all([
      prisma.attendanceRecord.findMany({ where: { checkedInAt: { gte: startOfToday } }, orderBy: { checkedInAt: 'desc' } }),
      prisma.attendanceRecord.findMany({ where: { checkedInAt: { gte: startOfMonth } }, orderBy: { checkedInAt: 'desc' } }),
      prisma.attendanceRecord.findMany({ distinct: ['employeeName'], select: { employeeName: true }, orderBy: { employeeName: 'asc' } }),
    ]);
    return NextResponse.json({ todayRecords, monthlyRecords, names: savedNames.map((entry) => entry.employeeName) });
  } catch (error) {
    console.error('Attendance GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, employeeName } = await request.json();
    const name = typeof employeeName === 'string' ? employeeName.trim() : '';
    if (!name || !['CHECK_IN', 'CHECK_OUT'].includes(action)) return NextResponse.json({ error: 'الاسم والإجراء مطلوبان.' }, { status: 400 });
    if (action === 'CHECK_IN') {
      const openRecord = await prisma.attendanceRecord.findFirst({ where: { employeeName: name, checkedOutAt: null } });
      if (openRecord) return NextResponse.json({ error: 'هذا الموظف مسجل حضور بالفعل ولم يسجل انصرافًا.' }, { status: 409 });
      return NextResponse.json({ record: await prisma.attendanceRecord.create({ data: { employeeName: name } }) }, { status: 201 });
    }
    const openRecord = await prisma.attendanceRecord.findFirst({ where: { employeeName: name, checkedOutAt: null }, orderBy: { checkedInAt: 'desc' } });
    if (!openRecord) return NextResponse.json({ error: 'لا يوجد تسجيل حضور مفتوح بهذا الاسم.' }, { status: 404 });
    return NextResponse.json({ record: await prisma.attendanceRecord.update({ where: { id: openRecord.id }, data: { checkedOutAt: new Date() } }) });
  } catch (error) {
    console.error('Attendance POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
