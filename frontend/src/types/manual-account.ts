export interface ManualAccount {
  id: string;
  name: string;
  amount: number;
  type: 'cash' | 'investment' | 'debt' | 'mortgage';
  createdAt: string;
  updatedAt: string;
}
