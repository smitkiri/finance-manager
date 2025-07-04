import { useState, useEffect } from 'react';
import { Expense, TransactionFormData } from '../types';
import { generateId } from '../utils';
import { LocalStorage } from '../utils/storage';

export const useTransactions = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

  // Load expenses on component mount
  useEffect(() => {
    const loadExpenses = async () => {
      try {
        const loadedExpenses = await LocalStorage.loadExpenses();
        setExpenses(loadedExpenses);
        setIsInitialLoadComplete(true);
      } catch (error) {
        console.error('Error loading expenses:', error);
        setIsInitialLoadComplete(true);
      }
    };
    
    loadExpenses();
  }, []);

  const addExpense = async (formData: TransactionFormData) => {
    const newExpense: Expense = {
      id: generateId(),
      date: formData.date,
      description: formData.description,
      category: formData.category,
      amount: parseFloat(formData.amount),
      type: formData.type,
      memo: formData.memo,
    };

    try {
      const updatedExpenses = await LocalStorage.addExpense(newExpense);
      setExpenses(updatedExpenses);
      return true;
    } catch (error) {
      console.error('Error adding expense:', error);
      return false;
    }
  };

  const updateExpense = async (formData: TransactionFormData, editingExpense: Expense) => {
    const updatedExpense: Expense = {
      ...editingExpense,
      date: formData.date,
      description: formData.description,
      category: formData.category,
      amount: parseFloat(formData.amount),
      type: formData.type,
      memo: formData.memo,
    };

    try {
      const updatedExpenses = await LocalStorage.updateExpense(updatedExpense);
      setExpenses(updatedExpenses);
      return true;
    } catch (error) {
      console.error('Error updating expense:', error);
      return false;
    }
  };

  const deleteExpense = async (id: string) => {
    try {
      const updatedExpenses = await LocalStorage.deleteExpense(id);
      setExpenses(updatedExpenses);
      return true;
    } catch (error) {
      console.error('Error deleting expense:', error);
      return false;
    }
  };

  const updateCategory = async (expenseId: string, newCategory: string) => {
    try {
      const expenseToUpdate = expenses.find(exp => exp.id === expenseId);
      if (!expenseToUpdate) return false;

      const updatedExpense: Expense = {
        ...expenseToUpdate,
        category: newCategory,
      };

      const updatedExpenses = await LocalStorage.updateExpense(updatedExpense);
      setExpenses(updatedExpenses);
      return true;
    } catch (error) {
      console.error('Error updating category:', error);
      return false;
    }
  };

  const addLabel = async (expenseId: string, label: string) => {
    try {
      const expenseToUpdate = expenses.find(exp => exp.id === expenseId);
      if (!expenseToUpdate) return false;

      const currentLabels = expenseToUpdate.labels || [];
      if (currentLabels.length >= 3) return false; // Max 3 labels
      if (currentLabels.includes(label)) return false; // Don't add duplicate

      const updatedExpense: Expense = {
        ...expenseToUpdate,
        labels: [...currentLabels, label],
      };

      const updatedExpenses = await LocalStorage.updateExpense(updatedExpense);
      setExpenses(updatedExpenses);
      return true;
    } catch (error) {
      console.error('Error adding label:', error);
      return false;
    }
  };

  const removeLabel = async (expenseId: string, label: string) => {
    try {
      const expenseToUpdate = expenses.find(exp => exp.id === expenseId);
      if (!expenseToUpdate) return false;

      const currentLabels = expenseToUpdate.labels || [];
      const updatedLabels = currentLabels.filter(l => l !== label);

      const updatedExpense: Expense = {
        ...expenseToUpdate,
        labels: updatedLabels,
      };

      const updatedExpenses = await LocalStorage.updateExpense(updatedExpense);
      setExpenses(updatedExpenses);
      return true;
    } catch (error) {
      console.error('Error removing label:', error);
      return false;
    }
  };

  return {
    expenses,
    isInitialLoadComplete,
    addExpense,
    updateExpense,
    deleteExpense,
    updateCategory,
    addLabel,
    removeLabel,
  };
}; 