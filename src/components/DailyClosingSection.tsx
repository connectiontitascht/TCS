import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  Calendar, 
  CheckCircle, 
  Lock, 
  Unlock, 
  Printer, 
  TrendingUp, 
  TrendingDown, 
  Coins, 
  AlertCircle,
  FileText,
  Search,
  Check,
  Plus,
  Trash2,
  PlusCircle,
  Edit,
  FileDown,
  Filter,
  MoreVertical,
  X,
  FileSpreadsheet
} from 'lucide-react';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  onSnapshot, 
  getDoc,
  getDocFromServer,
  serverTimestamp
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Transaction, DailyClosing, ExpenseCategory, EXPENSE_CATEGORY_LABELS, AppUser } from '../types';
import { PaymentMethodLogo } from './PaymentLogos';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface DailyClosingSectionProps {
  userId: string;
  transactions: Transaction[];
  currentUserProfile?: AppUser | null;
  modalTrigger?: { type: 'income' | 'expense' | 'cash_details' | 'month_closing'; id: number } | null;
  onModalHandled?: () => void;
}

export function DailyClosingSection({ userId, transactions, currentUserProfile, modalTrigger, onModalHandled }: DailyClosingSectionProps) {
  const [closings, setClosings] = useState<DailyClosing[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeEntryModal, setActiveEntryModal] = useState<'income' | 'expense' | 'cash_details' | 'month_closing' | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [closingMonth, setClosingMonth] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().slice(0, 7);
  });
  const [monthlyDues, setMonthlyDues] = useState<
    Record<string, { dueAmount: number; notes?: string; discountAmount?: number; discountNotes?: string; updatedBy?: string }>
  >({});
  const [dueAmountInput, setDueAmountInput] = useState<string>('');
  const [dueNotesInput, setDueNotesInput] = useState<string>('');
  const [savingDue, setSavingDue] = useState<boolean>(false);
  const [dueSaveSuccess, setDueSaveSuccess] = useState<boolean>(false);
  const [discountAmountInput, setDiscountAmountInput] = useState<string>('');
  const [discountNotesInput, setDiscountNotesInput] = useState<string>('');
  const [savingDiscount, setSavingDiscount] = useState<boolean>(false);
  const [discountSaveSuccess, setDiscountSaveSuccess] = useState<boolean>(false);

  // Opening balance inputs (States)
  const [openingCash, setOpeningCash] = useState<string>('0');
  const [openingBkash, setOpeningBkash] = useState<string>('0');
  const [openingNagad, setOpeningNagad] = useState<string>('0');
  const [openingRocket, setOpeningRocket] = useState<string>('0');
  const [openingBank, setOpeningBank] = useState<string>('0');
  const [openingSsl, setOpeningSsl] = useState<string>('0');

  // Cash Drawer statement inputs (States)
  const [khaOfficeCash, setKhaOfficeCash] = useState<string>('0');
  const [dhakaOfficeCash, setDhakaOfficeCash] = useState<string>('0');
  const [nayanCash, setNayanCash] = useState<string>('0');
  const [accountCash, setAccountCash] = useState<string>('0');

  const [transferKhaToNayan, setTransferKhaToNayan] = useState<string>('0');
  const [transferNayanToDhaka, setTransferNayanToDhaka] = useState<string>('0');
  const [transferDhakaToNayan, setTransferDhakaToNayan] = useState<string>('0');
  const [transferDhakaToKha, setTransferDhakaToKha] = useState<string>('0');

  const [notes, setNotes] = useState<string>('');
  const [isDrawerSubmitted, setIsDrawerSubmitted] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const lastDateRef = React.useRef<string>('');
  
  // Modal viewer
  const [selectedClosing, setSelectedClosing] = useState<DailyClosing | null>(null);
  const [printPreviewData, setPrintPreviewData] = useState<DailyClosing | null>(null);

  // Entry Statement form states
  const [entryCategory, setEntryCategory] = useState<string>('customer_bill');
  const [entryAmount, setEntryAmount] = useState<string>('');
  const [entryPaymentMethod, setEntryPaymentMethod] = useState<string>('cash');

  // Expense Entry Statement form states
  const [expenseCategory, setExpenseCategory] = useState<string>('bandwidth_bill');
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expensePaymentMethod, setExpensePaymentMethod] = useState<string>('cash');

  // Editing Transaction Modal form states
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editingTxCategory, setEditingTxCategory] = useState<string>('');
  const [editingTxAmount, setEditingTxAmount] = useState<string>('');
  const [editingTxPaymentMethod, setEditingTxPaymentMethod] = useState<string>('');

  // Custom confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    message: string;
    description?: string;
    onConfirm: () => void;
  } | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Filters for Daily Closing Historical Logs (similar to transaction list)
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [quickDateFilter, setQuickDateFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  useEffect(() => {
    if (modalTrigger) {
      if (modalTrigger.type === 'month_closing') {
        setClosingMonth(selectedDate.slice(0, 7));
      }
      setActiveEntryModal(modalTrigger.type);
      setError('');
      onModalHandled?.();
    }
  }, [modalTrigger]);

  // 1. Fetch closing history for list view
  useEffect(() => {
    const q = query(
      collection(db, 'daily_closings'),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: DailyClosing[] = [];
      snapshot.forEach((doc) => {
        list.push(doc.data() as DailyClosing);
      });
      setClosings(list);
      setLoading(false);
    }, (err) => {
      console.error('Error fetching daily closings:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  // 1B. Fetch manual monthly due & discount amounts
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'monthly_dues'),
      (snapshot) => {
        const duesMap: Record<
          string,
          { dueAmount: number; notes?: string; discountAmount?: number; discountNotes?: string; updatedBy?: string }
        > = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as {
            month?: string;
            dueAmount?: number;
            notes?: string;
            discountAmount?: number;
            discountNotes?: string;
            updatedBy?: string;
          };
          const key = data.month || docSnap.id;
          duesMap[key] = {
            dueAmount: Number(data.dueAmount) || 0,
            notes: data.notes || '',
            discountAmount: Number(data.discountAmount) || 0,
            discountNotes: data.discountNotes || '',
            updatedBy: data.updatedBy || '',
          };
        });
        setMonthlyDues(duesMap);
      },
      (err) => {
        console.error('Error fetching monthly dues:', err);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  useEffect(() => {
    const saved = monthlyDues[closingMonth];
    setDueAmountInput(saved && saved.dueAmount > 0 ? saved.dueAmount.toString() : '');
    setDueNotesInput(saved?.notes || '');
    setDiscountAmountInput(saved && (saved.discountAmount ?? 0) > 0 ? String(saved.discountAmount) : '');
    setDiscountNotesInput(saved?.discountNotes || '');
  }, [
    closingMonth,
    monthlyDues[closingMonth]?.dueAmount,
    monthlyDues[closingMonth]?.notes,
    monthlyDues[closingMonth]?.discountAmount,
    monthlyDues[closingMonth]?.discountNotes,
  ]);

  const handleSaveMonthlyDue = async (customAmount?: number, customNotes?: string) => {
    const targetMonth = closingMonth || selectedDate.slice(0, 7);
    const parsedAmount =
      typeof customAmount === 'number'
        ? Math.max(0, customAmount)
        : Math.max(0, parseFloat(dueAmountInput || '0') || 0);
    const cleanNotes = (typeof customNotes === 'string' ? customNotes.trim() : dueNotesInput.trim()).slice(0, 500);

    setSavingDue(true);
    setDueSaveSuccess(false);
    try {
      const dueDocRef = doc(db, 'monthly_dues', targetMonth);
      const isNew = !monthlyDues[targetMonth];
      await setDoc(
        dueDocRef,
        {
          id: targetMonth,
          userId,
          month: targetMonth,
          dueAmount: parsedAmount,
          notes: cleanNotes,
          updatedBy: (currentUserProfile?.email || 'System Admin').slice(0, 150),
          ...(isNew ? { createdAt: serverTimestamp() } : {}),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setDueSaveSuccess(true);
      setTimeout(() => setDueSaveSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `monthly_dues/${targetMonth}`);
    } finally {
      setSavingDue(false);
    }
  };

  const handleSaveMonthlyDiscount = async (customAmount?: number, customNotes?: string) => {
    const targetMonth = closingMonth || selectedDate.slice(0, 7);
    const parsedAmount =
      typeof customAmount === 'number'
        ? Math.max(0, customAmount)
        : Math.max(0, parseFloat(discountAmountInput || '0') || 0);
    const cleanNotes = (
      typeof customNotes === 'string' ? customNotes.trim() : discountNotesInput.trim()
    ).slice(0, 500);

    setSavingDiscount(true);
    setDiscountSaveSuccess(false);
    try {
      const dueDocRef = doc(db, 'monthly_dues', targetMonth);
      const existingRecord = monthlyDues[targetMonth];
      const isNew = !existingRecord;
      await setDoc(
        dueDocRef,
        {
          id: targetMonth,
          userId,
          month: targetMonth,
          dueAmount: existingRecord?.dueAmount ?? 0,
          discountAmount: parsedAmount,
          discountNotes: cleanNotes,
          updatedBy: (currentUserProfile?.email || 'System Admin').slice(0, 150),
          ...(isNew ? { createdAt: serverTimestamp() } : {}),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setDiscountSaveSuccess(true);
      setTimeout(() => setDiscountSaveSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `monthly_dues/${targetMonth}`);
    } finally {
      setSavingDiscount(false);
    }
  };

  // Isolate Daily Closing exclusively to entries created inside Daily Closing (never collect from other menus)
  const dailyClosingOnlyTransactions = React.useMemo(
    () =>
      (transactions || []).filter(
        (t) =>
          t.isDailyClosing === true ||
          (t.notes &&
            (t.notes.includes('Daily Closing entry statement:') ||
              t.notes.includes('Daily Closing expense statement:')))
      ),
    [transactions]
  );

  // Helper: compute automatic opening balances for any target date (YYYY-MM-DD)
  // Uses the latest closed DailyClosing strictly before targetDate as an anchor (if any),
  // then adds net Daily Closing transactions (income - expense) for all dates strictly between anchorDate and targetDate.
  const computeOpeningBalancesForDate = (targetDate: string) => {
    const balances = {
      cash: 0,
      bkash: 0,
      nagad: 0,
      rocket: 0,
      bank: 0,
      sslcommerz: 0,
    };

    if (!targetDate) return balances;

    const priorClosedClosings = closings
      .filter((c) => c.date < targetDate && c.status === 'closed')
      .sort((a, b) => b.date.localeCompare(a.date));

    let anchorDate = '';
    if (priorClosedClosings.length > 0) {
      const lastClosed = priorClosedClosings[0];
      anchorDate = lastClosed.date;
      balances.cash = Number(lastClosed.closingCash ?? 0);
      balances.bkash = Number(lastClosed.closingBkash ?? 0);
      balances.nagad = Number(lastClosed.closingNagad ?? 0);
      balances.rocket = Number(lastClosed.closingRocket ?? 0);
      balances.bank = Number(lastClosed.closingBank ?? 0);
      balances.sslcommerz = Number(lastClosed.closingSsl ?? 0);
    }

    for (const t of dailyClosingOnlyTransactions) {
      if (!t.date || t.date >= targetDate) continue;
      if (anchorDate && t.date <= anchorDate) continue;

      const pm = (t.paymentMethod || 'cash').trim().toLowerCase();
      const amount = Number(t.amount) || 0;
      const delta = t.type === 'income' ? amount : -amount;

      if (pm === 'cash' || !t.paymentMethod) {
        balances.cash += delta;
      } else if (pm === 'bkash') {
        balances.bkash += delta;
      } else if (pm === 'nagad') {
        balances.nagad += delta;
      } else if (pm === 'rocket') {
        balances.rocket += delta;
      } else if (pm === 'bank') {
        balances.bank += delta;
      } else if (pm === 'sslcommerz') {
        balances.sslcommerz += delta;
      }
    }

    return balances;
  };

  // Helper: compute category-wise income & expense breakdown for any transaction list
  const computeCategoryBreakdown = (txList: Transaction[]) => {
    const incomeCategoryMap: Record<string, { key: string; label: string; amount: number; count: number }> = {
      customer_bill: { key: 'customer_bill', label: 'Customer Bill Collection', amount: 0, count: 0 },
      reseller_bill: { key: 'reseller_bill', label: 'Reseller Bill Collection', amount: 0, count: 0 },
      service_charge: { key: 'service_charge', label: 'Service Charge Collection', amount: 0, count: 0 },
      other_income: { key: 'other_income', label: 'Other Income', amount: 0, count: 0 },
    };

    const expenseCategoryMap: Record<string, { key: string; label: string; amount: number; count: number }> = {};
    Object.entries(EXPENSE_CATEGORY_LABELS).forEach(([key, meta]) => {
      expenseCategoryMap[key] = { key, label: meta.label, amount: 0, count: 0 };
    });

    const formatFallbackCategory = (rawKey: string) =>
      rawKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    for (const t of txList) {
      const amt = Number(t.amount) || 0;
      const catKey = (t.category || (t.type === 'income' ? 'other_income' : 'other_expense')).trim();
      if (t.type === 'income') {
        if (!incomeCategoryMap[catKey]) {
          incomeCategoryMap[catKey] = {
            key: catKey,
            label: formatFallbackCategory(catKey),
            amount: 0,
            count: 0,
          };
        }
        incomeCategoryMap[catKey].amount += amt;
        incomeCategoryMap[catKey].count += 1;
      } else {
        if (!expenseCategoryMap[catKey]) {
          expenseCategoryMap[catKey] = {
            key: catKey,
            label: formatFallbackCategory(catKey),
            amount: 0,
            count: 0,
          };
        }
        expenseCategoryMap[catKey].amount += amt;
        expenseCategoryMap[catKey].count += 1;
      }
    }

    return {
      incomeCategories: Object.values(incomeCategoryMap),
      expenseCategories: Object.values(expenseCategoryMap),
    };
  };

  // Helper: compute Month Closing statement summary for any YYYY-MM month
  const getMonthClosingSummary = (monthStr: string) => {
    const safeMonth = monthStr || selectedDate.slice(0, 7);
    const openBal = computeOpeningBalancesForDate(`${safeMonth}-01`);

    const monthTxs = dailyClosingOnlyTransactions.filter(
      (t) => t.date && t.date.startsWith(safeMonth)
    );

    const flows = {
      cash: { income: 0, expense: 0 },
      bkash: { income: 0, expense: 0 },
      nagad: { income: 0, expense: 0 },
      rocket: { income: 0, expense: 0 },
      bank: { income: 0, expense: 0 },
      sslcommerz: { income: 0, expense: 0 },
    };

    for (const t of monthTxs) {
      const pm = (t.paymentMethod || 'cash').trim().toLowerCase();
      const amt = Number(t.amount) || 0;
      const key: keyof typeof flows =
        pm === 'bkash' ? 'bkash' :
        pm === 'nagad' ? 'nagad' :
        pm === 'rocket' ? 'rocket' :
        pm === 'bank' ? 'bank' :
        pm === 'sslcommerz' ? 'sslcommerz' : 'cash';

      if (t.type === 'income') {
        flows[key].income += amt;
      } else {
        flows[key].expense += amt;
      }
    }

    const methods = [
      { key: 'cash', label: 'Cash', open: openBal.cash, income: flows.cash.income, expense: flows.cash.expense, close: openBal.cash + flows.cash.income - flows.cash.expense, pl: flows.cash.income - flows.cash.expense },
      { key: 'bkash', label: 'bKash', open: openBal.bkash, income: flows.bkash.income, expense: flows.bkash.expense, close: openBal.bkash + flows.bkash.income - flows.bkash.expense, pl: flows.bkash.income - flows.bkash.expense },
      { key: 'nagad', label: 'Nagad', open: openBal.nagad, income: flows.nagad.income, expense: flows.nagad.expense, close: openBal.nagad + flows.nagad.income - flows.nagad.expense, pl: flows.nagad.income - flows.nagad.expense },
      { key: 'rocket', label: 'Rocket', open: openBal.rocket, income: flows.rocket.income, expense: flows.rocket.expense, close: openBal.rocket + flows.rocket.income - flows.rocket.expense, pl: flows.rocket.income - flows.rocket.expense },
      { key: 'bank', label: 'Bank Transfer', open: openBal.bank, income: flows.bank.income, expense: flows.bank.expense, close: openBal.bank + flows.bank.income - flows.bank.expense, pl: flows.bank.income - flows.bank.expense },
      { key: 'sslcommerz', label: 'SSL Commerz', open: openBal.sslcommerz, income: flows.sslcommerz.income, expense: flows.sslcommerz.expense, close: openBal.sslcommerz + flows.sslcommerz.income - flows.sslcommerz.expense, pl: flows.sslcommerz.income - flows.sslcommerz.expense },
    ];

    const totalOpen = methods.reduce((s, m) => s + m.open, 0);
    const totalIncome = methods.reduce((s, m) => s + m.income, 0);
    const totalExpense = methods.reduce((s, m) => s + m.expense, 0);
    const totalClose = methods.reduce((s, m) => s + m.close, 0);
    const totalPL = totalIncome - totalExpense;

    const monthClosings = closings
      .filter((c) => c.date && c.date.startsWith(safeMonth))
      .sort((a, b) => b.date.localeCompare(a.date));
    const closedDaysCount = monthClosings.filter((c) => c.status === 'closed').length;
    const latestDrawerDoc = monthClosings.find((c) => c.isDrawerSubmitted || c.status === 'closed') || null;

    const totalTransferKhaToNayan = monthClosings.reduce((s, c) => s + (c.transferKhaToNayan ?? 0), 0);
    const totalTransferNayanToDhaka = monthClosings.reduce((s, c) => s + (c.transferNayanToDhaka ?? 0), 0);
    const totalTransferDhakaToNayan = monthClosings.reduce((s, c) => s + (c.transferDhakaToNayan ?? 0), 0);
    const totalTransferDhakaToKha = monthClosings.reduce((s, c) => s + (c.transferDhakaToKha ?? 0), 0);

    const { incomeCategories, expenseCategories } = computeCategoryBreakdown(monthTxs);

    const MONTH_NAMES = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const [yrStr, moStr] = safeMonth.split('-');
    const moIdx = parseInt(moStr, 10) - 1;
    const monthName = moIdx >= 0 && moIdx < 12 && yrStr ? `${MONTH_NAMES[moIdx]} ${yrStr}` : safeMonth;

    return {
      month: safeMonth,
      monthName,
      methods,
      monthTxs,
      incomeCategories,
      expenseCategories,
      incomeCount: monthTxs.filter((t) => t.type === 'income').length,
      expenseCount: monthTxs.filter((t) => t.type === 'expense').length,
      totalOpen,
      totalIncome,
      totalExpense,
      totalClose,
      totalPL,
      dueAmount: monthlyDues[safeMonth]?.dueAmount ?? 0,
      dueNotes: monthlyDues[safeMonth]?.notes || '',
      discountAmount: monthlyDues[safeMonth]?.discountAmount ?? 0,
      discountNotes: monthlyDues[safeMonth]?.discountNotes || '',
      closedDaysCount,
      latestDrawerDoc,
      transfers: {
        khaToNayan: totalTransferKhaToNayan,
        nayanToDhaka: totalTransferNayanToDhaka,
        dhakaToNayan: totalTransferDhakaToNayan,
        dhakaToKha: totalTransferDhakaToKha,
        total: totalTransferKhaToNayan + totalTransferNayanToDhaka + totalTransferDhakaToNayan + totalTransferDhakaToKha,
      },
    };
  };

  const handleDownloadMonthClosingPDF = (monthStr: string) => {
    try {
      const summary = getMonthClosingSummary(monthStr);
      const doc = new jsPDF();

      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text('TITAS INTERNET & ACCOUNTING', 105, 18, { align: 'center' });

      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text('OFFICIAL MONTH CLOSING & FINANCIAL STATEMENT REPORT', 105, 24, { align: 'center' });

      doc.setDrawColor(203, 213, 225);
      doc.line(14, 29, 196, 29);

      doc.setFontSize(9.5);
      doc.setTextColor(51, 65, 85);
      doc.text(`Closing Month: ${summary.month}`, 14, 36);
      doc.text(`Closed Days: ${summary.closedDaysCount}`, 14, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text(summary.monthName, 105, 40, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(51, 65, 85);
      doc.text(`Generated By: ${currentUserProfile?.email || 'System Admin'}`, 196, 36, { align: 'right' });
      doc.text(`Generated At: ${new Date().toLocaleTimeString()} BDT`, 196, 42, { align: 'right' });

      const cardsY = 48;
      const cards = [
        {
          label: 'MONTH OPENING',
          value: `${summary.totalOpen.toLocaleString()} BDT`,
          fill: [248, 250, 252] as [number, number, number],
          border: [226, 232, 240] as [number, number, number],
          labelColor: [148, 163, 184] as [number, number, number],
          valueColor: [15, 23, 42] as [number, number, number],
        },
        {
          label: `MONTH INCOME (${summary.incomeCount})`,
          value: `+${summary.totalIncome.toLocaleString()} BDT`,
          fill: [236, 253, 245] as [number, number, number],
          border: [167, 243, 208] as [number, number, number],
          labelColor: [4, 120, 87] as [number, number, number],
          valueColor: [4, 120, 87] as [number, number, number],
        },
        {
          label: `MONTH EXPENSE (${summary.expenseCount})`,
          value: `-${summary.totalExpense.toLocaleString()} BDT`,
          fill: [255, 241, 242] as [number, number, number],
          border: [254, 205, 211] as [number, number, number],
          labelColor: [190, 18, 60] as [number, number, number],
          valueColor: [190, 18, 60] as [number, number, number],
        },
        {
          label: 'MONTH CLOSING',
          value: `${summary.totalClose.toLocaleString()} BDT`,
          fill: [240, 253, 250] as [number, number, number],
          border: [153, 246, 228] as [number, number, number],
          labelColor: [15, 118, 110] as [number, number, number],
          valueColor: [19, 78, 74] as [number, number, number],
        },
      ];

      const cardGap = 4;
      const cardW = (182 - cardGap * 3) / 4;
      const cardH = 22;

      cards.forEach((card, idx) => {
        const x = 14 + idx * (cardW + cardGap);
        doc.setFillColor(...card.fill);
        doc.setDrawColor(...card.border);
        doc.roundedRect(x, cardsY, cardW, cardH, 3, 3, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...card.labelColor);
        doc.text(card.label, x + 4, cardsY + 7);

        doc.setFontSize(10.5);
        doc.setTextColor(...card.valueColor);
        doc.text(card.value, x + 4, cardsY + 16);
      });

      doc.setFont('helvetica', 'normal');

      const formatPL = (val: number) =>
        val > 0 ? `+${val.toLocaleString()} BDT` : val < 0 ? `-${Math.abs(val).toLocaleString()} BDT` : '0 BDT';

      autoTable(doc, {
        startY: cardsY + cardH + 6,
        head: [['Payment Method', 'Month Opening', 'Month Income (+)', 'Month Expense (-)', 'Month Closing', 'P/L']],
        body: [
          ...summary.methods.map((m) => [
            m.label,
            `${m.open.toLocaleString()} BDT`,
            `+${m.income.toLocaleString()} BDT`,
            `-${m.expense.toLocaleString()} BDT`,
            `${m.close.toLocaleString()} BDT`,
            formatPL(m.pl),
          ]),
          [
            'TOTAL',
            `${summary.totalOpen.toLocaleString()} BDT`,
            `+${summary.totalIncome.toLocaleString()} BDT`,
            `-${summary.totalExpense.toLocaleString()} BDT`,
            `${summary.totalClose.toLocaleString()} BDT`,
            formatPL(summary.totalPL),
          ],
        ],
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8.5, textColor: 51 },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'right', textColor: [5, 150, 105], fontStyle: 'bold' },
          3: { halign: 'right', textColor: [225, 29, 72], fontStyle: 'bold' },
          4: { halign: 'right', fontStyle: 'bold' },
          5: { halign: 'right', fontStyle: 'bold' },
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            if (data.column.index === 5) {
              const plVal = data.row.index < summary.methods.length ? summary.methods[data.row.index].pl : summary.totalPL;
              if (plVal > 0) data.cell.styles.textColor = [5, 150, 105];
              else if (plVal < 0) data.cell.styles.textColor = [225, 29, 72];
              else data.cell.styles.textColor = [100, 116, 139];
            }
            if (data.row.index === summary.methods.length) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [241, 245, 249];
            }
          }
        },
      });

      let nextY = (doc as any).lastAutoTable.finalY + 8;

      if (summary.latestDrawerDoc) {
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text(`Latest Cash Details (${summary.latestDrawerDoc.date}) & Monthly Transfers`, 14, nextY);
        autoTable(doc, {
          startY: nextY + 3,
          head: [['Physical Cash Snapshot', 'Amount', 'Monthly Transfers Total', 'Amount']],
          body: [
            ['KHA Office Cash', `${(summary.latestDrawerDoc.khaOfficeCash ?? 0).toLocaleString()} BDT`, 'KHA Office to Nayan', `${summary.transfers.khaToNayan.toLocaleString()} BDT`],
            ['Dhaka Office Cash', `${(summary.latestDrawerDoc.dhakaOfficeCash ?? 0).toLocaleString()} BDT`, 'Nayan to Dhaka office', `${summary.transfers.nayanToDhaka.toLocaleString()} BDT`],
            ['Nayan Cash', `${(summary.latestDrawerDoc.nayanCash ?? 0).toLocaleString()} BDT`, 'Dhaka office to Nayan', `${summary.transfers.dhakaToNayan.toLocaleString()} BDT`],
            ['Account Cash', `${(summary.latestDrawerDoc.accountCash ?? 0).toLocaleString()} BDT`, 'Dhaka to KHA Office', `${summary.transfers.dhakaToKha.toLocaleString()} BDT`],
          ],
          theme: 'grid',
          headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 8 },
          columnStyles: {
            1: { halign: 'right' },
            3: { halign: 'right' },
          },
        });
        nextY = (doc as any).lastAutoTable.finalY + 8;
      }

      doc.setFontSize(9.5);
      doc.setTextColor(4, 120, 87);
      doc.text(`Category-Wise Income Statement (${summary.month})`, 14, nextY);
      autoTable(doc, {
        startY: nextY + 3,
        head: [['Income Category', 'Entries', 'Amount (BDT)']],
        body: [
          ...summary.incomeCategories.map((c) => [
            c.label,
            c.count.toString(),
            `+${c.amount.toLocaleString()} BDT`,
          ]),
          ['Total Category Income', summary.incomeCount.toString(), `+${summary.totalIncome.toLocaleString()} BDT`],
        ],
        theme: 'grid',
        headStyles: { fillColor: [5, 150, 105], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8.5, textColor: 51 },
        columnStyles: {
          1: { halign: 'center' },
          2: { halign: 'right', textColor: [5, 150, 105], fontStyle: 'bold' },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.row.index === summary.incomeCategories.length) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [236, 253, 245];
          }
        },
      });

      const afterIncomeCatY = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(9.5);
      doc.setTextColor(190, 18, 60);
      doc.text(`Category-Wise Expense Statement (${summary.month})`, 14, afterIncomeCatY);
      autoTable(doc, {
        startY: afterIncomeCatY + 3,
        head: [['Expense Category', 'Entries', 'Amount (BDT)']],
        body: [
          ...summary.expenseCategories.map((c) => [
            c.label,
            c.count.toString(),
            `-${c.amount.toLocaleString()} BDT`,
          ]),
          ['Total Category Expense', summary.expenseCount.toString(), `-${summary.totalExpense.toLocaleString()} BDT`],
        ],
        theme: 'grid',
        headStyles: { fillColor: [225, 29, 72], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8.5, textColor: 51 },
        columnStyles: {
          1: { halign: 'center' },
          2: { halign: 'right', textColor: [225, 29, 72], fontStyle: 'bold' },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.row.index === summary.expenseCategories.length) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [255, 241, 242];
          }
        },
      });

      const afterExpenseCatY = (doc as any).lastAutoTable.finalY + 8;
      const plLabel = summary.totalPL > 0 ? 'NET PROFIT' : summary.totalPL < 0 ? 'NET LOSS' : 'BREAK-EVEN';
      const plMargin = summary.totalIncome > 0 ? ((summary.totalPL / summary.totalIncome) * 100).toFixed(1) : '0.0';
      doc.setFontSize(9.5);
      doc.setTextColor(15, 118, 110);
      doc.text(`Profit & Loss (P/L) Statement (${summary.month})`, 14, afterExpenseCatY);
      autoTable(doc, {
        startY: afterExpenseCatY + 3,
        head: [['P/L Statement Item', 'Details', 'Amount (BDT)']],
        body: [
          ['Total Monthly Income (+)', `${summary.incomeCount} entries`, `+${summary.totalIncome.toLocaleString()} BDT`],
          ['Total Monthly Expense (-)', `${summary.expenseCount} entries`, `-${summary.totalExpense.toLocaleString()} BDT`],
          [`Net Profit / Loss (${plLabel})`, `Margin: ${plMargin}%`, formatPL(summary.totalPL)],
        ],
        theme: 'grid',
        headStyles: { fillColor: [15, 118, 110], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8.5, textColor: 51 },
        columnStyles: {
          1: { halign: 'center' },
          2: { halign: 'right', fontStyle: 'bold' },
        },
        didParseCell: (data) => {
          if (data.section === 'body') {
            if (data.row.index === 0 && data.column.index === 2) data.cell.styles.textColor = [5, 150, 105];
            if (data.row.index === 1 && data.column.index === 2) data.cell.styles.textColor = [225, 29, 72];
            if (data.row.index === 2) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = summary.totalPL >= 0 ? [240, 253, 250] : [255, 241, 242];
              if (data.column.index === 2) {
                data.cell.styles.textColor = summary.totalPL > 0 ? [4, 120, 87] : summary.totalPL < 0 ? [190, 18, 60] : [51, 65, 85];
              }
            }
          }
        },
      });

      const afterPLY = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(9.5);
      doc.setTextColor(180, 83, 9);
      doc.text(`Due Amount (${summary.month})`, 14, afterPLY);
      autoTable(doc, {
        startY: afterPLY + 3,
        head: [['Due Item', 'Note / Details', 'Amount (BDT)']],
        body: [
          ['Manual Due Amount', summary.dueNotes ? summary.dueNotes : 'Monthly Due', `${summary.dueAmount.toLocaleString()} BDT`],
        ],
        theme: 'grid',
        headStyles: { fillColor: [180, 83, 9], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8.5, textColor: 51 },
        columnStyles: {
          1: { halign: 'center' },
          2: { halign: 'right', fontStyle: 'bold', textColor: [180, 83, 9] },
        },
      });

      const afterDueY = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(9.5);
      doc.setTextColor(109, 40, 217);
      doc.text(`Discount (${summary.month})`, 14, afterDueY);
      autoTable(doc, {
        startY: afterDueY + 3,
        head: [['Discount Item', 'Note / Details', 'Amount (BDT)']],
        body: [
          ['Manual Discount', summary.discountNotes ? summary.discountNotes : 'Monthly Discount', `${summary.discountAmount.toLocaleString()} BDT`],
        ],
        theme: 'grid',
        headStyles: { fillColor: [109, 40, 217], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8.5, textColor: 51 },
        columnStyles: {
          1: { halign: 'center' },
          2: { halign: 'right', fontStyle: 'bold', textColor: [109, 40, 217] },
        },
      });

      doc.save(`Month_Closing_Report_${summary.month}.pdf`);
    } catch (err) {
      console.error('Failed to generate Month Closing PDF:', err);
    }
  };

  const handleDownloadMonthClosingExcel = (monthStr: string) => {
    try {
      const summary = getMonthClosingSummary(monthStr);
      const latestCashTotal = summary.latestDrawerDoc
        ? (summary.latestDrawerDoc.khaOfficeCash ?? 0) +
          (summary.latestDrawerDoc.dhakaOfficeCash ?? 0) +
          (summary.latestDrawerDoc.nayanCash ?? 0) +
          (summary.latestDrawerDoc.accountCash ?? 0)
        : 0;

      const summaryRows: (string | number)[][] = [
        ['TITAS INTERNET & ACCOUNTING'],
        ['OFFICIAL MONTH CLOSING & FINANCIAL STATEMENT REPORT'],
        ['Closing Month', `${summary.monthName} (${summary.month})`, 'Closed Days', summary.closedDaysCount, 'Generated By', currentUserProfile?.email || 'System Admin'],
        [],
        ['MONTH SUMMARY', 'AMOUNT (BDT)', 'ENTRIES'],
        ['Month Opening', summary.totalOpen, ''],
        ['Month Income (+)', summary.totalIncome, summary.incomeCount],
        ['Month Expense (-)', summary.totalExpense, summary.expenseCount],
        ['Month Closing', summary.totalClose, ''],
        [],
        ['PAYMENT METHOD MONTHLY BREAKDOWN'],
        ['Payment Method', 'Opening (BDT)', 'Income (+) (BDT)', 'Expense (-) (BDT)', 'Closing (BDT)', 'P/L (BDT)'],
        ...summary.methods.map((m) => [m.label, m.open, m.income, m.expense, m.close, m.pl]),
        ['TOTAL', summary.totalOpen, summary.totalIncome, summary.totalExpense, summary.totalClose, summary.totalPL],
        [],
        ['LATEST PHYSICAL CASH', summary.latestDrawerDoc ? summary.latestDrawerDoc.date : 'No Entry', '', 'MONTHLY CASH TRANSFERS', summary.month],
        ['KHA Office Cash', summary.latestDrawerDoc?.khaOfficeCash ?? 0, '', 'KHA Office to Nayan', summary.transfers.khaToNayan],
        ['Dhaka Office Cash', summary.latestDrawerDoc?.dhakaOfficeCash ?? 0, '', 'Nayan to Dhaka office', summary.transfers.nayanToDhaka],
        ['Nayan Cash', summary.latestDrawerDoc?.nayanCash ?? 0, '', 'Dhaka office to Nayan', summary.transfers.dhakaToNayan],
        ['Account Cash', summary.latestDrawerDoc?.accountCash ?? 0, '', 'Dhaka office to KHA Office', summary.transfers.dhakaToKha],
        ['Total Physical Cash', latestCashTotal, '', 'Total Transfers', summary.transfers.total],
        [],
        ['CATEGORY-WISE INCOME STATEMENT', 'ENTRIES', 'AMOUNT (BDT)'],
        ...summary.incomeCategories.map((c) => [c.label, c.count, c.amount]),
        ['Total Category Income', summary.incomeCount, summary.totalIncome],
        [],
        ['CATEGORY-WISE EXPENSE STATEMENT', 'ENTRIES', 'AMOUNT (BDT)'],
        ...summary.expenseCategories.map((c) => [c.label, c.count, c.amount]),
        ['Total Category Expense', summary.expenseCount, summary.totalExpense],
        [],
        ['P/L STATEMENT', 'STATUS / DETAILS', 'AMOUNT (BDT)'],
        ['Total Monthly Income (+)', `${summary.incomeCount} entries`, summary.totalIncome],
        ['Total Monthly Expense (-)', `${summary.expenseCount} entries`, summary.totalExpense],
        [
          'Net Profit / Loss (P/L)',
          summary.totalPL > 0 ? 'PROFIT' : summary.totalPL < 0 ? 'LOSS' : 'BREAK-EVEN',
          summary.totalPL,
        ],
        [],
        ['DUE AMOUNT', 'NOTE / DETAILS', 'AMOUNT (BDT)'],
        ['Manual Due Amount', summary.dueNotes || 'Monthly Due', summary.dueAmount],
        [],
        ['DISCOUNT', 'NOTE / DETAILS', 'AMOUNT (BDT)'],
        ['Manual Discount', summary.discountNotes || 'Monthly Discount', summary.discountAmount],
      ];

      const wb = XLSX.utils.book_new();
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      wsSummary['!cols'] = [
        { wch: 24 },
        { wch: 18 },
        { wch: 18 },
        { wch: 26 },
        { wch: 18 },
        { wch: 26 },
      ];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Month Closing Summary');

      const sortedTxs = [...summary.monthTxs].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const txRows: (string | number)[][] = [
        ['SL', 'Date', 'Type', 'Category', 'Payment Method', 'Amount (BDT)', 'Notes'],
        ...sortedTxs.map((tx, idx) => [
          idx + 1,
          tx.date || '',
          (tx.type || '').toUpperCase(),
          getCategoryLabel(tx),
          (tx.paymentMethod || 'cash').toUpperCase(),
          Number(tx.amount) || 0,
          tx.notes || '',
        ]),
      ];
      const wsTx = XLSX.utils.aoa_to_sheet(txRows);
      wsTx['!cols'] = [
        { wch: 6 },
        { wch: 14 },
        { wch: 12 },
        { wch: 24 },
        { wch: 16 },
        { wch: 16 },
        { wch: 40 },
      ];
      XLSX.utils.book_append_sheet(wb, wsTx, 'Monthly Transactions');

      XLSX.writeFile(wb, `Month_Closing_Report_${summary.month}.xlsx`);
    } catch (err) {
      console.error('Failed to generate Month Closing Excel:', err);
    }
  };

  const handlePrintMonthClosingStatement = (monthStr: string) => {
    try {
      const summary = getMonthClosingSummary(monthStr);
      const escapeHtml = (val: string) =>
        val
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      const latestCashTotal = summary.latestDrawerDoc
        ? (summary.latestDrawerDoc.khaOfficeCash ?? 0) +
          (summary.latestDrawerDoc.dhakaOfficeCash ?? 0) +
          (summary.latestDrawerDoc.nayanCash ?? 0) +
          (summary.latestDrawerDoc.accountCash ?? 0)
        : 0;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Month_Closing_Statement_${summary.month}</title>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                color: #0f172a;
                background: #f8fafc;
                padding: 20px;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .page {
                max-width: 820px;
                margin: 0 auto;
                background: #ffffff;
                padding: 28px;
                border-radius: 14px;
                border: 1px solid #e2e8f0;
              }
              .print-toolbar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: #f0fdfa;
                border: 1px solid #99f6e4;
                padding: 12px 16px;
                border-radius: 10px;
                margin-bottom: 20px;
              }
              .print-toolbar span { font-size: 12px; font-weight: 700; color: #115e59; }
              .btn-group { display: flex; gap: 8px; }
              .btn-print {
                background: #0d9488; color: #ffffff; border: none; border-radius: 8px;
                padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer;
              }
              .btn-close {
                background: #e2e8f0; color: #334155; border: none; border-radius: 8px;
                padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer;
              }
              @media print {
                .no-print { display: none !important; }
                html, body { background: #ffffff; padding: 0; margin: 0; }
                .page { border: none; padding: 0; max-width: 100%; border-radius: 0; box-shadow: none; }
                .section, .cards, .grid-2, .sigs { break-inside: avoid; page-break-inside: avoid; }
                @page { size: A4 portrait; margin: 8mm; }
              }
              .header { text-align: center; border-bottom: 1.5px dashed #cbd5e1; padding-bottom: 8px; margin-bottom: 8px; }
              .header h1 { font-size: 16px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase; color: #0f172a; }
              .header p { font-size: 9px; font-weight: 600; color: #64748b; letter-spacing: 1.1px; text-transform: uppercase; margin-top: 2px; }
              .meta { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; font-size: 9.5px; color: #475569; margin-bottom: 10px; line-height: 1.45; }
              .meta strong { color: #0f172a; }
              .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
              .card { border-radius: 8px; padding: 8px 10px; border: 1px solid #e2e8f0; }
              .card-label { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; display: block; }
              .card-val { font-size: 12.5px; font-weight: 800; margin-top: 3px; display: block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
              .card-open { background: #f8fafc; border-color: #e2e8f0; }
              .card-open .card-label { color: #94a3b8; }
              .card-open .card-val { color: #0f172a; }
              .card-inc { background: #ecfdf5; border-color: #a7f3d0; }
              .card-inc .card-label, .card-inc .card-val { color: #047857; }
              .card-exp { background: #fff1f2; border-color: #fecdd3; }
              .card-exp .card-label, .card-exp .card-val { color: #be123c; }
              .card-close { background: #f0fdfa; border-color: #99f6e4; }
              .card-close .card-label { color: #0f766e; }
              .card-close .card-val { color: #134e4a; }
              .section { border: 1px solid #e2e8f0; border-radius: 10px; padding: 9px 12px; margin-bottom: 10px; background: #ffffff; }
              .section-title { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; }
              table { width: 100%; border-collapse: collapse; font-size: 10px; }
              th { text-align: left; font-size: 8px; text-transform: uppercase; color: #64748b; padding: 4px 5px; border-bottom: 1px solid #cbd5e1; }
              td { padding: 4px 5px; border-bottom: 1px solid #f1f5f9; }
              .num { text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
              .inc { color: #059669; font-weight: 700; }
              .exp { color: #e11d48; font-weight: 700; }
              .bold { font-weight: 800; color: #0f172a; }
              .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
              .cat-grid-2 { display: grid; grid-template-columns: 1fr 1fr; column-gap: 20px; }
              .row-item { display: flex; justify-content: space-between; font-size: 9.5px; padding: 2.5px 0; border-bottom: 1px dashed #e2e8f0; gap: 8px; }
              .row-total { display: flex; justify-content: space-between; font-size: 10px; font-weight: 800; padding-top: 5px; margin-top: 4px; border-top: 1px solid #e2e8f0; color: #1e1b4b; }
              .sigs { display: flex; justify-content: space-between; margin-top: 22px; padding-top: 8px; }
              .sig-box { width: 160px; text-align: center; }
              .sig-line { border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: #64748b; }
            </style>
          </head>
          <body>
            <div class="page">
              <div class="print-toolbar no-print">
                <span>Month Closing Statement Print View (${summary.month})</span>
                <div class="btn-group">
                  <button type="button" class="btn-print" onclick="window.print()">Print Now</button>
                  <button type="button" class="btn-close" onclick="window.close()">Close</button>
                </div>
              </div>
              <div class="header">
                <h1>Titas Internet &amp; Accounting</h1>
                <p>Official Month Closing &amp; Financial Statement Report</p>
              </div>
              <div class="meta">
                <div>
                  <div><strong>Closing Month:</strong> ${summary.month}</div>
                  <div><strong>Closed Days:</strong> ${summary.closedDaysCount}</div>
                </div>
                <div style="text-align: center; padding: 3px 14px; background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 6px;">
                  <div style="font-size: 13px; font-weight: 800; color: #0f172a; letter-spacing: 0.4px; text-transform: uppercase;">${escapeHtml(summary.monthName)}</div>
                </div>
                <div style="text-align: right;">
                  <div><strong>Generated By:</strong> ${currentUserProfile?.email || 'System Admin'}</div>
                  <div><strong>Generated At:</strong> ${new Date().toLocaleTimeString()} BDT</div>
                </div>
              </div>

              <div class="cards">
                <div class="card card-open">
                  <span class="card-label">Month Opening</span>
                  <span class="card-val">${summary.totalOpen.toLocaleString()} BDT</span>
                </div>
                <div class="card card-inc">
                  <span class="card-label">Month Income (${summary.incomeCount})</span>
                  <span class="card-val">+${summary.totalIncome.toLocaleString()} BDT</span>
                </div>
                <div class="card card-exp">
                  <span class="card-label">Month Expense (${summary.expenseCount})</span>
                  <span class="card-val">-${summary.totalExpense.toLocaleString()} BDT</span>
                </div>
                <div class="card card-close">
                  <span class="card-label">Month Closing</span>
                  <span class="card-val">${summary.totalClose.toLocaleString()} BDT</span>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1.75fr 1fr; gap: 10px; margin-bottom: 10px; align-items: stretch;">
                <div class="section" style="margin-bottom: 0; padding: 9px 10px;">
                  <div class="section-title">
                    <span>Payment Method Breakdown (${summary.month})</span>
                    <span>BDT</span>
                  </div>
                  <table style="font-size: 9px;">
                    <thead>
                      <tr>
                        <th style="padding: 3.5px 3px;">Method</th>
                        <th class="num" style="padding: 3.5px 3px;">Open</th>
                        <th class="num" style="padding: 3.5px 3px;">Income</th>
                        <th class="num" style="padding: 3.5px 3px;">Expense</th>
                        <th class="num" style="padding: 3.5px 3px;">Close</th>
                        <th class="num" style="padding: 3.5px 3px;">P/L</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${summary.methods.map((m) => {
                        const plText = m.pl > 0 ? `+${m.pl.toLocaleString()}` : m.pl < 0 ? `-${Math.abs(m.pl).toLocaleString()}` : '0';
                        const plCls = m.pl > 0 ? 'inc' : m.pl < 0 ? 'exp' : 'bold';
                        return `
                        <tr>
                          <td class="bold" style="padding: 3.5px 3px; white-space: nowrap;">${m.label}</td>
                          <td class="num" style="padding: 3.5px 3px; white-space: nowrap;">${m.open.toLocaleString()}</td>
                          <td class="num inc" style="padding: 3.5px 3px; white-space: nowrap;">+${m.income.toLocaleString()}</td>
                          <td class="num exp" style="padding: 3.5px 3px; white-space: nowrap;">-${m.expense.toLocaleString()}</td>
                          <td class="num bold" style="padding: 3.5px 3px; white-space: nowrap;">${m.close.toLocaleString()}</td>
                          <td class="num ${plCls}" style="padding: 3.5px 3px; white-space: nowrap;">${plText}</td>
                        </tr>
                      `;
                      }).join('')}
                      <tr style="background: #f8fafc;">
                        <td class="bold" style="padding: 3.5px 3px;">Total</td>
                        <td class="num bold" style="padding: 3.5px 3px;">${summary.totalOpen.toLocaleString()}</td>
                        <td class="num inc" style="padding: 3.5px 3px;">+${summary.totalIncome.toLocaleString()}</td>
                        <td class="num exp" style="padding: 3.5px 3px;">-${summary.totalExpense.toLocaleString()}</td>
                        <td class="num bold" style="padding: 3.5px 3px;">${summary.totalClose.toLocaleString()}</td>
                        <td class="num ${summary.totalPL > 0 ? 'inc' : summary.totalPL < 0 ? 'exp' : 'bold'}" style="padding: 3.5px 3px;">${summary.totalPL > 0 ? `+${summary.totalPL.toLocaleString()}` : summary.totalPL < 0 ? `-${Math.abs(summary.totalPL).toLocaleString()}` : '0'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style="display: flex; flex-direction: column; gap: 6px; justify-content: space-between;">
                  <div class="section" style="margin-bottom: 0; padding: 7px 10px; flex: 1; display: flex; flex-direction: column; justify-content: space-between; background: ${summary.totalPL > 0 ? '#f0fdfa' : summary.totalPL < 0 ? '#fff1f2' : '#f8fafc'}; border-color: ${summary.totalPL > 0 ? '#99f6e4' : summary.totalPL < 0 ? '#fecdd3' : '#e2e8f0'};">
                    <div>
                      <div class="section-title" style="margin-bottom: 4px; padding-bottom: 4px;">
                        <span style="color: ${summary.totalPL > 0 ? '#0f766e' : summary.totalPL < 0 ? '#be123c' : '#334155'};">P/L Statement (${summary.month})</span>
                        <span style="color: ${summary.totalPL > 0 ? '#047857' : summary.totalPL < 0 ? '#be123c' : '#475569'};">
                          ${summary.totalPL > 0 ? 'PROFIT' : summary.totalPL < 0 ? 'LOSS' : 'EVEN'}
                        </span>
                      </div>
                      <div class="row-item">
                        <span>Income (${summary.incomeCount})</span>
                        <span class="inc">+${summary.totalIncome.toLocaleString()} BDT</span>
                      </div>
                      <div class="row-item">
                        <span>Expense (${summary.expenseCount})</span>
                        <span class="exp">-${summary.totalExpense.toLocaleString()} BDT</span>
                      </div>
                      <div class="row-item" style="border-bottom: none;">
                        <span>Profit Margin</span>
                        <span class="bold">${summary.totalIncome > 0 ? ((summary.totalPL / summary.totalIncome) * 100).toFixed(1) : '0.0'}%</span>
                      </div>
                    </div>
                    <div class="row-total" style="margin-top: 4px; padding-top: 4px; border-top-color: ${summary.totalPL > 0 ? '#99f6e4' : summary.totalPL < 0 ? '#fecdd3' : '#cbd5e1'}; color: ${summary.totalPL > 0 ? '#047857' : summary.totalPL < 0 ? '#be123c' : '#0f172a'};">
                      <span>Net P/L</span>
                      <span>${summary.totalPL > 0 ? `+${summary.totalPL.toLocaleString()} BDT` : summary.totalPL < 0 ? `-${Math.abs(summary.totalPL).toLocaleString()} BDT` : '0 BDT'}</span>
                    </div>
                  </div>

                  <div class="section" style="margin-bottom: 0; padding: 6px 10px; background: #fffbeb; border-color: #fde68a;">
                    <div class="section-title" style="margin-bottom: 3px; padding-bottom: 3px; border-bottom-color: #fde68a;">
                      <span style="color: #92400e;">Due Amount</span>
                      <span style="color: #b45309;">${summary.month}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 9.5px; color: #78350f;">
                      <span>Total Due</span>
                      <span class="bold" style="color: #b45309; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${summary.dueAmount.toLocaleString()} BDT</span>
                    </div>
                    ${summary.dueNotes ? `<div style="margin-top: 2px; font-size: 8.5px; color: #78350f;"><strong>Note:</strong> ${escapeHtml(summary.dueNotes)}</div>` : ''}
                  </div>

                  <div class="section" style="margin-bottom: 0; padding: 6px 10px; background: #f5f3ff; border-color: #ddd6fe;">
                    <div class="section-title" style="margin-bottom: 3px; padding-bottom: 3px; border-bottom-color: #ddd6fe;">
                      <span style="color: #5b21b6;">Discount</span>
                      <span style="color: #6d28d9;">${summary.month}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 9.5px; color: #4c1d95;">
                      <span>Total Discount</span>
                      <span class="bold" style="color: #6d28d9; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${summary.discountAmount.toLocaleString()} BDT</span>
                    </div>
                    ${summary.discountNotes ? `<div style="margin-top: 2px; font-size: 8.5px; color: #4c1d95;"><strong>Note:</strong> ${escapeHtml(summary.discountNotes)}</div>` : ''}
                  </div>
                </div>
              </div>

              <div class="grid-2">
                <div class="section" style="margin-bottom: 0;">
                  <div class="section-title">
                    <span>Latest Physical Cash</span>
                    <span>${summary.latestDrawerDoc ? summary.latestDrawerDoc.date : 'No Entry'}</span>
                  </div>
                  <div class="row-item"><span>KHA Office Cash</span><span class="bold">${(summary.latestDrawerDoc?.khaOfficeCash ?? 0).toLocaleString()} BDT</span></div>
                  <div class="row-item"><span>Dhaka Office Cash</span><span class="bold">${(summary.latestDrawerDoc?.dhakaOfficeCash ?? 0).toLocaleString()} BDT</span></div>
                  <div class="row-item"><span>Nayan Cash</span><span class="bold">${(summary.latestDrawerDoc?.nayanCash ?? 0).toLocaleString()} BDT</span></div>
                  <div class="row-item"><span>Account Cash</span><span class="bold">${(summary.latestDrawerDoc?.accountCash ?? 0).toLocaleString()} BDT</span></div>
                  <div class="row-total"><span>Total Physical Cash</span><span>${latestCashTotal.toLocaleString()} BDT</span></div>
                </div>

                <div class="section" style="margin-bottom: 0;">
                  <div class="section-title">
                    <span>Monthly Cash Transfers</span>
                    <span>${summary.month}</span>
                  </div>
                  <div class="row-item"><span>KHA Office to Nayan</span><span class="bold">${summary.transfers.khaToNayan.toLocaleString()} BDT</span></div>
                  <div class="row-item"><span>Nayan to Dhaka office</span><span class="bold">${summary.transfers.nayanToDhaka.toLocaleString()} BDT</span></div>
                  <div class="row-item"><span>Dhaka office to Nayan</span><span class="bold">${summary.transfers.dhakaToNayan.toLocaleString()} BDT</span></div>
                  <div class="row-item"><span>Dhaka office to KHA Office</span><span class="bold">${summary.transfers.dhakaToKha.toLocaleString()} BDT</span></div>
                  <div class="row-total"><span>Total Transfers</span><span>${summary.transfers.total.toLocaleString()} BDT</span></div>
                </div>
              </div>

              <div class="section">
                <div class="section-title">
                  <span style="color: #047857;">Category-Wise Income Statement (${summary.month})</span>
                  <span style="color: #047857;">Total: +${summary.totalIncome.toLocaleString()} BDT</span>
                </div>
                <div class="cat-grid-2">
                  ${summary.incomeCategories.map((c) => `
                    <div class="row-item">
                      <span>${escapeHtml(c.label)}${c.count > 0 ? ` (${c.count})` : ''}</span>
                      <span class="${c.amount > 0 ? 'inc' : 'bold'}">+${c.amount.toLocaleString()} BDT</span>
                    </div>
                  `).join('')}
                </div>
              </div>

              <div class="section" style="margin-bottom: 0;">
                <div class="section-title">
                  <span style="color: #be123c;">Category-Wise Expense Statement (${summary.month})</span>
                  <span style="color: #be123c;">Total: -${summary.totalExpense.toLocaleString()} BDT</span>
                </div>
                <div class="cat-grid-2">
                  ${summary.expenseCategories.map((c) => `
                    <div class="row-item">
                      <span>${escapeHtml(c.label)}${c.count > 0 ? ` (${c.count})` : ''}</span>
                      <span class="${c.amount > 0 ? 'exp' : 'bold'}">-${c.amount.toLocaleString()} BDT</span>
                    </div>
                  `).join('')}
                </div>
              </div>

              <div class="sigs">
                <div class="sig-box"><div class="sig-line">Prepared By</div></div>
                <div class="sig-box"><div class="sig-line">Approved By</div></div>
              </div>
            </div>
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                }, 250);
              };
            </script>
          </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
      } else {
        window.print();
      }
    } catch (err) {
      console.error('Failed to print Month Closing statement:', err);
      window.print();
    }
  };

  // 2A. Sync Opening Balances automatically for selectedDate
  useEffect(() => {
    const existingClosedToday = closings.find(
      (c) => c.date === selectedDate && c.status === 'closed'
    );

    if (existingClosedToday) {
      setOpeningCash((existingClosedToday.openingCash ?? 0).toString());
      setOpeningBkash((existingClosedToday.openingBkash ?? 0).toString());
      setOpeningNagad((existingClosedToday.openingNagad ?? 0).toString());
      setOpeningRocket((existingClosedToday.openingRocket ?? 0).toString());
      setOpeningBank((existingClosedToday.openingBank ?? 0).toString());
      setOpeningSsl((existingClosedToday.openingSsl ?? 0).toString());
      return;
    }

    const autoOpening = computeOpeningBalancesForDate(selectedDate);
    setOpeningCash(autoOpening.cash.toString());
    setOpeningBkash(autoOpening.bkash.toString());
    setOpeningNagad(autoOpening.nagad.toString());
    setOpeningRocket(autoOpening.rocket.toString());
    setOpeningBank(autoOpening.bank.toString());
    setOpeningSsl(autoOpening.sslcommerz.toString());
  }, [selectedDate, closings, dailyClosingOnlyTransactions]);

  // 2B. Load saved Cash Drawer inputs when selectedDate changes
  useEffect(() => {
    if (loading) return;
    const fetchDrawerForDate = async () => {
      try {
        setError('');
        const existingToday = closings.find((c) => c.date === selectedDate);
        const todayDocId = existingToday ? existingToday.id : `dc_${userId}_${selectedDate}`;
        const todayDocRef = doc(db, 'daily_closings', todayDocId);
        const todayDocSnap = await getDocFromServer(todayDocRef);

        if (todayDocSnap.exists()) {
          const todayData = todayDocSnap.data() as DailyClosing;
          if (lastDateRef.current !== selectedDate) {
            setKhaOfficeCash((todayData.khaOfficeCash ?? 0).toString());
            setDhakaOfficeCash((todayData.dhakaOfficeCash ?? 0).toString());
            setNayanCash((todayData.nayanCash ?? 0).toString());
            setAccountCash((todayData.accountCash ?? 0).toString());

            setTransferKhaToNayan((todayData.transferKhaToNayan ?? 0).toString());
            setTransferNayanToDhaka((todayData.transferNayanToDhaka ?? 0).toString());
            setTransferDhakaToNayan((todayData.transferDhakaToNayan ?? 0).toString());
            setTransferDhakaToKha((todayData.transferDhakaToKha ?? 0).toString());
            setIsDrawerSubmitted(!!todayData.isDrawerSubmitted);
          }
          lastDateRef.current = selectedDate;
          return;
        }

        if (lastDateRef.current !== selectedDate) {
          setKhaOfficeCash('0');
          setDhakaOfficeCash('0');
          setNayanCash('0');
          setAccountCash('0');

          setTransferKhaToNayan('0');
          setTransferNayanToDhaka('0');
          setTransferDhakaToNayan('0');
          setTransferDhakaToKha('0');
          setIsDrawerSubmitted(false);
        }
        lastDateRef.current = selectedDate;
      } catch (err) {
        console.error('Error fetching closing data:', err);
      }
    };

    fetchDrawerForDate();
  }, [selectedDate, userId, closings, loading]);

  // 3. Process current date Daily Closing transactions ONLY (dynamic aggregates)
  const dateTransactions = dailyClosingOnlyTransactions.filter(t => t.date === selectedDate);
  
  // Aggregate functions by payment method
  const getAggregates = (method: string) => {
    const methodTransactions = dateTransactions.filter(t => {
      const pm = (t.paymentMethod || 'cash').trim().toLowerCase();
      if (method === 'cash') {
        return pm === 'cash' || !t.paymentMethod;
      }
      return pm === method;
    });

    const income = methodTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const expense = methodTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    return { income, expense };
  };

  const cashFlow = getAggregates('cash');
  const bkashFlow = getAggregates('bkash');
  const nagadFlow = getAggregates('nagad');
  const rocketFlow = getAggregates('rocket');
  const bankFlow = getAggregates('bank');
  const sslFlow = getAggregates('sslcommerz');

  // Parse helper
  const val = (s: string) => {
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  // Closing calculations
  const closingCash = val(openingCash) + cashFlow.income - cashFlow.expense;
  const closingBkash = val(openingBkash) + bkashFlow.income - bkashFlow.expense;
  const closingNagad = val(openingNagad) + nagadFlow.income - nagadFlow.expense;
  const closingRocket = val(openingRocket) + rocketFlow.income - rocketFlow.expense;
  const closingBank = val(openingBank) + bankFlow.income - bankFlow.expense;
  const closingSsl = val(openingSsl) + sslFlow.income - sslFlow.expense;

  const totalOpening = val(openingCash) + val(openingBkash) + val(openingNagad) + val(openingRocket) + val(openingBank) + val(openingSsl);
  const totalInflow = cashFlow.income + bkashFlow.income + nagadFlow.income + rocketFlow.income + bankFlow.income + sslFlow.income;
  const totalOutflow = cashFlow.expense + bkashFlow.expense + nagadFlow.expense + rocketFlow.expense + bankFlow.expense + sslFlow.expense;
  const totalClosing = closingCash + closingBkash + closingNagad + closingRocket + closingBank + closingSsl;

  // Helper to retrieve the opening balance of a payment method
  const getPreviousBalanceForMethod = (method: string): number => {
    switch (method.toLowerCase()) {
      case 'cash': return val(openingCash);
      case 'bkash': return val(openingBkash);
      case 'nagad': return val(openingNagad);
      case 'rocket': return val(openingRocket);
      case 'bank': return val(openingBank);
      case 'sslcommerz': return val(openingSsl);
      default: return 0;
    }
  };

  const entryPreviousBalance = getPreviousBalanceForMethod(entryPaymentMethod);
  const entryClosingBalance = entryPreviousBalance + (parseFloat(entryAmount) || 0);

  const getPrevBalanceForTx = (tx: Transaction): number => {
    const method = (tx.paymentMethod || 'cash').trim().toLowerCase() || 'cash';

    if (tx.date === selectedDate) {
      return getPreviousBalanceForMethod(method);
    }

    const closedOnTxDate = closings.find((c) => c.date === tx.date && c.status === 'closed');
    if (closedOnTxDate) {
      switch (method) {
        case 'cash': return Number(closedOnTxDate.openingCash ?? 0);
        case 'bkash': return Number(closedOnTxDate.openingBkash ?? 0);
        case 'nagad': return Number(closedOnTxDate.openingNagad ?? 0);
        case 'rocket': return Number(closedOnTxDate.openingRocket ?? 0);
        case 'bank': return Number(closedOnTxDate.openingBank ?? 0);
        case 'sslcommerz': return Number(closedOnTxDate.openingSsl ?? 0);
        default: return 0;
      }
    }

    const openingForTxDate = computeOpeningBalancesForDate(tx.date);
    switch (method) {
      case 'cash': return openingForTxDate.cash;
      case 'bkash': return openingForTxDate.bkash;
      case 'nagad': return openingForTxDate.nagad;
      case 'rocket': return openingForTxDate.rocket;
      case 'bank': return openingForTxDate.bank;
      case 'sslcommerz': return openingForTxDate.sslcommerz;
      default: return 0;
    }
  };

  const getCategoryLabel = (tx: Transaction) => {
    if (tx.type === 'income') {
      const incomeLabels: Record<string, string> = {
        customer_bill: 'Customer Bill Collection',
        reseller_bill: 'Reseller Bill Collection',
        service_charge: 'Service Charge Collection',
        other_income: 'Other Income',
      };
      return incomeLabels[tx.category] || tx.category;
    } else {
      return EXPENSE_CATEGORY_LABELS[tx.category as ExpenseCategory]?.label || tx.category;
    }
  };

  const filteredDailyClosingTxs = dailyClosingOnlyTransactions
    .filter(t => {
      // 1. Search filter
      const categoryLabel = getCategoryLabel(t).toLowerCase();
      const notesLower = (t.notes || '').toLowerCase();
      const titleLower = (t.title || '').toLowerCase();
      const pmLower = (t.paymentMethod || 'cash').toLowerCase();
      const searchLower = searchTerm.toLowerCase();

      const matchesSearch = 
        categoryLabel.includes(searchLower) ||
        notesLower.includes(searchLower) ||
        titleLower.includes(searchLower) ||
        pmLower.includes(searchLower) ||
        t.amount.toString().includes(searchLower) ||
        t.date.includes(searchLower);

      // 2. Type Filter (income / expense)
      const matchesType = typeFilter === 'all' ? true : t.type === typeFilter;

      // 3. Category Filter
      const matchesCategory = categoryFilter === 'all' ? true : t.category === categoryFilter;

      // 4. Date Filter
      let matchesDate = true;
      if (quickDateFilter === 'today') {
        const todayStr = new Date().toISOString().split('T')[0];
        matchesDate = t.date === todayStr;
      } else if (quickDateFilter === 'this-month') {
        const now = new Date();
        const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        matchesDate = t.date.startsWith(currentYearMonth);
      } else if (quickDateFilter === 'last-month') {
        const now = new Date();
        let year = now.getFullYear();
        let month = now.getMonth(); // previous month index
        if (month === 0) {
          month = 12;
          year = year - 1;
        }
        const lastYearMonth = `${year}-${String(month).padStart(2, '0')}`;
        matchesDate = t.date.startsWith(lastYearMonth);
      } else if (quickDateFilter === 'custom') {
        if (startDate) {
          matchesDate = matchesDate && t.date >= startDate;
        }
        if (endDate) {
          matchesDate = matchesDate && t.date <= endDate;
        }
      }

      return matchesSearch && matchesType && matchesCategory && matchesDate;
    });

  // Sort daily closing transactions based on user selection
  const dailyClosingTxs = [...filteredDailyClosingTxs].sort((a, b) => {
    if (sortOrder === 'newest') {
      if (b.date !== a.date) {
        return b.date.localeCompare(a.date);
      }
      const timeA = a.createdAt || '';
      const timeB = b.createdAt || '';
      return timeB.localeCompare(timeA);
    } else {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      const timeA = a.createdAt || '';
      const timeB = b.createdAt || '';
      return timeA.localeCompare(timeB);
    }
  });

  const handleExportCSVLogs = () => {
    const headers = ['SL', 'Date', 'Category', 'Payment Method', 'Type', 'Amount (BDT)', 'Previous Balance (BDT)', 'Closing Balance (BDT)', 'Notes'];
    const csvContent = [
      headers.join(','),
      ...dailyClosingTxs.map((tx, idx) => {
        const prevBal = getPrevBalanceForTx(tx);
        const closingBal = tx.type === 'income' ? prevBal + tx.amount : prevBal - tx.amount;
        const categoryLabel = getCategoryLabel(tx);
        return [
          idx + 1,
          `"${tx.date}"`,
          `"${categoryLabel.replace(/"/g, '""')}"`,
          `"${(tx.paymentMethod || 'cash').toUpperCase()}"`,
          `"${tx.type.toUpperCase()}"`,
          tx.amount,
          prevBal,
          closingBal,
          `"${(tx.notes || '').replace(/"/g, '""')}"`
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `daily_closing_logs_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPDFLogs = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please disable your browser popup blocker and try again.');
      return;
    }

    const dateText = 
      quickDateFilter === 'today' ? 'Today\'s Logs' :
      quickDateFilter === 'this-month' ? 'Current Month Logs' :
      quickDateFilter === 'last-month' ? 'Previous Month Logs' :
      quickDateFilter === 'custom' ? `Period: ${startDate || 'Start'} to ${endDate || 'End'}` : 
      'All Time Logs';

    const typeText = 
      typeFilter === 'income' ? ' (Income Only)' :
      typeFilter === 'expense' ? ' (Expense Only)' : '';

    const totalIncome = dailyClosingTxs
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + (t.amount ?? 0), 0);
    const totalExpense = dailyClosingTxs
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + (t.amount ?? 0), 0);
    const netBalance = totalIncome - totalExpense;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Titas_Internet_Daily_Closing_Logs_${new Date().toISOString().split('T')[0]}</title>
          <meta charset="utf-8">
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            body {
              font-family: 'Inter', sans-serif;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            @media print {
              .no-print { display: none !important; }
              body { padding: 0; margin: 0; background: white; }
              @page { size: portrait; margin: 10mm; }
            }
          </style>
        </head>
        <body class="bg-slate-50 text-slate-800 p-4 md:p-8">
          <div class="max-w-[1000px] w-full mx-auto bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-100">
            
            <div class="no-print flex justify-between items-center bg-indigo-50 p-4 rounded-xl border border-indigo-100 mb-8">
              <div class="flex items-center gap-2">
                <span class="flex h-2 w-2 relative">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
                </span>
                <span class="text-xs font-bold text-indigo-800">Daily Closing Logs Report Preview</span>
              </div>
              <div class="flex gap-2.5">
                <button onclick="window.print()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg cursor-pointer shadow-sm transition">
                  🖨️ Print Report / Save PDF
                </button>
                <button onclick="window.close()" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs px-4 py-2 rounded-lg cursor-pointer transition">
                  Close
                </button>
              </div>
            </div>

            <div class="flex flex-col md:flex-row justify-between items-start md:items-center border-b-2 border-slate-100 pb-6 mb-8 gap-4">
              <div>
                <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Titas Internet</h1>
                <p class="text-xs font-semibold text-slate-500 mt-1">Daily Closing & Accounts Statement Logs</p>
                <p class="text-[11px] text-slate-400 font-medium mt-0.5">Generated on: ${new Date().toLocaleString('en-US', { hour12: true })}</p>
              </div>
              <div class="md:text-right">
                <span class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50/70 border border-indigo-100/60 rounded-xl text-xs font-bold text-indigo-700">
                  📅 ${dateText}${typeText}
                </span>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div class="p-4 rounded-xl border border-emerald-100 bg-emerald-50/20 text-left">
                <span class="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">Total Daily Inflows (+)</span>
                <h3 class="text-xl font-extrabold text-emerald-800 mt-1">৳ ${totalIncome.toLocaleString()}</h3>
              </div>

              <div class="p-4 rounded-xl border border-rose-100 bg-rose-50/20 text-left">
                <span class="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">Total Daily Outflows (-)</span>
                <h3 class="text-xl font-extrabold text-rose-800 mt-1">৳ ${totalExpense.toLocaleString()}</h3>
              </div>

              <div class="p-4 rounded-xl border border-indigo-100 bg-indigo-50/20 text-left">
                <span class="text-[11px] font-bold text-indigo-700 uppercase tracking-wider block">Net Balance Flow (=)</span>
                <h3 class="text-xl font-extrabold text-indigo-800 mt-1">৳ ${netBalance.toLocaleString()}</h3>
              </div>
            </div>

            <div class="mb-8 overflow-x-auto">
              <h3 class="text-xs font-bold text-slate-700 mb-3 border-b pb-1.5 uppercase tracking-wider">📝 Daily Closing Logs Statement</h3>
              <table class="w-full text-left text-[11px] border-collapse min-w-[800px]">
                <thead>
                  <tr class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <th class="py-2.5 px-3">S/L</th>
                    <th class="py-2.5 px-3">Date</th>
                    <th class="py-2.5 px-3">Category</th>
                    <th class="py-2.5 px-3">Payment Method</th>
                    <th class="py-2.5 px-3 text-right">Income / Expense</th>
                    <th class="py-2.5 px-3 text-right">Previous Balance</th>
                    <th class="py-2.5 px-3 text-right">Closing Balance</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${dailyClosingTxs.length === 0 ? `
                    <tr>
                      <td colspan="7" class="py-8 text-center text-slate-400 font-bold">No daily closing transactions found for the selected criteria.</td>
                    </tr>
                  ` : dailyClosingTxs.map((tx, idx) => {
                    const prevBal = getPrevBalanceForTx(tx) ?? 0;
                    const amt = tx.amount ?? 0;
                    const closingBal = tx.type === 'income' ? prevBal + amt : prevBal - amt;
                    const catLabel = getCategoryLabel(tx);
                    const isInc = tx.type === 'income';

                    return `
                      <tr class="hover:bg-slate-50/30">
                        <td class="py-2.5 px-3 text-slate-500 font-semibold font-mono">${idx + 1}</td>
                        <td class="py-2.5 px-3 text-slate-500 font-semibold font-mono whitespace-nowrap">${tx.date}</td>
                        <td class="py-2.5 px-3 font-bold text-slate-800">${catLabel}</td>
                        <td class="py-2.5 px-3 whitespace-nowrap">
                          <span class="inline-block bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase font-mono">
                            ${tx.paymentMethod || 'cash'}
                          </span>
                        </td>
                        <td class="py-2.5 px-3 text-right font-bold font-mono whitespace-nowrap ${isInc ? 'text-emerald-600' : 'text-rose-600'}">
                          ${isInc ? '+' : '-'} ৳ ${amt.toLocaleString()}
                        </td>
                        <td class="py-2.5 px-3 text-right font-mono text-slate-500">৳ ${prevBal.toLocaleString()}</td>
                        <td class="py-2.5 px-3 text-right font-extrabold font-mono text-indigo-900">৳ ${closingBal.toLocaleString()}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <div class="grid grid-cols-2 gap-12 pt-10 border-t border-dashed border-slate-300 mt-12">
              <div class="text-center">
                <div class="w-36 border-b border-slate-400 mx-auto mb-1.5 h-8"></div>
                <p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Accountant Signature</p>
              </div>
              <div class="text-center">
                <div class="w-36 border-b border-slate-400 mx-auto mb-1.5 h-8"></div>
                <p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Approving Officer Signature</p>
              </div>
            </div>

          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 400);
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handlePrintLogsSummary = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please disable your browser popup blocker and try again.');
      return;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthNumber = now.getMonth() + 1;
    const currentYearMonth = `${currentYear}-${String(currentMonthNumber).padStart(2, '0')}`;
    
    const monthNamesEnglish = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const currentMonthNameEnglish = monthNamesEnglish[now.getMonth()];

    const totalIncome = dailyClosingTxs
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + (t.amount ?? 0), 0);
    const totalExpense = dailyClosingTxs
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + (t.amount ?? 0), 0);
    const netBalance = totalIncome - totalExpense;

    const methodFlows: { [key: string]: { income: number; expense: number } } = {};
    dailyClosingTxs.forEach(t => {
      const pm = (t.paymentMethod || 'cash').toUpperCase();
      if (!methodFlows[pm]) {
        methodFlows[pm] = { income: 0, expense: 0 };
      }
      if (t.type === 'income') {
        methodFlows[pm].income += (t.amount ?? 0);
      } else {
        methodFlows[pm].expense += (t.amount ?? 0);
      }
    });

    const methodSummaryList = Object.entries(methodFlows).map(([method, data]) => ({
      method,
      income: data.income,
      expense: data.expense
    }));

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Daily_Closing_Summary_${currentYearMonth}</title>
          <meta charset="utf-8">
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            body {
              font-family: 'Inter', sans-serif;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            @media print {
              .no-print { display: none !important; }
              body { padding: 0; margin: 0; background: white; }
              @page { size: portrait; margin: 10mm; }
            }
          </style>
        </head>
        <body class="bg-slate-50 text-slate-800 p-4 md:p-8">
          <div class="max-w-[800px] w-full mx-auto bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-100">
            
            <div class="no-print flex justify-between items-center bg-emerald-50 p-4 rounded-xl border border-emerald-100 mb-8">
              <span class="text-xs font-bold text-emerald-800">Monthly Closing Summary Report Preview</span>
              <div class="flex gap-2">
                <button onclick="window.print()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-lg cursor-pointer shadow-sm transition">
                  🖨️ Print
                </button>
                <button onclick="window.close()" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs px-4 py-2 rounded-lg cursor-pointer transition">
                  Close
                </button>
              </div>
            </div>

            <div class="text-center border-b-2 border-slate-100 pb-6 mb-8">
              <h1 class="text-2xl font-extrabold text-slate-900">TITAS ISP SYSTEM</h1>
              <p class="text-xs font-semibold text-slate-500 mt-1">Monthly Transaction and Daily Closing Summary Report</p>
              <span class="inline-block mt-3 bg-indigo-50 text-indigo-700 font-bold text-[11px] px-3.5 py-1.5 rounded-full uppercase">
                Summary of ${currentMonthNameEnglish} ${currentYear}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-4 mb-8">
              <div class="p-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs">
                <span class="text-slate-400 font-bold block uppercase mb-1">Report Period</span>
                <span class="font-extrabold text-slate-800 text-sm">${currentMonthNameEnglish} - ${currentYear}</span>
              </div>
              <div class="p-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs">
                <span class="text-slate-400 font-bold block uppercase mb-1">Print Timestamp</span>
                <span class="font-extrabold text-slate-800 text-sm">${new Date().toLocaleString('en-US', { hour12: true })}</span>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-4 mb-8">
              <div class="p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                <span class="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Total Inflow (+)</span>
                <span class="text-base font-black text-emerald-800 mt-1 block">BDT ${totalIncome.toLocaleString()}</span>
              </div>
              <div class="p-4 bg-rose-50 border border-rose-100 rounded-xl">
                <span class="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">Total Outflow (-)</span>
                <span class="text-base font-black text-rose-800 mt-1 block">BDT ${totalExpense.toLocaleString()}</span>
              </div>
              <div class="p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                <span class="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">Net Balance (=)</span>
                <span class="text-base font-black text-indigo-800 mt-1 block">BDT ${netBalance.toLocaleString()}</span>
              </div>
            </div>

            <h3 class="text-xs font-bold text-slate-700 mb-3 uppercase tracking-wider">💳 Method-Wise Summary Breakdown</h3>
            <table class="w-full text-left text-[11px] border-collapse border border-slate-200 rounded-xl overflow-hidden mb-8">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <th class="py-2.5 px-3">Payment Method</th>
                  <th class="py-2.5 px-3 text-right">Inflow (+)</th>
                  <th class="py-2.5 px-3 text-right">Outflow (-)</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${methodSummaryList.length === 0 ? `
                  <tr>
                    <td colspan="3" class="py-6 text-center text-slate-400 font-bold">No payment method records found.</td>
                  </tr>
                ` : methodSummaryList.map(item => `
                  <tr>
                    <td class="py-2.5 px-3 font-bold text-slate-800">${item.method}</td>
                    <td class="py-2.5 px-3 text-right font-bold text-emerald-600">BDT ${item.income.toLocaleString()}</td>
                    <td class="py-2.5 px-3 text-right font-bold text-rose-600">BDT ${item.expense.toLocaleString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <h3 class="text-xs font-bold text-slate-700 mb-3 uppercase tracking-wider">📝 Detailed Logs</h3>
            <table class="w-full text-left text-[11px] border-collapse border border-slate-200 rounded-xl overflow-hidden mb-8">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                  <th class="py-2.5 px-3">Date</th>
                  <th class="py-2.5 px-3">Category</th>
                  <th class="py-2.5 px-3 text-center">Type</th>
                  <th class="py-2.5 px-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${dailyClosingTxs.slice(0, 15).map(tx => {
                  const isInc = tx.type === 'income';
                  const catLabel = getCategoryLabel(tx);
                  return `
                    <tr>
                      <td class="py-2.5 px-3 font-mono font-semibold text-slate-500">${tx.date}</td>
                      <td class="py-2.5 px-3 font-bold text-slate-800">${catLabel}</td>
                      <td class="py-2.5 px-3 text-center">
                        <span class="inline-block px-2 py-0.5 rounded text-[9px] font-bold ${isInc ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}">
                          ${isInc ? 'Income' : 'Expense'}
                        </span>
                      </td>
                      <td class="py-2.5 px-3 text-right font-bold font-mono ${isInc ? 'text-emerald-600' : 'text-rose-600'}">
                        BDT ${(tx.amount ?? 0).toLocaleString()}
                      </td>
                    </tr>
                  `;
                }).join('')}
                ${dailyClosingTxs.length > 15 ? `
                  <tr>
                    <td colspan="4" class="py-3 text-center text-slate-400 italic">Showing top 15 entries. Use full PDF Report download for complete details.</td>
                  </tr>
                ` : ''}
              </tbody>
            </table>

            <div class="signature-footer flex justify-between gap-12 pt-16 border-t border-dashed border-slate-200 mt-12">
              <div class="text-center w-36">
                <div class="border-b border-slate-300 w-full mb-1 h-6"></div>
                <p class="text-[9px] font-bold text-slate-500 uppercase">Prepared By</p>
              </div>
              <div class="text-center w-36">
                <div class="border-b border-slate-300 w-full mb-1 h-6"></div>
                <p class="text-[9px] font-bold text-slate-500 uppercase">Authorized Signature</p>
              </div>
            </div>

          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 400);
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Add a new Daily Closing Entry Statement (Income Transaction)
  const handleAddEntryStatement = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const isClosed = closings.some(c => c.date === selectedDate && c.status === 'closed');
    if (isClosed) {
      setError('Cannot add entry: This date is locked and closed. Please unlock/reopen the day first.');
      return;
    }

    if (!entryAmount || parseFloat(entryAmount) <= 0) {
      setError('Please enter a valid Today Income amount.');
      return;
    }

    const titleMap: Record<string, string> = {
      customer_bill: 'Customer Bill Collection',
      reseller_bill: 'Reseller Bill Collection',
      service_charge: 'Service Charge Collection',
      other_income: 'Other Income',
    };

    const newTxId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const txDocRef = doc(db, 'transactions', newTxId);

    const newTx = {
      id: newTxId,
      userId,
      type: 'income',
      title: titleMap[entryCategory] || 'Income Statement',
      amount: parseFloat(entryAmount),
      category: entryCategory,
      date: selectedDate,
      paymentMethod: entryPaymentMethod,
      notes: `Daily Closing entry statement: ${titleMap[entryCategory] || 'Income'}`,
      isDailyClosing: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(txDocRef, newTx);
      setSuccess('Income statement entry added successfully!');
      setEntryAmount('');
      setActiveEntryModal(null);
      setTimeout(() => setSuccess(''), 5500);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `transactions/${newTxId}`);
    }
  };

  // Add a new Daily Closing Expense Statement (Expense Transaction)
  const handleAddExpenseEntryStatement = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const isClosed = closings.some(c => c.date === selectedDate && c.status === 'closed');
    if (isClosed) {
      setError('Cannot add expense: This date is locked and closed. Please unlock/reopen the day first.');
      return;
    }

    if (!expenseAmount || parseFloat(expenseAmount) <= 0) {
      setError('Please enter a valid Today Expense amount.');
      return;
    }

    const titleMap: Record<string, string> = {
      office_rent: 'Office Rent',
      transport: 'Transport',
      fuel: 'Fuel',
      materials: 'Materials',
      utilities: 'Utilities',
      promotion: 'Promotion',
      bandwidth_bill: 'Bandwidth Bill',
      software_bill: 'Software Bill',
      emoney_charge: 'E-Money Charge',
      salary: 'Salary',
      mobile_bill: 'Mobile Bill',
      office_expense: 'Office Expense',
      entertainment: 'Entertainment',
      allowance: 'Allowance',
      other_expense: 'Other Expense',
    };

    const newTxId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const txDocRef = doc(db, 'transactions', newTxId);

    const newTx = {
      id: newTxId,
      userId,
      type: 'expense',
      title: titleMap[expenseCategory] || 'Expense Statement',
      amount: parseFloat(expenseAmount),
      category: expenseCategory,
      date: selectedDate,
      paymentMethod: expensePaymentMethod,
      notes: `Daily Closing expense statement: ${titleMap[expenseCategory] || 'Expense'}`,
      isDailyClosing: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(txDocRef, newTx);
      setSuccess('Expense statement entry added successfully!');
      setExpenseAmount('');
      setActiveEntryModal(null);
      setTimeout(() => setSuccess(''), 5500);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `transactions/${newTxId}`);
    }
  };

  // Delete an Entry Statement
  const handleDeleteEntryStatement = (txId: string) => {
    const tx = transactions.find(t => t.id === txId);
    if (tx) {
      const isClosed = closings.some(c => c.date === tx.date && c.status === 'closed');
      if (isClosed) {
        setError('Cannot delete transaction: This date has been locked and closed. Please unlock/reopen the day first.');
        setTimeout(() => setError(''), 5500);
        return;
      }
    }

    setConfirmModal({
      message: 'Delete Entry Statement?',
      description: 'Are you sure you want to delete this entry statement? This action cannot be undone.',
      onConfirm: async () => {
        setError('');
        setSuccess('');
        try {
          await deleteDoc(doc(db, 'transactions', txId));
          setSuccess('Entry statement deleted successfully.');
          setTimeout(() => setSuccess(''), 5500);
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `transactions/${txId}`);
        }
      }
    });
  };

  // Start editing a Statement
  const handleStartEdit = (tx: Transaction) => {
    const isClosed = closings.some(c => c.date === tx.date && c.status === 'closed');
    if (isClosed) {
      setError('Cannot edit transaction: This date has been locked and closed. Please unlock/reopen the day first.');
      setTimeout(() => setError(''), 5500);
      return;
    }
    setEditingTx(tx);
    setEditingTxCategory(tx.category);
    setEditingTxAmount(tx.amount.toString());
    setEditingTxPaymentMethod(tx.paymentMethod || 'cash');
  };

  // Submit Edited Statement
  const handleEditTxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;
    setError('');
    setSuccess('');

    const isClosed = closings.some(c => c.date === editingTx.date && c.status === 'closed');
    if (isClosed) {
      setError('Cannot save changes: This date is locked and closed. Please unlock/reopen the day first.');
      setTimeout(() => setError(''), 5500);
      return;
    }

    const amt = parseFloat(editingTxAmount);
    if (isNaN(amt) || amt <= 0) {
      setError('Please enter a valid amount.');
      return;
    }

    try {
      const txDocRef = doc(db, 'transactions', editingTx.id);
      let notesText = '';
      let titleText = '';

      if (editingTx.type === 'income') {
        const titleMap: Record<string, string> = {
          customer_bill: 'Customer Bill Collection Statement',
          reseller_bill: 'Reseller Bill Collection Statement',
          service_charge: 'Service Charge Collection Statement',
          other_income: 'Other Income Statement',
        };
        titleText = titleMap[editingTxCategory] || 'Income Statement';
        notesText = `Daily Closing entry statement: ${titleText}`;
      } else {
        const titleMap: Record<string, string> = {
          bandwidth_bill: 'Bandwidth Bill',
          software_bill: 'Software Bill',
          emoney_charge: 'E-Money Charge',
          salary: 'Salary',
          mobile_bill: 'Mobile Bill',
          office_expense: 'Office Expense',
          entertainment: 'Entertainment',
          allowance: 'Allowance',
          other_expense: 'Other Expense',
          transport: 'Transport',
          fuel: 'Fuel',
          materials: 'Materials',
          utilities: 'Utilities',
          promotion: 'Promotion',
        };
        titleText = titleMap[editingTxCategory] || 'Expense Statement';
        notesText = `Daily Closing expense statement: ${titleText}`;
      }

      await setDoc(txDocRef, {
        ...editingTx,
        category: editingTxCategory,
        paymentMethod: editingTxPaymentMethod,
        amount: amt,
        title: titleText,
        notes: notesText,
        updatedAt: serverTimestamp()
      });

      setSuccess('Statement entry updated successfully!');
      setEditingTx(null);
      setTimeout(() => setSuccess(''), 5500);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `transactions/${editingTx.id}`);
    }
  };

  // Submit Cash Drawer Statement
  const handleDrawerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const kha = parseFloat(khaOfficeCash || '0');
    const dhaka = parseFloat(dhakaOfficeCash || '0');
    const nayan = parseFloat(nayanCash || '0');
    const acc = parseFloat(accountCash || '0');
    
    const tKhaNayan = parseFloat(transferKhaToNayan || '0');
    const tNayanDhaka = parseFloat(transferNayanToDhaka || '0');
    const tDhakaNayan = parseFloat(transferDhakaToNayan || '0');
    const tDhakaKha = parseFloat(transferDhakaToKha || '0');

    if (kha < 0 || dhaka < 0 || nayan < 0 || acc < 0 || tKhaNayan < 0 || tNayanDhaka < 0 || tDhakaNayan < 0 || tDhakaKha < 0) {
      setError('Amounts cannot be negative.');
      return;
    }

    setIsDrawerSubmitted(true);

    const existingClosing = closings.find(c => c.date === selectedDate);
    const docId = existingClosing ? existingClosing.id : `dc_${userId}_${selectedDate}`;
    try {
      const docRef = doc(db, 'daily_closings', docId);
      const docSnap = await getDoc(docRef);

      const payload: Partial<DailyClosing> = {
        id: docId,
        userId,
        date: selectedDate,
        khaOfficeCash: kha,
        dhakaOfficeCash: dhaka,
        nayanCash: nayan,
        accountCash: acc,
        transferKhaToNayan: tKhaNayan,
        transferNayanToDhaka: tNayanDhaka,
        transferDhakaToNayan: tDhakaNayan,
        transferDhakaToKha: tDhakaKha,
        isDrawerSubmitted: true,
        status: docSnap.exists() ? (docSnap.data()?.status || 'open') : 'open',
        updatedAt: serverTimestamp()
      };

      if (!docSnap.exists()) {
        payload.openingCash = parseFloat(openingCash || '0');
        payload.openingBkash = parseFloat(openingBkash || '0');
        payload.openingNagad = parseFloat(openingNagad || '0');
        payload.openingRocket = parseFloat(openingRocket || '0');
        payload.openingBank = parseFloat(openingBank || '0');
        payload.openingSsl = parseFloat(openingSsl || '0');
        payload.createdAt = serverTimestamp();
      }

      await setDoc(docRef, payload, { merge: true });
      setSuccess('Cash Details statement successfully submitted and saved!');
      setActiveEntryModal(null);
      setTimeout(() => setSuccess(''), 5500);
    } catch (err) {
      console.error('Error saving drawer statement:', err);
      setError('Failed to save cash drawer statement to database.');
    }
  };

  const handleModifyDrawer = async () => {
    setIsDrawerSubmitted(false);
    const existingClosing = closings.find(c => c.date === selectedDate);
    const docId = existingClosing ? existingClosing.id : `dc_${userId}_${selectedDate}`;
    try {
      const docRef = doc(db, 'daily_closings', docId);
      await setDoc(docRef, { isDrawerSubmitted: false, updatedAt: serverTimestamp() }, { merge: true });
      setSuccess('Statement submission reset. You can now modify the values above.');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      console.error('Error updating drawer submission state:', err);
    }
  };

  // 4. Submit Daily Closing Day
  const handleSaveClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (currentUserProfile && !currentUserProfile.permissions?.canManageDailyClosing) {
      setError('Access Denied: You do not possess permission to lock closing statements.');
      return;
    }

    if (!selectedDate) {
      setError('Please select a valid date.');
      return;
    }

    const existingClosing = closings.find(c => c.date === selectedDate);
    const docId = existingClosing ? existingClosing.id : `dc_${userId}_${selectedDate}`;
    
    try {
      const docRef = doc(db, 'daily_closings', docId);
      const docSnap = await getDoc(docRef);

      const payload: any = {
        id: docId,
        userId,
        date: selectedDate,
        openingCash: val(openingCash),
        openingBkash: val(openingBkash),
        openingNagad: val(openingNagad),
        openingRocket: val(openingRocket),
        openingBank: val(openingBank),
        openingSsl: val(openingSsl),

        closingCash,
        closingBkash,
        closingNagad,
        closingRocket,
        closingBank,
        closingSsl,

        totalCashIn: cashFlow.income,
        totalBkashIn: bkashFlow.income,
        totalNagadIn: nagadFlow.income,
        totalRocketIn: rocketFlow.income,
        totalBankIn: bankFlow.income,
        totalSslIn: sslFlow.income,

        totalCashOut: cashFlow.expense,
        totalBkashOut: bkashFlow.expense,
        totalNagadOut: nagadFlow.expense,
        totalRocketOut: rocketFlow.expense,
        totalBankOut: bankFlow.expense,
        totalSslOut: sslFlow.expense,

        khaOfficeCash: val(khaOfficeCash),
        dhakaOfficeCash: val(dhakaOfficeCash),
        nayanCash: val(nayanCash),
        accountCash: val(accountCash),

        transferKhaToNayan: val(transferKhaToNayan),
        transferNayanToDhaka: val(transferNayanToDhaka),
        transferDhakaToNayan: val(transferDhakaToNayan),
        transferDhakaToKha: val(transferDhakaToKha),

        notes: notes.trim(),
        status: 'closed',
        closedBy: currentUserProfile?.email || 'System Admin',
        updatedAt: serverTimestamp()
      };

      if (!docSnap.exists()) {
        payload.createdAt = serverTimestamp();
      }

      await setDoc(docRef, payload, { merge: true });
      setSuccess(`Daily closing for ${selectedDate} has been successfully completed and locked.`);
      setNotes('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `daily_closings/${docId}`);
    }
  };

  // 5. Delete/Reopen Closing
  const handleReopenClosing = (id: string, dateStr: string) => {
    setConfirmModal({
      message: 'Reopen Daily Closing?',
      description: `Are you sure you want to reopen and unlock the daily closing for ${dateStr}? This will let you edit or delete transactions for this date.`,
      onConfirm: async () => {
        try {
          const docRef = doc(db, 'daily_closings', id);
          await setDoc(docRef, { status: 'open', updatedAt: serverTimestamp() }, { merge: true });
          setSuccess(`Daily closing for ${dateStr} has been successfully reopened.`);
          setTimeout(() => setSuccess(''), 5000);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `daily_closings/${id}`);
        }
      }
    });
  };

  // Print the currently active selected date closing
  const handlePrintCurrent = () => {
    const existing = closings.find(c => c.date === selectedDate);
    if (existing && existing.status === 'closed') {
      setPrintPreviewData(existing);
    } else {
      const activeObj: DailyClosing = {
        id: existing ? existing.id : `dc_${userId}_${selectedDate}`,
        userId: existing?.userId || userId,
        date: selectedDate,
        openingCash: val(openingCash),
        openingBkash: val(openingBkash),
        openingNagad: val(openingNagad),
        openingRocket: val(openingRocket),
        openingBank: val(openingBank),
        openingSsl: val(openingSsl),

        closingCash,
        closingBkash,
        closingNagad,
        closingRocket,
        closingBank,
        closingSsl,

        totalCashIn: cashFlow.income,
        totalBkashIn: bkashFlow.income,
        totalNagadIn: nagadFlow.income,
        totalRocketIn: rocketFlow.income,
        totalBankIn: bankFlow.income,
        totalSslIn: sslFlow.income,

        totalCashOut: cashFlow.expense,
        totalBkashOut: bkashFlow.expense,
        totalNagadOut: nagadFlow.expense,
        totalRocketOut: rocketFlow.expense,
        totalBankOut: bankFlow.expense,
        totalSslOut: sslFlow.expense,

        khaOfficeCash: val(khaOfficeCash),
        dhakaOfficeCash: val(dhakaOfficeCash),
        nayanCash: val(nayanCash),
        accountCash: val(accountCash),

        transferKhaToNayan: val(transferKhaToNayan),
        transferNayanToDhaka: val(transferNayanToDhaka),
        transferDhakaToNayan: val(transferDhakaToNayan),
        transferDhakaToKha: val(transferDhakaToKha),

        notes: notes.trim() || existing?.notes || '',
        status: existing?.status || 'open',
        closedBy: existing?.closedBy || currentUserProfile?.email || 'System Admin',
      };
      setPrintPreviewData(activeObj);
    }
  };

  // 6. Direct Print Layout
  const handlePrint = (dc: DailyClosing) => {
    setPrintPreviewData(dc);
  };

  const handleDownloadClosingPDF = (dc: DailyClosing) => {
    try {
      const doc = new jsPDF();
      
      // Top accent bar (teal color)
      doc.setFillColor(13, 148, 136);
      doc.rect(0, 0, 210, 8, 'F');
      
      // Title Block
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text('Titas Broadband & Accounting', 14, 24);
      
      doc.setFont('helvetica', 'medium');
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text('Daily Closing & Financial Statement Report', 14, 30);
      
      // Metadata
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(`Report Date: ${dc.date}`, 14, 39);
      doc.text(`Generated By: ${dc.closedBy || 'System Admin'}`, 14, 44);
      doc.text(`System Status: ${(dc.status || 'open').toUpperCase()}`, 120, 39);
      doc.text(`Run Time: ${new Date().toLocaleTimeString()} BDT`, 120, 44);
      
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.line(14, 49, 196, 49);

      const tableRows = [
        ['Cash', `${(dc.openingCash ?? 0).toLocaleString()} BDT`, `+${(dc.totalCashIn ?? 0).toLocaleString()} BDT`, `-${(dc.totalCashOut ?? 0).toLocaleString()} BDT`, `${(dc.closingCash ?? 0).toLocaleString()} BDT`],
        ['bKash', `${(dc.openingBkash ?? 0).toLocaleString()} BDT`, `+${(dc.totalBkashIn ?? 0).toLocaleString()} BDT`, `-${(dc.totalBkashOut ?? 0).toLocaleString()} BDT`, `${(dc.closingBkash ?? 0).toLocaleString()} BDT`],
        ['Nagad', `${(dc.openingNagad ?? 0).toLocaleString()} BDT`, `+${(dc.totalNagadIn ?? 0).toLocaleString()} BDT`, `-${(dc.totalNagadOut ?? 0).toLocaleString()} BDT`, `${(dc.closingNagad ?? 0).toLocaleString()} BDT`],
        ['Rocket', `${(dc.openingRocket ?? 0).toLocaleString()} BDT`, `+${(dc.totalRocketIn ?? 0).toLocaleString()} BDT`, `-${(dc.totalRocketOut ?? 0).toLocaleString()} BDT`, `${(dc.closingRocket ?? 0).toLocaleString()} BDT`],
        ['Bank Transfer', `${(dc.openingBank ?? 0).toLocaleString()} BDT`, `+${(dc.totalBankIn ?? 0).toLocaleString()} BDT`, `-${(dc.totalBankOut ?? 0).toLocaleString()} BDT`, `${(dc.closingBank ?? 0).toLocaleString()} BDT`],
        ['SSL Commerz', `${(dc.openingSsl ?? 0).toLocaleString()} BDT`, `+${(dc.totalSslIn ?? 0).toLocaleString()} BDT`, `-${(dc.totalSslOut ?? 0).toLocaleString()} BDT`, `${(dc.closingSsl ?? 0).toLocaleString()} BDT`],
      ];

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text('Detailed Breakdown by Payment Method', 14, 56);

      autoTable(doc, {
        startY: 60,
        head: [['Payment Method', 'Opening Balance', 'Total Collection (+)', 'Total Expense (-)', 'Closing Balance']],
        body: tableRows,
        theme: 'striped',
        headStyles: {
          fillColor: [13, 148, 136], // teal-600
          textColor: [255, 255, 255],
          fontSize: 8.5,
          fontStyle: 'bold',
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [51, 65, 85],
        },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'right', textColor: [5, 150, 105] }, // emerald-600
          3: { halign: 'right', textColor: [225, 29, 72] },  // rose-600
          4: { halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42] },
        },
        styles: {
          font: 'helvetica',
          cellPadding: 3,
        },
        margin: { left: 14, right: 14 }
      });

      let nextStartY = (doc as any).lastAutoTable.finalY + 12;

      // Cash Drawer Statement (Physical Cash & Transfers) in PDF
      if (nextStartY + 50 > 280) {
        doc.addPage();
        nextStartY = 20;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text('Cash Drawer Statement (Physical Cash & Transfers)', 14, nextStartY);

      const drawerRows = [
        ['KHA Office Cash', `${(dc.khaOfficeCash ?? 0).toLocaleString()} BDT`, 'KHA Office to Nayan', `${(dc.transferKhaToNayan ?? 0).toLocaleString()} BDT`],
        ['Dhaka Office', `${(dc.dhakaOfficeCash ?? 0).toLocaleString()} BDT`, 'Nayan to Dhaka office', `${(dc.transferNayanToDhaka ?? 0).toLocaleString()} BDT`],
        ['Nayan Cash', `${(dc.nayanCash ?? 0).toLocaleString()} BDT`, 'Dhaka office to Nayan', `${(dc.transferDhakaToNayan ?? 0).toLocaleString()} BDT`],
        ['Account Cash', `${(dc.accountCash ?? 0).toLocaleString()} BDT`, 'Dhaka to KHA Office', `${(dc.transferDhakaToKha ?? 0).toLocaleString()} BDT`],
      ];

      autoTable(doc, {
        startY: nextStartY + 4,
        head: [['Cash Summary', 'Amount', 'Money Transfers', 'Amount']],
        body: drawerRows,
        theme: 'striped',
        headStyles: {
          fillColor: [71, 85, 105], // Slate-600
          textColor: [255, 255, 255],
          fontSize: 8.5,
          fontStyle: 'bold',
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [51, 65, 85],
        },
        columnStyles: {
          1: { halign: 'right', fontStyle: 'bold' },
          3: { halign: 'right', fontStyle: 'bold' },
        },
        styles: {
          font: 'helvetica',
          cellPadding: 3,
        },
        margin: { left: 14, right: 14 }
      });

      nextStartY = (doc as any).lastAutoTable.finalY + 12;

      // Filter and render Daily Closing Entry & Expense Logs
      const previewTxs = dailyClosingOnlyTransactions.filter(t => t.date === dc.date);
      if (previewTxs.length > 0) {
        if (nextStartY + 35 > 280) {
          doc.addPage();
          nextStartY = 20;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        doc.text('Daily Closing Entry & Expense Logs', 14, nextStartY);

        const txRows = previewTxs.map(t => [
          getCategoryLabel(t),
          t.paymentMethod || 'cash',
          t.type === 'income' ? 'INFLOW (+)' : 'OUTFLOW (-)',
          `${(t.amount ?? 0).toLocaleString()} BDT`
        ]);

        autoTable(doc, {
          startY: nextStartY + 4,
          head: [['Category', 'Payment Method', 'Type', 'Amount']],
          body: txRows,
          theme: 'striped',
          headStyles: {
            fillColor: [71, 85, 105], // slate-600
            textColor: [255, 255, 255],
            fontSize: 8.5,
            fontStyle: 'bold',
          },
          bodyStyles: {
            fontSize: 8,
            textColor: [51, 65, 85],
          },
          columnStyles: {
            2: { halign: 'center', fontStyle: 'bold' },
            3: { halign: 'right', fontStyle: 'bold' },
          },
          didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 2) {
              const val = data.cell.raw as string;
              if (val.includes('INFLOW')) {
                data.cell.styles.textColor = [5, 150, 105];
              } else {
                data.cell.styles.textColor = [225, 29, 72];
              }
            }
          },
          styles: {
            font: 'helvetica',
            cellPadding: 3,
          },
          margin: { left: 14, right: 14 }
        });

        nextStartY = (doc as any).lastAutoTable.finalY + 12;
      }

      // Financial Summary Box
      const totalIn = (dc.totalCashIn ?? 0) + (dc.totalBkashIn ?? 0) + (dc.totalNagadIn ?? 0) + (dc.totalRocketIn ?? 0) + (dc.totalBankIn ?? 0) + (dc.totalSslIn ?? 0);
      const totalOut = (dc.totalCashOut ?? 0) + (dc.totalBkashOut ?? 0) + (dc.totalNagadOut ?? 0) + (dc.totalRocketOut ?? 0) + (dc.totalBankOut ?? 0) + (dc.totalSslOut ?? 0);
      const totalOpenBal = (dc.openingCash ?? 0) + (dc.openingBkash ?? 0) + (dc.openingNagad ?? 0) + (dc.openingRocket ?? 0) + (dc.openingBank ?? 0) + (dc.openingSsl ?? 0);
      const totalCloseBal = (dc.closingCash ?? 0) + (dc.closingBkash ?? 0) + (dc.closingNagad ?? 0) + (dc.closingRocket ?? 0) + (dc.closingBank ?? 0) + (dc.closingSsl ?? 0);

      if (nextStartY + 36 > 280) {
        doc.addPage();
        nextStartY = 20;
      }

      doc.setDrawColor(15, 23, 42); // slate-900 border
      doc.setLineWidth(0.4);
      doc.rect(14, nextStartY, 182, 32);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.text('TOTAL OPENING BALANCE:', 18, nextStartY + 6);
      doc.text(`${totalOpenBal.toLocaleString()} BDT`, 192, nextStartY + 6, { align: 'right' });

      doc.setTextColor(5, 150, 105); // emerald-600
      doc.text('(+) TOTAL COLLECTION (INFLOW):', 18, nextStartY + 13);
      doc.text(`+ ${totalIn.toLocaleString()} BDT`, 192, nextStartY + 13, { align: 'right' });

      doc.setTextColor(225, 29, 72); // rose-600
      doc.text('(-) TOTAL EXPENSE (OUTFLOW):', 18, nextStartY + 20);
      doc.text(`- ${totalOut.toLocaleString()} BDT`, 192, nextStartY + 20, { align: 'right' });

      doc.setDrawColor(226, 232, 240);
      doc.line(18, nextStartY + 24, 192, nextStartY + 24);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('(=) GRAND CLOSING BALANCE:', 18, nextStartY + 29);
      doc.text(`${totalCloseBal.toLocaleString()} BDT`, 192, nextStartY + 29, { align: 'right' });

      nextStartY += 38;

      // Category-Wise Income & Expense Statements in Daily Closing PDF
      const { incomeCategories: pdfIncomeCats, expenseCategories: pdfExpenseCats } = computeCategoryBreakdown(previewTxs);
      const pdfIncomeTotal = pdfIncomeCats.reduce((sum, c) => sum + c.amount, 0);
      const pdfExpenseTotal = pdfExpenseCats.reduce((sum, c) => sum + c.amount, 0);

      if (nextStartY + 35 > 280) {
        doc.addPage();
        nextStartY = 20;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(4, 120, 87);
      doc.text(`Category-Wise Income Statement (${dc.date})`, 14, nextStartY);
      doc.text(`Total: +${pdfIncomeTotal.toLocaleString()} BDT`, 196, nextStartY, { align: 'right' });

      const pdfIncomePairs: (string | number)[][] = [];
      for (let i = 0; i < pdfIncomeCats.length; i += 2) {
        const left = pdfIncomeCats[i];
        const right = pdfIncomeCats[i + 1];
        pdfIncomePairs.push([
          `${left.label}${left.count > 0 ? ` (${left.count})` : ''}`,
          `+${left.amount.toLocaleString()} BDT`,
          right ? `${right.label}${right.count > 0 ? ` (${right.count})` : ''}` : '',
          right ? `+${right.amount.toLocaleString()} BDT` : '',
        ]);
      }

      autoTable(doc, {
        startY: nextStartY + 3,
        body: pdfIncomePairs,
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, textColor: [51, 65, 85] },
        columnStyles: {
          0: { cellWidth: 62 },
          1: { halign: 'right', cellWidth: 29, fontStyle: 'bold', textColor: [5, 150, 105] },
          2: { cellWidth: 62 },
          3: { halign: 'right', cellWidth: 29, fontStyle: 'bold', textColor: [5, 150, 105] },
        },
        margin: { left: 14, right: 14 },
      });

      nextStartY = (doc as any).lastAutoTable.finalY + 8;

      if (nextStartY + 45 > 280) {
        doc.addPage();
        nextStartY = 20;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(190, 18, 60);
      doc.text(`Category-Wise Expense Statement (${dc.date})`, 14, nextStartY);
      doc.text(`Total: -${pdfExpenseTotal.toLocaleString()} BDT`, 196, nextStartY, { align: 'right' });

      const pdfExpensePairs: (string | number)[][] = [];
      for (let i = 0; i < pdfExpenseCats.length; i += 2) {
        const left = pdfExpenseCats[i];
        const right = pdfExpenseCats[i + 1];
        pdfExpensePairs.push([
          `${left.label}${left.count > 0 ? ` (${left.count})` : ''}`,
          `-${left.amount.toLocaleString()} BDT`,
          right ? `${right.label}${right.count > 0 ? ` (${right.count})` : ''}` : '',
          right ? `-${right.amount.toLocaleString()} BDT` : '',
        ]);
      }

      autoTable(doc, {
        startY: nextStartY + 3,
        body: pdfExpensePairs,
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, textColor: [51, 65, 85] },
        columnStyles: {
          0: { cellWidth: 62 },
          1: { halign: 'right', cellWidth: 29, fontStyle: 'bold', textColor: [225, 29, 72] },
          2: { cellWidth: 62 },
          3: { halign: 'right', cellWidth: 29, fontStyle: 'bold', textColor: [225, 29, 72] },
        },
        margin: { left: 14, right: 14 },
      });

      nextStartY = (doc as any).lastAutoTable.finalY + 10;

      // Notes / Comments
      if (dc.notes) {
        if (nextStartY + 16 > 280) {
          doc.addPage();
          nextStartY = 20;
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text('Notes / Comments:', 14, nextStartY);

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(115, 115, 115);
        const splitNotes = doc.splitTextToSize(dc.notes, 182);
        doc.text(splitNotes, 14, nextStartY + 4);
        nextStartY += 5 + (splitNotes.length * 3.5);
      }

      // Signatures
      if (nextStartY + 25 > 280) {
        doc.addPage();
        nextStartY = 20;
      } else {
        nextStartY += 10;
      }

      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.3);
      doc.line(14, nextStartY + 15, 64, nextStartY + 15);
      doc.line(146, nextStartY + 15, 196, nextStartY + 15);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('Prepared By', 39, nextStartY + 19, { align: 'center' });
      doc.text('Approved By', 171, nextStartY + 19, { align: 'center' });

      doc.save(`Daily_Closing_Report_${dc.date}.pdf`);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      alert('Failed to generate PDF report. Please try again.');
    }
  };

  const handleOpenClosingPrintView = (dc: DailyClosing) => {
    try {
      const escapeHtml = (val: string) =>
        val
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      const totalIn =
        (dc.totalCashIn ?? 0) +
        (dc.totalBkashIn ?? 0) +
        (dc.totalNagadIn ?? 0) +
        (dc.totalRocketIn ?? 0) +
        (dc.totalBankIn ?? 0) +
        (dc.totalSslIn ?? 0);
      const totalOut =
        (dc.totalCashOut ?? 0) +
        (dc.totalBkashOut ?? 0) +
        (dc.totalNagadOut ?? 0) +
        (dc.totalRocketOut ?? 0) +
        (dc.totalBankOut ?? 0) +
        (dc.totalSslOut ?? 0);
      const totalOpenBal =
        (dc.openingCash ?? 0) +
        (dc.openingBkash ?? 0) +
        (dc.openingNagad ?? 0) +
        (dc.openingRocket ?? 0) +
        (dc.openingBank ?? 0) +
        (dc.openingSsl ?? 0);
      const totalCloseBal =
        (dc.closingCash ?? 0) +
        (dc.closingBkash ?? 0) +
        (dc.closingNagad ?? 0) +
        (dc.closingRocket ?? 0) +
        (dc.closingBank ?? 0) +
        (dc.closingSsl ?? 0);
      const totalPL = totalIn - totalOut;

      const methods = [
        { name: 'Cash', open: dc.openingCash ?? 0, inc: dc.totalCashIn ?? 0, exp: dc.totalCashOut ?? 0, close: dc.closingCash ?? 0 },
        { name: 'bKash', open: dc.openingBkash ?? 0, inc: dc.totalBkashIn ?? 0, exp: dc.totalBkashOut ?? 0, close: dc.closingBkash ?? 0 },
        { name: 'Nagad', open: dc.openingNagad ?? 0, inc: dc.totalNagadIn ?? 0, exp: dc.totalNagadOut ?? 0, close: dc.closingNagad ?? 0 },
        { name: 'Rocket', open: dc.openingRocket ?? 0, inc: dc.totalRocketIn ?? 0, exp: dc.totalRocketOut ?? 0, close: dc.closingRocket ?? 0 },
        { name: 'Bank', open: dc.openingBank ?? 0, inc: dc.totalBankIn ?? 0, exp: dc.totalBankOut ?? 0, close: dc.closingBank ?? 0 },
        { name: 'SSL', open: dc.openingSsl ?? 0, inc: dc.totalSslIn ?? 0, exp: dc.totalSslOut ?? 0, close: dc.closingSsl ?? 0 },
      ];

      const previewTxs = dailyClosingOnlyTransactions.filter((t) => t.date === dc.date);
      const { incomeCategories, expenseCategories } = computeCategoryBreakdown(previewTxs);
      const categoryIncomeTotal = incomeCategories.reduce((sum, c) => sum + c.amount, 0);
      const categoryExpenseTotal = expenseCategories.reduce((sum, c) => sum + c.amount, 0);

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Daily_Closing_Report_${escapeHtml(dc.date)}</title>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                color: #0f172a;
                background: #f8fafc;
                padding: 20px;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .page {
                max-width: 800px;
                margin: 0 auto;
                background: #ffffff;
                padding: 28px;
                border-radius: 14px;
                border: 1px solid #e2e8f0;
              }
              .print-toolbar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: #f0fdfa;
                border: 1px solid #99f6e4;
                padding: 12px 16px;
                border-radius: 10px;
                margin-bottom: 20px;
              }
              .print-toolbar span { font-size: 12px; font-weight: 700; color: #115e59; }
              .btn-group { display: flex; gap: 8px; }
              .btn-print {
                background: #0d9488; color: #ffffff; border: none; border-radius: 8px;
                padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer;
              }
              .btn-close {
                background: #e2e8f0; color: #334155; border: none; border-radius: 8px;
                padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer;
              }
              @media print {
                .no-print { display: none !important; }
                html, body { background: #ffffff; padding: 0; margin: 0; }
                .page { border: none; padding: 0; max-width: 100%; border-radius: 0; box-shadow: none; }
                .section, .grid-2, .summary-box, .sigs { break-inside: avoid; page-break-inside: avoid; }
                @page { size: A4 portrait; margin: 10mm; }
              }
              .header { text-align: center; border-bottom: 1.5px dashed #cbd5e1; padding-bottom: 10px; margin-bottom: 10px; }
              .header h1 { font-size: 16px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase; color: #0f172a; }
              .header p { font-size: 9.5px; font-weight: 600; color: #64748b; letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }
              .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 10px; color: #475569; padding-bottom: 10px; margin-bottom: 14px; border-bottom: 1px dashed #cbd5e1; }
              .meta strong { color: #0f172a; }
              .section { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; background: #ffffff; }
              .section-title { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 6px; display: flex; justify-content: space-between; }
              table { width: 100%; border-collapse: collapse; font-size: 10px; }
              th { text-align: left; font-size: 8.5px; text-transform: uppercase; color: #64748b; padding: 5px 4px; border-bottom: 1px solid #cbd5e1; }
              td { padding: 5px 4px; border-bottom: 1px solid #f1f5f9; }
              .num { text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
              .inc { color: #059669; font-weight: 700; }
              .exp { color: #e11d48; font-weight: 700; }
              .bold { font-weight: 800; color: #0f172a; }
              .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
              .cat-grid-2 { display: grid; grid-template-columns: 1fr 1fr; column-gap: 20px; }
              .row-item { display: flex; justify-content: space-between; font-size: 10px; padding: 3.5px 0; border-bottom: 1px dashed #e2e8f0; gap: 8px; }
              .summary-box { border: 1.5px solid #0f172a; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 10.5px; }
              .summary-row { display: flex; justify-content: space-between; font-weight: 700; padding: 3px 0; }
              .summary-grand { display: flex; justify-content: space-between; font-weight: 800; font-size: 12px; border-top: 1px solid #cbd5e1; margin-top: 5px; padding-top: 6px; color: #0f172a; }
              .notes-box { padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 10px; color: #475569; margin-bottom: 14px; font-style: italic; }
              .sigs { display: flex; justify-content: space-between; margin-top: 28px; padding-top: 8px; }
              .sig-box { width: 150px; text-align: center; }
              .sig-line { border-top: 1px solid #0f172a; padding-top: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; }
            </style>
          </head>
          <body>
            <div class="page">
              <div class="print-toolbar no-print">
                <span>Daily Closing Print View (${escapeHtml(dc.date)})</span>
                <div class="btn-group">
                  <button type="button" class="btn-print" onclick="window.print()">Print Now</button>
                  <button type="button" class="btn-close" onclick="window.close()">Close</button>
                </div>
              </div>

              <div class="header">
                <h1>Titas Broadband &amp; Accounting</h1>
                <p>Daily Closing &amp; Financial Statement Report</p>
              </div>

              <div class="meta">
                <div><strong>REPORT DATE:</strong> ${escapeHtml(dc.date)}</div>
                <div style="text-align: right;"><strong>GENERATED BY:</strong> ${escapeHtml(dc.closedBy || 'System Admin')}</div>
                <div><strong>SYSTEM STATUS:</strong> <span style="font-weight: 800; color: ${dc.status === 'closed' ? '#047857' : '#b45309'};">${escapeHtml((dc.status || 'open').toUpperCase())}</span></div>
                <div style="text-align: right;"><strong>RUN TIME:</strong> ${escapeHtml(new Date().toLocaleTimeString())} BDT</div>
              </div>

              <div class="section">
                <div class="section-title">
                  <span>Detailed Breakdown by Payment Method</span>
                  <span>BDT</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Method</th>
                      <th class="num">Opening</th>
                      <th class="num">Inflow (+)</th>
                      <th class="num">Outflow (-)</th>
                      <th class="num">Closing</th>
                      <th class="num">P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${methods.map((m) => {
                      const pl = m.inc - m.exp;
                      const plText = pl > 0 ? `+${pl.toLocaleString()}` : pl < 0 ? `-${Math.abs(pl).toLocaleString()}` : '0';
                      const plCls = pl > 0 ? 'inc' : pl < 0 ? 'exp' : 'bold';
                      return `
                        <tr>
                          <td class="bold">${m.name}</td>
                          <td class="num">${m.open.toLocaleString()}</td>
                          <td class="num inc">+${m.inc.toLocaleString()}</td>
                          <td class="num exp">-${m.exp.toLocaleString()}</td>
                          <td class="num bold">${m.close.toLocaleString()}</td>
                          <td class="num ${plCls}">${plText}</td>
                        </tr>
                      `;
                    }).join('')}
                    <tr style="background: #f8fafc;">
                      <td class="bold">Total</td>
                      <td class="num bold">${totalOpenBal.toLocaleString()}</td>
                      <td class="num inc">+${totalIn.toLocaleString()}</td>
                      <td class="num exp">-${totalOut.toLocaleString()}</td>
                      <td class="num bold">${totalCloseBal.toLocaleString()}</td>
                      <td class="num ${totalPL > 0 ? 'inc' : totalPL < 0 ? 'exp' : 'bold'}">${totalPL > 0 ? `+${totalPL.toLocaleString()}` : totalPL < 0 ? `-${Math.abs(totalPL).toLocaleString()}` : '0'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="grid-2">
                <div class="section" style="margin-bottom: 0;">
                  <div class="section-title"><span>Cash Summary Details</span><span>BDT</span></div>
                  <div class="row-item"><span>KHA Office Cash</span><span class="bold">${(dc.khaOfficeCash ?? 0).toLocaleString()} ৳</span></div>
                  <div class="row-item"><span>Dhaka office</span><span class="bold">${(dc.dhakaOfficeCash ?? 0).toLocaleString()} ৳</span></div>
                  <div class="row-item"><span>Nayan Cash</span><span class="bold">${(dc.nayanCash ?? 0).toLocaleString()} ৳</span></div>
                  <div class="row-item" style="border-bottom: none;"><span>Account Cash</span><span class="bold">${(dc.accountCash ?? 0).toLocaleString()} ৳</span></div>
                </div>
                <div class="section" style="margin-bottom: 0;">
                  <div class="section-title"><span>Transfer Money Details</span><span>BDT</span></div>
                  <div class="row-item"><span>KHA Office to Nayan</span><span class="bold">${(dc.transferKhaToNayan ?? 0).toLocaleString()} ৳</span></div>
                  <div class="row-item"><span>Nayan to Dhaka office</span><span class="bold">${(dc.transferNayanToDhaka ?? 0).toLocaleString()} ৳</span></div>
                  <div class="row-item"><span>Dhaka office to Nayan</span><span class="bold">${(dc.transferDhakaToNayan ?? 0).toLocaleString()} ৳</span></div>
                  <div class="row-item" style="border-bottom: none;"><span>Dhaka to KHA Office</span><span class="bold">${(dc.transferDhakaToKha ?? 0).toLocaleString()} ৳</span></div>
                </div>
              </div>

              <div class="section">
                <div class="section-title">
                  <span>Daily Closing Entry &amp; Expense Logs</span>
                  <span>${previewTxs.length} Entries</span>
                </div>
                ${previewTxs.length === 0 ? `
                  <div style="text-align: center; padding: 10px; color: #94a3b8; font-style: italic; font-size: 10px;">
                    No entry statements or expense logs recorded for this day.
                  </div>
                ` : `
                  <table>
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Method</th>
                        <th style="text-align: right;">Type</th>
                        <th class="num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${previewTxs.map((tx) => `
                        <tr>
                          <td class="bold">${escapeHtml(getCategoryLabel(tx))}</td>
                          <td style="text-transform: capitalize;">${escapeHtml(tx.paymentMethod || 'cash')}</td>
                          <td style="text-align: right;" class="${tx.type === 'income' ? 'inc' : 'exp'}">${tx.type === 'income' ? 'INFLOW' : 'OUTFLOW'}</td>
                          <td class="num ${tx.type === 'income' ? 'inc' : 'exp'}">${tx.type === 'income' ? '+' : '-'}${(tx.amount ?? 0).toLocaleString()} BDT</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                `}
              </div>

              <div class="summary-box">
                <div class="summary-row"><span>TOTAL OPENING BALANCE:</span><span class="num">${totalOpenBal.toLocaleString()} BDT</span></div>
                <div class="summary-row inc"><span>(+) TOTAL COLLECTION (INFLOW):</span><span class="num">+ ${totalIn.toLocaleString()} BDT</span></div>
                <div class="summary-row exp"><span>(-) TOTAL EXPENSE (OUTFLOW):</span><span class="num">- ${totalOut.toLocaleString()} BDT</span></div>
                <div class="summary-grand"><span>(=) GRAND CLOSING BALANCE:</span><span class="num">${totalCloseBal.toLocaleString()} BDT</span></div>
              </div>

              <div class="section">
                <div class="section-title">
                  <span style="color: #047857;">Category-Wise Income Statement (${escapeHtml(dc.date)})</span>
                  <span style="color: #047857;">Total: +${categoryIncomeTotal.toLocaleString()} BDT</span>
                </div>
                <div class="cat-grid-2">
                  ${incomeCategories.map((c) => `
                    <div class="row-item">
                      <span>${escapeHtml(c.label)}${c.count > 0 ? ` (${c.count})` : ''}</span>
                      <span class="${c.amount > 0 ? 'inc' : 'bold'}">+${c.amount.toLocaleString()} BDT</span>
                    </div>
                  `).join('')}
                </div>
              </div>

              <div class="section">
                <div class="section-title">
                  <span style="color: #be123c;">Category-Wise Expense Statement (${escapeHtml(dc.date)})</span>
                  <span style="color: #be123c;">Total: -${categoryExpenseTotal.toLocaleString()} BDT</span>
                </div>
                <div class="cat-grid-2">
                  ${expenseCategories.map((c) => `
                    <div class="row-item">
                      <span>${escapeHtml(c.label)}${c.count > 0 ? ` (${c.count})` : ''}</span>
                      <span class="${c.amount > 0 ? 'exp' : 'bold'}">-${c.amount.toLocaleString()} BDT</span>
                    </div>
                  `).join('')}
                </div>
              </div>

              ${dc.notes ? `<div class="notes-box"><strong>Notes / Comments:</strong> ${escapeHtml(dc.notes)}</div>` : ''}

              <div class="sigs">
                <div class="sig-box"><div class="sig-line">Prepared By</div></div>
                <div class="sig-box"><div class="sig-line">Approved By</div></div>
              </div>
            </div>
          </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
      } else {
        window.print();
      }
    } catch (err) {
      console.error('Failed to open Daily Closing print view:', err);
      window.print();
    }
  };

  const handleDownloadClosingExcel = (dc: DailyClosing) => {
    try {
      const totalIn =
        (dc.totalCashIn ?? 0) +
        (dc.totalBkashIn ?? 0) +
        (dc.totalNagadIn ?? 0) +
        (dc.totalRocketIn ?? 0) +
        (dc.totalBankIn ?? 0) +
        (dc.totalSslIn ?? 0);
      const totalOut =
        (dc.totalCashOut ?? 0) +
        (dc.totalBkashOut ?? 0) +
        (dc.totalNagadOut ?? 0) +
        (dc.totalRocketOut ?? 0) +
        (dc.totalBankOut ?? 0) +
        (dc.totalSslOut ?? 0);
      const totalOpenBal =
        (dc.openingCash ?? 0) +
        (dc.openingBkash ?? 0) +
        (dc.openingNagad ?? 0) +
        (dc.openingRocket ?? 0) +
        (dc.openingBank ?? 0) +
        (dc.openingSsl ?? 0);
      const totalCloseBal =
        (dc.closingCash ?? 0) +
        (dc.closingBkash ?? 0) +
        (dc.closingNagad ?? 0) +
        (dc.closingRocket ?? 0) +
        (dc.closingBank ?? 0) +
        (dc.closingSsl ?? 0);

      const methodRows = [
        { name: 'Cash', open: dc.openingCash ?? 0, inc: dc.totalCashIn ?? 0, exp: dc.totalCashOut ?? 0, close: dc.closingCash ?? 0 },
        { name: 'bKash', open: dc.openingBkash ?? 0, inc: dc.totalBkashIn ?? 0, exp: dc.totalBkashOut ?? 0, close: dc.closingBkash ?? 0 },
        { name: 'Nagad', open: dc.openingNagad ?? 0, inc: dc.totalNagadIn ?? 0, exp: dc.totalNagadOut ?? 0, close: dc.closingNagad ?? 0 },
        { name: 'Rocket', open: dc.openingRocket ?? 0, inc: dc.totalRocketIn ?? 0, exp: dc.totalRocketOut ?? 0, close: dc.closingRocket ?? 0 },
        { name: 'Bank Transfer', open: dc.openingBank ?? 0, inc: dc.totalBankIn ?? 0, exp: dc.totalBankOut ?? 0, close: dc.closingBank ?? 0 },
        { name: 'SSL Commerz', open: dc.openingSsl ?? 0, inc: dc.totalSslIn ?? 0, exp: dc.totalSslOut ?? 0, close: dc.closingSsl ?? 0 },
      ];

      const summaryRows: (string | number)[][] = [
        ['TITAS BROADBAND & ACCOUNTING'],
        ['DAILY CLOSING & FINANCIAL STATEMENT REPORT'],
        ['Report Date', dc.date, 'Status', (dc.status || 'open').toUpperCase(), 'Generated By', dc.closedBy || 'System Admin'],
        [],
        ['DETAILED BREAKDOWN BY PAYMENT METHOD'],
        ['Payment Method', 'Opening Balance (BDT)', 'Inflow (+) (BDT)', 'Outflow (-) (BDT)', 'Closing Balance (BDT)', 'P/L (BDT)'],
        ...methodRows.map((m) => [m.name, m.open, m.inc, m.exp, m.close, m.inc - m.exp]),
        ['TOTAL', totalOpenBal, totalIn, totalOut, totalCloseBal, totalIn - totalOut],
        [],
        ['CASH DRAWER STATEMENT', 'AMOUNT (BDT)', '', 'TRANSFER MONEY DETAILS', 'AMOUNT (BDT)'],
        ['KHA Office Cash', dc.khaOfficeCash ?? 0, '', 'KHA Office to Nayan', dc.transferKhaToNayan ?? 0],
        ['Dhaka office', dc.dhakaOfficeCash ?? 0, '', 'Nayan to Dhaka office', dc.transferNayanToDhaka ?? 0],
        ['Nayan Cash', dc.nayanCash ?? 0, '', 'Dhaka office to Nayan', dc.transferDhakaToNayan ?? 0],
        ['Account Cash', dc.accountCash ?? 0, '', 'Dhaka to KHA Office', dc.transferDhakaToKha ?? 0],
        [],
        ['FINANCIAL SUMMARY', 'AMOUNT (BDT)'],
        ['Total Opening Balance', totalOpenBal],
        ['(+) Total Collection (Inflow)', totalIn],
        ['(-) Total Expense (Outflow)', totalOut],
        ['(=) Grand Closing Balance', totalCloseBal],
      ];

      const previewTxs = dailyClosingOnlyTransactions.filter((t) => t.date === dc.date);
      const { incomeCategories, expenseCategories } = computeCategoryBreakdown(previewTxs);
      const categoryIncomeTotal = incomeCategories.reduce((sum, c) => sum + c.amount, 0);
      const categoryExpenseTotal = expenseCategories.reduce((sum, c) => sum + c.amount, 0);

      summaryRows.push(
        [],
        [`CATEGORY-WISE INCOME STATEMENT (${dc.date})`, 'ENTRIES', 'AMOUNT (BDT)'],
        ...incomeCategories.map((c) => [c.label, c.count, c.amount]),
        ['Total Category Income', previewTxs.filter((t) => t.type === 'income').length, categoryIncomeTotal],
        [],
        [`CATEGORY-WISE EXPENSE STATEMENT (${dc.date})`, 'ENTRIES', 'AMOUNT (BDT)'],
        ...expenseCategories.map((c) => [c.label, c.count, c.amount]),
        ['Total Category Expense', previewTxs.filter((t) => t.type === 'expense').length, categoryExpenseTotal]
      );

      if (dc.notes) {
        summaryRows.push([], ['Notes / Comments', dc.notes]);
      }
      const logRows: (string | number)[][] = [
        ['SL', 'Date', 'Category', 'Payment Method', 'Type', 'Amount (BDT)', 'Notes'],
        ...previewTxs.map((tx, idx) => [
          idx + 1,
          tx.date,
          getCategoryLabel(tx),
          (tx.paymentMethod || 'cash').toUpperCase(),
          tx.type === 'income' ? 'INFLOW' : 'OUTFLOW',
          tx.amount ?? 0,
          tx.notes || '',
        ]),
      ];

      const wb = XLSX.utils.book_new();
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      wsSummary['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Daily Closing');

      const wsLogs = XLSX.utils.aoa_to_sheet(logRows);
      wsLogs['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 32 }];
      XLSX.utils.book_append_sheet(wb, wsLogs, 'Entry & Expense Logs');

      XLSX.writeFile(wb, `Daily_Closing_Report_${dc.date}.xlsx`);
    } catch (err) {
      console.error('Failed to generate Excel:', err);
      alert('Failed to generate Excel report. Please try again.');
    }
  };

  // Render inline Print Preview Modal
  const renderPrintPreviewModal = () => {
    if (!printPreviewData) return null;

    const totalIn = (printPreviewData.totalCashIn ?? 0) + (printPreviewData.totalBkashIn ?? 0) + (printPreviewData.totalNagadIn ?? 0) + (printPreviewData.totalRocketIn ?? 0) + (printPreviewData.totalBankIn ?? 0) + (printPreviewData.totalSslIn ?? 0);
    const totalOut = (printPreviewData.totalCashOut ?? 0) + (printPreviewData.totalBkashOut ?? 0) + (printPreviewData.totalNagadOut ?? 0) + (printPreviewData.totalRocketOut ?? 0) + (printPreviewData.totalBankOut ?? 0) + (printPreviewData.totalSslOut ?? 0);
    const totalOpenBal = (printPreviewData.openingCash ?? 0) + (printPreviewData.openingBkash ?? 0) + (printPreviewData.openingNagad ?? 0) + (printPreviewData.openingRocket ?? 0) + (printPreviewData.openingBank ?? 0) + (printPreviewData.openingSsl ?? 0);
    const totalCloseBal = (printPreviewData.closingCash ?? 0) + (printPreviewData.closingBkash ?? 0) + (printPreviewData.closingNagad ?? 0) + (printPreviewData.closingRocket ?? 0) + (printPreviewData.closingBank ?? 0) + (printPreviewData.closingSsl ?? 0);

    return (
      <div className="fixed inset-0 bg-slate-950/70 z-[120] flex items-center justify-center p-4 overflow-y-auto animate-fade-in no-print">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * {
              visibility: hidden !important;
            }
            #printable-report-area, #printable-report-area * {
              visibility: visible !important;
            }
            #printable-report-area {
              position: fixed !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              height: auto !important;
              background: white !important;
              color: black !important;
              padding: 40px !important;
              margin: 0 !important;
              box-shadow: none !important;
              border: none !important;
              z-index: 99999 !important;
            }
            .no-print {
              display: none !important;
            }
          }
        ` }} />
        
        <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative flex flex-col my-8 border border-slate-100 animate-scale-up max-h-[90vh]">
          {/* Header Actions */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4 shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-teal-50 text-teal-600 rounded-xl">
                <Printer className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-extrabold text-slate-800">Print Report Preview</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Verify and print the formal daily closing layout</p>
              </div>
            </div>
            <button 
              onClick={() => setPrintPreviewData(null)}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Printable Report Document Card */}
          <div className="flex-1 overflow-y-auto pr-1 bg-slate-100/50 p-6 rounded-2xl border border-slate-200/40">
            <div 
              id="printable-report-area" 
              className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-xl mx-auto font-mono text-[11px] text-slate-800 leading-relaxed"
            >
              {/* Header */}
              <div className="text-center border-b border-dashed border-slate-300 pb-4 mb-4">
                <h1 className="text-base font-bold tracking-wider text-slate-900 uppercase">Titas Broadband & Accounting</h1>
                <p className="text-[10px] text-slate-500 font-medium mt-1 uppercase tracking-widest">Daily Closing & Financial Statement Report</p>
              </div>

              {/* Meta information */}
              <div className="grid grid-cols-2 gap-y-1.5 border-b border-dashed border-slate-200 pb-3 mb-4 text-[10px] text-slate-600">
                <div><strong>REPORT DATE:</strong> <span className="font-bold text-slate-900">{printPreviewData.date}</span></div>
                <div className="text-right"><strong>GENERATED BY:</strong> <span className="font-bold text-slate-900">{printPreviewData.closedBy || 'System Admin'}</span></div>
                <div><strong>SYSTEM STATUS:</strong> <span className={`font-bold ${printPreviewData.status === 'closed' ? 'text-emerald-700' : 'text-amber-700'}`}>{printPreviewData.status?.toUpperCase() || 'OPEN'}</span></div>
                <div className="text-right"><strong>RUN TIME:</strong> <span className="font-bold text-slate-900">{new Date().toLocaleTimeString()} BDT</span></div>
              </div>

              {/* Table Breakdown */}
              <div className="font-bold text-[9px] uppercase text-slate-400 tracking-wider mb-2">
                Detailed Breakdown by Payment Method
              </div>
              <div className="border-t border-b border-slate-200 py-1 mb-4 overflow-x-auto">
                <table className="w-full text-[10px] text-left">
                  <thead>
                    <tr className="border-b border-slate-200 pb-1 text-slate-500 font-bold">
                      <th className="py-1">METHOD</th>
                      <th className="py-1 text-right">OPENING</th>
                      <th className="py-1 text-right">INFLOW (+)</th>
                      <th className="py-1 text-right">OUTFLOW (-)</th>
                      <th className="py-1 text-right">CLOSING</th>
                      <th className="py-1 text-right">P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: 'Cash', open: printPreviewData.openingCash ?? 0, inc: printPreviewData.totalCashIn ?? 0, exp: printPreviewData.totalCashOut ?? 0, close: printPreviewData.closingCash ?? 0 },
                      { name: 'bKash', open: printPreviewData.openingBkash ?? 0, inc: printPreviewData.totalBkashIn ?? 0, exp: printPreviewData.totalBkashOut ?? 0, close: printPreviewData.closingBkash ?? 0 },
                      { name: 'Nagad', open: printPreviewData.openingNagad ?? 0, inc: printPreviewData.totalNagadIn ?? 0, exp: printPreviewData.totalNagadOut ?? 0, close: printPreviewData.closingNagad ?? 0 },
                      { name: 'Rocket', open: printPreviewData.openingRocket ?? 0, inc: printPreviewData.totalRocketIn ?? 0, exp: printPreviewData.totalRocketOut ?? 0, close: printPreviewData.closingRocket ?? 0 },
                      { name: 'Bank', open: printPreviewData.openingBank ?? 0, inc: printPreviewData.totalBankIn ?? 0, exp: printPreviewData.totalBankOut ?? 0, close: printPreviewData.closingBank ?? 0 },
                      { name: 'SSL', open: printPreviewData.openingSsl ?? 0, inc: printPreviewData.totalSslIn ?? 0, exp: printPreviewData.totalSslOut ?? 0, close: printPreviewData.closingSsl ?? 0 },
                    ].map((m) => {
                      const pl = m.inc - m.exp;
                      return (
                        <tr key={m.name} className="border-b border-slate-100">
                          <td className="py-1.5 font-semibold text-slate-700">{m.name}</td>
                          <td className="py-1.5 text-right font-mono">{m.open.toLocaleString()}</td>
                          <td className="py-1.5 text-right font-mono text-emerald-600">+{m.inc.toLocaleString()}</td>
                          <td className="py-1.5 text-right font-mono text-rose-600">-{m.exp.toLocaleString()}</td>
                          <td className="py-1.5 text-right font-mono font-bold text-slate-900">{m.close.toLocaleString()}</td>
                          <td className={`py-1.5 text-right font-mono font-bold ${pl > 0 ? 'text-emerald-600' : pl < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                            {pl > 0 ? `+${pl.toLocaleString()}` : pl < 0 ? `-${Math.abs(pl).toLocaleString()}` : '0'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Cash Drawer Statement */}
              <div className="font-bold text-[9px] uppercase text-slate-400 tracking-wider mb-2 mt-5">
                Cash Drawer Statement (Physical Cash & Transfers)
              </div>
              <div className="border-t border-b border-slate-200 py-2 mb-4 grid grid-cols-2 gap-4">
                {/* Cash Summary Details */}
                <div>
                  <div className="font-bold text-[9px] text-slate-500 uppercase tracking-wider mb-1.5 border-b border-slate-100 pb-0.5">
                    CASH SUMMARY DETAILS
                  </div>
                  <table className="w-full text-[10px] text-left">
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="py-1 text-slate-600">KHA Office Cash</td>
                        <td className="py-1 text-right font-mono font-bold text-slate-900">
                          {(printPreviewData.khaOfficeCash ?? 0).toLocaleString()} ৳
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1 text-slate-600">Dhaka office</td>
                        <td className="py-1 text-right font-mono font-bold text-slate-900">
                          {(printPreviewData.dhakaOfficeCash ?? 0).toLocaleString()} ৳
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1 text-slate-600">Nayan Cash</td>
                        <td className="py-1 text-right font-mono font-bold text-slate-900">
                          {(printPreviewData.nayanCash ?? 0).toLocaleString()} ৳
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1 text-slate-600">Account Cash</td>
                        <td className="py-1 text-right font-mono font-bold text-slate-900">
                          {(printPreviewData.accountCash ?? 0).toLocaleString()} ৳
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Transfer Money Details */}
                <div>
                  <div className="font-bold text-[9px] text-slate-500 uppercase tracking-wider mb-1.5 border-b border-slate-100 pb-0.5">
                    TRANSFER MONEY DETAILS
                  </div>
                  <table className="w-full text-[10px] text-left">
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="py-1 text-slate-600">KHA Office to Nayan</td>
                        <td className="py-1 text-right font-mono font-bold text-slate-900">
                          {(printPreviewData.transferKhaToNayan ?? 0).toLocaleString()} ৳
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1 text-slate-600">Nayan to Dhaka office</td>
                        <td className="py-1 text-right font-mono font-bold text-slate-900">
                          {(printPreviewData.transferNayanToDhaka ?? 0).toLocaleString()} ৳
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1 text-slate-600">Dhaka office to Nayan</td>
                        <td className="py-1 text-right font-mono font-bold text-slate-900">
                          {(printPreviewData.transferDhakaToNayan ?? 0).toLocaleString()} ৳
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1 text-slate-600">Dhaka to KHA Office</td>
                        <td className="py-1 text-right font-mono font-bold text-slate-900">
                          {(printPreviewData.transferDhakaToKha ?? 0).toLocaleString()} ৳
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Daily Closing Transaction Logs */}
              <div className="font-bold text-[9px] uppercase text-slate-400 tracking-wider mb-2 mt-5">
                Daily Closing Entry & Expense Logs
              </div>
              <div className="border-t border-b border-slate-200 py-1 mb-5 overflow-x-auto">
                {(() => {
                  const previewTxs = dailyClosingOnlyTransactions.filter(t => t.date === printPreviewData.date);
                  if (previewTxs.length === 0) {
                    return (
                      <div className="py-2 text-center text-slate-400 italic text-[10px]">
                        No entry statements or expense logs recorded for this day.
                      </div>
                    );
                  }
                  return (
                    <table className="w-full text-[10px] text-left">
                      <thead>
                        <tr className="border-b border-slate-200 pb-1 text-slate-500 font-bold">
                          <th className="py-1">CATEGORY</th>
                          <th className="py-1">METHOD</th>
                          <th className="py-1 text-right">TYPE</th>
                          <th className="py-1 text-right">AMOUNT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewTxs.map((tx, idx) => {
                          const categoryLabel = getCategoryLabel(tx);
                          return (
                            <tr key={tx.id || idx} className="border-b border-slate-100">
                              <td className="py-1.5 font-semibold text-slate-700">{categoryLabel}</td>
                              <td className="py-1.5 text-slate-600 capitalize">{tx.paymentMethod || 'cash'}</td>
                              <td className={`py-1.5 text-right font-bold ${tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {tx.type === 'income' ? 'INFLOW' : 'OUTFLOW'}
                              </td>
                              <td className={`py-1.5 text-right font-mono font-bold ${tx.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {tx.type === 'income' ? '+' : '-'}{(tx.amount ?? 0).toLocaleString()} BDT
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </div>

              {/* Financial Summary */}
              <div className="border border-slate-900 p-3 space-y-1.5 mb-5">
                <div className="flex justify-between font-bold">
                  <span>TOTAL OPENING BALANCE:</span>
                  <span>{totalOpenBal.toLocaleString()} BDT</span>
                </div>
                <div className="flex justify-between font-bold text-emerald-700">
                  <span>(+) TOTAL COLLECTION (INFLOW):</span>
                  <span>+ {totalIn.toLocaleString()} BDT</span>
                </div>
                <div className="flex justify-between font-bold text-rose-700">
                  <span>(-) TOTAL EXPENSE (OUTFLOW):</span>
                  <span>- {totalOut.toLocaleString()} BDT</span>
                </div>
                <div className="flex justify-between font-extrabold border-t border-slate-300 pt-1.5 text-xs text-slate-900">
                  <span>(=) GRAND CLOSING BALANCE:</span>
                  <span>{totalCloseBal.toLocaleString()} BDT</span>
                </div>
              </div>

              {/* Category-Wise Income & Expense Statements */}
              {(() => {
                const previewTxsForCats = dailyClosingOnlyTransactions.filter((t) => t.date === printPreviewData.date);
                const { incomeCategories, expenseCategories } = computeCategoryBreakdown(previewTxsForCats);
                const catIncomeTotal = incomeCategories.reduce((sum, c) => sum + c.amount, 0);
                const catExpenseTotal = expenseCategories.reduce((sum, c) => sum + c.amount, 0);
                return (
                  <>
                    <div className="border border-slate-200 rounded-xl p-3 mb-4 bg-white">
                      <div className="flex items-center justify-between text-[9px] font-extrabold uppercase tracking-wider text-emerald-700 border-b border-slate-200 pb-1.5 mb-2">
                        <span>Category-Wise Income Statement ({printPreviewData.date})</span>
                        <span>Total: +{catIncomeTotal.toLocaleString()} BDT</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
                        {incomeCategories.map((c) => (
                          <div key={c.key} className="flex items-center justify-between text-[9.5px] py-1 border-b border-dashed border-slate-200 gap-2">
                            <span className="text-slate-700">{c.label}{c.count > 0 ? ` (${c.count})` : ''}</span>
                            <span className={`font-mono font-bold whitespace-nowrap ${c.amount > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                              +{c.amount.toLocaleString()} BDT
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl p-3 mb-5 bg-white">
                      <div className="flex items-center justify-between text-[9px] font-extrabold uppercase tracking-wider text-rose-700 border-b border-slate-200 pb-1.5 mb-2">
                        <span>Category-Wise Expense Statement ({printPreviewData.date})</span>
                        <span>Total: -{catExpenseTotal.toLocaleString()} BDT</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5">
                        {expenseCategories.map((c) => (
                          <div key={c.key} className="flex items-center justify-between text-[9.5px] py-1 border-b border-dashed border-slate-200 gap-2">
                            <span className="text-slate-700">{c.label}{c.count > 0 ? ` (${c.count})` : ''}</span>
                            <span className={`font-mono font-bold whitespace-nowrap ${c.amount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                              -{c.amount.toLocaleString()} BDT
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Notes */}
              {printPreviewData.notes && (
                <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-lg text-[10px] text-slate-500 mb-5 italic leading-relaxed">
                  <strong>Notes / Comments:</strong> {printPreviewData.notes}
                </div>
              )}

              {/* Signature Blocks */}
              <div className="mt-8 flex justify-between text-[10px] text-slate-500">
                <div className="border-t border-slate-950 w-28 pt-1 text-center">Prepared By</div>
                <div className="border-t border-slate-950 w-28 pt-1 text-center">Approved By</div>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex flex-wrap items-center gap-2.5 mt-4 shrink-0 no-print">
            <button
              onClick={() => handleOpenClosingPrintView(printPreviewData)}
              className="flex-1 min-w-[130px] py-3 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-teal-600/10"
            >
              <Printer className="w-4 h-4" />
              <span>Print View</span>
            </button>
            <button
              onClick={() => handleDownloadClosingPDF(printPreviewData)}
              className="flex-1 min-w-[130px] py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-indigo-600/10"
            >
              <FileDown className="w-4 h-4" />
              <span>Download PDF</span>
            </button>
            <button
              onClick={() => handleDownloadClosingExcel(printPreviewData)}
              className="flex-1 min-w-[130px] py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-600/10"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Download Excel</span>
            </button>
            <button
              onClick={() => setPrintPreviewData(null)}
              className="py-3 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Close Preview
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Check if today is already closed
  const isDateAlreadyClosed = closings.some(c => c.date === selectedDate && c.status === 'closed');
  const activeClosingDoc = closings.find(c => c.date === selectedDate);

  return (
    <div className="space-y-6 animate-fade-in select-none">
      {/* Title Header */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <span className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Calculator className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-2xl font-black tracking-tight">Daily Closing Portal</h2>
              <p className="text-xs text-indigo-200/80 mt-0.5 font-medium">Manage and lock daily opening, collection, expense, and closing balances across all payment methods</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl px-4 py-2 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-white font-mono text-xs focus:outline-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Alert Messaging */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span className="font-semibold">{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-xs flex items-center gap-2.5">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500" />
          <span className="font-semibold">{success}</span>
        </div>
      )}

      {/* Sub-Menu Quick Navigation Bar */}
      <div className="bg-white rounded-2xl p-2.5 border border-slate-200/60 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { setError(''); setActiveEntryModal('income'); }}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-sm shadow-emerald-600/20 transition cursor-pointer"
          >
            <TrendingUp className="w-4 h-4" />
            <span>Income</span>
          </button>
          <button
            type="button"
            onClick={() => { setError(''); setActiveEntryModal('expense'); }}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-sm shadow-rose-600/20 transition cursor-pointer"
          >
            <TrendingDown className="w-4 h-4" />
            <span>Expense</span>
          </button>
          <button
            type="button"
            onClick={() => { setError(''); setActiveEntryModal('cash_details'); }}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-sm shadow-indigo-600/20 transition cursor-pointer"
          >
            <Coins className="w-4 h-4" />
            <span>Cash Details</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setError('');
              setClosingMonth(selectedDate.slice(0, 7));
              setActiveEntryModal('month_closing');
            }}
            className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-sm shadow-teal-600/20 transition cursor-pointer"
          >
            <Calendar className="w-4 h-4" />
            <span>Month Closing</span>
          </button>
        </div>

        <div className="flex items-center gap-2 pr-1">
          {isDateAlreadyClosed ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] bg-rose-50 text-rose-600 px-3 py-1.5 rounded-xl font-bold border border-rose-100">
              <Lock className="w-3.5 h-3.5" /> {selectedDate} Locked
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl font-bold border border-emerald-100">
              <Unlock className="w-3.5 h-3.5" /> {selectedDate} Open
            </span>
          )}
        </div>
      </div>

      {/* Main calculation workspace */}
      <div className="space-y-6">
        {/* 3 Summary Cards (Read-only Overview) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Income Summary Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm flex items-start justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block">Daily Income</span>
              <h4 className="text-xl font-black font-mono text-slate-900 mt-1">+{totalInflow.toLocaleString()} ৳</h4>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                {dateTransactions.filter(t => t.type === 'income').length} entries on {selectedDate}
              </p>
            </div>
            <span className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </span>
          </div>

          {/* Expense Summary Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm flex items-start justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 block">Daily Expense</span>
              <h4 className="text-xl font-black font-mono text-slate-900 mt-1">-{totalOutflow.toLocaleString()} ৳</h4>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                {dateTransactions.filter(t => t.type === 'expense').length} entries on {selectedDate}
              </p>
            </div>
            <span className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
              <TrendingDown className="w-5 h-5" />
            </span>
          </div>

          {/* Cash Details Summary Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm flex items-start justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 block">Cash Details</span>
              <h4 className="text-xl font-black font-mono text-slate-900 mt-1">
                {(val(khaOfficeCash) + val(dhakaOfficeCash) + val(nayanCash) + val(accountCash)).toLocaleString()} ৳
              </h4>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                {isDateAlreadyClosed ? 'Locked & Closed' : isDrawerSubmitted ? 'Submitted Draft' : 'Pending Entry'}
              </p>
            </div>
            <span className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <Coins className="w-5 h-5" />
            </span>
          </div>
        </div>

        {/* Side-by-Side Row: Payment Method Balance Breakdown (Left) & Cash Details Statement (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Payment Method Breakdown Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/60 shadow-sm flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-teal-50 text-teal-600 rounded-xl">
                  <Calculator className="w-4.5 h-4.5" />
                </span>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800">Payment Method Balance Breakdown</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Live opening, collection, expense & closing balance for {selectedDate}</p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-2">Payment Method</th>
                    <th className="py-2.5 px-2 text-right">Opening</th>
                    <th className="py-2.5 px-2 text-right">Income (+)</th>
                    <th className="py-2.5 px-2 text-right">Expense (-)</th>
                    <th className="py-2.5 px-2 text-right">Closing</th>
                    <th className="py-2.5 px-2 text-right">P/L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    { key: 'cash', label: 'Cash', open: val(openingCash), flow: cashFlow, close: closingCash },
                    { key: 'bkash', label: 'bKash', open: val(openingBkash), flow: bkashFlow, close: closingBkash },
                    { key: 'nagad', label: 'Nagad', open: val(openingNagad), flow: nagadFlow, close: closingNagad },
                    { key: 'rocket', label: 'Rocket', open: val(openingRocket), flow: rocketFlow, close: closingRocket },
                    { key: 'bank', label: 'Bank Transfer', open: val(openingBank), flow: bankFlow, close: closingBank },
                    { key: 'sslcommerz', label: 'SSL Commerz', open: val(openingSsl), flow: sslFlow, close: closingSsl },
                  ].map((row) => {
                    const rowPL = row.flow.income - row.flow.expense;
                    return (
                      <tr key={row.key} className="hover:bg-slate-50/60 transition">
                        <td className="py-2.5 px-2 font-bold text-slate-700 flex items-center gap-2 whitespace-nowrap">
                          <PaymentMethodLogo method={row.key} className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
                          <span>{row.label}</span>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-600 whitespace-nowrap">{row.open.toLocaleString()}</td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-600 whitespace-nowrap">+{row.flow.income.toLocaleString()}</td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-rose-600 whitespace-nowrap">-{row.flow.expense.toLocaleString()}</td>
                        <td className="py-2.5 px-2 text-right font-mono font-extrabold text-slate-900 whitespace-nowrap">{row.close.toLocaleString()}</td>
                        <td className={`py-2.5 px-2 text-right font-mono font-extrabold whitespace-nowrap ${rowPL > 0 ? 'text-emerald-600' : rowPL < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                          {rowPL > 0 ? `+${rowPL.toLocaleString()}` : rowPL < 0 ? `-${Math.abs(rowPL).toLocaleString()}` : '0'}
                        </td>
                      </tr>
                    );
                  })}
                  {(() => {
                    const dailyPL = totalInflow - totalOutflow;
                    return (
                      <tr className="bg-slate-50/90 font-extrabold">
                        <td className="py-2.5 px-2 text-slate-800 whitespace-nowrap">Total</td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-700 whitespace-nowrap">{totalOpening.toLocaleString()}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-emerald-600 whitespace-nowrap">+{totalInflow.toLocaleString()}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-rose-600 whitespace-nowrap">-{totalOutflow.toLocaleString()}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-900 whitespace-nowrap">{totalClosing.toLocaleString()}</td>
                        <td className={`py-2.5 px-2 text-right font-mono whitespace-nowrap ${dailyPL > 0 ? 'text-emerald-600' : dailyPL < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                          {dailyPL > 0 ? `+${dailyPL.toLocaleString()}` : dailyPL < 0 ? `-${Math.abs(dailyPL).toLocaleString()}` : '0'}
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cash Details Statement Card (Right side of Payment Method Breakdown) */}
          <div className="bg-white rounded-2xl p-6 border border-indigo-100 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 mb-4">
                <div>
                  <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <span>Cash Details Statement ({selectedDate})</span>
                  </h4>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                    Status: {isDateAlreadyClosed ? 'Locked & Closed' : isDrawerSubmitted ? 'Verified Draft' : 'Pending Entry'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <h5 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2.5 pb-1 border-b border-slate-100 flex items-center justify-between">
                    <span>Physical Cash Summary</span>
                    <span>Amount (৳)</span>
                  </h5>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                      <span className="text-slate-500 font-medium">KHA Office Cash</span>
                      <span className="font-mono font-bold text-slate-800">{val(khaOfficeCash).toLocaleString()} ৳</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                      <span className="text-slate-500 font-medium">Dhaka Office Cash</span>
                      <span className="font-mono font-bold text-slate-800">{val(dhakaOfficeCash).toLocaleString()} ৳</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                      <span className="text-slate-500 font-medium">Nayan Cash</span>
                      <span className="font-mono font-bold text-slate-800">{val(nayanCash).toLocaleString()} ৳</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                      <span className="text-slate-500 font-medium">Account Cash</span>
                      <span className="font-mono font-bold text-slate-800">{val(accountCash).toLocaleString()} ৳</span>
                    </div>
                    <div className="flex justify-between pt-2 text-indigo-700 font-bold">
                      <span>Total Physical Cash</span>
                      <span className="font-mono text-sm font-black">
                        {(val(khaOfficeCash) + val(dhakaOfficeCash) + val(nayanCash) + val(accountCash)).toLocaleString()} ৳
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h5 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2.5 pb-1 border-b border-slate-100 flex items-center justify-between">
                    <span>Money Transfers</span>
                    <span>Amount (৳)</span>
                  </h5>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                      <span className="text-slate-500 font-medium">KHA Office to Nayan</span>
                      <span className="font-mono font-bold text-slate-800">{val(transferKhaToNayan).toLocaleString()} ৳</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                      <span className="text-slate-500 font-medium">Nayan to Dhaka office</span>
                      <span className="font-mono font-bold text-slate-800">{val(transferNayanToDhaka).toLocaleString()} ৳</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                      <span className="text-slate-500 font-medium">Dhaka office to Nayan</span>
                      <span className="font-mono font-bold text-slate-800">{val(transferDhakaToNayan).toLocaleString()} ৳</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                      <span className="text-slate-500 font-medium">Dhaka office to KHA Office</span>
                      <span className="font-mono font-bold text-slate-800">{val(transferDhakaToKha).toLocaleString()} ৳</span>
                    </div>
                    <div className="flex justify-between pt-2 text-slate-700 font-bold">
                      <span>Total Transfers</span>
                      <span className="font-mono text-sm font-black">
                        {(val(transferKhaToNayan) + val(transferNayanToDhaka) + val(transferDhakaToNayan) + val(transferDhakaToKha)).toLocaleString()} ৳
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section: Closing Summary */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/60 shadow-sm flex flex-col gap-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <Check className="w-4 h-4" />
            </span>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Closing Summary</h3>
          </div>

          {/* Aggregated totals visualization */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
            <div className="p-3.5 bg-slate-50 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[11px] font-semibold text-slate-500">Total Opening:</span>
              </div>
              <span className="text-xs font-bold text-slate-700">{totalOpening.toLocaleString()} BDT</span>
            </div>

            <div className="p-3.5 bg-emerald-50/50 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[11px] font-semibold text-emerald-600">Total Collection (Inflow):</span>
              </div>
              <span className="text-xs font-extrabold text-emerald-600">+{totalInflow.toLocaleString()} BDT</span>
            </div>

            <div className="p-3.5 bg-rose-50/50 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                <span className="text-[11px] font-semibold text-rose-600">Total Expense (Outflow):</span>
              </div>
              <span className="text-xs font-extrabold text-rose-600">-{totalOutflow.toLocaleString()} BDT</span>
            </div>

            <div className="p-3.5 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-indigo-600" />
                <span className="text-xs font-bold text-indigo-700">Grand Closing:</span>
              </div>
              <span className="text-sm font-black text-indigo-800">{totalClosing.toLocaleString()} BDT</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-end">
            {/* Notes Input / Display */}
            <div className="lg:col-span-2">
              {isDateAlreadyClosed ? (
                activeClosingDoc?.notes ? (
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Special Notes / Comments:</label>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-semibold italic whitespace-pre-wrap">
                      {activeClosingDoc.notes}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Special Notes / Comments:</label>
                    <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-xl text-xs text-slate-400 italic font-medium">
                      No special notes entered for this day.
                    </div>
                  </div>
                )
              ) : (
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Special Notes / Comments (Optional):</label>
                  <textarea 
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Enter additional details, deposit notes, or daily remarks..."
                    rows={3}
                    className="w-full text-xs p-3 border border-slate-200 rounded-xl focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  ></textarea>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              {isDateAlreadyClosed ? (
                <div className="space-y-2.5">
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 justify-center">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide">Account Closed & Locked</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button 
                      type="button"
                      onClick={handlePrintCurrent}
                      className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-teal-600/10"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print Report</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const closedDoc = closings.find(c => c.date === selectedDate);
                        handleReopenClosing(closedDoc ? closedDoc.id : `dc_${userId}_${selectedDate}`, selectedDate);
                      }}
                      className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Unlock className="w-4 h-4" />
                      <span>Unlock Day</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <button 
                    onClick={handleSaveClosing}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-indigo-600/20"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Complete & Lock Day</span>
                  </button>
                  <button 
                    type="button"
                    onClick={handlePrintCurrent}
                    className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-teal-600/10"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print Preview Report</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Daily Closings Historical Grid */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <FileText className="w-4.5 h-4.5 text-indigo-600" />
            <h3 className="text-sm font-extrabold text-slate-800">Historical Daily Closing Logs</h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Download PDF report button */}
            <button
              onClick={handleDownloadPDFLogs}
              title="Download PDF report for current filtered daily closing logs"
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm hover:shadow transition-all cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5 text-indigo-100" />
              Download PDF Report
            </button>

            {/* Monthly Summary direct Print button */}
            <button
              onClick={handlePrintLogsSummary}
              title="Print summary of daily closing logs"
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm hover:shadow transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-100" />
              Current Month Summary (Print)
            </button>

            {/* Export CSV button */}
            <button
              onClick={handleExportCSVLogs}
              title="Export filtered daily closing logs as CSV"
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-sm hover:shadow transition-all cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5 text-slate-300" />
              Export CSV
            </button>

            {/* Quick buttons: All, Income, Expense */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/40">
              <button
                onClick={() => { setTypeFilter('all'); setCategoryFilter('all'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  typeFilter === 'all' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                All
              </button>
              <button
                onClick={() => { setTypeFilter('income'); setCategoryFilter('all'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  typeFilter === 'income' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Income
              </button>
              <button
                onClick={() => { setTypeFilter('expense'); setCategoryFilter('all'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  typeFilter === 'expense' ? 'bg-rose-50 text-rose-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Expense
              </button>
            </div>
          </div>
        </div>

        {/* Filters Container */}
        <div className="p-4 bg-slate-50/40 border-b border-slate-100 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">Search Logs</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search category, notes, method, amount..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-slate-800 font-medium"
                />
              </div>
            </div>

            {/* Category Dropdown */}
            <div className="relative">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">Category Filter</label>
              <div className="relative">
                <Filter className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-slate-700 font-medium appearance-none cursor-pointer"
                >
                  <option value="all">All Categories</option>
                  {typeFilter === 'all' || typeFilter === 'income' ? (
                    <optgroup label="Income Categories">
                      <option value="customer_bill">Customer Bill Collection</option>
                      <option value="reseller_bill">Reseller Bill Collection</option>
                      <option value="service_charge">Service Charge Collection</option>
                      <option value="other_income">Other Income</option>
                    </optgroup>
                  ) : null}
                  {typeFilter === 'all' || typeFilter === 'expense' ? (
                    <optgroup label="Expense Categories">
                      {Object.entries(EXPENSE_CATEGORY_LABELS).map(([key, item]) => (
                        <option key={key} value={key}>
                          {item.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Date Filter Quick Options */}
            <div className="relative">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">Date Filter</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <select
                  value={quickDateFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setQuickDateFilter(val);
                    if (val !== 'custom') {
                      setStartDate('');
                      setEndDate('');
                    }
                  }}
                  className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-slate-700 font-medium appearance-none cursor-pointer"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="this-month">This Month</option>
                  <option value="last-month">Last Month</option>
                  <option value="custom">Custom Range</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
            </div>

            {/* Sort Order */}
            <div className="relative">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1 block">Sort Order</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-slate-700 font-medium appearance-none cursor-pointer"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Custom Date Inputs */}
          {quickDateFilter === 'custom' && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-indigo-50/40 rounded-xl border border-indigo-100/50">
              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Reset Filters Bar */}
          {(searchTerm !== '' || typeFilter !== 'all' || categoryFilter !== 'all' || quickDateFilter !== 'all' || startDate !== '' || endDate !== '') && (
            <div className="flex items-center justify-between text-[11px] bg-slate-100 px-3 py-2 rounded-xl border border-slate-200/50">
              <span className="text-slate-500 font-semibold">
                Active Filters: {typeFilter !== 'all' ? `Type (${typeFilter})` : ''} 
                {categoryFilter !== 'all' ? ` • Category (${categoryFilter})` : ''} 
                {searchTerm !== '' ? ` • Keyword ("${searchTerm}")` : ''} 
                {quickDateFilter !== 'all' ? ` • Date (${quickDateFilter === 'custom' ? `${startDate || 'Start'} to ${endDate || 'End'}` : quickDateFilter})` : ''}
              </span>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setTypeFilter('all');
                  setCategoryFilter('all');
                  setQuickDateFilter('all');
                  setStartDate('');
                  setEndDate('');
                  setSortOrder('newest');
                }}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-extrabold hover:underline cursor-pointer flex items-center gap-1"
              >
                Clear All
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 font-medium text-xs">Loading data, please wait...</div>
        ) : dailyClosingTxs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-semibold text-xs flex flex-col items-center gap-2 bg-slate-50/20">
            <AlertCircle className="w-8 h-8 text-slate-300" />
            <span>
              {(searchTerm !== '' || typeFilter !== 'all' || categoryFilter !== 'all' || quickDateFilter !== 'all' || startDate !== '' || endDate !== '') 
                ? "No daily closing transactions match your search filter criteria." 
                : "No daily closing statements or expense entries found."}
            </span>
            {(searchTerm !== '' || typeFilter !== 'all' || categoryFilter !== 'all' || quickDateFilter !== 'all' || startDate !== '' || endDate !== '') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setTypeFilter('all');
                  setCategoryFilter('all');
                  setQuickDateFilter('all');
                  setStartDate('');
                  setEndDate('');
                  setSortOrder('newest');
                }}
                className="mt-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Reset Filter Criteria
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">S/L</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4 text-right">Income / Expense</th>
                  <th className="py-3 px-4 text-right">Previous Balance</th>
                  <th className="py-3 px-4 text-right">Closing Balance</th>
                  <th className="py-3 px-6 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dailyClosingTxs.map((tx, idx) => {
                  const prevBal = getPrevBalanceForTx(tx);
                  const closingBal = tx.type === 'income' ? prevBal + tx.amount : prevBal - tx.amount;
                  const categoryLabel = getCategoryLabel(tx);
                  const isTxDateClosed = closings.some(c => c.date === tx.date && c.status === 'closed');

                  return (
                    <tr key={tx.id} className="border-b border-slate-100/70 hover:bg-slate-50/50 transition">
                      <td className="py-3 px-4 text-xs font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-3 px-4 text-xs font-mono font-semibold text-slate-600">{tx.date}</td>
                      <td className="py-3 px-4 text-xs font-bold text-slate-700">{categoryLabel}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-slate-600 capitalize">
                          {tx.paymentMethod || 'cash'}
                        </span>
                      </td>
                      <td className={`py-3 px-4 text-xs font-mono font-bold text-right ${tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {tx.type === 'income' ? '+' : '-'}{(tx.amount ?? 0).toLocaleString()} BDT
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-right text-slate-500">
                        {(prevBal ?? 0).toLocaleString()} BDT
                      </td>
                      <td className="py-3 px-4 text-xs font-mono font-extrabold text-right text-indigo-900">
                        {(closingBal ?? 0).toLocaleString()} BDT
                      </td>
                      <td className="py-3 px-6 text-center">
                        {isTxDateClosed ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="inline-flex items-center gap-1 text-[10px] text-rose-500 font-bold bg-rose-50/50 px-2 py-0.5 rounded-full border border-rose-100">
                              <Lock className="w-3 h-3" /> Locked
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const closedDoc = closings.find(c => c.date === tx.date);
                                handleReopenClosing(closedDoc ? closedDoc.id : `dc_${userId}_${tx.date}`, tx.date);
                              }}
                              className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition cursor-pointer"
                              title="Unlock / Reopen this day to edit or delete"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(tx)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50/80 transition cursor-pointer"
                              title="Edit statement entry"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEntryStatement(tx.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                              title="Delete statement entry"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Closing Detail View Modal */}
      {selectedClosing && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative overflow-hidden animate-scale-up">
            <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-32 h-32 bg-slate-100 rounded-full"></div>
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4 relative z-10">
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Calculator className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-800">Daily Closing Detailed View</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Date: {selectedClosing.date}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedClosing(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                <div className="col-span-2">Payment Method</div>
                <div className="text-right">Opening Balance</div>
                <div className="text-right">Inflow (+In)</div>
                <div className="text-right">Closing Balance</div>
              </div>

              {/* Cash */}
              <div className="grid grid-cols-5 items-center text-xs font-medium py-1.5 border-b border-slate-50">
                <div className="col-span-2 flex items-center gap-2.5">
                  <PaymentMethodLogo method="cash" className="w-6 h-6" />
                  <span>Cash</span>
                </div>
                <div className="text-right font-mono text-slate-600">{(selectedClosing.openingCash ?? 0).toLocaleString()}</div>
                <div className="text-right font-mono text-emerald-600">+{(selectedClosing.totalCashIn ?? 0).toLocaleString()}</div>
                <div className="text-right font-mono text-slate-800 font-bold">{(selectedClosing.closingCash ?? 0).toLocaleString()}</div>
              </div>

              {/* bKash */}
              <div className="grid grid-cols-5 items-center text-xs font-medium py-1.5 border-b border-slate-50">
                <div className="col-span-2 flex items-center gap-2.5">
                  <PaymentMethodLogo method="bkash" className="w-6 h-6" />
                  <span>bKash</span>
                </div>
                <div className="text-right font-mono text-slate-600">{(selectedClosing.openingBkash ?? 0).toLocaleString()}</div>
                <div className="text-right font-mono text-emerald-600">+{(selectedClosing.totalBkashIn ?? 0).toLocaleString()}</div>
                <div className="text-right font-mono text-slate-800 font-bold">{(selectedClosing.closingBkash ?? 0).toLocaleString()}</div>
              </div>

              {/* Nagad */}
              <div className="grid grid-cols-5 items-center text-xs font-medium py-1.5 border-b border-slate-50">
                <div className="col-span-2 flex items-center gap-2.5">
                  <PaymentMethodLogo method="nagad" className="w-6 h-6" />
                  <span>Nagad</span>
                </div>
                <div className="text-right font-mono text-slate-600">{(selectedClosing.openingNagad ?? 0).toLocaleString()}</div>
                <div className="text-right font-mono text-emerald-600">+{(selectedClosing.totalNagadIn ?? 0).toLocaleString()}</div>
                <div className="text-right font-mono text-slate-800 font-bold">{(selectedClosing.closingNagad ?? 0).toLocaleString()}</div>
              </div>

              {/* Rocket */}
              <div className="grid grid-cols-5 items-center text-xs font-medium py-1.5 border-b border-slate-50">
                <div className="col-span-2 flex items-center gap-2.5">
                  <PaymentMethodLogo method="rocket" className="w-6 h-6" />
                  <span>Rocket</span>
                </div>
                <div className="text-right font-mono text-slate-600">{(selectedClosing.openingRocket ?? 0).toLocaleString()}</div>
                <div className="text-right font-mono text-emerald-600">+{(selectedClosing.totalRocketIn ?? 0).toLocaleString()}</div>
                <div className="text-right font-mono text-slate-800 font-bold">{(selectedClosing.closingRocket ?? 0).toLocaleString()}</div>
              </div>

              {/* Bank */}
              <div className="grid grid-cols-5 items-center text-xs font-medium py-1.5 border-b border-slate-50">
                <div className="col-span-2 flex items-center gap-2.5">
                  <PaymentMethodLogo method="bank" className="w-6 h-6" />
                  <span>Bank Transfer</span>
                </div>
                <div className="text-right font-mono text-slate-600">{(selectedClosing.openingBank ?? 0).toLocaleString()}</div>
                <div className="text-right font-mono text-emerald-600">+{(selectedClosing.totalBankIn ?? 0).toLocaleString()}</div>
                <div className="text-right font-mono text-slate-800 font-bold">{(selectedClosing.closingBank ?? 0).toLocaleString()}</div>
              </div>

              {/* SSL */}
              <div className="grid grid-cols-5 items-center text-xs font-medium py-1.5 border-b border-slate-100">
                <div className="col-span-2 flex items-center gap-2.5">
                  <PaymentMethodLogo method="sslcommerz" className="w-6 h-6" />
                  <span>SSL Commerz</span>
                </div>
                <div className="text-right font-mono text-slate-600">{(selectedClosing.openingSsl ?? 0).toLocaleString()}</div>
                <div className="text-right font-mono text-emerald-600">+{(selectedClosing.totalSslIn ?? 0).toLocaleString()}</div>
                <div className="text-right font-mono text-slate-800 font-bold">{(selectedClosing.closingSsl ?? 0).toLocaleString()}</div>
              </div>

              {/* Total Summary Row */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-2 mt-4 font-mono text-xs font-semibold text-slate-700">
                <div className="flex justify-between">
                  <span>Total Opening Balance:</span>
                  <span>{((selectedClosing.openingCash ?? 0) + (selectedClosing.openingBkash ?? 0) + (selectedClosing.openingNagad ?? 0) + (selectedClosing.openingRocket ?? 0) + (selectedClosing.openingBank ?? 0) + (selectedClosing.openingSsl ?? 0)).toLocaleString()} BDT</span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>(+) Total Collection (Inflow):</span>
                  <span>+{((selectedClosing.totalCashIn ?? 0) + (selectedClosing.totalBkashIn ?? 0) + (selectedClosing.totalNagadIn ?? 0) + (selectedClosing.totalRocketIn ?? 0) + (selectedClosing.totalBankIn ?? 0) + (selectedClosing.totalSslIn ?? 0)).toLocaleString()} BDT</span>
                </div>
                <div className="flex justify-between text-rose-600">
                  <span>(-) Total Expense (Outflow):</span>
                  <span>-{((selectedClosing.totalCashOut ?? 0) + (selectedClosing.totalBkashOut ?? 0) + (selectedClosing.totalNagadOut ?? 0) + (selectedClosing.totalRocketOut ?? 0) + (selectedClosing.totalBankOut ?? 0) + (selectedClosing.totalSslOut ?? 0)).toLocaleString()} BDT</span>
                </div>
                <div className="flex justify-between border-t border-indigo-100 pt-2 text-indigo-900 font-extrabold text-sm">
                  <span>(=) Grand Closing Balance:</span>
                  <span>{((selectedClosing.closingCash ?? 0) + (selectedClosing.closingBkash ?? 0) + (selectedClosing.closingNagad ?? 0) + (selectedClosing.closingRocket ?? 0) + (selectedClosing.closingBank ?? 0) + (selectedClosing.closingSsl ?? 0)).toLocaleString()} BDT</span>
                </div>
              </div>

              {/* Cash Drawer Statement inside Modal */}
              <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50 mt-4">
                <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-200 flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Cash Drawer Statement</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Cash Summary Details */}
                  <div className="bg-white border border-slate-100 rounded-xl p-3">
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Cash Summary</h5>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">KHA Office Cash:</span>
                        <span className="font-bold font-mono text-slate-700">{(selectedClosing.khaOfficeCash ?? 0).toLocaleString()} ৳</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Dhaka office:</span>
                        <span className="font-bold font-mono text-slate-700">{(selectedClosing.dhakaOfficeCash ?? 0).toLocaleString()} ৳</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Nayan Cash:</span>
                        <span className="font-bold font-mono text-slate-700">{(selectedClosing.nayanCash ?? 0).toLocaleString()} ৳</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Account Cash:</span>
                        <span className="font-bold font-mono text-slate-700">{(selectedClosing.accountCash ?? 0).toLocaleString()} ৳</span>
                      </div>
                    </div>
                  </div>

                  {/* Transfer Money Details */}
                  <div className="bg-white border border-slate-100 rounded-xl p-3">
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Transfer Money</h5>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">KHA Office to Nayan:</span>
                        <span className="font-bold font-mono text-slate-700">{(selectedClosing.transferKhaToNayan ?? 0).toLocaleString()} ৳</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Nayan to Dhaka office:</span>
                        <span className="font-bold font-mono text-slate-700">{(selectedClosing.transferNayanToDhaka ?? 0).toLocaleString()} ৳</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Dhaka office to Nayan:</span>
                        <span className="font-bold font-mono text-slate-700">{(selectedClosing.transferDhakaToNayan ?? 0).toLocaleString()} ৳</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Dhaka office to KHA Office:</span>
                        <span className="font-bold font-mono text-slate-700">{(selectedClosing.transferDhakaToKha ?? 0).toLocaleString()} ৳</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {selectedClosing.notes && (
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-500 mt-3 font-medium">
                  <strong>Notes / Comments:</strong> {selectedClosing.notes}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => handlePrint(selectedClosing)}
                className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Report</span>
              </button>
              <button
                onClick={() => handleDownloadClosingPDF(selectedClosing)}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-indigo-600/10"
              >
                <FileDown className="w-4 h-4" />
                <span>Download PDF</span>
              </button>
              <button
                onClick={() => setSelectedClosing(null)}
                className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editing Transaction Statement Modal */}
      {editingTx && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleEditTxSubmit} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden animate-scale-up">
            <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-32 h-32 bg-indigo-50 rounded-full"></div>
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4 relative z-10">
              <div className="flex items-center gap-2.5">
                <span className={`p-2 rounded-xl ${editingTx.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  <Edit className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-800">
                    Edit {editingTx.type === 'income' ? 'Income' : 'Expense'} Statement
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-mono">Date: {editingTx.date}</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setEditingTx(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 relative z-10">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
                <select
                  value={editingTxCategory}
                  onChange={(e) => setEditingTxCategory(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-bold cursor-pointer"
                >
                  {editingTx.type === 'income' ? (
                    <>
                      <option value="customer_bill">Customer Bill</option>
                      <option value="reseller_bill">Reseller Bill</option>
                      <option value="service_charge">Service Charge</option>
                      <option value="other_income">Other</option>
                    </>
                  ) : (
                    Object.entries(EXPENSE_CATEGORY_LABELS).map(([key, item]) => (
                      <option key={key} value={key}>
                        {item.label}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Payment Method</label>
                <select
                  value={editingTxPaymentMethod}
                  onChange={(e) => setEditingTxPaymentMethod(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-bold capitalize cursor-pointer"
                >
                  <option value="cash">Cash</option>
                  <option value="bkash">bKash</option>
                  <option value="nagad">Nagad</option>
                  <option value="rocket">Rocket</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="sslcommerz">SSL Commerz</option>
                  <option value="upay">Upay</option>
                  <option value="cellfin">Cellfin</option>
                  <option value="tap">Tap</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Amount (BDT)</label>
                <input
                  type="number"
                  placeholder="Amount"
                  value={editingTxAmount}
                  onChange={(e) => setEditingTxAmount(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-semibold font-mono"
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6 relative z-10">
              <button
                type="submit"
                className={`flex-1 py-2.5 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer ${editingTx.type === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
              >
                <span>Save Changes</span>
              </button>
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl relative overflow-hidden animate-scale-up border border-slate-100">
            <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-24 h-24 bg-rose-50/50 rounded-full"></div>
            <div className="text-center relative z-10">
              <span className="inline-flex p-3 rounded-2xl bg-rose-50 text-rose-600 mb-4">
                <AlertCircle className="w-6 h-6" />
              </span>
              <h3 className="text-base font-extrabold text-slate-800">{confirmModal.message}</h3>
              {confirmModal.description && (
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">{confirmModal.description}</p>
              )}
              <div className="flex items-center gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    confirmModal.onConfirm();
                    setConfirmModal(null);
                  }}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-md shadow-rose-600/10"
                >
                  Yes, Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Income Statement Entry Popup Modal */}
      {activeEntryModal === 'income' && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] z-[90] flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setActiveEntryModal(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden animate-scale-up border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <TrendingUp className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-800">Daily Income Statement Entry</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-mono">Record Date: {selectedDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isDateAlreadyClosed && (
                  <span className="flex items-center gap-1 text-[10px] bg-rose-50 text-rose-600 px-2.5 py-1 rounded-full font-bold border border-rose-100">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setActiveEntryModal(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span className="font-semibold">{error}</span>
              </div>
            )}

            {isDateAlreadyClosed ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto">
                  <Lock className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-slate-600">
                  {selectedDate} is locked and closed. Reopen the day from Closing Summary to add new income entries.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveEntryModal(null)}
                  className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleAddEntryStatement} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
                    <select
                      value={entryCategory}
                      onChange={(e) => setEntryCategory(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none font-bold cursor-pointer"
                    >
                      <option value="customer_bill">Customer Bill</option>
                      <option value="reseller_bill">Reseller Bill</option>
                      <option value="service_charge">Service Charge</option>
                      <option value="other_income">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Payment Method</label>
                    <select
                      value={entryPaymentMethod}
                      onChange={(e) => setEntryPaymentMethod(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none font-bold cursor-pointer"
                    >
                      <option value="cash">Cash</option>
                      <option value="bkash">bKash</option>
                      <option value="nagad">Nagad</option>
                      <option value="rocket">Rocket</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="sslcommerz">SSL Commerz</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Today Income Amount (BDT)</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={entryAmount}
                    onChange={(e) => setEntryAmount(e.target.value)}
                    className="w-full text-sm px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none font-bold font-mono"
                    autoFocus
                    required
                  />
                </div>

                <div className="p-3.5 bg-emerald-50/60 border border-emerald-100 rounded-xl flex items-center justify-between text-xs font-mono">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Opening ({entryPaymentMethod})</span>
                    <span className="font-bold text-slate-700">{entryPreviousBalance.toLocaleString()} BDT</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase block">Projected Balance</span>
                    <span className="font-extrabold text-emerald-700">{entryClosingBalance.toLocaleString()} BDT</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-600/20"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Add Income Statement</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveEntryModal(null)}
                    className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Expense Statement Entry Popup Modal */}
      {activeEntryModal === 'expense' && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] z-[90] flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setActiveEntryModal(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden animate-scale-up border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
                  <TrendingDown className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-800">Daily Expense Statement Entry</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-mono">Record Date: {selectedDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isDateAlreadyClosed && (
                  <span className="flex items-center gap-1 text-[10px] bg-rose-50 text-rose-600 px-2.5 py-1 rounded-full font-bold border border-rose-100">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setActiveEntryModal(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span className="font-semibold">{error}</span>
              </div>
            )}

            {isDateAlreadyClosed ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto">
                  <Lock className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-slate-600">
                  {selectedDate} is locked and closed. Reopen the day from Closing Summary to add new expense entries.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveEntryModal(null)}
                  className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleAddExpenseEntryStatement} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
                    <select
                      value={expenseCategory}
                      onChange={(e) => setExpenseCategory(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:outline-none font-bold cursor-pointer"
                    >
                      {Object.entries(EXPENSE_CATEGORY_LABELS).map(([key, item]) => (
                        <option key={key} value={key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Payment Method</label>
                    <select
                      value={expensePaymentMethod}
                      onChange={(e) => setExpensePaymentMethod(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:outline-none font-bold capitalize cursor-pointer"
                    >
                      <option value="cash">Cash</option>
                      <option value="bkash">bKash</option>
                      <option value="nagad">Nagad</option>
                      <option value="rocket">Rocket</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="sslcommerz">SSL Commerz</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Today Expense Amount (BDT)</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    className="w-full text-sm px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:outline-none font-bold font-mono"
                    autoFocus
                    required
                  />
                </div>

                <div className="p-3.5 bg-rose-50/60 border border-rose-100 rounded-xl flex items-center justify-between text-xs font-mono">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Opening ({expensePaymentMethod})</span>
                    <span className="font-bold text-slate-700">{getPreviousBalanceForMethod(expensePaymentMethod).toLocaleString()} BDT</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-rose-600 uppercase block">After Expense</span>
                    <span className="font-extrabold text-rose-700">
                      {(getPreviousBalanceForMethod(expensePaymentMethod) - (parseFloat(expenseAmount) || 0)).toLocaleString()} BDT
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-rose-600/20"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Expense Statement</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveEntryModal(null)}
                    className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Cash Details Statement Popup Modal */}
      {activeEntryModal === 'cash_details' && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] z-[90] flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
          onClick={() => setActiveEntryModal(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative overflow-hidden animate-scale-up border border-slate-100 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Coins className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-800">Cash Details Statement</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-mono">Record Date: {selectedDate} • Physical Cash & Transfers</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isDateAlreadyClosed ? (
                  <span className="flex items-center gap-1 text-[10px] bg-rose-50 text-rose-600 px-2.5 py-1 rounded-full font-bold border border-rose-100">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                ) : isDrawerSubmitted ? (
                  <span className="flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full font-bold border border-emerald-100">
                    <CheckCircle className="w-3 h-3" /> Submitted
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full font-bold border border-indigo-100">
                    <Unlock className="w-3 h-3" /> Editable
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setActiveEntryModal(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span className="font-semibold">{error}</span>
              </div>
            )}

            <form onSubmit={handleDrawerSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Cash Summary Details */}
                <div className="border border-slate-200/60 rounded-2xl p-4 bg-slate-50/50">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-4 pb-2 border-b border-slate-200 flex items-center justify-between">
                    <span>Cash Summary Details</span>
                    <span className="text-[10px] font-bold text-slate-400">BDT</span>
                  </h4>
                  <div className="space-y-3">
                    {[
                      { label: 'KHA Office Cash', value: khaOfficeCash, setter: setKhaOfficeCash, id: 'modalKhaOfficeCash' },
                      { label: 'Dhaka office', value: dhakaOfficeCash, setter: setDhakaOfficeCash, id: 'modalDhakaOfficeCash' },
                      { label: 'Nayan Cash', value: nayanCash, setter: setNayanCash, id: 'modalNayanCash' },
                      { label: 'Account Cash', value: accountCash, setter: setAccountCash, id: 'modalAccountCash' },
                    ].map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3">
                        <label className="text-xs font-bold text-slate-600" htmlFor={item.id}>{item.label}</label>
                        <div className="relative w-32">
                          <span className="absolute left-3 top-2 text-[10px] font-bold text-slate-400">৳</span>
                          <input
                            type="number"
                            id={item.id}
                            value={item.value}
                            disabled={isDateAlreadyClosed}
                            onChange={(e) => item.setter(e.target.value)}
                            className="w-full text-xs pl-6 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-slate-700 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-bold font-mono text-right disabled:bg-slate-100 disabled:text-slate-500"
                          />
                        </div>
                      </div>
                    ))}
                    <div className="pt-2.5 mt-2 border-t border-slate-200 flex items-center justify-between text-xs font-extrabold text-indigo-700">
                      <span>Total Physical Cash</span>
                      <span className="font-mono">
                        {(val(khaOfficeCash) + val(dhakaOfficeCash) + val(nayanCash) + val(accountCash)).toLocaleString()} ৳
                      </span>
                    </div>
                  </div>
                </div>

                {/* Transfer Money Details */}
                <div className="border border-slate-200/60 rounded-2xl p-4 bg-slate-50/50">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-4 pb-2 border-b border-slate-200 flex items-center justify-between">
                    <span>Transfer Money Details</span>
                    <span className="text-[10px] font-bold text-slate-400">BDT</span>
                  </h4>
                  <div className="space-y-3">
                    {[
                      { label: 'KHA Office to Nayan', value: transferKhaToNayan, setter: setTransferKhaToNayan, id: 'modalTransferKhaToNayan' },
                      { label: 'Nayan to Dhaka office', value: transferNayanToDhaka, setter: setTransferNayanToDhaka, id: 'modalTransferNayanToDhaka' },
                      { label: 'Dhaka office to Nayan', value: transferDhakaToNayan, setter: setTransferDhakaToNayan, id: 'modalTransferDhakaToNayan' },
                      { label: 'Dhaka to KHA Office', value: transferDhakaToKha, setter: setTransferDhakaToKha, id: 'modalTransferDhakaToKha' },
                    ].map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3">
                        <label className="text-xs font-bold text-slate-600" htmlFor={item.id}>{item.label}</label>
                        <div className="relative w-32">
                          <span className="absolute left-3 top-2 text-[10px] font-bold text-slate-400">৳</span>
                          <input
                            type="number"
                            id={item.id}
                            value={item.value}
                            disabled={isDateAlreadyClosed}
                            onChange={(e) => item.setter(e.target.value)}
                            className="w-full text-xs pl-6 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-slate-700 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-bold font-mono text-right disabled:bg-slate-100 disabled:text-slate-500"
                          />
                        </div>
                      </div>
                    ))}
                    <div className="pt-2.5 mt-2 border-t border-slate-200 flex items-center justify-between text-xs font-extrabold text-slate-700">
                      <span>Total Transfers</span>
                      <span className="font-mono">
                        {(val(transferKhaToNayan) + val(transferNayanToDhaka) + val(transferDhakaToNayan) + val(transferDhakaToKha)).toLocaleString()} ৳
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                {!isDateAlreadyClosed && isDrawerSubmitted && (
                  <button
                    type="button"
                    onClick={handleModifyDrawer}
                    className="py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-100 transition cursor-pointer"
                  >
                    Reset Draft
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveEntryModal(null)}
                  className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  {isDateAlreadyClosed ? 'Close' : 'Cancel'}
                </button>
                {!isDateAlreadyClosed && (
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition cursor-pointer"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Submit Cash Details</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Month Closing Statement Popup Modal */}
      {activeEntryModal === 'month_closing' && (() => {
        const monthSummary = getMonthClosingSummary(closingMonth);
        const latestCashTotal = monthSummary.latestDrawerDoc
          ? (monthSummary.latestDrawerDoc.khaOfficeCash ?? 0) +
            (monthSummary.latestDrawerDoc.dhakaOfficeCash ?? 0) +
            (monthSummary.latestDrawerDoc.nayanCash ?? 0) +
            (monthSummary.latestDrawerDoc.accountCash ?? 0)
          : 0;

        return (
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] z-[90] flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
            onClick={() => setActiveEntryModal(null)}
          >
            <style dangerouslySetInnerHTML={{ __html: `
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #printable-month-closing-area, #printable-month-closing-area * {
                  visibility: visible !important;
                }
                #printable-month-closing-area {
                  position: fixed !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  height: auto !important;
                  background: white !important;
                  color: black !important;
                  padding: 32px !important;
                  margin: 0 !important;
                  box-shadow: none !important;
                  border: none !important;
                  z-index: 99999 !important;
                }
                .no-print {
                  display: none !important;
                }
              }
            ` }} />
            <div
              className="bg-white rounded-3xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl relative overflow-hidden animate-scale-up border border-slate-100 my-8 max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-5 shrink-0 no-print">
                <div className="flex items-center gap-3">
                  <span className="p-2.5 bg-teal-50 text-teal-600 rounded-xl">
                    <Calendar className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-800">Month Closing Statement</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                      Monthly Opening, Income, Expense &amp; Closing Overview • {monthSummary.closedDaysCount} Closed Days
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-teal-600" />
                    <input
                      type="month"
                      value={closingMonth}
                      onChange={(e) => setClosingMonth(e.target.value)}
                      className="bg-transparent text-slate-800 font-mono text-xs font-bold focus:outline-none cursor-pointer"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveEntryModal(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Scrollable Printable Body */}
              <div id="printable-month-closing-area" className="flex-1 overflow-y-auto pr-1 space-y-5">
                <div className="hidden print:block text-center border-b border-dashed border-slate-300 pb-4 mb-4">
                  <h1 className="text-base font-bold tracking-wider text-slate-900 uppercase">Titas Internet &amp; Accounting</h1>
                  <p className="text-[10px] text-slate-500 font-medium mt-1 uppercase tracking-widest">
                    Month Closing Statement • {monthSummary.month}
                  </p>
                </div>

                {/* 4 Monthly Summary Tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                  <div className="p-3.5 bg-slate-50 border border-slate-200/70 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Month Opening</span>
                    <span className="text-sm font-black text-slate-800 mt-1 block">{monthSummary.totalOpen.toLocaleString()} ৳</span>
                  </div>
                  <div className="p-3.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase block">Month Income ({monthSummary.incomeCount})</span>
                    <span className="text-sm font-black text-emerald-700 mt-1 block">+{monthSummary.totalIncome.toLocaleString()} ৳</span>
                  </div>
                  <div className="p-3.5 bg-rose-50/70 border border-rose-100 rounded-2xl">
                    <span className="text-[10px] font-bold text-rose-700 uppercase block">Month Expense ({monthSummary.expenseCount})</span>
                    <span className="text-sm font-black text-rose-700 mt-1 block">-{monthSummary.totalExpense.toLocaleString()} ৳</span>
                  </div>
                  <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-2xl">
                    <span className="text-[10px] font-bold text-teal-700 uppercase block">Month Closing</span>
                    <span className="text-sm font-black text-teal-900 mt-1 block">{monthSummary.totalClose.toLocaleString()} ৳</span>
                  </div>
                </div>

                {/* Payment Method Breakdown Table for the Month */}
                <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-200/60">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 pb-2 border-b border-slate-200 flex items-center justify-between">
                    <span>Payment Method Monthly Breakdown ({monthSummary.month})</span>
                    <span className="text-[10px] font-bold text-slate-400">BDT</span>
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <th className="py-2 px-1.5 sm:px-2.5">Payment Method</th>
                          <th className="py-2 px-1.5 sm:px-2.5 text-right">Opening</th>
                          <th className="py-2 px-1.5 sm:px-2.5 text-right">Income (+)</th>
                          <th className="py-2 px-1.5 sm:px-2.5 text-right">Expense (-)</th>
                          <th className="py-2 px-1.5 sm:px-2.5 text-right">Closing</th>
                          <th className="py-2 px-1.5 sm:px-2.5 text-right">P/L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60">
                        {monthSummary.methods.map((row) => (
                          <tr key={row.key} className="hover:bg-white transition">
                            <td className="py-2 px-1.5 sm:px-2.5 font-bold text-slate-700 flex items-center gap-2 whitespace-nowrap">
                              <PaymentMethodLogo method={row.key} className="w-5 h-5 shrink-0" />
                              <span>{row.label}</span>
                            </td>
                            <td className="py-2 px-1.5 sm:px-2.5 text-right font-mono text-slate-600 whitespace-nowrap">{row.open.toLocaleString()}</td>
                            <td className="py-2 px-1.5 sm:px-2.5 text-right font-mono font-bold text-emerald-600 whitespace-nowrap">+{row.income.toLocaleString()}</td>
                            <td className="py-2 px-1.5 sm:px-2.5 text-right font-mono font-bold text-rose-600 whitespace-nowrap">-{row.expense.toLocaleString()}</td>
                            <td className="py-2 px-1.5 sm:px-2.5 text-right font-mono font-extrabold text-slate-900 whitespace-nowrap">{row.close.toLocaleString()}</td>
                            <td className={`py-2 px-1.5 sm:px-2.5 text-right font-mono font-extrabold whitespace-nowrap ${row.pl > 0 ? 'text-emerald-600' : row.pl < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                              {row.pl > 0 ? `+${row.pl.toLocaleString()}` : row.pl < 0 ? `-${Math.abs(row.pl).toLocaleString()}` : '0'}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-slate-100/80 font-extrabold">
                          <td className="py-2 px-1.5 sm:px-2.5 text-slate-800 whitespace-nowrap">Total</td>
                          <td className="py-2 px-1.5 sm:px-2.5 text-right font-mono text-slate-700 whitespace-nowrap">{monthSummary.totalOpen.toLocaleString()}</td>
                          <td className="py-2 px-1.5 sm:px-2.5 text-right font-mono text-emerald-600 whitespace-nowrap">+{monthSummary.totalIncome.toLocaleString()}</td>
                          <td className="py-2 px-1.5 sm:px-2.5 text-right font-mono text-rose-600 whitespace-nowrap">-{monthSummary.totalExpense.toLocaleString()}</td>
                          <td className="py-2 px-1.5 sm:px-2.5 text-right font-mono text-slate-900 whitespace-nowrap">{monthSummary.totalClose.toLocaleString()}</td>
                          <td className={`py-2 px-1.5 sm:px-2.5 text-right font-mono whitespace-nowrap ${monthSummary.totalPL > 0 ? 'text-emerald-600' : monthSummary.totalPL < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                            {monthSummary.totalPL > 0 ? `+${monthSummary.totalPL.toLocaleString()}` : monthSummary.totalPL < 0 ? `-${Math.abs(monthSummary.totalPL).toLocaleString()}` : '0'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Cash Details Snapshot & Monthly Transfers */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-200/60">
                    <h4 className="text-[11px] font-black text-indigo-950 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-200 flex items-center justify-between">
                      <span>Latest Physical Cash</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {monthSummary.latestDrawerDoc ? monthSummary.latestDrawerDoc.date : 'No Entry'}
                      </span>
                    </h4>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500">KHA Office Cash</span>
                        <span className="font-mono font-bold text-slate-800">{(monthSummary.latestDrawerDoc?.khaOfficeCash ?? 0).toLocaleString()} ৳</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500">Dhaka Office Cash</span>
                        <span className="font-mono font-bold text-slate-800">{(monthSummary.latestDrawerDoc?.dhakaOfficeCash ?? 0).toLocaleString()} ৳</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500">Nayan Cash</span>
                        <span className="font-mono font-bold text-slate-800">{(monthSummary.latestDrawerDoc?.nayanCash ?? 0).toLocaleString()} ৳</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500">Account Cash</span>
                        <span className="font-mono font-bold text-slate-800">{(monthSummary.latestDrawerDoc?.accountCash ?? 0).toLocaleString()} ৳</span>
                      </div>
                      <div className="flex justify-between pt-2 mt-1 border-t border-slate-200 font-bold text-indigo-700">
                        <span>Total Physical Cash</span>
                        <span className="font-mono">{latestCashTotal.toLocaleString()} ৳</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-200/60">
                    <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-200 flex items-center justify-between">
                      <span>Monthly Cash Transfers</span>
                      <span className="text-[10px] font-mono text-slate-400">{monthSummary.month}</span>
                    </h4>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500">KHA Office to Nayan</span>
                        <span className="font-mono font-bold text-slate-800">{monthSummary.transfers.khaToNayan.toLocaleString()} ৳</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500">Nayan to Dhaka office</span>
                        <span className="font-mono font-bold text-slate-800">{monthSummary.transfers.nayanToDhaka.toLocaleString()} ৳</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500">Dhaka office to Nayan</span>
                        <span className="font-mono font-bold text-slate-800">{monthSummary.transfers.dhakaToNayan.toLocaleString()} ৳</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500">Dhaka office to KHA Office</span>
                        <span className="font-mono font-bold text-slate-800">{monthSummary.transfers.dhakaToKha.toLocaleString()} ৳</span>
                      </div>
                      <div className="flex justify-between pt-2 mt-1 border-t border-slate-200 font-bold text-slate-700">
                        <span>Total Transfers</span>
                        <span className="font-mono">{monthSummary.transfers.total.toLocaleString()} ৳</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Category-Wise Income & P/L Statement (Left) + Category-Wise Expense Statement (Right) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <div className="space-y-4">
                    <div className="bg-emerald-50/30 rounded-2xl p-4 border border-emerald-200/70">
                      <h4 className="text-[11px] font-black text-emerald-800 uppercase tracking-wider mb-3 pb-1.5 border-b border-emerald-200/80 flex items-center justify-between">
                        <span>Category-Wise Income Statement</span>
                        <span className="text-[10px] font-mono text-emerald-600">{monthSummary.month}</span>
                      </h4>
                      <div className="space-y-1.5 text-xs">
                        {monthSummary.incomeCategories.map((cat) => (
                          <div key={cat.key} className="flex items-center justify-between py-0.5 gap-2">
                            <span className="text-slate-600 flex items-center gap-1.5">
                              <span>{cat.label}</span>
                              {cat.count > 0 && (
                                <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">
                                  {cat.count}
                                </span>
                              )}
                            </span>
                            <span className={`font-mono font-bold ${cat.amount > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                              +{cat.amount.toLocaleString()} ৳
                            </span>
                          </div>
                        ))}
                        <div className="flex justify-between pt-2 mt-1 border-t border-emerald-200/80 font-extrabold text-emerald-800">
                          <span>Total Category Income</span>
                          <span className="font-mono">+{monthSummary.totalIncome.toLocaleString()} ৳</span>
                        </div>
                      </div>
                    </div>

                    {/* P/L Statement Card directly under Category-Wise Income Statement */}
                    <div className={`rounded-2xl p-4 border ${monthSummary.totalPL > 0 ? 'bg-teal-50/40 border-teal-200/80' : monthSummary.totalPL < 0 ? 'bg-rose-50/40 border-rose-200/80' : 'bg-slate-50/60 border-slate-200/70'}`}>
                      <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-200/80 flex items-center justify-between">
                        <span>P/L Statement (Profit &amp; Loss)</span>
                        <span className={`text-[10px] font-mono font-extrabold px-2 py-0.5 rounded ${monthSummary.totalPL > 0 ? 'bg-emerald-100 text-emerald-700' : monthSummary.totalPL < 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>
                          {monthSummary.totalPL > 0 ? 'PROFIT' : monthSummary.totalPL < 0 ? 'LOSS' : 'BREAK-EVEN'}
                        </span>
                      </h4>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between py-0.5">
                          <span className="text-slate-600">Total Income ({monthSummary.incomeCount})</span>
                          <span className="font-mono font-bold text-emerald-600">+{monthSummary.totalIncome.toLocaleString()} ৳</span>
                        </div>
                        <div className="flex justify-between py-0.5">
                          <span className="text-slate-600">Total Expense ({monthSummary.expenseCount})</span>
                          <span className="font-mono font-bold text-rose-600">-{monthSummary.totalExpense.toLocaleString()} ৳</span>
                        </div>
                        <div className="flex justify-between py-0.5">
                          <span className="text-slate-500">Profit Margin</span>
                          <span className="font-mono font-bold text-slate-700">
                            {monthSummary.totalIncome > 0 ? `${((monthSummary.totalPL / monthSummary.totalIncome) * 100).toFixed(1)}%` : '0.0%'}
                          </span>
                        </div>
                        <div className={`flex justify-between pt-2 mt-1 border-t border-slate-200/80 font-extrabold ${monthSummary.totalPL > 0 ? 'text-emerald-700' : monthSummary.totalPL < 0 ? 'text-rose-700' : 'text-slate-800'}`}>
                          <span>Net Profit / Loss (P/L)</span>
                          <span className="font-mono">
                            {monthSummary.totalPL > 0 ? `+${monthSummary.totalPL.toLocaleString()} ৳` : monthSummary.totalPL < 0 ? `-${Math.abs(monthSummary.totalPL).toLocaleString()} ৳` : '0 ৳'}
                          </span>
                        </div>
                        <div className="flex justify-between pt-1 text-[11px] text-slate-500">
                          <span>Closing (Opening {monthSummary.totalOpen.toLocaleString()} + P/L)</span>
                          <span className="font-mono font-bold text-slate-800">{monthSummary.totalClose.toLocaleString()} ৳</span>
                        </div>
                      </div>
                    </div>

                    {/* Manual Due Amount Entry Card directly under P/L Statement */}
                    <div className="bg-amber-50/40 rounded-2xl p-4 border border-amber-200/80">
                      <h4 className="text-[11px] font-black text-amber-900 uppercase tracking-wider mb-3 pb-1.5 border-b border-amber-200/80 flex items-center justify-between">
                        <span>Manual Due Amount ({monthSummary.month})</span>
                        <span className="font-mono text-xs font-extrabold text-amber-700">
                          {monthSummary.dueAmount.toLocaleString()} ৳
                        </span>
                      </h4>
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                              Due Amount (BDT)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="0"
                              value={dueAmountInput}
                              onChange={(e) => setDueAmountInput(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                              Due Note (Optional)
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Pending customer bill"
                              value={dueNotesInput}
                              onChange={(e) => setDueNotesInput(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <div className="text-[10px] font-semibold text-slate-500">
                            {dueSaveSuccess ? (
                              <span className="text-emerald-600 font-bold flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Due amount saved</span>
                              </span>
                            ) : monthSummary.dueNotes ? (
                              <span className="text-slate-600">Note: {monthSummary.dueNotes}</span>
                            ) : (
                              <span>Saved per month ({monthSummary.month})</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {monthSummary.dueAmount > 0 && (
                              <button
                                type="button"
                                disabled={savingDue}
                                onClick={() => {
                                  setDueAmountInput('');
                                  setDueNotesInput('');
                                  handleSaveMonthlyDue(0, '');
                                }}
                                className="px-2.5 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
                              >
                                Clear
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={savingDue}
                              onClick={() => handleSaveMonthlyDue()}
                              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-extrabold transition cursor-pointer shadow-sm shadow-amber-600/20 disabled:opacity-50"
                            >
                              {savingDue ? 'Saving...' : 'Save Due'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Manual Discount Entry Card directly under Manual Due Amount */}
                    <div className="bg-violet-50/40 rounded-2xl p-4 border border-violet-200/80">
                      <h4 className="text-[11px] font-black text-violet-900 uppercase tracking-wider mb-3 pb-1.5 border-b border-violet-200/80 flex items-center justify-between">
                        <span>Discount ({monthSummary.month})</span>
                        <span className="font-mono text-xs font-extrabold text-violet-700">
                          {monthSummary.discountAmount.toLocaleString()} ৳
                        </span>
                      </h4>
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                              Discount Amount (BDT)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="0"
                              value={discountAmountInput}
                              onChange={(e) => setDiscountAmountInput(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-violet-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                              Discount Note (Optional)
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Customer bill discount"
                              value={discountNotesInput}
                              onChange={(e) => setDiscountNotesInput(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-violet-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <div className="text-[10px] font-semibold text-slate-500">
                            {discountSaveSuccess ? (
                              <span className="text-emerald-600 font-bold flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Discount saved</span>
                              </span>
                            ) : monthSummary.discountNotes ? (
                              <span className="text-slate-600">Note: {monthSummary.discountNotes}</span>
                            ) : (
                              <span>Saved per month ({monthSummary.month})</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {monthSummary.discountAmount > 0 && (
                              <button
                                type="button"
                                disabled={savingDiscount}
                                onClick={() => {
                                  setDiscountAmountInput('');
                                  setDiscountNotesInput('');
                                  handleSaveMonthlyDiscount(0, '');
                                }}
                                className="px-2.5 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
                              >
                                Clear
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={savingDiscount}
                              onClick={() => handleSaveMonthlyDiscount()}
                              className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-[11px] font-extrabold transition cursor-pointer shadow-sm shadow-violet-600/20 disabled:opacity-50"
                            >
                              {savingDiscount ? 'Saving...' : 'Save Discount'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-rose-50/30 rounded-2xl p-4 border border-rose-200/70">
                    <h4 className="text-[11px] font-black text-rose-800 uppercase tracking-wider mb-3 pb-1.5 border-b border-rose-200/80 flex items-center justify-between">
                      <span>Category-Wise Expense Statement</span>
                      <span className="text-[10px] font-mono text-rose-600">{monthSummary.month}</span>
                    </h4>
                    <div className="space-y-1.5 text-xs">
                      {monthSummary.expenseCategories.map((cat) => (
                        <div key={cat.key} className="flex items-center justify-between py-0.5 gap-2">
                          <span className="text-slate-600 flex items-center gap-1.5">
                            <span>{cat.label}</span>
                            {cat.count > 0 && (
                              <span className="text-[10px] font-mono font-bold text-rose-700 bg-rose-100/80 px-1.5 py-0.5 rounded">
                                {cat.count}
                              </span>
                            )}
                          </span>
                          <span className={`font-mono font-bold ${cat.amount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                            -{cat.amount.toLocaleString()} ৳
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-2 mt-1 border-t border-rose-200/80 font-extrabold text-rose-800">
                        <span>Total Category Expense</span>
                        <span className="font-mono">-{monthSummary.totalExpense.toLocaleString()} ৳</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-4 mt-4 border-t border-slate-100 shrink-0 no-print">
                <button
                  type="button"
                  onClick={() => handlePrintMonthClosingStatement(closingMonth)}
                  className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold rounded-xl flex items-center gap-2 transition cursor-pointer shadow-sm shadow-teal-600/20"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Statement</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadMonthClosingExcel(closingMonth)}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl flex items-center gap-2 transition cursor-pointer shadow-sm shadow-emerald-600/20"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Download Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadMonthClosingPDF(closingMonth)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-xl flex items-center gap-2 transition cursor-pointer shadow-sm shadow-indigo-600/20"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveEntryModal(null)}
                  className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Inline Print Preview Modal */}
      {renderPrintPreviewModal()}
    </div>
  );
}
