export interface DemoAccount {
  id: string;
  name: string;
  balance: number;
  type: 'checking' | 'savings' | 'investment' | 'credit' | 'loan';
  institution: string;
  lastUpdated: string;
}

export interface DemoTransaction {
  id: string;
  accountId: string;
  amount: number;
  category: string;
  date: string;
  description: string;
}

export interface DemoGoal {
  id: string;
  name: string;
  target: number;
  current: number;
  targetDate?: string;
}

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  household: {
    primary: string;
    spouse: string;
    children: number;
  };
  income: {
    primary: number;
    spouse: number;
    total: number;
  };
  location: string;
}

export interface DemoProfile {
  id: string;
  profileText: string;
  createdAt: string;
  updatedAt: string;
}

// Comprehensive demo dataset
export const demoData = {
  user: {
    id: "demo_user_1",
    name: "Sarah & Michael Chen",
    email: "sarah.chen@example.com",
    household: {
      primary: "Sarah Chen",
      spouse: "Michael Chen", 
      children: 2
    },
    income: {
      primary: 85000, // Software Engineer
      spouse: 72000,  // Marketing Manager
      total: 157000
    },
    location: "Austin, TX"
  },

  accounts: [
    {
      id: "checking_1",
      name: "Chase Checking",
      balance: 12450.67,
      type: "checking" as const,
      institution: "Chase Bank",
      lastUpdated: "2024-07-28T10:30:00Z"
    },
    {
      id: "savings_1", 
      name: "Ally High-Yield Savings",
      balance: 28450.00,
      type: "savings" as const,
      institution: "Ally Bank",
      lastUpdated: "2024-07-28T10:30:00Z"
    },
    {
      id: "401k_1",
      name: "Fidelity 401(k)",
      balance: 156780.45,
      type: "investment" as const,
      institution: "Fidelity",
      lastUpdated: "2024-07-28T10:30:00Z"
    },
    {
      id: "ira_1",
      name: "Vanguard Roth IRA",
      balance: 89420.30,
      type: "investment" as const,
      institution: "Vanguard",
      lastUpdated: "2024-07-28T10:30:00Z"
    },
    {
      id: "credit_1",
      name: "Chase Sapphire Reserve",
      balance: -3240.50,
      type: "credit" as const,
      institution: "Chase Bank",
      lastUpdated: "2024-07-28T10:30:00Z"
    },
    {
      id: "mortgage_1",
      name: "Wells Fargo Mortgage",
      balance: 485000.00,
      type: "loan" as const,
      institution: "Wells Fargo",
      lastUpdated: "2024-07-28T10:30:00Z"
    },
    {
      id: "cd_1",
      name: "Marcus 12-Month CD",
      balance: 25000.00,
      type: "savings" as const,
      institution: "Marcus by Goldman Sachs",
      lastUpdated: "2024-07-28T10:30:00Z"
    }
  ],

  transactions: [
    // Recent transactions (last 30 days)
    {
      id: "t1",
      accountId: "checking_1",
      amount: 4250.00,
      category: "salary",
      date: "2025-07-15",
      description: "Salary - Tech Corp"
    },
    {
      id: "t2", 
      accountId: "checking_1",
      amount: -850.00,
      category: "mortgage",
      date: "2025-07-01",
      description: "Mortgage Payment"
    },
    {
      id: "t3",
      accountId: "checking_1", 
      amount: -120.00,
      category: "utilities",
      date: "2025-07-05",
      description: "Electric Bill"
    },
    {
      id: "t4",
      accountId: "checking_1",
      amount: -85.00,
      category: "insurance",
      date: "2025-07-10",
      description: "Car Insurance"
    },
    {
      id: "t5",
      accountId: "checking_1",
      amount: -450.00,
      category: "groceries",
      date: "2025-07-12",
      description: "Whole Foods"
    },
    {
      id: "t6",
      accountId: "checking_1",
      amount: -200.00,
      category: "gas",
      date: "2025-07-14",
      description: "Shell Gas Station"
    },
    {
      id: "t7",
      accountId: "checking_1",
      amount: -150.00,
      category: "entertainment",
      date: "2025-07-16",
      description: "Netflix & Spotify"
    },
    {
      id: "t8",
      accountId: "checking_1",
      amount: -300.00,
      category: "dining",
      date: "2025-07-18",
      description: "Restaurant Expenses"
    },
    {
      id: "t9",
      accountId: "checking_1",
      amount: -1000.00,
      category: "transfer",
      date: "2025-07-20",
      description: "Transfer to Savings"
    },
    {
      id: "t10",
      accountId: "credit_1",
      amount: -150.00,
      category: "shopping",
      date: "2025-07-22",
      description: "Amazon Purchase"
    },
    {
      id: "t11",
      accountId: "credit_1",
      amount: -75.00,
      category: "gas",
      date: "2025-07-24",
      description: "Exxon Gas Station"
    },
    {
      id: "t12",
      accountId: "credit_1",
      amount: -200.00,
      category: "dining",
      date: "2025-07-26",
      description: "Date Night Restaurant"
    },

    // Historical transactions (last 6 months)
    {
      id: "t13",
      accountId: "checking_1",
      amount: 4250.00,
      category: "salary",
      date: "2024-06-15",
      description: "Salary - Tech Corp"
    },
    {
      id: "t14",
      accountId: "checking_1",
      amount: -850.00,
      category: "mortgage",
      date: "2024-06-01",
      description: "Mortgage Payment"
    },
    {
      id: "t15",
      accountId: "checking_1",
      amount: -1200.00,
      category: "transfer",
      date: "2024-06-05",
      description: "Transfer to Savings"
    },
    {
      id: "t16",
      accountId: "checking_1",
      amount: 4250.00,
      category: "salary",
      date: "2024-05-15",
      description: "Salary - Tech Corp"
    },
    {
      id: "t17",
      accountId: "checking_1",
      amount: -850.00,
      category: "mortgage",
      date: "2024-05-01",
      description: "Mortgage Payment"
    },
    {
      id: "t18",
      accountId: "checking_1",
      amount: -800.00,
      category: "transfer",
      date: "2024-05-10",
      description: "Transfer to Savings"
    },
    {
      id: "t19",
      accountId: "checking_1",
      amount: 4250.00,
      category: "salary",
      date: "2024-04-15",
      description: "Salary - Tech Corp"
    },
    {
      id: "t20",
      accountId: "checking_1",
      amount: -850.00,
      category: "mortgage",
      date: "2024-04-01",
      description: "Mortgage Payment"
    },
    {
      id: "t21",
      accountId: "checking_1",
      amount: -600.00,
      category: "transfer",
      date: "2024-04-12",
      description: "Transfer to Savings"
    },
    {
      id: "t22",
      accountId: "checking_1",
      amount: 4250.00,
      category: "salary",
      date: "2024-03-15",
      description: "Salary - Tech Corp"
    },
    {
      id: "t23",
      accountId: "checking_1",
      amount: -850.00,
      category: "mortgage",
      date: "2024-03-01",
      description: "Mortgage Payment"
    },
    {
      id: "t24",
      accountId: "checking_1",
      amount: -500.00,
      category: "transfer",
      date: "2024-03-08",
      description: "Transfer to Savings"
    },
    {
      id: "t25",
      accountId: "checking_1",
      amount: 4250.00,
      category: "salary",
      date: "2024-02-15",
      description: "Salary - Tech Corp"
    },
    {
      id: "t26",
      accountId: "checking_1",
      amount: -850.00,
      category: "mortgage",
      date: "2024-02-01",
      description: "Mortgage Payment"
    },
    {
      id: "t27",
      accountId: "checking_1",
      amount: -400.00,
      category: "transfer",
      date: "2024-02-05",
      description: "Transfer to Savings"
    },
    {
      id: "t28",
      accountId: "checking_1",
      amount: 4250.00,
      category: "salary",
      date: "2024-01-15",
      description: "Salary - Tech Corp"
    },
    {
      id: "t29",
      accountId: "checking_1",
      amount: -850.00,
      category: "mortgage",
      date: "2024-01-01",
      description: "Mortgage Payment"
    },
    {
      id: "t30",
      accountId: "checking_1",
      amount: -300.00,
      category: "transfer",
      date: "2024-01-10",
      description: "Transfer to Savings"
    }
  ],

  goals: [
    {
      id: "emergency",
      name: "Emergency Fund",
      target: 50000,
      current: 28450,
      targetDate: "2024-12-31"
    },
    {
      id: "vacation",
      name: "Europe Vacation",
      target: 8000,
      current: 3200,
      targetDate: "2025-06-30"
    },
    {
      id: "house",
      name: "House Down Payment",
      target: 100000,
      current: 45000,
      targetDate: "2026-12-31"
    },
    {
      id: "retirement",
      name: "Retirement Savings",
      target: 2000000,
      current: 246200, // 401k + IRA
      targetDate: "2045-12-31"
    }
  ],

  // Investment portfolio data
  investments: {
    "401k_1": [
      { symbol: "VTSAX", name: "Vanguard Total Stock Market", shares: 245.67, value: 156780.45, allocation: 0.7 },
      { symbol: "VTIAX", name: "Vanguard Total International", shares: 89.23, value: 156780.45, allocation: 0.2 },
      { symbol: "VBTLX", name: "Vanguard Total Bond Market", shares: 156.78, value: 156780.45, allocation: 0.1 }
    ],
    "ira_1": [
      { symbol: "VTI", name: "Vanguard Total Stock Market ETF", shares: 156.78, value: 89420.30, allocation: 0.8 },
      { symbol: "VXUS", name: "Vanguard Total International ETF", shares: 89.42, value: 89420.30, allocation: 0.2 }
    ]
  },

  // Credit card data
  creditCards: {
    "credit_1": {
      limit: 15000,
      apr: 18.99,
      dueDate: "2024-08-15",
      minimumPayment: 35.00
    }
  },

  // Loan data
  loans: {
    "mortgage_1": {
      originalAmount: 520000,
      interestRate: 3.25,
      term: 30,
      monthlyPayment: 850.00,
      nextPayment: "2024-08-01"
    }
  }
};

// Helper functions for demo data analysis
export const getDemoDataAnalysis = () => {
  const accounts = demoData.accounts;
  const transactions = demoData.transactions;
  const goals = demoData.goals;

  // Calculate monthly savings
  const monthlyIncome = transactions
    .filter(t => t.category === "salary")
    .reduce((sum, t) => sum + t.amount, 0) / 6; // Average over 6 months

  const monthlyExpenses = transactions
    .filter(t => t.category !== "salary" && t.category !== "transfer")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0) / 6;

  const monthlySavings = monthlyIncome - monthlyExpenses;

  // Calculate account balances
  const totalAssets = accounts
    .filter(a => a.type !== "loan" && a.type !== "credit")
    .reduce((sum, a) => sum + a.balance, 0);

  const totalLiabilities = accounts
    .filter(a => a.type === "loan" || a.type === "credit")
    .reduce((sum, a) => sum + Math.abs(a.balance), 0);

  const netWorth = totalAssets - totalLiabilities;

  // Calculate goal progress
  const goalProgress = goals.map(goal => ({
    ...goal,
    progress: (goal.current / goal.target) * 100,
    remaining: goal.target - goal.current
  }));

  return {
    monthlyIncome,
    monthlyExpenses,
    monthlySavings,
    totalAssets,
    totalLiabilities,
    netWorth,
    goalProgress
  };
};

// Debug logging to verify demo data is loaded
console.log('Demo data loaded:', {
  hasUser: !!demoData.user,
  accountsCount: demoData.accounts.length,
  transactionsCount: demoData.transactions.length
}); 