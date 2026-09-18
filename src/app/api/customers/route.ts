import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET: Fetch all customers with their order summary
export async function GET() {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { orders: true },
        },
        orders: {
          select: {
            total: true,
            discount: true,
            status: true,
          },
        },
      },
    });

    const formattedCustomers = customers.map((c) => {
      const completedOrders = c.orders.filter((o) => o.status === 'COMPLETED');
      const totalSpent = completedOrders.reduce((sum, o) => sum + o.total, 0);
      const totalDiscountReceived = completedOrders.reduce((sum, o) => sum + o.discount, 0);

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        type: c.type,
        discountRate: c.discountRate,
        notes: c.notes,
        createdAt: c.createdAt,
        totalOrders: completedOrders.length,
        totalSpent,
        totalDiscountReceived,
      };
    });

    return NextResponse.json({ customers: formattedCustomers });
  } catch (error: any) {
    console.error('GET customers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Create a new customer
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, phone, type, discountRate, notes } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'اسم العميل مطلوب' }, { status: 400 });
    }

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        phone: phone ? phone.trim() : null,
        type: type || 'INDIVIDUAL',
        discountRate: typeof discountRate === 'number' ? discountRate : Number(discountRate || 0),
        notes: notes ? notes.trim() : null,
      },
    });

    return NextResponse.json({ success: true, customer });
  } catch (error: any) {
    console.error('POST customer error:', error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'رقم الهاتف مسجل مسبقاً لعميل آخر' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}

// PUT: Update customer details
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, name, phone, type, discountRate, notes } = body;

    if (!id) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        name: name ? name.trim() : undefined,
        phone: phone !== undefined ? (phone ? phone.trim() : null) : undefined,
        type: type !== undefined ? type : undefined,
        discountRate: discountRate !== undefined ? Number(discountRate) : undefined,
        notes: notes !== undefined ? (notes ? notes.trim() : null) : undefined,
      },
    });

    return NextResponse.json({ success: true, customer: updated });
  } catch (error: any) {
    console.error('PUT customer error:', error);
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
}

// DELETE: Delete a customer
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    await prisma.customer.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE customer error:', error);
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
  }
}
