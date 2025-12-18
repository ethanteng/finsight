export interface ManualAccount {
  id: string;
  name: string;
  amount: number;
  type: 'cash' | 'investment' | 'debt';
  createdAt: string;
  updatedAt: string;
}
