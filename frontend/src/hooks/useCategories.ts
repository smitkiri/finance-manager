import { useState, useEffect } from 'react';
import { ApiClient } from '../utils/apiClient';

export const useCategories = () => {
  const [categories, setCategories] = useState<string[]>([]);

  // Load categories on component mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const loadedCategories = await ApiClient.loadCategories();
        setCategories(loadedCategories);
      } catch (error) {
        console.error('Error loading categories:', error);
      }
    };

    loadCategories();
  }, []);

  const addCategory = async (category: string) => {
    try {
      const updatedCategories = await ApiClient.addCategory(category);
      setCategories(updatedCategories);
      return true;
    } catch (error) {
      console.error('Error adding category:', error);
      return false;
    }
  };

  const deleteCategory = async (category: string) => {
    try {
      const updatedCategories = await ApiClient.deleteCategory(category);
      setCategories(updatedCategories);
      return true;
    } catch (error) {
      console.error('Error deleting category:', error);
      return false;
    }
  };

  const updateCategoryName = async (oldCategory: string, newCategory: string) => {
    try {
      const updatedCategories = await ApiClient.updateCategory(oldCategory, newCategory);
      setCategories(updatedCategories);
      return true;
    } catch (error) {
      console.error('Error updating category name:', error);
      return false;
    }
  };

  return {
    categories,
    addCategory,
    deleteCategory,
    updateCategoryName,
  };
};
