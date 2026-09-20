import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET: Fetch all purchase invoices
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplierId');
    const paymentMethod = searchParams.get('paymentMethod');

    const where: any = {};
    if (supplierId) where.supplierId = supplierId;
    if (paymentMethod) where.paymentMethod = paymentMethod;

    const invoices = await prisma.purchaseInvoice.findMany({
      where,
      orderBy: { invoiceDate: 'desc' },
      include: {
        supplier: {
          select: { id: true, name: true, phone: true, companyName: true },
        },
        items: {
          include: {
            rawMaterial: { select: { id: true, name: true, purchaseUnit: true, deductUnit: true } },
          },
        },
      },
    });

    return NextResponse.json({ invoices });
  } catch (error: any) {
    console.error('GET purchase invoices error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Create a purchase invoice and update stock
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      invoiceNumber,
      supplierId,
      supplierName,
      invoiceDate,
      items,
      paymentMethod = 'CASH',
      paidAmount,
      notes,
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'يجب إضافة أصناف أو خامات للفاتورة' }, { status: 400 });
    }

    let calculatedTotal = 0;
    for (const it of items) {
      const itemTotal = it.totalPrice !== undefined && it.totalPrice !== '' ? Number(it.totalPrice) : Number(it.quantity || 0) * Number(it.unitPrice || 0);
      calculatedTotal += itemTotal;
    }

    const actualPaid = paidAmount !== undefined && paidAmount !== '' ? Number(paidAmount) : calculatedTotal;
    const remainingAmount = Math.max(0, calculatedTotal - actualPaid);

    const generatedNumber =
      invoiceNumber || `PINV-${Date.now().toString().slice(-6)}`;

    // Prisma Transaction
    const createdInvoice = await prisma.$transaction(async (tx) => {
      // 1. Create Purchase Invoice
      const invoice = await tx.purchaseInvoice.create({
        data: {
          invoiceNumber: generatedNumber,
          supplierId: supplierId || null,
          supplierName: supplierName || null,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          totalAmount: calculatedTotal,
          paidAmount: actualPaid,
          remainingAmount,
          paymentMethod,
          notes: notes || null,
          items: {
            create: items.map((it: any) => {
              const qty = Number(it.quantity) || 1;
              const tot = it.totalPrice !== undefined && it.totalPrice !== '' ? Number(it.totalPrice) : qty * Number(it.unitPrice || 0);
              const unit = qty > 0 ? tot / qty : tot;
              return {
                rawMaterialId: it.rawMaterialId || null,
                itemName: it.itemName,
                quantity: qty,
                purchaseUnit: it.purchaseUnit || 'unit',
                unitPrice: unit,
                totalPrice: tot,
              };
            }),
          },
        },
        include: {
          items: true,
        },
      });

      // 2. Increment Stock & Update Wholesale Cost for Produce Items & RawMaterials
      for (const it of items) {
        const qty = Number(it.quantity) || 0;
        const tot = it.totalPrice !== undefined && it.totalPrice !== '' ? Number(it.totalPrice) : qty * Number(it.unitPrice || 0);
        const unit = qty > 0 ? tot / qty : tot;

        // A) Update wholesale cost in Item table (Produce Item) so POS and Reports reflect latest market cost
        // A) Update wholesale cost & selling price in Item table (Produce Item) so POS and Reports reflect latest market cost
        try {
          let matchedItem = null;
          if (it.itemId) {
            matchedItem = await tx.item.findUnique({ where: { id: it.itemId } });
          }
          if (!matchedItem && it.itemName) {
            matchedItem = await tx.item.findFirst({ where: { name: it.itemName.trim() } });
          }
          if (matchedItem) {
            const updateData: any = {};
            if (unit > 0) updateData.cost = unit;
            if (qty > 0) updateData.stockQty = { increment: qty };
            if (it.sellingPrice !== undefined && it.sellingPrice !== '' && Number(it.sellingPrice) > 0) {
              updateData.price = Number(it.sellingPrice);
            }
            if (Object.keys(updateData).length > 0) {
              await tx.item.update({
                where: { id: matchedItem.id },
                data: updateData,
              });
            }
          }
        } catch (itemErr) {
          console.warn('Could not update Item.cost, price and stockQty:', itemErr);
        }

        // B) Update RawMaterial stock & cost if matched or specified
        try {
          let rmId = it.rawMaterialId;
          if (!rmId && it.itemName) {
            const matchedRm = await tx.rawMaterial.findFirst({ where: { name: it.itemName.trim() } });
            if (matchedRm) rmId = matchedRm.id;
          }

          if (rmId) {
            const rawMat = await tx.rawMaterial.findUnique({
              where: { id: rmId },
            });

            if (rawMat) {
              const addedStockInDeductUnits = qty * (rawMat.conversionFactor || 1);
              await tx.rawMaterial.update({
                where: { id: rmId },
                data: {
                  stockQty: {
                    increment: addedStockInDeductUnits,
                  },
                  costPerPurchaseUnit: unit > 0 ? unit : (rawMat.costPerPurchaseUnit || 0),
                },
              });

              // Also record a restock log for history
              await tx.restockLog.create({
                data: {
                  rawMaterialId: rmId,
                  quantity: Number(it.quantity),
                  amount: tot,
                  createdAt: invoiceDate ? new Date(invoiceDate) : new Date(),
                },
              });
            }
          }
        } catch (rmErr) {
          console.warn('Could not update RawMaterial:', rmErr);
        }
      }

      return invoice;
    });

    return NextResponse.json({ success: true, invoice: createdInvoice });
  } catch (error: any) {
    console.error('POST purchase invoice error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create purchase invoice' }, { status: 500 });
  }
}

// PATCH: Settle or add partial payment to existing purchase invoice
export async function PATCH(request: Request) {
  try {
    const { invoiceId, paymentAmount, paymentMethod = 'CASH', notes } = await request.json();

    if (!invoiceId || paymentAmount === undefined || Number(paymentAmount) <= 0) {
      return NextResponse.json({ error: 'يرجى تحديد الفاتورة ومبلغ السداد الصحيح' }, { status: 400 });
    }

    const pay = Number(paymentAmount);

    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 });
    }

    const newPaid = invoice.paidAmount + pay;
    const newRemaining = Math.max(0, invoice.totalAmount - newPaid);
    const paymentNote = `سداد مبلغ ${pay} ج (${paymentMethod}) بتاريخ ${new Date().toLocaleDateString()}${notes ? `: ${notes}` : ''}`;
    const updatedNotes = invoice.notes ? `${invoice.notes}\n${paymentNote}` : paymentNote;

    const updated = await prisma.purchaseInvoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount: newPaid,
        remainingAmount: newRemaining,
        notes: updatedNotes,
      },
    });

    return NextResponse.json({ success: true, invoice: updated });
  } catch (error: any) {
    console.error('PATCH purchase payment error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update payment' }, { status: 500 });
  }
}
