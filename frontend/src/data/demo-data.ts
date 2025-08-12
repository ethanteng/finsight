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
  // Enhanced transaction data
  enriched_data?: {
    merchant_name?: string;
    website?: string;
    logo_url?: string;
    primary_color?: string;
    domain?: string;
    category?: string[];
    category_id?: string;
    brand_logo_url?: string;
    brand_name?: string;
  };
}

export interface DemoInvestment {
  symbol: string;
  name: string;
  shares: number;
  price: number;
  value: number;
  allocation: number;
  change1d: number;
  change1m: number;
  change1y: number;
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
      lastUpdated: "2025-08-11T10:30:00Z"
    },
    {
      id: "savings_1", 
      name: "Ally High-Yield Savings",
      balance: 28450.00,
      type: "savings" as const,
      institution: "Ally Bank",
      lastUpdated: "2025-08-11T10:30:00Z"
    },
    {
      id: "401k_1",
      name: "Fidelity 401(k)",
      balance: 156780.45,
      type: "investment" as const,
      institution: "Fidelity",
      lastUpdated: "2025-08-11T10:30:00Z"
    },
    {
      id: "ira_1",
      name: "Vanguard Roth IRA",
      balance: 89420.30,
      type: "investment" as const,
      institution: "Vanguard",
      lastUpdated: "2025-08-11T10:30:00Z"
    },
    {
      id: "credit_1",
      name: "Chase Sapphire Reserve",
      balance: -3240.50,
      type: "credit" as const,
      institution: "Chase Bank",
      lastUpdated: "2025-08-11T10:30:00Z"
    },
    {
      id: "mortgage_1",
      name: "Wells Fargo Mortgage",
      balance: 485000.00,
      type: "loan" as const,
      institution: "Wells Fargo",
      lastUpdated: "2025-08-11T10:30:00Z"
    },
    {
      id: "cd_1",
      name: "Marcus 12-Month CD",
      balance: 25000.00,
      type: "savings" as const,
      institution: "Marcus by Goldman Sachs",
      lastUpdated: "2025-08-11T10:30:00Z"
    },
    // Additional investment accounts to reach 60 holdings
    {
      id: "brokerage_1",
      name: "Fidelity Individual Brokerage",
      balance: 125000.00,
      type: "investment" as const,
      institution: "Fidelity",
      lastUpdated: "2025-08-11T10:30:00Z"
    },
    {
      id: "hsa_1",
      name: "Health Savings Account",
      balance: 18500.00,
      type: "investment" as const,
      institution: "Fidelity",
      lastUpdated: "2025-08-11T10:30:00Z"
    },
    {
      id: "529_1",
      name: "College Savings 529 Plan",
      balance: 32000.00,
      type: "investment" as const,
      institution: "Vanguard",
      lastUpdated: "2025-08-11T10:30:00Z"
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
      description: "Electric Bill",
      enriched_data: {
        merchant_name: "Austin Energy",
        website: "austinenergy.com",
        logo_url: "https://logo.clearbit.com/austinenergy.com",
        primary_color: "#0066CC",
        domain: "austinenergy.com",
        category: ["utilities", "electric", "government"],
        category_id: "18000000",
        brand_logo_url: "https://logo.clearbit.com/austinenergy.com",
        brand_name: "Austin Energy"
      }
    },
    {
      id: "t4",
      accountId: "checking_1",
      amount: -85.00,
      category: "insurance",
      date: "2025-07-10",
      description: "Car Insurance",
      enriched_data: {
        merchant_name: "State Farm",
        website: "statefarm.com",
        logo_url: "https://logo.clearbit.com/statefarm.com",
        primary_color: "#E31837",
        domain: "statefarm.com",
        category: ["insurance", "auto", "financial"],
        category_id: "22000000",
        brand_logo_url: "https://logo.clearbit.com/statefarm.com",
        brand_name: "State Farm"
      }
    },
    {
      id: "t5",
      accountId: "checking_1",
      amount: -450.00,
      category: "groceries",
      date: "2025-07-12",
      description: "Whole Foods",
      enriched_data: {
        merchant_name: "Whole Foods Market",
        website: "wholefoodsmarket.com",
        logo_url: "https://logo.clearbit.com/wholefoodsmarket.com",
        primary_color: "#2E7D32",
        domain: "wholefoodsmarket.com",
        category: ["food", "groceries", "organic"],
        category_id: "13000000",
        brand_logo_url: "https://logo.clearbit.com/wholefoodsmarket.com",
        brand_name: "Whole Foods Market"
      }
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
    {
      id: "t13",
      accountId: "checking_1",
      amount: -180.00,
      category: "shopping",
      date: "2025-07-27",
      description: "Target - Household Items"
    },
    {
      id: "t14",
      accountId: "checking_1",
      amount: -65.00,
      category: "gas",
      date: "2025-07-25",
      description: "Costco Gas"
    },
    {
      id: "t15",
      accountId: "checking_1",
      amount: -120.00,
      category: "dining",
      date: "2025-07-23",
      description: "Lunch with Colleagues"
    },
    {
      id: "t16",
      accountId: "checking_1",
      amount: -95.00,
      category: "shopping",
      date: "2025-07-21",
      description: "CVS Pharmacy"
    },
    {
      id: "t17",
      accountId: "checking_1",
      amount: -40.00,
      category: "entertainment",
      date: "2025-07-19",
      description: "Movie Tickets"
    },
    {
      id: "t18",
      accountId: "checking_1",
      amount: -280.00,
      category: "groceries",
      date: "2025-07-17",
      description: "H-E-B Groceries"
    },
    {
      id: "t19",
      accountId: "checking_1",
      amount: -60.00,
      category: "gas",
      date: "2025-07-15",
      description: "Shell Gas Station"
    },
    {
      id: "t20",
      accountId: "checking_1",
      amount: -110.00,
      category: "dining",
      date: "2025-07-13",
      description: "Coffee & Breakfast"
    },

    // Investment transactions (401k contributions and dividends)
    {
      id: "t21",
      accountId: "401k_1",
      amount: 1200.00,
      category: "401k_contribution",
      date: "2025-07-15",
      description: "401k Contribution - Tech Corp"
    },
    {
      id: "t22",
      accountId: "401k_1",
      amount: 45.67,
      category: "dividend",
      date: "2025-07-10",
      description: "VTSAX Dividend Reinvestment"
    },
    {
      id: "t23",
      accountId: "401k_1",
      amount: 23.45,
      category: "dividend",
      date: "2025-07-10",
      description: "VTIAX Dividend Reinvestment"
    },
    {
      id: "t24",
      accountId: "ira_1",
      amount: 6500.00,
      category: "ira_contribution",
      date: "2025-07-01",
      description: "Roth IRA Contribution"
    },
    {
      id: "t25",
      accountId: "ira_1",
      amount: 18.90,
      category: "dividend",
      date: "2025-07-05",
      description: "VTI Dividend Reinvestment"
    },
    // Additional recent transactions to show more activity
    {
      id: "t26",
      accountId: "checking_1",
      amount: -75.00,
      category: "gas",
      date: "2025-07-28",
      description: "Shell Gas Station"
    },
    {
      id: "t27",
      accountId: "checking_1",
      amount: -120.00,
      category: "dining",
      date: "2025-07-27",
      description: "Restaurant Dinner"
    },
    {
      id: "t28",
      accountId: "checking_1",
      amount: -200.00,
      category: "shopping",
      date: "2025-07-26",
      description: "Target Shopping"
    },
    {
      id: "t29",
      accountId: "checking_1",
      amount: -85.00,
      category: "insurance",
      date: "2025-07-25",
      description: "Home Insurance"
    },
    {
      id: "t30",
      accountId: "checking_1",
      amount: -150.00,
      category: "entertainment",
      date: "2025-07-24",
      description: "Weekend Activities"
    },
    {
      id: "t31",
      accountId: "checking_1",
      amount: -95.00,
      category: "shopping",
      date: "2025-07-23",
      description: "CVS Pharmacy"
    },
    {
      id: "t32",
      accountId: "checking_1",
      amount: -180.00,
      category: "groceries",
      date: "2025-07-22",
      description: "H-E-B Groceries"
    },
    {
      id: "t33",
      accountId: "checking_1",
      amount: -60.00,
      category: "gas",
      date: "2025-07-21",
      description: "Shell Gas Station"
    },
    {
      id: "t34",
      accountId: "checking_1",
      amount: -110.00,
      category: "dining",
      date: "2025-07-20",
      description: "Coffee & Breakfast"
    },
    {
      id: "t35",
      accountId: "checking_1",
      amount: -250.00,
      category: "shopping",
      date: "2025-07-19",
      description: "Home Depot"
    },
    {
      id: "t36",
      accountId: "checking_1",
      amount: -90.00,
      category: "dining",
      date: "2025-07-18",
      description: "Lunch with Colleagues"
    },
    {
      id: "t37",
      accountId: "checking_1",
      amount: -75.00,
      category: "gas",
      date: "2025-07-17",
      description: "Costco Gas"
    },
    {
      id: "t38",
      accountId: "checking_1",
      amount: -120.00,
      category: "utilities",
      date: "2025-07-16",
      description: "Water Bill"
    },
    {
      id: "t39",
      accountId: "checking_1",
      amount: -200.00,
      category: "shopping",
      date: "2025-07-14",
      description: "Clothing Shopping"
    },
    {
      id: "t40",
      accountId: "checking_1",
      amount: -85.00,
      category: "insurance",
      date: "2025-07-13",
      description: "Car Insurance"
    },

    // Historical transactions (last 6 months)
    {
      id: "t26",
      accountId: "checking_1",
      amount: 4250.00,
      category: "salary",
      date: "2025-06-15",
      description: "Salary - Tech Corp"
    },
    {
      id: "t27",
      accountId: "checking_1",
      amount: -850.00,
      category: "mortgage",
      date: "2025-06-01",
      description: "Mortgage Payment"
    },
    {
      id: "t28",
      accountId: "checking_1",
      amount: -1200.00,
      category: "transfer",
      date: "2025-06-05",
      description: "Transfer to Savings"
    },
    {
      id: "t29",
      accountId: "checking_1",
      amount: -320.00,
      category: "groceries",
      date: "2025-06-08",
      description: "H-E-B Groceries"
    },
    {
      id: "t30",
      accountId: "checking_1",
      amount: -180.00,
      category: "shopping",
      date: "2025-06-12",
      description: "Home Depot"
    },
    {
      id: "t31",
      accountId: "checking_1",
      amount: -95.00,
      category: "dining",
      date: "2025-06-14",
      description: "Restaurant Dinner"
    },
    {
      id: "t32",
      accountId: "checking_1",
      amount: -65.00,
      category: "gas",
      date: "2025-06-16",
      description: "Shell Gas Station"
    },
    {
      id: "t33",
      accountId: "checking_1",
      amount: -150.00,
      category: "entertainment",
      date: "2025-06-18",
      description: "Weekend Activities"
    },
    {
      id: "t34",
      accountId: "checking_1",
      amount: 4250.00,
      category: "salary",
      date: "2025-05-15",
      description: "Salary - Tech Corp"
    },
    {
      id: "t35",
      accountId: "checking_1",
      amount: -850.00,
      category: "mortgage",
      date: "2025-05-01",
      description: "Mortgage Payment"
    },
    {
      id: "t36",
      accountId: "checking_1",
      amount: -800.00,
      category: "transfer",
      date: "2025-05-10",
      description: "Transfer to Savings"
    },
    {
      id: "t37",
      accountId: "checking_1",
      amount: -280.00,
      category: "groceries",
      date: "2025-05-12",
      description: "H-E-B Groceries"
    },
    {
      id: "t38",
      accountId: "checking_1",
      amount: -120.00,
      category: "utilities",
      date: "2025-05-05",
      description: "Water Bill"
    },
    {
      id: "t39",
      accountId: "checking_1",
      amount: -200.00,
      category: "shopping",
      date: "2025-05-15",
      description: "Target Shopping"
    },
    {
      id: "t40",
      accountId: "checking_1",
      amount: -85.00,
      category: "insurance",
      date: "2025-05-10",
      description: "Home Insurance"
    },
    {
      id: "t41",
      accountId: "checking_1",
      amount: 4250.00,
      category: "salary",
      date: "2025-04-15",
      description: "Salary - Tech Corp"
    },
    {
      id: "t42",
      accountId: "checking_1",
      amount: -850.00,
      category: "mortgage",
      date: "2025-04-01",
      description: "Mortgage Payment"
    },
    {
      id: "t43",
      accountId: "checking_1",
      amount: -600.00,
      category: "transfer",
      date: "2025-04-12",
      description: "Transfer to Savings"
    },
    {
      id: "t44",
      accountId: "checking_1",
      amount: -350.00,
      category: "groceries",
      date: "2025-04-08",
      description: "H-E-B Groceries"
    },
    {
      id: "t45",
      accountId: "checking_1",
      amount: -150.00,
      category: "dining",
      date: "2025-04-20",
      description: "Birthday Dinner"
    },
    {
      id: "t46",
      accountId: "checking_1",
      amount: -120.00,
      category: "utilities",
      date: "2025-04-05",
      description: "Electric Bill"
    },
    {
      id: "t47",
      accountId: "checking_1",
      amount: 4250.00,
      category: "salary",
      date: "2025-03-15",
      description: "Salary - Tech Corp"
    },
    {
      id: "t48",
      accountId: "checking_1",
      amount: -850.00,
      category: "mortgage",
      date: "2025-03-01",
      description: "Mortgage Payment"
    },
    {
      id: "t49",
      accountId: "checking_1",
      amount: -500.00,
      category: "transfer",
      date: "2025-03-08",
      description: "Transfer to Savings"
    },
    {
      id: "t50",
      accountId: "checking_1",
      amount: -300.00,
      category: "groceries",
      date: "2025-03-10",
      description: "H-E-B Groceries"
    },
    {
      id: "t51",
      accountId: "checking_1",
      amount: -200.00,
      category: "shopping",
      date: "2025-03-22",
      description: "Clothing Shopping"
    },
    {
      id: "t52",
      accountId: "checking_1",
      amount: -100.00,
      category: "dining",
      date: "2025-03-25",
      description: "Lunch Out"
    },
    {
      id: "t53",
      accountId: "checking_1",
      amount: 4250.00,
      category: "salary",
      date: "2025-02-15",
      description: "Salary - Tech Corp"
    },
    {
      id: "t54",
      accountId: "checking_1",
      amount: -850.00,
      category: "mortgage",
      date: "2025-02-01",
      description: "Mortgage Payment"
    },
    {
      id: "t55",
      accountId: "checking_1",
      amount: -400.00,
      category: "transfer",
      date: "2025-02-05",
      description: "Transfer to Savings"
    },
    {
      id: "t56",
      accountId: "checking_1",
      amount: -250.00,
      category: "groceries",
      date: "2025-02-12",
      description: "H-E-B Groceries"
    },
    {
      id: "t57",
      accountId: "checking_1",
      amount: -180.00,
      category: "shopping",
      date: "2025-02-18",
      description: "Home Improvement"
    },
    {
      id: "t58",
      accountId: "checking_1",
      amount: 4250.00,
      category: "salary",
      date: "2025-01-15",
      description: "Salary - Tech Corp"
    },
    {
      id: "t59",
      accountId: "checking_1",
      amount: -850.00,
      category: "mortgage",
      date: "2025-01-01",
      description: "Mortgage Payment"
    },
    {
      id: "t60",
      accountId: "checking_1",
      amount: -300.00,
      category: "transfer",
      date: "2025-01-10",
      description: "Transfer to Savings"
    },
    {
      id: "t61",
      accountId: "checking_1",
      amount: -320.00,
      category: "groceries",
      date: "2025-01-08",
      description: "H-E-B Groceries"
    },
    {
      id: "t62",
      accountId: "checking_1",
      amount: -150.00,
      category: "shopping",
      date: "2025-01-20",
      description: "Target Shopping"
    },

    // Investment transactions (historical)
    {
      id: "t63",
      accountId: "401k_1",
      amount: 1200.00,
      category: "401k_contribution",
      date: "2025-06-15",
      description: "401k Contribution - Tech Corp"
    },
    {
      id: "t64",
      accountId: "401k_1",
      amount: 42.30,
      category: "dividend",
      date: "2025-06-10",
      description: "VTSAX Dividend Reinvestment"
    },
    {
      id: "t65",
      accountId: "401k_1",
      amount: 1200.00,
      category: "401k_contribution",
      date: "2025-05-15",
      description: "401k Contribution - Tech Corp"
    },
    {
      id: "t66",
      accountId: "401k_1",
      amount: 38.90,
      category: "dividend",
      date: "2025-05-10",
      description: "VTSAX Dividend Reinvestment"
    },
    {
      id: "t67",
      accountId: "401k_1",
      amount: 1200.00,
      category: "401k_contribution",
      date: "2025-04-15",
      description: "401k Contribution - Tech Corp"
    },
    {
      id: "t68",
      accountId: "401k_1",
      amount: 35.60,
      category: "dividend",
      date: "2025-04-10",
      description: "VTSAX Dividend Reinvestment"
    },
    {
      id: "t69",
      accountId: "401k_1",
      amount: 1200.00,
      category: "401k_contribution",
      date: "2025-03-15",
      description: "401k Contribution - Tech Corp"
    },
    {
      id: "t70",
      accountId: "401k_1",
      amount: 32.40,
      category: "dividend",
      date: "2025-03-10",
      description: "VTSAX Dividend Reinvestment"
    },
    {
      id: "t71",
      accountId: "401k_1",
      amount: 1200.00,
      category: "401k_contribution",
      date: "2025-02-15",
      description: "401k Contribution - Tech Corp"
    },
    {
      id: "t72",
      accountId: "401k_1",
      amount: 29.80,
      category: "dividend",
      date: "2025-02-10",
      description: "VTSAX Dividend Reinvestment"
    },
    {
      id: "t73",
      accountId: "401k_1",
      amount: 1200.00,
      category: "401k_contribution",
      date: "2025-01-15",
      description: "401k Contribution - Tech Corp"
    },
    {
      id: "t74",
      accountId: "401k_1",
      amount: 27.20,
      category: "dividend",
      date: "2025-01-10",
      description: "VTSAX Dividend Reinvestment"
    }
  ],

  goals: [
    {
      id: "emergency",
      name: "Emergency Fund",
      target: 50000,
      current: 28450,
      targetDate: "2025-12-31"
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

  // Investment portfolio data - now with realistic math and more holdings
  investments: {
    "401k_1": [
      { 
        symbol: "VTSAX", 
        name: "Vanguard Total Stock Market Index Fund", 
        shares: 1097.45, 
        price: 142.80, 
        value: 156780.45, 
        allocation: 0.7,
        change1d: 0.85,
        change1m: 2.45,
        change1y: 18.90
      },
      { 
        symbol: "VTIAX", 
        name: "Vanguard Total International Stock Index Fund", 
        shares: 447.89, 
        price: 35.00, 
        value: 15678.05, 
        allocation: 0.2,
        change1d: -0.25,
        change1m: 1.20,
        change1y: 12.45
      },
      { 
        symbol: "VBTLX", 
        name: "Vanguard Total Bond Market Index Fund", 
        shares: 1567.80, 
        price: 10.00, 
        value: 15678.00, 
        allocation: 0.1,
        change1d: 0.05,
        change1m: 0.30,
        change1y: 2.10
      }
    ],
    "ira_1": [
      { 
        symbol: "VTI", 
        name: "Vanguard Total Stock Market ETF", 
        shares: 156.78, 
        price: 570.00, 
        value: 89420.30, 
        allocation: 0.8,
        change1d: 1.20,
        change1m: 3.45,
        change1y: 22.10
      },
      { 
        symbol: "VXUS", 
        name: "Vanguard Total International ETF", 
        shares: 447.10, 
        price: 40.00, 
        value: 17884.00, 
        allocation: 0.2,
        change1d: -0.15,
        change1m: 0.90,
        change1y: 11.80
      }
    ],
    "brokerage_1": [
      { 
        symbol: "AAPL", 
        name: "Apple Inc.", 
        shares: 45.67, 
        price: 185.50, 
        value: 8471.85, 
        allocation: 0.15,
        change1d: 1.25,
        change1m: 5.20,
        change1y: 28.50
      },
      { 
        symbol: "MSFT", 
        name: "Microsoft Corporation", 
        shares: 32.45, 
        price: 420.80, 
        value: 13655.36, 
        allocation: 0.25,
        change1d: 0.85,
        change1m: 3.10,
        change1y: 22.40
      },
      { 
        symbol: "GOOGL", 
        name: "Alphabet Inc.", 
        shares: 28.90, 
        price: 175.20, 
        value: 5063.28, 
        allocation: 0.10,
        change1d: -0.45,
        change1m: 1.80,
        change1y: 15.60
      },
      { 
        symbol: "AMZN", 
        name: "Amazon.com Inc.", 
        shares: 35.67, 
        price: 185.40, 
        value: 6613.28, 
        allocation: 0.12,
        change1d: 0.95,
        change1m: 4.20,
        change1y: 18.90
      },
      { 
        symbol: "TSLA", 
        name: "Tesla Inc.", 
        shares: 42.34, 
        price: 245.60, 
        value: 10398.70, 
        allocation: 0.18,
        change1d: -1.20,
        change1m: -2.10,
        change1y: 12.40
      },
      { 
        symbol: "NVDA", 
        name: "NVIDIA Corporation", 
        shares: 15.78, 
        price: 890.50, 
        value: 14052.09, 
        allocation: 0.25,
        change1d: 2.10,
        change1m: 8.50,
        change1y: 45.20
      },
      { 
        symbol: "BRK.B", 
        name: "Berkshire Hathaway Inc.", 
        shares: 18.90, 
        price: 365.40, 
        value: 6906.06, 
        allocation: 0.12,
        change1d: 0.65,
        change1m: 2.80,
        change1y: 16.80
      },
      { 
        symbol: "JPM", 
        name: "JPMorgan Chase & Co.", 
        shares: 67.45, 
        price: 198.50, 
        value: 13389.53, 
        allocation: 0.23,
        change1d: 0.45,
        change1m: 1.90,
        change1y: 12.60
      },
      { 
        symbol: "JNJ", 
        name: "Johnson & Johnson", 
        shares: 89.12, 
        price: 165.80, 
        value: 14776.50, 
        allocation: 0.25,
        change1d: 0.25,
        change1m: 1.20,
        change1y: 8.90
      },
      { 
        symbol: "PG", 
        name: "Procter & Gamble Co.", 
        shares: 76.34, 
        price: 145.60, 
        value: 11114.62, 
        allocation: 0.19,
        change1d: 0.35,
        change1m: 1.50,
        change1y: 9.80
      }
    ],
    "hsa_1": [
      { 
        symbol: "VTSAX", 
        name: "Vanguard Total Stock Market Index Fund", 
        shares: 89.45, 
        price: 142.80, 
        value: 12773.46, 
        allocation: 0.7,
        change1d: 0.85,
        change1m: 2.45,
        change1y: 18.90
      },
      { 
        symbol: "VTIAX", 
        name: "Vanguard Total International Stock Index Fund", 
        shares: 36.78, 
        price: 35.00, 
        value: 1287.30, 
        allocation: 0.2,
        change1d: -0.25,
        change1m: 1.20,
        change1y: 12.45
      },
      { 
        symbol: "VBTLX", 
        name: "Vanguard Total Bond Market Index Fund", 
        shares: 128.90, 
        price: 10.00, 
        value: 1289.00, 
        allocation: 0.1,
        change1d: 0.05,
        change1m: 0.30,
        change1y: 2.10
      }
    ],
    "529_1": [
      { 
        symbol: "VTSAX", 
        name: "Vanguard Total Stock Market Index Fund", 
        shares: 156.78, 
        price: 142.80, 
        value: 22387.58, 
        allocation: 0.6,
        change1d: 0.85,
        change1m: 2.45,
        change1y: 18.90
      },
      { 
        symbol: "VTIAX", 
        name: "Vanguard Total International Stock Index Fund", 
        shares: 67.45, 
        price: 35.00, 
        value: 2360.75, 
        allocation: 0.2,
        change1d: -0.25,
        change1m: 1.20,
        change1y: 12.45
      },
      { 
        symbol: "VBTLX", 
        name: "Vanguard Total Bond Market Index Fund", 
        shares: 225.67, 
        price: 10.00, 
        value: 2256.70, 
        allocation: 0.2,
        change1d: 0.05,
        change1m: 0.30,
        change1y: 2.10
      }
    ]
  },

  // Credit card data
  creditCards: {
    "credit_1": {
      limit: 15000,
      apr: 18.99,
      dueDate: "2025-08-15",
      minimumPayment: 35.00
    }
  },

  // User profile data
  profile: {
    id: "demo_profile_1",
    profileText: `I am Sarah Chen, a 35-year-old software engineer living in Austin, TX with my husband Michael (37, Marketing Manager) and our two children (ages 5 and 8). 

Our household income is $157,000 annually, with me earning $85,000 as a software engineer and Michael earning $72,000 as a marketing manager. We have a stable dual-income household with good job security in the tech industry.

We own our home with a $485,000 mortgage at 3.25% interest rate, and we're focused on building our emergency fund, saving for our children's education, and planning for retirement. Our financial goals include:
- Building a $50,000 emergency fund (currently at $28,450)
- Saving for a family vacation to Europe ($8,000 target, currently at $3,200)
- Building a house down payment fund ($100,000 target, currently at $45,000)
- Long-term retirement planning (currently have $246,200 in retirement accounts)

Our investment strategy is conservative with a mix of index funds in our 401(k) and Roth IRA. We prioritize saving and are working to increase our monthly savings rate. We're also focused on paying down our credit card debt and maintaining good credit scores.

Note: This profile reflects our financial situation as of August 2025.`,
    createdAt: "2025-08-11T10:30:00Z",
    updatedAt: "2025-08-11T10:30:00Z"
  },

  // Loan data
  loans: {
    "mortgage_1": {
      originalAmount: 520000,
      interestRate: 3.25,
      term: 30,
      monthlyPayment: 850.00,
      nextPayment: "2025-08-01"
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
    .filter(t => t.category !== "salary" && t.category !== "transfer" && 
                 t.category !== "401k_contribution" && t.category !== "ira_contribution" && 
                 t.category !== "dividend")
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

  // Calculate investment performance
  const totalInvestmentValue = Object.values(demoData.investments)
    .flat()
    .reduce((sum, holding) => sum + holding.value, 0);

  const totalInvestmentChange1m = Object.values(demoData.investments)
    .flat()
    .reduce((sum, holding) => sum + (holding.value * holding.change1m / 100), 0);

  const totalInvestmentChange1y = Object.values(demoData.investments)
    .flat()
    .reduce((sum, holding) => sum + (holding.value * holding.change1y / 100), 0);

  return {
    monthlyIncome,
    monthlyExpenses,
    monthlySavings,
    totalAssets,
    totalLiabilities,
    netWorth,
    goalProgress,
    totalInvestmentValue,
    totalInvestmentChange1m,
    totalInvestmentChange1y
  };
};

// Debug logging to verify demo data is loaded
console.log('Demo data loaded:', {
  hasUser: !!demoData.user,
  accountsCount: demoData.accounts.length,
  transactionsCount: demoData.transactions.length,
  investmentHoldings: Object.values(demoData.investments).flat().length
}); 