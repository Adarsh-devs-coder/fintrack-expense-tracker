import { useState, useEffect, useMemo } from 'react';
import AuthModal from './components/AuthModal';
import AnalyticsPanel from './components/AnalyticsPanel';

const API_BASE = 'http://localhost:8000/api';
const CATEGORIES = ['Food', 'Travel', 'Bills', 'Shopping'];

export default function App() {
  const [expenses, setExpenses] = useState([]);
  const [budget, setBudget] = useState(10000);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');

  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('fintrack_auth');
    return saved ? JSON.parse(saved) : null;
  });
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');
  const [customCategory, setCustomCategory] = useState('');
  const [editingId, setEditingId] = useState(null);

  const getLocalNow = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 16);
  };
  const [date, setDate] = useState(getLocalNow());

  const [dateFilter, setDateFilter] = useState('today');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  useEffect(() => {
    if (user && user.token) {
      fetchUserData(user.token);
    } else {
      setExpenses([]);
      setBudget(10000);
    }
  }, [user]);

  const fetchUserData = async (token) => {
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Token ${token}`
      };
      const [expRes, budRes] = await Promise.all([
        fetch(`${API_BASE}/expenses/`, { headers }),
        fetch(`${API_BASE}/budget/`, { headers })
      ]);

      if (expRes.ok) {
        setExpenses(await expRes.json());
      }
      if (budRes.ok) {
        const bData = await budRes.json();
        setBudget(Number(bData.amount));
      }
    } catch (err) {
      console.error('Failed to load user records:', err);
    }
  };

  // Sync temporary session entries to database when user signs in or registers
  const handleAuthSuccess = async (authData) => {
    const sessionItems = !user ? [...expenses] : [];
    localStorage.setItem('fintrack_auth', JSON.stringify(authData));

    if (sessionItems.length > 0) {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Token ${authData.token}`
      };
      for (const item of sessionItems) {
        try {
          await fetch(`${API_BASE}/expenses/`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              title: item.title,
              amount: item.amount,
              category: item.category,
              date: item.date
            })
          });
        } catch (err) {
          console.error('Sync failed:', err);
        }
      }
    }

    setUser(authData);
  };

  const adjustAmount = (delta) => {
    const curr = parseFloat(amount) || 0;
    setAmount(String(curr + delta));
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    const numVal = parseFloat(amount);
    if (!title.trim() || isNaN(numVal) || numVal <= 0) return;

    const finalCat = category === 'Custom'
      ? (customCategory.trim() || 'Other')
      : category;

    const isoDate = new Date(date).toISOString();

    // Unauthenticated session: update state in browser memory
    if (!user) {
      if (editingId) {
        setExpenses(
          expenses.map((item) =>
            item.id === editingId
              ? { ...item, title: title.trim(), amount: numVal, category: finalCat, date: isoDate }
              : item
          )
        );
        setEditingId(null);
      } else {
        const localEntry = {
          id: `local-${Date.now()}`,
          title: title.trim(),
          amount: numVal,
          category: finalCat,
          date: isoDate
        };
        setExpenses([localEntry, ...expenses]);
      }

      setTitle('');
      setAmount('');
      setCustomCategory('');
      setDate(getLocalNow());
      return;
    }

    // Authenticated session: persist to SQLite
    try {
      const url = editingId
        ? `${API_BASE}/expenses/${editingId}/`
        : `${API_BASE}/expenses/`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${user.token}`
        },
        body: JSON.stringify({
          title: title.trim(),
          amount: numVal,
          category: finalCat,
          date: isoDate
        })
      });

      if (res.ok) {
        const saved = await res.json();
        if (editingId) {
          setExpenses(expenses.map((item) => (item.id === editingId ? saved : item)));
          setEditingId(null);
        } else {
          setExpenses([saved, ...expenses]);
        }

        setTitle('');
        setAmount('');
        setCustomCategory('');
        setDate(getLocalNow());
      }
    } catch (err) {
      console.error('Error saving expense:', err);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setTitle(item.title);
    setAmount(String(item.amount));
    if (CATEGORIES.includes(item.category)) {
      setCategory(item.category);
      setCustomCategory('');
    } else {
      setCategory('Custom');
      setCustomCategory(item.category);
    }

    const d = new Date(item.date);
    const offset = d.getTimezoneOffset() * 60000;
    setDate(new Date(d.getTime() - offset).toISOString().slice(0, 16));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!user) {
      setExpenses(expenses.filter((item) => item.id !== id));
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/expenses/${id}/`, {
        method: 'DELETE',
        headers: { Authorization: `Token ${user.token}` }
      });
      if (res.ok) {
        setExpenses(expenses.filter((item) => item.id !== id));
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleBudgetUpdate = async () => {
    const val = parseFloat(budgetInput);
    if (isNaN(val) || val <= 0) return;

    if (!user) {
      setBudget(val);
      setEditingBudget(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/budget/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${user.token}`
        },
        body: JSON.stringify({ amount: val })
      });
      if (res.ok) {
        const data = await res.json();
        setBudget(Number(data.amount));
        setEditingBudget(false);
      }
    } catch (err) {
      console.error('Budget update failed:', err);
    }
  };

  const downloadCSV = () => {
    if (filteredExpenses.length === 0) return;
    const cols = ['Date', 'Time', 'Title', 'Category', 'Amount (INR)'];
    const rows = filteredExpenses.map((item) => {
      const d = new Date(item.date);
      return [
        d.toLocaleDateString('en-IN'),
        d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        `"${item.title.replace(/"/g, '""')}"`,
        item.category,
        item.amount
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' +
      [cols.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `expenses_${dateFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const now = new Date();
  const todayStr = now.toDateString();
  const yest = new Date();
  yest.setDate(now.getDate() - 1);
  const yesterdayStr = yest.toDateString();

  const thisMonthExpenses = useMemo(() => {
    return expenses.filter((item) => {
      const d = new Date(item.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }, [expenses]);

  const totalSpentThisMonth = useMemo(() => {
    return thisMonthExpenses.reduce((acc, item) => acc + Number(item.amount), 0);
  }, [thisMonthExpenses]);

  const todaysTotal = useMemo(() => {
    return expenses
      .filter((item) => new Date(item.date).toDateString() === todayStr)
      .reduce((acc, item) => acc + Number(item.amount), 0);
  }, [expenses, todayStr]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      const d = new Date(item.date);

      if (dateFilter === 'today' && d.toDateString() !== todayStr) return false;
      if (dateFilter === 'yesterday' && d.toDateString() !== yesterdayStr) return false;
      if (dateFilter === 'month') {
        if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
      }
      if (dateFilter === 'custom') {
        const offset = d.getTimezoneOffset() * 60000;
        const localYMD = new Date(d.getTime() - offset).toISOString().slice(0, 10);
        if (localYMD !== selectedDate) return false;
      }

      if (categoryFilter !== 'All' && item.category !== categoryFilter) return false;

      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        if (!item.title.toLowerCase().includes(q) && !item.category.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [expenses, dateFilter, selectedDate, categoryFilter, searchText, todayStr, yesterdayStr]);

  const filteredTotal = useMemo(() => {
    return filteredExpenses.reduce((acc, item) => acc + Number(item.amount), 0);
  }, [filteredExpenses]);

  const percentUsed = budget > 0 ? (totalSpentThisMonth / budget) * 100 : 0;
  let barColor = 'bg-green-600';
  if (percentUsed >= 70 && percentUsed <= 90) barColor = 'bg-yellow-500';
  else if (percentUsed > 90) barColor = 'bg-red-600';

  const categoryList = useMemo(() => {
    const s = new Set([...CATEGORIES, ...expenses.map((e) => e.category)]);
    return ['All', ...Array.from(s)];
  }, [expenses]);

  return (
    <div className="min-h-screen pb-12 bg-slate-50 text-slate-800">
      <nav className="bg-white border-b border-slate-200 px-6 py-3.5 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-slate-900">FinTrack</h1>
            <p className="text-xs text-slate-500">Personal Expense & Budget Tracker</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block pr-3 border-r border-slate-200">
              <span className="text-[11px] text-slate-500 block">Today's Spend</span>
              <span className="text-sm font-bold text-blue-600">₹{todaysTotal.toLocaleString('en-IN')}</span>
            </div>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-xs font-semibold text-slate-800 block">{user.username}</span>
                  <span className="text-[10px] text-green-600 block">Synced</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('fintrack_auth');
                    setUser(null);
                  }}
                  className="text-xs border border-slate-300 hover:bg-slate-100 text-slate-700 px-2.5 py-1 rounded"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3.5 py-1.5 rounded"
              >
                Sign In / Register
              </button>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 mt-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
            <span className="text-xs text-slate-500 block">Monthly Spend</span>
            <span className="text-lg font-bold text-slate-900 mt-0.5 block">
              ₹{totalSpentThisMonth.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
            <span className="text-xs text-slate-500 block">Remaining Budget</span>
            <span className={`text-lg font-bold mt-0.5 block ${budget - totalSpentThisMonth < 0 ? 'text-red-600' : 'text-green-600'}`}>
              ₹{(budget - totalSpentThisMonth).toLocaleString('en-IN')}
            </span>
          </div>
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
            <span className="text-xs text-slate-500 block">Today's Total</span>
            <span className="text-lg font-bold text-blue-600 mt-0.5 block">
              ₹{todaysTotal.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
            <span className="text-xs text-slate-500 block">Total Records</span>
            <span className="text-lg font-bold text-slate-900 mt-0.5 block">
              {expenses.length}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Monthly Budget</h2>
              <p className="text-xs text-slate-500">
                ₹{totalSpentThisMonth.toLocaleString('en-IN')} spent of ₹{budget.toLocaleString('en-IN')}
              </p>
            </div>

            {editingBudget ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="border border-slate-300 rounded px-2.5 py-1 text-sm w-28"
                />
                <button
                  type="button"
                  onClick={handleBudgetUpdate}
                  className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingBudget(false)}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setBudgetInput(String(budget));
                  setEditingBudget(true);
                }}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                Edit Budget
              </button>
            )}
          </div>

          <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${barColor}`}
              style={{ width: `${Math.min(percentUsed, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-1.5">
            <span>{percentUsed.toFixed(1)}% used</span>
            {percentUsed > 90 && (
              <span className="text-red-600 font-medium">
                {percentUsed > 100 ? 'Budget limit exceeded' : 'Approaching budget limit'}
              </span>
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold text-slate-800">
              {editingId ? 'Edit Expense' : 'Add Expense'}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setTitle('');
                  setAmount('');
                  setDate(getLocalNow());
                }}
                className="text-xs text-slate-500 hover:text-slate-800 underline"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <form onSubmit={handleSaveExpense} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chai, Auto, Broadband"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-medium text-slate-600">Amount (₹)</label>
                  <div className="space-x-1">
                    {[10, 50, 100].map((inc) => (
                      <button
                        key={inc}
                        type="button"
                        onClick={() => adjustAmount(inc)}
                        className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded border border-slate-300"
                      >
                        +₹{inc}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="e.g. 37, 149"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Date & Time</label>
                <input
                  type="datetime-local"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Category</label>
              <div className="flex flex-wrap items-center gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${
                      category === cat
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {cat}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setCategory('Custom')}
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${
                    category === 'Custom'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Custom
                </button>

                {category === 'Custom' && (
                  <input
                    type="text"
                    required
                    placeholder="Enter custom category"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="border border-slate-300 rounded-md px-3 py-1 text-xs focus:outline-none focus:border-blue-500"
                  />
                )}
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md"
              >
                {editingId ? 'Update Expense' : 'Add Expense'}
              </button>
            </div>
          </form>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2">
            <AnalyticsPanel
              thisMonthExpenses={thisMonthExpenses}
              allExpenses={expenses}
              totalSpentThisMonth={totalSpentThisMonth}
            />
          </div>

          <div className="lg:col-span-3 bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex flex-col">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Expense Records</h2>
                <p className="text-xs text-slate-500">
                  Selected Total: <strong className="text-slate-900">₹{filteredTotal.toLocaleString('en-IN')}</strong> ({filteredExpenses.length} entries)
                </p>
              </div>

              <button
                type="button"
                onClick={downloadCSV}
                disabled={filteredExpenses.length === 0}
                className="text-xs border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded disabled:opacity-40"
              >
                Export CSV
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b border-slate-100">
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'month', label: 'This Month' },
                { id: 'custom', label: 'Specific Date' },
                { id: 'all', label: 'All History' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDateFilter(tab.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium ${
                    dateFilter === tab.id
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {dateFilter === 'custom' && (
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="border border-slate-300 rounded px-2.5 py-1 text-xs focus:outline-none focus:border-blue-500"
                />
              )}

              <input
                type="text"
                placeholder="Search by title..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="border border-slate-300 rounded px-2.5 py-1 text-xs flex-1 min-w-[140px] focus:outline-none focus:border-blue-500"
              />

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="border border-slate-300 rounded px-2.5 py-1 text-xs bg-white focus:outline-none focus:border-blue-500"
              >
                {categoryList.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'All' ? 'All Categories' : cat}
                  </option>
                ))}
              </select>
            </div>

            {filteredExpenses.length > 0 ? (
              <div className="space-y-2 overflow-y-auto max-h-72 pr-1">
                {filteredExpenses.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center p-2.5 rounded border border-slate-100 bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{item.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                          {item.category}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(item.date).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}{' '}
                          •{' '}
                          {new Date(item.date).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 mr-1">
                        ₹{Number(item.amount).toLocaleString('en-IN')}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleEdit(item)}
                        className="text-xs text-blue-600 hover:text-blue-800 px-1.5 py-0.5 rounded hover:bg-blue-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="text-xs text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 py-14 text-center">
                No expenses recorded yet.
              </p>
            )}
          </div>
        </div>
      </div>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        apiUrl={API_BASE}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
}