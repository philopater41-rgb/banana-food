import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const { username, currentPassword, newPassword } = await request.json();

    const cleanUsername = typeof username === 'string' ? username.trim() : '';
    const cleanCurrentPassword = typeof currentPassword === 'string' ? currentPassword : '';
    const cleanNewPassword = typeof newPassword === 'string' ? newPassword : '';

    if (!cleanUsername) {
      return NextResponse.json(
        { error: 'يرجى إدخال اسم المستخدم' },
        { status: 400 }
      );
    }

    if (!cleanCurrentPassword) {
      return NextResponse.json(
        { error: 'يرجى إدخال كلمة المرور الحالية' },
        { status: 400 }
      );
    }

    if (!cleanNewPassword) {
      return NextResponse.json(
        { error: 'يرجى إدخال كلمة المرور الجديدة' },
        { status: 400 }
      );
    }

    if (cleanNewPassword.length < 3) {
      return NextResponse.json(
        { error: 'كلمة المرور الجديدة يجب ألا تقل عن 3 أحرف' },
        { status: 400 }
      );
    }

    // 1. Find user by exact username or case-insensitive
    const user = await prisma.user.findFirst({
      where: {
        username: {
          equals: cleanUsername,
          mode: 'insensitive',
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'اسم المستخدم غير مسجل في النظام' },
        { status: 404 }
      );
    }

    // 2. Validate current password
    const currentHashed = crypto.createHash('sha256').update(cleanCurrentPassword).digest('hex');
    if (user.password !== currentHashed) {
      return NextResponse.json(
        { error: 'كلمة المرور الحالية غير صحيحة، يرجى التأكد وإعادة المحاولة' },
        { status: 401 }
      );
    }

    // 3. Prevent using the exact same password
    const newHashed = crypto.createHash('sha256').update(cleanNewPassword).digest('hex');
    if (currentHashed === newHashed) {
      return NextResponse.json(
        { error: 'كلمة المرور الجديدة مطابقة لكلمة المرور الحالية، يرجى اختيار كلمة مرور مختلفة' },
        { status: 400 }
      );
    }

    // 4. Update user password
    await prisma.user.update({
      where: { id: user.id },
      data: { password: newHashed },
    });

    return NextResponse.json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول.',
      username: user.username,
    });
  } catch (error: any) {
    console.error('Change password error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ في الخادم أثناء تحديث كلمة المرور' },
      { status: 500 }
    );
  }
}
