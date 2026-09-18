import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET: Fetch all suppliers with their purchases summary
export async function GET() {
  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      include: {
        purchases: {
          orderBy: { invoiceDate: 'desc' },
          include: {
            items: true,
          },
        },
      },
    });

    const formattedSuppliers = suppliers.map((s) => {
      const totalPurchases = s.purchases.reduce((sum, p) => sum + p.totalAmount, 0);
      const totalPaid = s.purchases.reduce((sum, p) => sum + p.paidAmount, 0);
      const remainingBalance = totalPurchases - totalPaid;

      return {
        id: s.id,
        name: s.name,
        phone: s.phone,
        companyName: s.companyName,
        address: s.address,
        notes: s.notes,
        createdAt: s.createdAt,
        invoicesCount: s.purchases.length,
        totalPurchases,
        totalPaid,
        remainingBalance,
        purchases: s.purchases,
      };
    });

    return NextResponse.json({ suppliers: formattedSuppliers });
  } catch (error: any) {
    console.error('GET suppliers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Add new supplier
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, phone, companyName, address, notes } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'اسم المورد مطلوب' }, { status: 400 });
    }

    const supplier = await prisma.supplier.create({
      data: {
        name: name.trim(),
        phone: phone ? phone.trim() : null,
        companyName: companyName ? companyName.trim() : null,
        address: address ? address.trim() : null,
        notes: notes ? notes.trim() : null,
      },
    });

    return NextResponse.json({ success: true, supplier });
  } catch (error: any) {
    console.error('POST supplier error:', error);
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 });
  }
}

// PUT: Update supplier
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, name, phone, companyName, address, notes } = body;

    if (!id) {
      return NextResponse.json({ error: 'Supplier ID is required' }, { status: 400 });
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        name: name ? name.trim() : undefined,
        phone: phone !== undefined ? (phone ? phone.trim() : null) : undefined,
        companyName: companyName !== undefined ? (companyName ? companyName.trim() : null) : undefined,
        address: address !== undefined ? (address ? address.trim() : null) : undefined,
        notes: notes !== undefined ? (notes ? notes.trim() : null) : undefined,
      },
    });

    return NextResponse.json({ success: true, supplier: updated });
  } catch (error: any) {
    console.error('PUT supplier error:', error);
    return NextResponse.json({ error: 'Failed to update supplier' }, { status: 500 });
  }
}

// DELETE: Delete supplier
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let id = searchParams.get('id');
    if (!id) {
      try {
        const body = await request.json();
        id = body?.id;
      } catch {
        // ignore
      }
    }

    if (!id) {
      return NextResponse.json({ error: 'Supplier ID is required' }, { status: 400 });
    }

    // Disconnect supplier from purchase invoices first so historical invoices are preserved
    await prisma.purchaseInvoice.updateMany({
      where: { supplierId: id },
      data: { supplierId: null },
    });

    await prisma.supplier.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE supplier error:', error);
    return NextResponse.json({ error: 'Failed to delete supplier' }, { status: 500 });
  }
}
